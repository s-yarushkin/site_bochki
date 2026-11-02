#!/usr/bin/env python3
"""R116: quiz invite only at editorial ВАША БАНЯ screen or 18s models inactivity; WEB-only release."""
import argparse
import hashlib
import os
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

REPO = "s-yarushkin/site_bochki"
SOURCE_COMMIT = "a3cb3c8378a7ef82a2a44f67755d5362c5fabd20"
WEB_LINK = Path("/srv/sites/dachapar-preview/current")
RELEASES = Path("/srv/sites/dachapar-preview/releases")
EXPECTED_ACTIVE = "DPQUIZ-r115-footer-0290aab2ae4866a3"
NEW_NAME = "DPQUIZ-r116-vision-d02879b3"
NEW_RELEASE = RELEASES / NEW_NAME
OLD_BLOBS = {
    "quiz.mjs": "0290aab2c4c769ad962d9c4b5f6360aaea7fb9f8",
    "quiz.css": "ae4866a32f0dae680f509f76203443f7a4634322",
}
NEW_BLOBS = {
    "quiz.mjs": "d02879b3dad79f58e0d0f8e56941c3d7668524d8",
}
PHOTOS = {
    "assets/quiz/step1-steamroom.webp": "4099ca2fa5dd61957c9c2a3ac55dca36c0f743c7e52e8944fbddb62ff8c0016c",
    "assets/quiz/step2-washroom.webp": "3871ae9d0207c48354700100cd19b8e9fc28fd8eadd62ad90052ee749bdc5918",
    "assets/quiz/step3-bedroom.webp": "bc308677205f0ae97ab8dd26450cd8ee6a906878735411e02a1a171c1fac8d90",
}
VERSION = "r116-vision-d02879b3"
HTML_ASSETS = {"quiz.mjs": "src"}

def stop(msg):
    raise RuntimeError("R116_VISION_STOP: " + msg)

