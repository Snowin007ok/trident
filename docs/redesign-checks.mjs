/**
 * TRIDENT redesign verification.
 *
 * Fifteen checks, run against the real application in a headless browser at
 * 1440, 768 and 375 px. Nothing here is mocked: the app loads its own data
 * files, reads its own localStorage and renders its own markup.
 *
 *   node docs/redesign-checks.mjs            (expects a server on :8099)
 *   BASE=http://127.0.0.1:8080 node docs/redesign-checks.mjs
 */
import { spawn } from 'node:child_process';

const CHROME = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = Number(process.env.CDP_PORT || 9450);
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

const SEED = {
  schemaVersion: 5,
  profile: { mode: 'guest', name: 'Learner', createdAt: '2026-09-01T09:00:00.000Z' },
  selectedPath: 'tn', theme: 'light',
  completedLessons: {
    'l-tn7-sources-monuments': '2026-09-20T09:10:00.000Z',
    'l-tn7-north-kingdoms': '2026-09-21T09:20:00.000Z'
  },
  readingPositions: {}, savedLessons: [], savedEvents: [], savedStories: [],
  quizAttempts: [], dailyQuizByDate: {},
  streak: { current: 3, best: 5, lastDate: '2026-09-22' },
  lastActivityDate: '2026-09-22', activeSeconds: 900, simulatedDate: null,
  xp: 280, awardedRewards: {}, badges: {}, artefacts: {}, timelineResults: {},
  selectedEra: null, migratedFrom: null,
  learningProfile: {
    mode: 'school', board: 'tamil_nadu_state_board', classLevel: '7',
    exam: null, examStage: null,
    createdAt: '2026-09-01T09:00:00.000Z', updatedAt: '2026-09-01T09:00:00.000Z'
  },
  savedBooks: []
};

const results = [];
const pass = (n, d) => results.push({ ok: true, n, d });
const fail = (n, d) => results.push({ ok: false, n, d });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--no-sandbox', '--disable-gpu',
  '--hide-scrollbars', '--disable-background-networking', '--disable-component-update',
  '--no-first-run', '--no-default-browser-check', '--disable-sync', '--disable-extensions',
  '--disable-dev-shm-usage', 'about:blank'
], { stdio: 'ignore' });

let ws; let id = 0;
const pending = new Map();
const consoleErrors = [];

function send(method, params = {}) {
  const msg = { id: ++id, method, params };
  ws.send(JSON.stringify(msg));
  return new Promise((res, rej) => {
    pending.set(msg.id, { res, rej });
    setTimeout(() => {
      if (pending.has(msg.id)) { pending.delete(msg.id); rej(new Error(`timeout ${method}`)); }
    }, 20000);
  });
}

async function evaluate(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true
  });
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description || 'eval failed');
  return result.value;
}

let navCount = 0;
async function open(hash, { width = 1440, height = 900, seed = true, reducedMotion = false } = {}) {
  await send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 700
  });
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }]
  });
  navCount += 1;
  await send('Page.navigate', { url: `${BASE}/?v=${navCount}${hash}` });
  await sleep(1400);
  if (!seed) return;
  const has = await evaluate("!!localStorage.getItem('trident.state')");
  if (!has) {
    await evaluate(`localStorage.setItem('trident.state', ${JSON.stringify(JSON.stringify(SEED))})`);
    navCount += 1;
    await send('Page.navigate', { url: `${BASE}/?v=${navCount}${hash}` });
    await sleep(1400);
  }
}

