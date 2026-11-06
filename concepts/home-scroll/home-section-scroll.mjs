const edgeTolerance = 18;
const settleDelay = 140;

export function sectionStop(points, start, end, viewport) {
  const distance = end - start;
  if (Math.abs(distance) < 24) return null;

  const direction = Math.sign(distance);
  const ordered = direction > 0 ? points : [...points].reverse();
  const next = ordered.find(point => (point - start) * direction > edgeTolerance);
  const beganAtStop = points.some(point => Math.abs(point - start) <= edgeTolerance);

  // Turn a deliberate gesture at the start of a screen into one screen transition.
  if (next !== undefined && beganAtStop && Math.abs(next - start) <= viewport * 1.15 &&
      (end - next) * direction <= viewport * .12) {
    return next;
  }

  // In a tall section, let visitors scroll normally until they approach its edge.
  const nearby = points.filter(point => {
    const fromStart = (point - start) * direction;
    const fromEnd = (point - end) * direction;
    return fromStart > edgeTolerance && fromEnd >= -viewport * .10 && fromEnd <= viewport * .28;
  });
  return nearby.reduce((closest, point) => (
    closest === null || Math.abs(point - end) < Math.abs(closest - end) ? point : closest
  ), null);
}

export function scrollEase(progress) {
  return progress * progress * (3 - 2 * progress);
}

function connectSectionScroll() {
  const hero = document.querySelector('.choice-hero');
  if (!hero) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let start = null;
  let timer;
  let frame;
  let touching = false;
  const isInteractive = target => target instanceof Element &&
    Boolean(target.closest('dialog, input, select, textarea, [contenteditable], .choice-photo-strip, #choice-menu'));
  const dialogOpen = () => Boolean(document.querySelector('dialog[open]'));

  function cancel() {
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    frame = undefined;
    start = null;
    touching = false;
  }

  function stops() {
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const sections = [...document.querySelectorAll('#main > section, footer.site-footer')];
    const offsets = [0, hero.getBoundingClientRect().bottom + window.scrollY];
    for (const section of sections) {
      const rect = section.getBoundingClientRect();
      if (rect.height > 0) offsets.push(rect.top + window.scrollY);
    }
    return [...new Set(offsets.map(y => Math.round(Math.max(0, Math.min(max, y)))))].sort((a, b) => a - b);
  }

  function settle() {
    if (start === null || touching) return;
    if (reducedMotion.matches || dialogOpen()) { cancel(); return; }

    const from = window.scrollY;
    const destination = sectionStop(stops(), start, from, window.innerHeight);
    start = null;
    if (destination === null || Math.abs(destination - from) < 3) return;

    const duration = Math.min(800, 370 + Math.abs(destination - from) * .48);
    const began = performance.now();
    function move(now) {
      if (reducedMotion.matches || dialogOpen()) { cancel(); return; }
      const progress = Math.min(1, Math.max(0, (now - began) / duration));
      const top = from + (destination - from) * scrollEase(progress);
      window.scrollTo({top, behavior: 'instant'});
      frame = progress < 1 ? requestAnimationFrame(move) : undefined;
    }
    frame = requestAnimationFrame(move);
  }

  function arm() {
    clearTimeout(timer);
    if (!touching) timer = setTimeout(settle, settleDelay);
  }

  window.addEventListener('wheel', event => {
    if (reducedMotion.matches || dialogOpen() || event.ctrlKey || event.defaultPrevented ||
        Math.abs(event.deltaX) >= Math.abs(event.deltaY) || isInteractive(event.target)) {
      cancel();
      return;
    }
    if (frame !== undefined) cancel();
    start ??= window.scrollY;
    arm();
  }, {passive: true});

  window.addEventListener('touchstart', event => {
    cancel();
    if (event.touches.length !== 1 || reducedMotion.matches || dialogOpen() || isInteractive(event.target)) return;
    start = window.scrollY;
    touching = true;
  }, {passive: true});
  window.addEventListener('touchend', () => {
    if (!touching) return;
    touching = false;
    arm();
  }, {passive: true});
  window.addEventListener('touchcancel', cancel, {passive: true});
  window.addEventListener('scroll', () => { if (start !== null) arm(); }, {passive: true});
  window.addEventListener('pointerdown', cancel, {passive: true});
  window.addEventListener('keydown', cancel);
  window.addEventListener('resize', cancel);
  window.addEventListener('hashchange', cancel);
  reducedMotion.addEventListener('change', cancel);
}

if (typeof document !== 'undefined') connectSectionScroll();