def git_sha(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def sha256(data):
    return hashlib.sha256(data).hexdigest()

def locate_quiz_assets(home):
    """Find exactly one quiz stylesheet and one module mount; no version guesses."""
    matches = {}
    for name, attr in HTML_ASSETS.items():
        # Match the URL only in its expected HTML attribute, with optional cache version.
        pattern = r'\b' + attr + r'\s*=\s*(["\'])(/QUIZ_ASSET(?:\?v=[A-Za-z0-9._-]+)?)\1'
        pattern = pattern.replace('QUIZ_ASSET', re.escape(name))
        found = [m.group(2) for m in re.finditer(pattern, home)]
        if len(found) != 1 or home.count("/" + name) != 1:
            stop("ambiguous or missing HTML mount for /" + name + "; matches=" + str(found))
        matches[name] = found[0]
    return matches

def check_active():
    if not WEB_LINK.is_symlink():
        stop("web/current is not a symlink")
    active = WEB_LINK.resolve(strict=True)
    if active.parent != RELEASES or active.name != EXPECTED_ACTIVE:
        stop("unexpected active WEB release " + str(active))
    if NEW_RELEASE.exists() or NEW_RELEASE.is_symlink():
        stop("target release already exists; inspect before retry")
    for name, expected in OLD_BLOBS.items():
        source = active / name
        if source.is_symlink() or not source.is_file() or git_sha(source.read_bytes()) != expected:
            stop("live file drift, refusing overwrite: " + name)
    for name, expected in PHOTOS.items():
        p = active / name
        if not p.is_file() or sha256(p.read_bytes()) != expected:
            stop("approved R108 photo missing or different: " + name)
    if (active / "index.html").is_symlink():
        stop("live index.html must be a regular file")
    home = (active / "index.html").read_text("utf-8")
    urls = locate_quiz_assets(home)
    if urls.get("quiz.mjs") != "/quiz.mjs?v=r115-footer-0290aab2" or home.count("/quiz.css?v=r115-footer-0290aab2") != 1:
        stop("unexpected live HTML quiz mount: " + str(urls))
    return active, home, urls

def fetch_approved_files():
    files = {}
    for name, expected in NEW_BLOBS.items():
        url = "https://raw.githubusercontent.com/" + REPO + "/" + SOURCE_COMMIT + "/web/" + name
        with urllib.request.urlopen(url, timeout=25) as response:
            data = response.read()
        if git_sha(data) != expected:
            stop("downloaded source sha mismatch: " + name)
        files[name] = data
    return files

def prepare_html(home, current_urls):
    for name, old in current_urls.items():
        new = "/" + name + "?v=" + VERSION
        if home.count(old) != 1:
            stop("missing unique original quiz reference: " + old)
        home = home.replace(old, new)
    actual = locate_quiz_assets(home)
    for name in HTML_ASSETS:
        if actual[name] != "/" + name + "?v=" + VERSION:
            stop("HTML cache-buster mismatch for " + name)
    return home

def main():
    p = argparse.ArgumentParser()
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true")
    group.add_argument("--apply", action="store_true")
    args = p.parse_args()
    old, old_html, current_urls = check_active()
    files = fetch_approved_files()
    new_html = prepare_html(old_html, current_urls)
    code = files["quiz.mjs"].decode("utf-8")
    required = ["const findBathVision=()=>", "const bathVisionVisible=()=>",
                "const observeLateBathScreen=()=>", "new IntersectionObserver(",
                "new MutationObserver(", "title==='ваша баня'",
                "title.includes('представляете')", "const modelsIdleMs=18000",
                "reason==='your-bath'&&!bathVisionVisible()"]
    for phrase in required:
        if phrase not in code:
            stop("R116 missing editorial trigger: " + phrase)
    for obsolete in ["watchFooter()", "footerObserver", "reachedYourBath()",
                     "ritualInView()", "inviteScrollFraction"]:
        if obsolete in code:
            stop("R116 forbidden old trigger remains: " + obsolete)
    if "footer.append(entry)" not in code:
        stop("R116 accidentally removed current footer manual entry")
    if old_html.count("/quiz.css?v=r115-footer-0290aab2") != 1:
        stop("R116 must not change styles")
    if args.check:
        print("R116_VISION_PREFLIGHT=PASS; old=" + str(old) + "; files=1; photos=3; API/SQLite untouched")
        print("HTML_ORIGINAL=" + str(current_urls))
        return
    if os.geteuid() != 0:
        stop("sudo required only for --apply")
    # Clone immutable release without altering the original. Preflight rejects symlink targets.
    subprocess.run(["cp", "-a", "--", str(old), str(NEW_RELEASE)], check=True)
    try:
        for name, blob in files.items():
            (NEW_RELEASE / name).write_bytes(blob)
        (NEW_RELEASE / "index.html").write_text(new_html, "utf-8")
        for name, expected in NEW_BLOBS.items():
            if git_sha((NEW_RELEASE / name).read_bytes()) != expected:
                stop("staged file mismatch: " + name)
        if (NEW_RELEASE / "index.html").read_text("utf-8") != new_html:
            stop("staged HTML mismatch")
        for name, expected in PHOTOS.items():
            if sha256((NEW_RELEASE / name).read_bytes()) != expected:
                stop("staged photo mismatch: " + name)
        for name in ["quiz.mjs"]:
            if not (NEW_RELEASE / name).is_file():
                stop("staged file missing " + name)
    except Exception:
        # Keep the failed stage for forensic inspection; active link stays unchanged.
        raise
    swap = WEB_LINK.with_name("current.r116-vision-switch")
    if swap.exists() or swap.is_symlink():
        stop("temporary switch symlink already exists")
    swap.symlink_to(NEW_RELEASE)
    os.replace(swap, WEB_LINK)
    if WEB_LINK.resolve(strict=True) != NEW_RELEASE:
        stop("symlink switch verification failed; do not retry blindly")
    print("R116_VISION_DEPLOY=PASS")
    print("WEB_OLD=" + str(old))
    print("WEB_NEW=" + str(NEW_RELEASE))
    print("CACHE_VERSION=" + VERSION)
    print("API_SQLITE=UNTOUCHED")
    print("ROLLBACK_COMMAND=sudo ln -s '" + str(old) +
          "' '/srv/sites/dachapar-preview/current.r116-rollback' && sudo mv -Tf " +
          "'/srv/sites/dachapar-preview/current.r116-rollback' '/srv/sites/dachapar-preview/current'")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("R116_VISION_ERROR=" + str(exc), file=sys.stderr)
        raise SystemExit(1)