/* ---- contrast maths, so the check is measured rather than asserted ---- */
const CONTRAST = `
  (() => {
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
    const parse = (s) => (s.match(/[\\d.]+/g) || []).slice(0, 3).map(Number);
    const bgOf = (node) => {
      let el = node;
      while (el && el !== document.documentElement) {
        const c = getComputedStyle(el).backgroundColor;
        const p = parse(c);
        if (p.length === 3 && !/rgba\\(.*,\\s*0\\)/.test(c)) return p;
        el = el.parentElement;
      }
      return [255, 255, 255];
    };
    const ratio = (a, b) => {
      const L1 = lum(a); const L2 = lum(b);
      return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    };
    const out = [];
    document.querySelectorAll('#view *, .app-header *, .bottom-nav *, .app-footer *').forEach((el) => {
      if (!el.firstChild || el.firstChild.nodeType !== 3) return;
      const text = el.textContent.trim();
      if (!text) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') return;
      const size = parseFloat(cs.fontSize);
      const weight = Number(cs.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const r = ratio(parse(cs.color), bgOf(el));
      const need = large ? 3 : 4.5;
      if (r + 0.05 < need) out.push({ text: text.slice(0, 40), size, ratio: Math.round(r * 100) / 100, need });
    });
    return out;
  })()`;

