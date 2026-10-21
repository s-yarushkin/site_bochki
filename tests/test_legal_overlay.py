#!/usr/bin/env python3
"""Isolated, non-production tests of narrow legal overlays."""
import importlib.util
import re
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('legal_overlay',ROOT/'ops/legal-overlay-install.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class LegalOverlayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.live=(ROOT/'index.html').read_text(encoding='utf-8')
        cls.privacy=(ROOT/'privacy.html').read_text(encoding='utf-8')
        cls.consent=(ROOT/'consent.html').read_bytes()
        cls.contract=(ROOT/'assets/js/lead-consent.js').read_text(encoding='utf-8')

    def make_old(self):
        current=module.NOTICE_RE.search(self.live).group()
        button=module.BUTTON_RE.search(self.live).group()
        self.assertIn(current+'\n'+button,self.live)
        old='<p class="form-footnote submit-consent-notice" id="submitConsentNotice">Нажимая кнопку, вы даёте <a href="consent.html">согласие</a>. <a href="privacy.html">Политика</a>.</p>'
        return self.live.replace(current+'\n'+button,button+'\n'+old)

    def test_reconcile_current_site_preserves_journal_and_ads_masking(self):
        old=self.make_old()
        old=old.replace('</body>','<aside id="r73-journal">Recent published articles</aside></body>')
        result=module.update_index(old,self.live)
        self.assertIn('id="r73-journal"',result)
        self.assertIn('ym-hide-content',result)
        self.assertIn('Отправляя заявку, вы подтверждаете',result)
        self.assertLess(result.index('id="submitConsentNotice"'),result.index('id="submitButton"'))
        self.assertEqual(result.count('id="submitButton"'),1)
        self.assertEqual(result.count('id="submitConsentNotice"'),1)
        self.assertNotIn('Нажимая кнопку, вы даёте',result)

    def test_idempotent_dry_run_refuses_another_install(self):
        with self.assertRaisesRegex(RuntimeError,'LEGAL_ALREADY_APPLIED|ACTIVE_NOTICE_UNKNOWN'):
            # Already updated source has same nodes and returns same payload; staging gate rejects.
            changed=module.update_index(self.live,self.live)
            module.ensure(changed!=self.live,'LEGAL_ALREADY_APPLIED')

    def test_unknown_notice_fails_closed(self):
        old=self.make_old().replace('Нажимая кнопку, вы даёте','НЕПРОВЕРЕННЫЕ УСЛОВИЯ')
        with self.assertRaisesRegex(RuntimeError,'ACTIVE_NOTICE_UNKNOWN'):
            module.update_index(old,self.live)

    def test_multiple_form_controls_fail_closed(self):
        old=self.make_old()
        with self.assertRaisesRegex(RuntimeError,'ACTIVE_SUBMIT_BUTTON_COUNT'):
            module.update_index(old+module.BUTTON_RE.search(old).group(),self.live)

    def test_source_consent_fingerprint_is_exact(self):
        # Git for Windows may convert LF to CRLF at checkout while Git archives
        # and the deployed consent document retain canonical LF bytes.
        # Normalize *only* permitted newline conversion; never trim or rewrite content.
        canonical=self.consent.replace(b'\r\n',b'\n')
        self.assertNotIn(b'\r',canonical,'Unexpected standalone CR in consent document')
        self.assertIn(self.consent,(canonical,canonical.replace(b'\n',b'\r\n')),
                      'Mixed source newlines are not allowed')
        digest=module.sha256(canonical)
        self.assertIn("CONSENT_DOCUMENT_SHA256='"+digest+"'",self.contract)
        self.assertIn("CONSENT_VERSION='2026-10-21'",self.contract)
        self.assertIn("CONSENT_METHOD='submit-button-v2'",self.contract)
        self.assertIn('113675581',self.privacy)
        self.assertIn('bdd-35@mail.ru',self.privacy)

    def test_windows_crlf_checkout_preserves_git_published_digest(self):
        canonical=self.consent.replace(b'\r\n',b'\n')
        simulated_windows=canonical.replace(b'\n',b'\r\n')
        self.assertEqual(module.sha256(simulated_windows.replace(b'\r\n',b'\n')),
                         module.sha256(canonical))
        self.assertNotEqual(module.sha256(canonical+b'mutated'),
                            module.sha256(canonical))
        self.assertIn("CONSENT_DOCUMENT_SHA256='"+module.sha256(canonical)+"'",
                      self.contract)

    def test_active_api_patch_only_rewrites_known_consent_fragments(self):
        # Construct the exact old-consent code shape reported by the live API probe.
        old=(
            "const marker='KEEP_NEWER_SERVER_LOGIC_UNCHANGED';\n"
            "  if(value.consentVersion!==undefined && !['2026-10-12','2026-10-14',CONSENT_VERSION].includes(value.consentVersion))throw new Error('CONSENT_VERSION_UNSUPPORTED');\n"
            "  const submitConsent=value.consentVersion===CONSENT_VERSION;\n"
            "  if(submitConsent&&value.consentMethod!==CONSENT_METHOD)throw new Error('CONSENT_METHOD_REQUIRED');\n"
            "  const lead={consentEvidence:submitConsent?{version:CONSENT_VERSION,method:CONSENT_METHOD,noticeId:CONSENT_NOTICE_ID,documentSha256:CONSENT_DOCUMENT_SHA256}:{version:value.consentVersion??'legacy-not-versioned',method:value.consentVersion?'explicit-checkbox-v66':'legacy-consent-true-unverified-action'}};\n"
            "  ['2026-10-14',CONSENT_VERSION].includes(lead.consentEvidence?.version);\n"
            "  ['2026-10-14',CONSENT_VERSION].includes(lead.consentEvidence?.version);\n"
            "const footer='KEEP_NEWER_SERVER_LOGIC_UNCHANGED';\n"
        )
        patched=module.patch_active_relay(old)
        # The actual active R7 API is CRLF, unlike the GitHub source.
        lf_bytes=old.encode('utf-8')
        crlf_bytes=lf_bytes.replace(b'\n',b'\r\n')
        self.assertEqual(module.patch_active_relay_bytes(lf_bytes),patched.encode('utf-8'))
        patched_crlf=module.patch_active_relay_bytes(crlf_bytes)
        self.assertEqual(patched_crlf,patched.encode('utf-8').replace(b'\n',b'\r\n'))
        self.assertEqual(patched_crlf.count(b'\r\n'),patched_crlf.count(b'\n'))
        self.assertIn(b'KEEP_NEWER_SERVER_LOGIC_UNCHANGED',patched_crlf)
        # CRLF/LF mixtures and stray carriage returns are not accepted.
        with self.assertRaisesRegex(RuntimeError,'ACTIVE_API_MIXED_NEWLINES'):
            module.patch_active_relay_bytes(crlf_bytes.replace(b'\r\n',b'\n',1))
        with self.assertRaisesRegex(RuntimeError,'ACTIVE_API_MIXED_NEWLINES'):
            module.patch_active_relay_bytes(lf_bytes+b'\r')
        self.assertIn("const marker='KEEP_NEWER_SERVER_LOGIC_UNCHANGED'",patched)
        self.assertIn("const footer='KEEP_NEWER_SERVER_LOGIC_UNCHANGED'",patched)
        self.assertIn("historicSubmit=value.consentVersion==='2026-10-16'",patched)
        self.assertIn("currentSubmit=value.consentVersion===CONSENT_VERSION",patched)
        self.assertIn("documentSha256:'fd858836a3eb8824f6db99c6f00c0e30cb77d58523582b45ea8d515965d96e2a'",patched)
        self.assertEqual(patched.count("['2026-10-14','2026-10-16',CONSENT_VERSION]"),2)
        self.assertNotIn('const marker=\'REMOVED\'',patched)
        self.assertNotEqual(module.sha256(patched.encode()),module.sha256(old.encode()))
        with self.assertRaisesRegex(RuntimeError,'ACTIVE_RELAY_CONSENT_SHAPE_CHANGED'):
            module.patch_active_relay(patched)

    def test_production_fingerprint_is_pinned_not_unrestricted(self):
        self.assertEqual(module.OLD_API_BLOB,'ed4be4b02be5cae25107e08e465dcd3f8dcf7d6d')
        self.assertEqual(len(module.OLD_API_BLOB),40)

    def test_historic_form_acceptance_contract(self):
        api=(ROOT/'server/garant-bani-relay.mjs').read_text(encoding='utf-8')
        self.assertIn("historicSubmit=value.consentVersion==='2026-10-16'",api)
        self.assertIn('fd858836a3eb8824f6db99c6f00c0e30cb77d58523582b45ea8d515965d96e2a',api)
        self.assertIn('CONSENT_METHOD_REQUIRED',api)

if __name__=='__main__':
    unittest.main()