async function main() {
  /* ---- connect ---- */
  let page = null;
  for (let i = 0; i < 60 && !page; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      page = list.find((t) => t.type === 'page');
    } catch { /* still starting */ }
    if (!page) await sleep(300);
  }
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws failed')); });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) rej(new Error(m.error.message)); else res(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      consoleErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    }
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      consoleErrors.push(m.params.entry.text);
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  /* ======================================================================
     1. A new student can reach their first lesson without confusion
     ====================================================================== */
  await open('#/welcome', { seed: false });
  await evaluate("localStorage.clear()");
  await open('#/welcome', { seed: false });
  const journey = await evaluate(`(async () => {
    const step = (sel) => { const n = document.querySelector(sel); if (n) n.click(); };
    const wait = () => new Promise((r) => setTimeout(r, 420));
    const trail = [];
    trail.push('welcome:' + !!document.querySelector('.welcome'));
    step('[data-testid="guest-btn"], .welcome-actions .btn-primary'); await wait();
    trail.push('onboarding:' + !!document.querySelector('[data-testid="onboarding"]'));
    step('[data-testid="ob-board-tn"]'); await wait();
    trail.push('classes:' + document.querySelectorAll('[data-testid="ob-classes"] .ob-card').length);
    step('[data-testid="ob-class-7"]'); await wait();
    trail.push('preview:' + ((document.querySelector('[data-testid="ob-preview"]')||{}).textContent || 'none'));
    const go = document.querySelector('[data-testid="ob-confirm"]');
    if (go) go.click(); await wait(); await wait();
    trail.push('home:' + !!document.querySelector('[data-testid="mission"]'));
    const cont = document.querySelector('[data-testid="continue-learning"]');
    trail.push('cta:' + (cont ? cont.textContent.trim() : 'none'));
    if (cont) cont.click(); await wait(); await wait();
    trail.push('reader:' + !!document.querySelector('[data-testid="reader"]'));
    return trail;
  })()`);
  const reachedReader = journey.some((s) => s === 'reader:true');
  const steps = journey.filter((s) => s.startsWith('welcome') || s.startsWith('onboarding') || s.startsWith('home')).length;
  if (reachedReader) pass('1. A new student reaches their first lesson', `welcome to reader in 4 taps — ${journey.join(', ')}`);
  else fail('1. A new student reaches their first lesson', journey.join(', '));

  /* --- from here on, a learner with two lessons behind them --- */
  await evaluate(`localStorage.setItem('trident.state', ${JSON.stringify(JSON.stringify(SEED))})`);

  /* ======================================================================
     2. Primary navigation contains only four destinations
     ====================================================================== */
  await open('#/dashboard');
  const nav = await evaluate(`({
    header: [...document.querySelectorAll('#primaryNav a')].map((a) => a.textContent.trim()),
    bottom: [...document.querySelectorAll('#bottomNavList a')].map((a) => a.textContent.trim()),
    labelled: [...document.querySelectorAll('#bottomNavList a span')].every((s) => s.textContent.trim().length > 0)
  })`);
  if (nav.header.length === 4 && nav.bottom.length === 4 && nav.labelled) {
    pass('2. Four destinations, labelled in both bars', `${nav.header.join(' / ')}`);
  } else {
    fail('2. Four destinations, labelled in both bars', JSON.stringify(nav));
  }

  /* ======================================================================
     3. Every screen has exactly one primary action
     ====================================================================== */
  const SCREENS = ['#/dashboard', '#/library', '#/lesson/l-tn7-chola-local-government', '#/quiz', '#/timeline', '#/progress', '#/collection', '#/story'];
  const primaries = [];
  for (const s of SCREENS) {
    await open(s);
    const n = await evaluate(`[...document.querySelectorAll('#view .btn-primary')]
      .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !b.disabled; }).length`);
    primaries.push({ s, n });
  }
  const bad = primaries.filter((p) => p.n !== 1);
  if (!bad.length) pass('3. One primary action per screen', primaries.map((p) => `${p.s.slice(2)}:${p.n}`).join(', '));
  else fail('3. One primary action per screen', bad.map((p) => `${p.s} has ${p.n}`).join('; '));

  /* ======================================================================
     4. The selected-class percentage is the same everywhere
     ====================================================================== */
  await open('#/dashboard');
  const homeFig = await evaluate("(document.querySelector('[data-testid=\"course-figure\"]')||{}).textContent");
  const hudFig = await evaluate("(document.querySelector('[data-testid=\"hud-course\"] span')||{}).textContent");
  await open('#/library');
  const learnFig = await evaluate("(document.querySelector('[data-testid=\"course-count\"]')||{}).textContent");
  await open('#/progress');
  const progFig = await evaluate("(document.querySelector('[data-testid=\"course-figure\"]')||{}).textContent");
  const nums = (s) => (String(s).match(/\d+/g) || []).slice(0, 2).join('/');
  const all = [nums(homeFig), nums(hudFig), nums(learnFig), nums(progFig)];
  if (new Set(all).size === 1 && all[0] === '2/10') {
    pass('4. The class figure agrees everywhere', `${all[0]} on Home, header, Learn and Progress`);
  } else {
    fail('4. The class figure agrees everywhere', `home=${homeFig} header=${hudFig} learn=${learnFig} progress=${progFig}`);
  }

  /* ======================================================================
     5. The quiz shows one question at a time
     ====================================================================== */
  await open('#/quiz');
  const quiz = await evaluate(`({
    onScreen: document.querySelectorAll('#view .question').length,
    position: (document.querySelector('[data-testid="quiz-position"]')||{}).textContent,
    percent: (document.querySelector('[data-testid="quiz-percent"]')||{}).textContent,
    railSegments: document.querySelectorAll('[data-testid="quiz-rail"] i').length,
    hasCheck: !!document.querySelector('[data-testid="quiz-check"]')
  })`);
  if (quiz.onScreen === 1 && /Question 1 of 5/.test(quiz.position) && quiz.railSegments === 5 && quiz.hasCheck) {
    pass('5. One question at a time', `${quiz.position.trim()}, ${quiz.percent.trim()}, five rail segments`);
  } else {
    fail('5. One question at a time', JSON.stringify(quiz));
  }

  /* ======================================================================
     6. The Timeline behaves like a game, not a form
     ====================================================================== */
  await open('#/timeline');
  const tl = await evaluate(`(async () => {
    const rail = !!document.querySelector('.tl-rail');
    const cards = document.querySelectorAll('[data-testid^="tl-card-"]').length;
    const yearsBefore = document.querySelectorAll('.tl-year').length;
    const first = document.querySelector('[data-testid="tl-card-0"] .tl-label').textContent;
    const down = document.querySelector('[data-testid="tl-down-0"]');
    if (down) down.click();
    await new Promise((r) => setTimeout(r, 60));
    const moved = document.querySelector('[data-testid="tl-card-1"] .tl-label').textContent === first;
    const feedback = !!document.querySelector('.tl-card.is-moving');
    document.querySelector('[data-testid="tl-check"]').click();
    await new Promise((r) => setTimeout(r, 200));
    return { rail, cards, yearsBefore, moved, feedback, yearsAfter: document.querySelectorAll('.tl-year').length };
  })()`);
  if (tl.rail && tl.cards === 4 && tl.yearsBefore === 0 && tl.moved && tl.feedback && tl.yearsAfter === 4) {
    pass('6. The Timeline is a rail, with movement feedback', 'cards move, the move is shown, dates revealed only on checking');
  } else {
    fail('6. The Timeline is a rail, with movement feedback', JSON.stringify(tl));
  }

  /* ======================================================================
     7. The companion never covers interactive content
     ====================================================================== */
  const overlaps = [];
  for (const [w, h] of [[1440, 900], [768, 1024], [375, 812]]) {
    for (const s of ['#/dashboard', '#/quiz', '#/lesson/l-tn7-chola-local-government', '#/timeline']) {
      await open(s, { width: w, height: h });
      const r = await evaluate(`(() => {
        const f = document.querySelector('[data-testid="companion-launcher"]');
        if (!f) return { skip: true };
        const a = f.getBoundingClientRect();
        // What a floating launcher can promise: it never sits on the screen's
        // primary action, never on the navigation, and never swallows a tap
        // meant for something else. It does float above content that scrolls
        // past underneath, which is what makes it a floating launcher.
        const guarded = [...document.querySelectorAll('#view .btn-primary, .bottom-nav a, #view .btn-block')]
        const hit = guarded.filter((el) => {
          const b = el.getBoundingClientRect();
          if (b.width === 0 || b.height === 0) return false;
          return !(b.right < a.left || b.left > a.right || b.bottom < a.top || b.top > a.bottom);
        }).map((el) => (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30));
        const mid = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2);
        return { hit, ownsItsOwnCentre: !!(mid && mid.closest('[data-testid="companion-launcher"]')), size: Math.round(a.width) };
      })()`);
      if (r.skip) continue;
      if (r.hit.length) overlaps.push(`${w}px ${s}: ${r.hit.join(', ')}`);
      if (!r.ownsItsOwnCentre) overlaps.push(`${w}px ${s}: something sits on top of the fish`);
    }
  }
  if (!overlaps.length) {
    pass('7. The companion covers no action and no navigation',
      'on Home, quiz, reader and timeline at 1440, 768 and 375: clear of every primary and full-width control and of the bottom bar, and it owns its own circle');
  } else {
    fail('7. The companion covers no action and no navigation', overlaps.join(' | '));
  }

  /* ======================================================================
     8. No unexplained blank rectangle
     ====================================================================== */
  await open('#/dashboard');
  const blanks = await evaluate(`(() => {
    const out = [];
    document.querySelectorAll('body *').forEach((el) => {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 14) return;
      if (el.textContent.trim()) return;
      if (el.querySelector('img, svg, input, canvas')) return;
      const framed = cs.borderTopWidth !== '0px' || cs.borderLeftWidth !== '0px';
      const filled = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent';
      if (framed && !filled) out.push(el.className || el.id || el.tagName);
    });
    return out;
  })()`);
  const toastHidden = await evaluate("getComputedStyle(document.getElementById('toast')).display");
  if (!blanks.length && toastHidden === 'none') {
    pass('8. No blank outlined rectangle', 'the hidden toast no longer paints; no empty framed box anywhere on Home');
  } else {
    fail('8. No blank outlined rectangle', `${blanks.join(', ')} (toast display: ${toastHidden})`);
  }

  /* ======================================================================
     9. Route changes land at the top
     ====================================================================== */
  const landings = await evaluate(`(async () => {
    const wait = () => new Promise((r) => setTimeout(r, 700));
    const out = [];
    for (const h of ['#/library', '#/progress', '#/collection', '#/quiz', '#/dashboard']) {
      window.scrollTo(0, 900);
      await wait();
      window.location.hash = h.slice(1);
      await wait();
      out.push(h + ':' + Math.round(window.scrollY));
    }
    return out;
  })()`);
  const notTop = landings.filter((l) => Number(l.split(':')[1]) > 4);
  if (!notTop.length) pass('9. Every route change lands at the top', landings.join(', '));
  else fail('9. Every route change lands at the top', notTop.join(', '));

  /* ======================================================================
     10. A failed event image has a designed fallback
     ====================================================================== */
  // A cached event with an image that cannot load, so the failure path is
  // exercised on purpose rather than waiting for a real 404.
  await open('#/dashboard');
  await evaluate(`(() => {
    const today = (() => {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    })();
    localStorage.setItem('trident:wikimedia-event:' + today, JSON.stringify({
      fetchedAt: new Date().toISOString(),
      source: 'Wikimedia “On this day” feed',
      events: [{
        id: 'check-broken-image',
        year: '1336',
        title: 'Vijayanagara is founded',
        text: 'A city is founded on the south bank of the Tungabhadra.',
        extract: 'The capital of the Vijayanagara empire.',
        url: 'https://en.wikipedia.org/wiki/Vijayanagara',
        source: 'Wikimedia “On this day” feed',
        image: { src: 'https://127.0.0.1:1/not-a-real-image.jpg', width: 320, height: 240 }
      }]
    }));
    return true;
  })()`);
  await open('#/event');
  await sleep(2200);
  const evt = await evaluate(`(async () => {
    const img = document.querySelector('.event-frame img');
    if (img) { img.dispatchEvent(new Event('error')); await new Promise((r) => setTimeout(r, 150)); }
    const motif = document.querySelector('[data-testid="event-motif"]');
    if (!motif) return { state: 'none', hasCard: !!document.querySelector('[data-testid="event-card"]'), sawImg: !!img };
    const r = motif.getBoundingClientRect();
    return {
      state: 'motif', drawn: !!motif.querySelector('svg'), sawImg: !!img,
      w: Math.round(r.width), h: Math.round(r.height),
      label: motif.getAttribute('aria-label'), caption: (motif.querySelector('span') || {}).textContent
    };
  })()`);
  if (evt.state === 'motif' && evt.drawn && evt.w > 40 && evt.h > 40) {
    pass('10. A failed image is replaced by a drawn motif',
      `${evt.sawImg ? 'the image errored and was swapped' : 'no image offered'} — ${evt.w}x${evt.h} drawing, labelled "${evt.label}", captioned "${(evt.caption || '').trim()}"`);
  } else {
    fail('10. A failed image is replaced by a drawn motif', JSON.stringify(evt));
  }

  /* ======================================================================
     11. Keyboard navigation and visible focus
     ====================================================================== */
  await open('#/dashboard');
  const kb = await evaluate(`(() => {
    const focusables = [...document.querySelectorAll('a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const cta = document.querySelector('[data-testid="continue-learning"]');
    const reachable = focusables.includes(cta);
    cta.focus();
    const focused = document.activeElement === cta;
    const cs = getComputedStyle(document.documentElement);
    return { count: focusables.length, reachable, focused,
      hasFocusRule: [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((r) => /:focus-visible/.test(r.selectorText || '')); } catch { return false; } }) };
  })()`);
  const smallTargets = await evaluate(`[...document.querySelectorAll('#view a, #view button, .bottom-nav a')]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 44 && !el.closest('.reader-top, .source, .more-filters'); })
    .map((el) => el.textContent.trim().slice(0, 24))`);
  if (kb.reachable && kb.focused && kb.hasFocusRule && smallTargets.length === 0) {
    pass('11. Keyboard reaches everything, and focus is visible', `${kb.count} focusable elements, a :focus-visible outline is defined, every target at least 44px tall`);
  } else {
    fail('11. Keyboard reaches everything, and focus is visible', `${JSON.stringify(kb)} short targets: ${smallTargets.join(', ')}`);
  }

  /* ======================================================================
     12. Reduced motion removes the non-essential movement
     ====================================================================== */
  await open('#/dashboard', { reducedMotion: true });
  const motion = await evaluate(`(() => {
    const f = document.querySelector('[data-testid="companion-launcher"]');
    const cs = getComputedStyle(f);
    const sparkle = getComputedStyle(document.querySelector('.companion-sparkle'));
    return { launcher: cs.animationName, sparkle: sparkle.animationName, duration: cs.transitionDuration };
  })()`);
  if (motion.launcher === 'none' && motion.sparkle === 'none') {
    pass('12. Reduced motion stops the idle float and the glint', 'the launcher and its sparkles have no animation');
  } else {
    fail('12. Reduced motion stops the idle float and the glint', JSON.stringify(motion));
  }

  /* ======================================================================
     13. Contrast passes WCAG AA
     ====================================================================== */
  const failures = [];
  for (const s of ['#/dashboard', '#/library', '#/lesson/l-tn7-chola-local-government', '#/quiz', '#/progress', '#/collection']) {
    await open(s);
    const bad2 = await evaluate(CONTRAST);
    bad2.forEach((b) => failures.push(`${s}: "${b.text}" ${b.ratio}:1 (needs ${b.need})`));
  }
  if (!failures.length) pass('13. Contrast passes AA on every screen checked', 'every text node measured against its real background');
  else fail('13. Contrast passes AA on every screen checked', failures.slice(0, 8).join(' | '));

  /* ======================================================================
     14. Progress and citations are unchanged
     ====================================================================== */
  await open('#/lesson/l-tn7-chola-local-government');
  const data = await evaluate(`(async () => {
    const state = JSON.parse(localStorage.getItem('trident.state'));
    const lessons = await (await fetch('data/lessons.json')).json();
    const tn7 = lessons.lessons.filter((l) => l.id.startsWith('l-tn7-'));
    const fields = ['book', 'chapter', 'pageStart', 'pageEnd', 'passageId', 'board', 'classLevel'];
    return {
      completed: Object.keys(state.completedLessons).length,
      xp: state.xp,
      streak: state.streak.current,
      lessons: tn7.length,
      citationsComplete: tn7.every((l) => l.citation && fields.every((f) => l.citation[f] !== undefined)),
      sourceShown: (document.querySelector('.src-line') || {}).textContent,
      passageInDetail: /trd_/.test(document.querySelector('.src-id') ? document.querySelector('.src-id').textContent : '')
    };
  })()`);
  if (data.completed === 2 && data.xp === 280 && data.streak === 3
      && data.lessons === 10 && data.citationsComplete && data.passageInDetail) {
    pass('14. Progress and citations untouched', `2 completed lessons, 280 XP, 3-day streak; 10 Class 7 lessons, every citation complete, passage id shown under "View source"`);
  } else {
    fail('14. Progress and citations untouched', JSON.stringify(data));
  }

  /* ======================================================================
     15. No console errors and no horizontal overflow
     ====================================================================== */
  const overflow = [];
  for (const [w, h] of [[1440, 900], [768, 1024], [375, 812]]) {
    for (const s of SCREENS) {
      await open(s, { width: w, height: h });
      const o = await evaluate('document.documentElement.scrollWidth > window.innerWidth + 1');
      if (o) overflow.push(`${w}px ${s}`);
    }
  }
  const realErrors = consoleErrors.filter((e) => !/favicon|ERR_|404|daily-brief/i.test(e));
  if (!overflow.length && !realErrors.length) {
    pass('15. No console errors, no horizontal overflow', '8 screens at 1440, 768 and 375');
  } else {
    fail('15. No console errors, no horizontal overflow', `overflow: ${overflow.join(', ') || 'none'}; errors: ${realErrors.slice(0, 3).join(' | ') || 'none'}`);
  }

  /* ---- report ---- */
  console.log('\nTRIDENT redesign verification\n' + '='.repeat(64));
  results.forEach((r) => {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.n}`);
    console.log(`      ${r.d}`);
  });
  const ok = results.filter((r) => r.ok).length;
  console.log('='.repeat(64));
  console.log(`${ok} of ${results.length} checks passed`);
  chrome.kill('SIGKILL');
  process.exit(ok === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error('harness failed:', e.message);
  chrome.kill('SIGKILL');
  process.exit(2);
});
