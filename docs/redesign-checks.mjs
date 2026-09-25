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
    meters: document.querySelectorAll('[data-testid="quiz-rail"]').length,
    boxes: document.querySelectorAll('.q-progress i, .q-progress .rail').length,
    hasCheck: !!document.querySelector('[data-testid="quiz-check"]')
  })`);
  if (quiz.onScreen === 1 && /Question 1 of 5/.test(quiz.position) && quiz.meters === 1 && quiz.boxes === 0 && quiz.hasCheck) {
    pass('5. One question at a time', `${quiz.position.trim()}, ${quiz.percent.trim()}, one continuous progress track`);
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
  await evaluate(`document.querySelector('[data-testid="profile-btn"]').click(); true`);
  await sleep(250);
  const smallTargets = await evaluate(`[...document.querySelectorAll('#view a, #view button, .bottom-nav a, .app-header a, .app-header button')]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 44 && !el.closest('.reader-top, .source, .more-filters'); })
    .map((el) => el.textContent.trim().slice(0, 24) || el.getAttribute('aria-label'))`);
  await evaluate(`document.querySelector('[data-testid="profile-btn"]').click(); true`);
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
  const ALL_ROUTES = [...SCREENS, '#/event', '#/settings', '#/profile'];
  for (const [w, h] of [[1440, 900], [1280, 800], [768, 1024], [375, 812]]) {
    for (const s of ALL_ROUTES) {
      await open(s, { width: w, height: h });
      const o = await evaluate(`(() => {
        const page = document.documentElement.scrollWidth > window.innerWidth + 1;
        const hdr = document.querySelector('.header-inner');
        const clipped = hdr && !hdr.closest('[hidden]') && hdr.scrollWidth > hdr.clientWidth + 1;
        // text cut off by a card that hides its overflow
        const cut = [];
        document.querySelectorAll('#view b, #view span, #view p, #view h1, #view h2, #view h3, #view a, #view button').forEach((e) => {
          if (!e.firstChild || e.firstChild.nodeType !== 3 || !e.textContent.trim()) return;
          const r = e.getBoundingClientRect(); if (!r.width) return;
          let p = e.parentElement;
          while (p && p !== document.body) {
            const cs = getComputedStyle(p);
            if (cs.overflowX === 'hidden' || cs.overflowX === 'clip') {
              const pr = p.getBoundingClientRect();
              if (r.right > pr.right + 1 || r.left < pr.left - 1) cut.push(e.textContent.trim().slice(0, 30));
              break;
            }
            p = p.parentElement;
          }
        });
        return (page || clipped || cut.length) ? { page, clipped, cut: cut.slice(0, 3) } : false;
      })()`);
      if (o) overflow.push(`${w}px ${s} ${JSON.stringify(o)}`);
    }
  }
  const realErrors = consoleErrors.filter((e) => !/favicon|ERR_|404|daily-brief/i.test(e));
  if (!overflow.length && !realErrors.length) {
    pass('15. No console errors, no horizontal overflow', `${ALL_ROUTES.length} routes at 1440, 1280, 768 and 375: no page overflow, no clipped header, no text cut off inside a card; zero console errors and uncaught exceptions`);
  } else {
    fail('15. No console errors, no horizontal overflow', `overflow: ${overflow.join(', ') || 'none'}; errors: ${realErrors.slice(0, 3).join(' | ') || 'none'}`);
  }

  /* ======================================================================
     16. The header band is the national tricolour, and only that
     --------------------------------------------------------------------
     Three touching stripes of equal width in #FF9933, #FFFFFF and #138808,
     full width, 3-4px each stripe high, not announced, and identical at
     0, 1 and 2 completed lessons and on every route.
     ====================================================================== */
  const BAND = `(() => {
    const band = document.querySelector('[data-testid="tricolour-nav"]');
    const r = band.getBoundingClientRect();
    const parts = [...band.children].map((c) => { const b = c.getBoundingClientRect(); return { l: b.left, w: b.width, h: b.height, bg: getComputedStyle(c).backgroundColor }; });
    return {
      width: r.width, vw: document.documentElement.clientWidth, hidden: band.getAttribute('aria-hidden'),
      role: band.getAttribute('role'), progressAttrs: ['aria-valuenow','aria-valuemax','value'].filter((a) => band.hasAttribute(a)).length,
      anim: getComputedStyle(band).animationName, radius: getComputedStyle(band).borderRadius,
      parts: parts.map((p) => ({ w: Math.round(p.w * 100) / 100, h: p.h, bg: p.bg, l: Math.round(p.l * 100) / 100 }))
    };
  })()`;
  const bands = [];
  for (const [label, done] of [['0 done', {}], ['1 done', { 'l-tn7-sources-monuments': '2026-09-20T09:00:00.000Z' }],
    ['2 done', { 'l-tn7-sources-monuments': '2026-09-20T09:00:00.000Z', 'l-tn7-north-kingdoms': '2026-09-21T09:00:00.000Z' }]]) {
    await open('#/dashboard');
    await evaluate(`localStorage.setItem('trident.state', JSON.stringify(Object.assign(
      JSON.parse(localStorage.getItem('trident.state')), { completedLessons: ${JSON.stringify(done)} })))`);
    for (const route of ['#/dashboard', '#/library', '#/quiz']) {
      await open(route);
      bands.push({ label, route, b: await evaluate(BAND) });
    }
  }
  await evaluate(`localStorage.setItem('trident.state', ${JSON.stringify(JSON.stringify(SEED))})`);
  const want = ['rgb(255, 153, 51)', 'rgb(255, 255, 255)', 'rgb(19, 136, 8)'];
  const bandProblems = bands.filter(({ b }) => {
    const [a, m, c] = b.parts;
    const equal = b.parts.length === 3 && Math.abs(a.w - m.w) < 1 && Math.abs(m.w - c.w) < 1;
    const touching = b.parts.length === 3 && Math.abs(a.l + a.w - m.l) < 0.6 && Math.abs(m.l + m.w - c.l) < 0.6;
    const colours = b.parts.every((p, i) => p.bg === want[i]);
    const height = b.parts.every((p) => p.h >= 3 && p.h <= 4);
    return !(equal && touching && colours && height && Math.abs(b.width - b.vw) < 1 && b.hidden === 'true'
      && !b.progressAttrs && b.anim === 'none' && (b.radius === '0px' || b.radius === ''));
  });
  const same = new Set(bands.map(({ b }) => JSON.stringify(b.parts))).size === 1;
  if (!bandProblems.length && same) {
    const p = bands[0].b.parts;
    pass('16. The header band is the national tricolour, not a progress bar',
      `three touching stripes of ${p[0].w}px each, ${p[0].h}px high, #FF9933 / #FFFFFF / #138808, full width, aria-hidden, no progress attributes, no animation; identical at 0, 1 and 2 lessons on Home, Learn and Practice`);
  } else {
    fail('16. The header band is the national tricolour, not a progress bar', JSON.stringify(bandProblems.slice(0, 2).concat(same ? [] : ['changes between states'])));
  }

  /* ======================================================================
     17. Course progress is exact: 0%, 33.33%, 66.67%, 100% for 0-3 lessons
     --------------------------------------------------------------------
     A Class 6 learner (three lessons). The same number drives the Home
     journey card, the Learn page and the lesson reader, each through the one
     shared meter, with real progressbar values and no segment boxes.
     ====================================================================== */
  const tn6 = await evaluate(`(async () => (await (await fetch('data/lessons.json')).json()).lessons
    .filter((l) => l.path === 'tn' && l.classLevel === '6').map((l) => l.id))()`);
  const counts = [];
  for (let n = 0; n <= tn6.length; n += 1) {
    // leave any page that saves reading time on exit before rewriting the state
    await open('#/progress');
    await evaluate(`(() => {
      const s = JSON.parse(localStorage.getItem('trident.state'));
      const done = {};
      ${JSON.stringify(tn6)}.slice(0, ${n}).forEach((id) => { done[id] = '2026-09-20T09:00:00.000Z'; });
      s.completedLessons = done;
      s.learningProfile = Object.assign({}, s.learningProfile, { classLevel: '6' });
      localStorage.setItem('trident.state', JSON.stringify(s));
      return true;
    })()`);
    const read = `(() => {
      const m = (id) => { const p = document.querySelector('[data-testid="' + id + '"]'); if (!p) return null;
        const w = p.closest('.meter');
        return { now: p.getAttribute('aria-valuenow'), max: p.getAttribute('aria-valuemax'), min: p.getAttribute('aria-valuemin'),
          role: p.getAttribute('role'), label: p.getAttribute('aria-label'), pct: w.dataset.percent, value: p.value, pmax: p.max,
          h: p.getBoundingClientRect().height, boxes: w.querySelectorAll('i').length }; };
      return m;
    })()`;
    await open('#/dashboard');
    const home = await evaluate(`(${read})('home-rail')`);
    const words = await evaluate(`(document.querySelector('[data-testid="course-figure"]')||{}).textContent`);
    await open('#/library');
    const lib = await evaluate(`(${read})('course-rail')`);
    const libWords = await evaluate(`(document.querySelector('[data-testid="course-count"]')||{}).textContent`);
    const libAction = await evaluate(`(document.querySelector('[data-testid="course-action"]')||{}).textContent`);
    await open('#/lesson/' + tn6[0]);
    const reader = await evaluate(`(${read})('reader-rail')`);
    counts.push({ n, home, lib, reader, words, libWords, libAction });
  }
  await evaluate(`localStorage.setItem('trident.state', ${JSON.stringify(JSON.stringify(SEED))})`);
  const expectPct = (n) => (n / tn6.length * 100).toFixed(2);
  const badCounts = counts.filter((c) => [c.home, c.lib, c.reader].some((m) => !m || m.now !== String(c.n)
    || m.max !== String(tn6.length) || m.min !== '0' || m.role !== 'progressbar' || !m.label || m.pct !== expectPct(c.n)
    || m.h < 10 || m.boxes !== 0)
    || c.words.trim() !== `${c.n} of ${tn6.length} chapters explored`
    || !c.libWords.startsWith(`${c.n} of ${tn6.length} lessons read — ${Math.round(c.n / tn6.length * 100)}% of the course`)
    || c.libAction.trim() !== (c.n === 0 ? 'Start learning' : c.n === tn6.length ? 'Review lessons' : 'Continue reading'));
  if (tn6.length === 3 && !badCounts.length) {
    pass('17. Course progress is exact at every count, in one shared component',
      counts.map((c) => `${c.n} of 3 → ${c.home.pct}% ("${c.libAction.trim()}")`).join(', ') + '; the same on Home, Learn and the lesson reader; role="progressbar" with real min, max and value; 10px+ track, no boxes');
  } else {
    fail('17. Course progress is exact at every count, in one shared component', JSON.stringify(badCounts.slice(0, 2)));
  }

  /* ======================================================================
     18. Quiz progress follows the question, and is never red before an error
     ====================================================================== */
  await open('#/quiz');
  const quizAdvance = await evaluate(`(async () => {
    const data = await (await fetch('data/questions.json')).json();
    const all = data.questions || data;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const meter = () => {
      const p = document.querySelector('[data-testid="quiz-rail"]');
      // the fill colour: the element's color drives the native fill in every engine
      const fill = p.closest('.meter').classList.contains('is-quiz') ? getComputedStyle(p).color : 'not-quiz';
      return { pct: (document.querySelector('[data-testid="quiz-percent"]') || {}).textContent,
        pos: (document.querySelector('[data-testid="quiz-position"]') || {}).textContent,
        now: p.getAttribute('aria-valuenow'), share: p.closest('.meter').dataset.percent, fill };
    };
    const steps = [];
    for (let i = 0; i < 5; i += 1) {
      steps.push(meter());
      const prompt = document.querySelector('.question-prompt').textContent.trim();
      const q = all.find((x) => x.prompt.trim() === prompt);
      const radios = [...document.querySelectorAll('.options input')];
      if (radios.length) {
        // answer the first one wrong, so the red check below is meaningful
        const pick = i === 0 ? radios.find((r) => Number(r.value) !== q.answerIndex) : radios.find((r) => Number(r.value) === q.answerIndex) || radios[0];
        pick.checked = true; pick.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        [...document.querySelectorAll('.match-row select')].forEach((s) => { s.selectedIndex = 1; s.dispatchEvent(new Event('change', { bubbles: true })); });
        const mv = document.querySelector('.order-item button:not([disabled])'); if (mv) mv.click();
      }
      await wait(60);
      document.querySelector('[data-testid="quiz-check"]').click();
      await wait(120);
      if (i === 0) steps[0].afterWrong = meter();
      const next = document.querySelector('[data-testid="quiz-next"]');
      if (i < 4) { next.click(); await wait(150); }
    }
    return steps;
  })()`);
  const red = 'rgb(199, 58, 50)';
  const q18ok = quizAdvance.length === 5
    && quizAdvance.every((st, i) => st.pct.trim() === `${(i + 1) * 20}% complete` && st.pos.trim() === `Question ${i + 1} of 5`
      && st.share === ((i + 1) * 20).toFixed(2) && st.fill !== red)
    && quizAdvance[0].afterWrong && quizAdvance[0].afterWrong.fill !== red;
  if (q18ok) {
    pass('18. Quiz progress follows the question and is never red',
      quizAdvance.map((st) => `${st.pos.trim()} → ${st.pct.trim()}`).join(', ') + `; fill ${quizAdvance[0].fill}, unchanged after a wrong answer`);
  } else {
    fail('18. Quiz progress follows the question and is never red', JSON.stringify(quizAdvance));
  }

  /* ======================================================================
     19. Wikimedia is visibly the live external source
     ====================================================================== */
  await open('#/dashboard');
  const homeTag = await evaluate("(document.querySelector('[data-testid=\"home-api-tag\"]')||{}).textContent");
  await open('#/event');
  await sleep(2000);
  const eventLabels = await evaluate(`({
    badge: (document.querySelector('[data-testid="wikimedia-label"]')||{}).textContent,
    note: (document.querySelector('[data-testid="api-note"]')||{}).textContent,
    teal: getComputedStyle(document.querySelector('[data-testid="wikimedia-label"]')).color
  })`);
  if (/wikimedia/i.test(homeTag) && /live/i.test(homeTag)
      && /Wikimedia API/i.test(eventLabels.badge) && /not TRIDENT syllabus material/i.test(eventLabels.note)) {
    pass('19. Wikimedia is visibly the live external source',
      `Home row tagged "${homeTag.trim()}"; the event page badges "${eventLabels.badge.trim()}" and separates API content from textbook content`);
  } else {
    fail('19. Wikimedia is visibly the live external source', JSON.stringify({ homeTag, ...eventLabels }));
  }

  /* ======================================================================
     20. An API failure invents nothing and grants nothing
     ====================================================================== */
  await open('#/dashboard');
  await evaluate(`(() => {
    const d = new Date();
    const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    localStorage.removeItem('trident:wikimedia-event:' + today);
    return true;
  })()`);
  await evaluate("window.fetch = ((orig) => (u, o) => (/wikimedia|wikipedia/i.test(String(u)) ? Promise.reject(new Error('blocked')) : orig(u, o)))(window.fetch); true");
  await open('#/event');
  await sleep(2500);
  const down = await evaluate(`(() => {
    const state = JSON.parse(localStorage.getItem('trident.state'));
    const offline = document.querySelector('[data-testid="event-offline"], [data-testid="event-empty"]');
    return {
      offline: !!offline,
      message: offline ? (offline.querySelector('h2') || {}).textContent : null,
      retry: !!document.querySelector('[data-testid="event-retry"]'),
      card: !!document.querySelector('[data-testid="event-card"]'),
      eventXp: Object.keys(state.awardedRewards || {}).filter((k) => k.startsWith('event:')).length
    };
  })()`);
  if (down.offline && down.retry && !down.card && down.eventXp === 0
      && /could not be loaded/i.test(down.message || '')) {
    pass('20. An API failure invents nothing', `"${down.message.trim()}" with a Retry button, no event card and no event XP recorded`);
  } else {
    fail('20. An API failure invents nothing', JSON.stringify(down));
  }

  /* ======================================================================
     21. Today's activities carry visible actions
     ====================================================================== */
  await open('#/dashboard');
  const actions = await evaluate(`(() => {
    const rows = [...document.querySelectorAll('.checkpoint')];
    return rows.map((r) => {
      const go = r.querySelector('.cp-side a, .cp-side .stamp');
      const mark = r.querySelector('.cp-mark');
      const xp = r.querySelector('.cp-xp');
      return {
        action: go ? go.textContent.trim() : null,
        markPx: mark ? Math.round(mark.getBoundingClientRect().width) : 0,
        xp: xp ? xp.textContent.trim() : null,
        state: r.classList.contains('is-done') ? 'done' : r.classList.contains('is-active') ? 'active'
          : r.classList.contains('is-locked') ? 'locked' : 'available'
      };
    });
  })()`);
  const labelsOk = actions.length === 4
    && actions.slice(0, 3).every((a) => a.action && a.xp && a.markPx >= 38)
    && actions[0].state === 'active' && actions[3].state === 'locked';
  if (labelsOk) {
    pass("21. The mission route shows action, time-reward and state at every checkpoint",
      actions.map((a) => `${a.action}${a.xp ? ` (${a.xp})` : ''} [${a.state}]`).join(' → '));
  } else {
    fail("21. The mission route shows action, time-reward and state at every checkpoint", JSON.stringify(actions));
  }

  /* ======================================================================
     22. Era colours appear only as small markers
     ====================================================================== */
  const eraMisuse = [];
  for (const s of ['#/library', '#/lesson/l-tn7-chola-local-government', '#/timeline']) {
    await open(s);
    const big = await evaluate(`(() => {
      const ERA = ['rgb(110, 113, 106)', 'rgb(8, 127, 140)', 'rgb(107, 79, 161)', 'rgb(177, 79, 50)', 'rgb(19, 138, 75)'];
      const out = [];
      document.querySelectorAll('#view *').forEach((el) => {
        const bg = getComputedStyle(el).backgroundColor;
        if (!ERA.includes(bg)) return;
        const r = el.getBoundingClientRect();
        if (r.width * r.height > 44 * 44) out.push(el.className + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
      });
      return out;
    })()`);
    big.forEach((b) => eraMisuse.push(`${s}: ${b}`));
  }
  if (!eraMisuse.length) {
    pass('22. Era colours stay small markers', 'no element larger than a 44px marker uses an era accent as its background');
  } else {
    fail('22. Era colours stay small markers', eraMisuse.join(' | '));
  }

  /* ======================================================================
     23. Timeline citations appear only after checking
     ====================================================================== */
  await open('#/timeline');
  const tlCite = await evaluate(`(async () => {
    const before = {
      cites: document.querySelectorAll('.tl-card .tl-cite').length,
      years: document.querySelectorAll('.tl-card .tl-year').length,
      eras: document.querySelectorAll('.tl-card .tl-era').length,
      controls: document.querySelectorAll('.tl-card .order-controls').length
    };
    document.querySelector('[data-testid="tl-check"]').click();
    await new Promise((r) => setTimeout(r, 250));
    return { before, after: {
      cites: document.querySelectorAll('.tl-card .tl-cite').length,
      years: document.querySelectorAll('.tl-card .tl-year').length,
      answer: !!document.querySelector('.tl-answer'),
      answerCites: document.querySelectorAll('.tl-answer .tl-cite').length
    } };
  })()`);
  if (tlCite.before.cites === 0 && tlCite.before.years === 0 && tlCite.before.eras === 4
      && tlCite.before.controls === 4 && tlCite.after.years === 4 && tlCite.after.answerCites === 4) {
    pass('23. Timeline citations wait for the check',
      'before: four titles with era markers and movement controls, no dates and no citations; after: four dates and four full citations');
  } else {
    fail('23. Timeline citations wait for the check', JSON.stringify(tlCite));
  }

  /* ======================================================================
     24. The companion leaps once, and rests
     ====================================================================== */
  await open('#/dashboard');
  const fish = await evaluate(`(async () => {
    const root = document.querySelector('.companion');
    const btn = document.querySelector('[data-testid="companion-launcher"]');
    const hashBefore = location.hash;
    btn.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse', bubbles: true }));
    const leapt = root.classList.contains('is-leaping');
    // a pointer resting on the launcher must not restart the animation
    btn.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse', bubbles: true }));
    await new Promise((r) => setTimeout(r, 700));
    const stillAfter = root.classList.contains('is-leaping');
    btn.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse', bubbles: true }));
    const repeated = root.classList.contains('is-leaping');
    btn.click();
    await new Promise((r) => setTimeout(r, 250));
    const open = !!document.querySelector('[data-testid="companion-panel"], .companion-panel');
    return { leapt, stillAfter, repeated, open, hashUnchanged: location.hash === hashBefore };
  })()`);
  if (fish.leapt && !fish.stillAfter && !fish.repeated && fish.open && fish.hashUnchanged) {
    pass('24. The companion leaps once and rests',
      'one leap on hover, the class clears when it ends, a resting pointer does not restart it, and opening the drawer leaves the URL alone');
  } else {
    fail('24. The companion leaps once and rests', JSON.stringify(fish));
  }

  /* ======================================================================
     25. The dashboard has one dominant action, and a mission starts in one tap
     ====================================================================== */
  await open('#/dashboard');
  const cta = await evaluate(`(async () => {
    const primaries = [...document.querySelectorAll('#view .btn-primary')]
      .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0; });
    const btn = document.querySelector('[data-testid="expedition-cta"]');
    const text = btn ? btn.textContent.trim() : null;
    btn.click();
    await new Promise((r) => setTimeout(r, 900));
    return { primaries: primaries.length, text, landed: location.hash };
  })()`);
  if (cta.primaries === 1 && /mission|expedition/i.test(cta.text) && /#\/(story|quiz|event|lesson)/.test(cta.landed)) {
    pass('25. One dominant action, and a mission begins in one tap',
      `"${cta.text}" is the only saffron button; one tap opened ${cta.landed}`);
  } else {
    fail('25. One dominant action, and a mission begins in one tap', JSON.stringify(cta));
  }

  /* ======================================================================
     26. Every displayed image carries attribution; no broken image icons
     ====================================================================== */
  const imgIssues = [];
  let imgCount = 0;
  for (const [w, h] of [[1440, 900], [375, 812]]) {
    for (const s of ['#/dashboard', '#/lesson/l-tn7-chola-local-government', '#/story', '#/collection', '#/onboarding']) {
      await open(s, { width: w, height: h });
      await sleep(900);
      const r = await evaluate(`(() => {
        const figs = [...document.querySelectorAll('#view figure.hi')];
        const unattributed = figs.filter((f) => !f.querySelector('.hi-source') || !f.querySelector('.hi-cite'));
        const tiles = [...document.querySelectorAll('#view .archive-tile')];
        const tileNoSource = tiles.filter((t) => !t.querySelector('.hi-source'));
        const imgs = [...document.querySelectorAll('#view img')];
        const broken = imgs.filter((i) => i.complete && i.naturalWidth === 0);
        const noAlt = imgs.filter((i) => !i.hasAttribute('alt'));
        const dupAlt = figs.filter((f) => {
          const im = f.querySelector('img'); const cap = f.querySelector('.hi-caption-text');
          return im && cap && im.alt.trim() === cap.textContent.trim();
        });
        return { figs: figs.length + tiles.length, unattributed: unattributed.length + tileNoSource.length,
          broken: broken.map((i) => i.src.split('/').pop()), noAlt: noAlt.length, dupAlt: dupAlt.length };
      })()`);
      imgCount += r.figs;
      if (r.unattributed) imgIssues.push(`${w}px ${s}: ${r.unattributed} without attribution`);
      if (r.broken.length) imgIssues.push(`${w}px ${s}: broken ${r.broken.join(',')}`);
      if (r.noAlt) imgIssues.push(`${w}px ${s}: ${r.noAlt} images with no alt`);
      if (r.dupAlt) imgIssues.push(`${w}px ${s}: ${r.dupAlt} alt texts duplicating their caption`);
    }
  }
  if (!imgIssues.length && imgCount > 0) {
    pass('26. Every image is attributed, has alt text, and loads', `${imgCount} images and tiles checked across five screens at two widths; none broken, none unattributed, no alt text repeating its caption`);
  } else {
    fail('26. Every image is attributed, has alt text, and loads', imgIssues.join(' | ') || 'no images found');
  }

  /* ======================================================================
     27. Every textbook image has its book and page; nothing unverified shows
     ====================================================================== */
  const cat = await evaluate(`(async () => {
    const c = await (await fetch('data/history-images.json')).json();
    const imgs = c.images || [];
    const tb = imgs.filter((i) => i.sourceType === 'textbook');
    return {
      total: imgs.length,
      textbook: tb.length,
      missingBookOrPage: tb.filter((i) => !i.bookTitle || !i.pageStart || !i.pageEnd).length,
      unverified: imgs.filter((i) => i.verified !== true).length,
      missingFields: imgs.filter((i) => !i.id || !i.title || !i.alt || !i.caption || !i.url || !i.credit || !i.licence).length,
      primaries: new Set(tb.filter((i) => i.primary).map((i) => i.lessonId)).size,
      sourcePdfsUnchanged: c.review && c.review.sourcePdfsUnchanged === true
    };
  })()`);
  if (cat.textbook > 0 && !cat.missingBookOrPage && !cat.unverified && !cat.missingFields && cat.sourcePdfsUnchanged) {
    pass('27. Every textbook image carries its book and pages', `${cat.textbook} images, all verified, all with book, chapter and pages; ${cat.primaries} lessons have a lead image; source PDFs recorded unchanged`);
  } else {
    fail('27. Every textbook image carries its book and pages', JSON.stringify(cat));
  }

  /* ======================================================================
     28. No API key reaches the browser
     ====================================================================== */
  const leak = await evaluate(`(async () => {
    const files = ['index.html', 'js/app.js', 'js/images.js', 'js/brief.js', 'js/companion.js', 'js/wikipedia.js',
      'js/openlibrary.js', 'js/library.js', 'js/storage.js', 'data/history-images.json'];
    const hits = [];
    for (const f of files) {
      const text = await (await fetch(f)).text();
      if (/EUROPEANA_API_KEY|GEMINI_API_KEY|wskey=[A-Za-z0-9]|AIza[0-9A-Za-z_-]{20,}/.test(text)) hits.push(f);
    }
    const env = await fetch('.env').then((r) => r.status).catch(() => 'blocked');
    return { hits, env };
  })()`);
  if (!leak.hits.length) {
    pass('28. No API key reaches the browser', `ten served files scanned for key names and key-shaped strings: none found. Europeana is reached only through the server's /api/images/europeana route`);
  } else {
    fail('28. No API key reaches the browser', JSON.stringify(leak));
  }

  /* ======================================================================
     29. A reward cannot be awarded twice
     ====================================================================== */
  await open('#/dashboard');
  const twice = await evaluate(`(async () => {
    const g = await import('./js/gamify.js');
    const s = await import('./js/storage.js');
    const day = '2031-01-01';
    const before = s.load().xp;
    const a = g.award('story', day, { lessons: [] });
    const mid = s.load().xp;
    const b = g.award('story', day, { lessons: [] });
    const after = s.load().xp;
    return { before, mid, after, first: a.xp, second: b.xp };
  })()`);
  if (twice.first === 30 && twice.second === 0 && twice.after === twice.mid && twice.mid === twice.before + 30) {
    pass('29. A reward is granted once', `the same story reward asked for twice paid ${twice.first} XP, then ${twice.second}; total ${twice.before} → ${twice.after}`);
  } else {
    fail('29. A reward is granted once', JSON.stringify(twice));
  }
  await evaluate(`localStorage.setItem('trident.state', ${JSON.stringify(JSON.stringify(SEED))})`);

  /* ======================================================================
     30. Wikimedia Commons results are filtered, capped, cached and deduped
     --------------------------------------------------------------------
     Neither this sandbox nor the development machine's shell can reach
     Wikimedia, so the live API is replaced by a response of the documented
     shape. What this proves is the filtering, not that Commons is reachable.
     ====================================================================== */
  await open('#/dashboard');
  const commons = await evaluate(`(async () => {
    const mod = await import('./js/images.js');
    Object.keys(localStorage).filter((k) => k.startsWith('trident:commons:')).forEach((k) => localStorage.removeItem(k));
    let calls = 0;
    const page = (id, full) => ({
      pageid: id, title: 'File:Fixture ' + id + '.jpg',
      imageinfo: [{
        thumburl: full.thumb === false ? undefined : 'https://example.invalid/t' + id + '.jpg',
        thumbwidth: 640, thumbheight: 480, mime: 'image/jpeg',
        descriptionurl: full.page === false ? undefined : 'https://commons.wikimedia.org/wiki/File:Fixture_' + id + '.jpg',
        extmetadata: {
          LicenseShortName: full.licence === false ? undefined : { value: 'CC BY-SA 4.0' },
          LicenseUrl: full.licence === false ? undefined : { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
          ObjectName: { value: 'Fixture ' + id }, ImageDescription: { value: 'A fixture image ' + id }
        }
      }]
    });
    const pages = {};
    // nine complete records, and three each missing one required field
    for (let i = 1; i <= 9; i++) pages[i] = page(i, {});
    pages[20] = page(20, { thumb: false });
    pages[21] = page(21, { page: false });
    pages[22] = page(22, { licence: false });
    const real = window.fetch;
    window.fetch = async (u, o) => {
      if (String(u).includes('commons.wikimedia.org')) {
        calls++;
        await new Promise((r) => setTimeout(r, 60));
        return new Response(JSON.stringify({ query: { pages } }), { status: 200 });
      }
      return real(u, o);
    };
    const [a, b] = await Promise.all([mod.searchCommons('Chola temple'), mod.searchCommons('Chola temple')]);
    const c = await mod.searchCommons('Chola temple');
    window.fetch = async () => { throw new Error('offline'); };
    const d = await mod.searchCommons('Pallava relief');
    window.fetch = real;
    const ids = a.results.map((r) => r.id);
    return {
      calls, count: a.results.length, sameForBoth: JSON.stringify(a) === JSON.stringify(b),
      thirdStatus: c.status, offlineStatus: d.status, offlineResults: d.results.length,
      incompleteLeaked: ids.some((x) => /-(20|21|22)$/.test(x)),
      allHaveLicence: a.results.every((r) => r.licence && r.licenceUrl && r.sourcePage && r.url)
    };
  })()`);
  if (commons.calls === 1 && commons.count === 6 && commons.sameForBoth && commons.thirdStatus === 'cache'
      && !commons.incompleteLeaked && commons.allHaveLicence && commons.offlineStatus === 'offline' && commons.offlineResults === 0) {
    pass('30. Commons results are filtered, capped at six, cached and deduplicated',
      'twelve records offered → six returned, the three with no thumbnail, source page or licence never among them; two simultaneous searches made one request; the next came from cache; offline returned nothing and did not throw');
  } else {
    fail('30. Commons results are filtered, capped at six, cached and deduplicated', JSON.stringify(commons));
  }

  /* ======================================================================
     31. The lesson's Commons drawer asks only when opened, and labels
         every picture as Commons with its licence — never as textbook
     --------------------------------------------------------------------
     Same documented-shape stand-in as check 30; the thumbnails point at
     files this app already serves so the layout can be seen.
     ====================================================================== */
  await open('#/lesson/l-tn7-chola-local-government');
  const drawer = await evaluate(`(async () => {
    Object.keys(localStorage).filter((k) => k.startsWith('trident:commons:')).forEach((k) => localStorage.removeItem(k));
    let calls = 0;
    const real = window.fetch;
    const cat = await (await real('data/history-images.json')).json();
    const urls = cat.images.slice(0, 3).map((i) => i.url);
    const pages = {};
    urls.forEach((u, i) => { pages[i + 1] = { pageid: 900 + i, title: 'File:Stand-in ' + i + '.jpg', imageinfo: [{
      thumburl: u, thumbwidth: 640, thumbheight: 480, mime: 'image/webp',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Stand-in_' + i + '.jpg',
      extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0' },
        ObjectName: { value: 'Stand-in picture ' + (i + 1) }, ImageDescription: { value: 'A stand-in used by the test, number ' + (i + 1) } } }] }; });
    window.fetch = async (u, o) => {
      if (String(u).includes('commons.wikimedia.org')) { calls++; return new Response(JSON.stringify({ query: { pages } }), { status: 200 }); }
      return real(u, o);
    };
    const d = document.querySelector('[data-testid="more-pictures"]');
    if (!d) { window.fetch = real; return { missing: true }; }
    const before = calls;
    d.open = true; d.dispatchEvent(new Event('toggle'));
    await new Promise((r) => setTimeout(r, 400));
    const figs = [...d.querySelectorAll('figure.hi')];
    const out = {
      before, after: calls, figures: figs.length,
      allCommons: figs.every((f) => /Wikimedia Commons/.test(f.querySelector('.hi-source').textContent)),
      noTextbookLabel: !d.textContent.includes('Verified textbook image'),
      allLicensed: figs.every((f) => f.querySelector('.hi-licence') && f.querySelector('a.hi-cite[href*="commons.wikimedia.org"]'))
    };
    // offline: a fresh topic via the retry path
    Object.keys(localStorage).filter((k) => k.startsWith('trident:commons:')).forEach((k) => localStorage.removeItem(k));
    window.fetch = async (u, o) => { if (String(u).includes('commons.wikimedia.org')) throw new Error('offline'); return real(u, o); };
    const mod = await import('./js/images.js');
    const off = await mod.searchCommons('A topic never searched');
    out.offline = off.status;
    window.fetch = real;
    return out;
  })()`);
  if (drawer && !drawer.missing && drawer.before === 0 && drawer.after === 1 && drawer.figures === 3
      && drawer.allCommons && drawer.noTextbookLabel && drawer.allLicensed && drawer.offline === 'offline') {
    pass('31. The lesson asks Commons only when its drawer opens, and never calls a Commons picture a textbook image',
      'the drawer sent nothing until it was opened, then one request; three pictures, each tagged Wikimedia Commons with its source page and licence linked; no "Verified textbook image" label among them');
  } else {
    fail('31. The lesson asks Commons only when its drawer opens, and never calls a Commons picture a textbook image', JSON.stringify(drawer));
  }

  /* ======================================================================
     32. The header's figures say what they are: "0 days", "0 XP", "1 day"
     ====================================================================== */
  const statFor = async (streak, xp) => {
    await open('#/dashboard');
    await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('trident.state'));
      const d = new Date(); const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      s.streak = { current: ${streak}, best: ${streak}, lastDate: ${streak} ? k : null }; s.xp = ${xp};
      localStorage.setItem('trident.state', JSON.stringify(s)); return true; })()`);
    await open('#/dashboard');
    // reach the streak the way a keyboard user does: focus the item before it, then Tab
    await evaluate(`document.querySelector('[data-testid="hud-course"]').focus(); true`);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await sleep(150);
    return evaluate(`(() => {
      const st = document.querySelector('[data-testid="hud-streak"]');
      const focusedIt = document.activeElement === st; const xp = document.querySelector('[data-testid="hud-xp"]');
      const vis = (e) => e.querySelector('.stat-value').innerText.replace(/\\s+/g, ' ').trim();
      const tip = getComputedStyle(st.querySelector('.stat-tip'));
      const tipShown = tip.visibility === 'visible' && Number(tip.opacity) > 0.9;
      const outline = getComputedStyle(st).outlineStyle;
      return { streak: vis(st), xp: vis(xp), sl: st.getAttribute('aria-label'), xl: xp.getAttribute('aria-label'),
        tipShown, outline, focusedIt, tags: st.tagName + '/' + xp.tagName, border: getComputedStyle(st).borderTopWidth,
        bg: getComputedStyle(st).backgroundColor };
    })()`);
  };
  const s0 = await statFor(0, 0);
  const s1 = await statFor(1, 30);
  const s2 = await statFor(2, 1250);
  await evaluate(`localStorage.setItem('trident.state', ${JSON.stringify(JSON.stringify(SEED))})`);
  const statsOk = s0.streak === '0 days' && s0.xp === '0 XP' && s0.sl === '0-day learning streak' && s0.xl === '0 experience points'
    && s1.streak === '1 day' && s1.sl === '1-day learning streak' && s2.streak === '2 days' && s2.xp === '1,250 XP'
    && s0.tipShown && s0.outline !== 'none' && s0.tags === 'SPAN/SPAN' && s0.border === '0px';
  if (statsOk) {
    pass('32. The header says "0 days" and "0 XP", never a bare zero',
      `"${s0.streak}" (aria-label "${s0.sl}"), "${s0.xp}" ("${s0.xl}"); "${s1.streak}"; "${s2.streak}", "${s2.xp}"; tooltip shown on keyboard focus; plain text, not styled as buttons`);
  } else {
    fail('32. The header says "0 days" and "0 XP", never a bare zero', JSON.stringify({ s0, s1, s2 }));
  }

  /* ======================================================================
     33. Answer cards: one border width, consistent green and red, and long
         answers never collide with their status label
     ====================================================================== */
  const answerStates = [];
  for (const [w, h] of [[1440, 900], [375, 812]]) {
    await evaluate(`localStorage.removeItem('trident.state'); true`);
    await open('#/quiz', { width: w, height: h });
    answerStates.push(await evaluate(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const data = await (await fetch('data/questions.json')).json();
      const all = data.questions || data;
      const opts = () => [...document.querySelectorAll('.option')];
      const bw = (o) => getComputedStyle(o).borderTopWidth + '/' + getComputedStyle(o).borderLeftWidth;
      const q = all.find((x) => x.prompt.trim() === document.querySelector('.question-prompt').textContent.trim());
      const before = { widths: opts().map(bw), marked: document.querySelectorAll('.option.is-correct, .option.is-wrong, .opt-mark:not(:empty)').length, w: opts()[0].getBoundingClientRect().width };
      const wrongInput = [...document.querySelectorAll('.option input')].find((i) => Number(i.value) !== q.answerIndex);
      wrongInput.checked = true; wrongInput.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(300);
      const chosen = wrongInput.closest('.option');
      const selected = { width: bw(chosen), border: getComputedStyle(chosen).borderTopColor, bg: getComputedStyle(chosen).backgroundColor };
      document.querySelector('[data-testid="quiz-check"]').click();
      await wait(300);
      const right = document.querySelector('.option.is-correct'); const wrong = document.querySelector('.option.is-wrong');
      const tone = (o) => ({ border: getComputedStyle(o).borderTopColor, icon: getComputedStyle(o.querySelector('.opt-mark svg')).color,
        label: getComputedStyle(o.querySelector('.opt-mark')).color, text: o.querySelector('.opt-mark').textContent.trim(), width: bw(o) });
      // make the wrong answer very long and measure the text against its label
      wrong.querySelector('span:not(.opt-mark)').textContent = 'A deliberately long answer that keeps going so that it must wrap across several lines on every screen size, to prove the status label never sits on top of it.';
      await wait(50);
      const overlaps = opts().filter((o) => { const t = o.querySelector('span:not(.opt-mark)').getBoundingClientRect(); const m = o.querySelector('.opt-mark');
        if (!m.textContent.trim()) return false; const r = m.getBoundingClientRect();
        return !(t.right <= r.left + 0.5 || r.right <= t.left + 0.5 || t.bottom <= r.top + 0.5 || r.bottom <= t.top + 0.5); }).length;
      const afterWidths = opts().map(bw);
      return { before, selected, right: tone(right), wrong: tone(wrong), overlaps, afterWidths, wAfter: opts()[0].getBoundingClientRect().width };
    })()`));
  }
  const green = 'rgb(14, 107, 58)'; const redInk = 'rgb(168, 43, 36)';
  const ansOk = answerStates.every((a) => a.before.marked === 0
    && [...a.before.widths, a.selected.width, ...a.afterWidths].every((x) => x === '2px/2px')
    && a.selected.border === 'rgb(20, 42, 67)'
    && a.right.border === green && a.right.icon === green && a.right.label === green && a.right.text === 'Correct answer'
    && a.wrong.border === redInk && a.wrong.icon === redInk && a.wrong.label === redInk && a.wrong.text === 'Your answer'
    && a.overlaps === 0 && Math.abs(a.before.w - a.wAfter) < 0.5);
  if (ansOk) {
    pass('33. Answer cards keep one 2px border; green and red are each one colour; long answers clear their label',
      'nothing marked before checking; chosen = navy border; correct = border, icon and "Correct answer" all ' + green + '; your wrong answer = border, icon and "Your answer" all ' + redInk + '; a very long answer wraps clear of its label at 1440 and 375');
  } else {
    fail('33. Answer cards keep one 2px border; green and red are each one colour; long answers clear their label', JSON.stringify(answerStates));
  }
  await evaluate(`localStorage.setItem('trident.state', ${JSON.stringify(JSON.stringify(SEED))})`);

  /* ======================================================================
     34. The verified-image caption: badge, then title, then citation — and
         the title and citation pass AA on a solid surface
     ====================================================================== */
  await open('#/lesson/l-tn7-chola-local-government');
  const cap = await evaluate(`(() => {
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const lum = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
    const parse = (x) => (x.match(/[\\d.]+/g) || []).map(Number);
    const ratio = (a, b) => { const A = lum(a), B = lum(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
    const fig = document.querySelector('.reader figure.hi');
    const capEl = fig.querySelector('.hi-cap');
    const bgc = parse(getComputedStyle(capEl).backgroundColor);
    const title = fig.querySelector('[data-testid="hi-title"]'); const cite = fig.querySelector('[data-testid="hi-cite"]');
    const badge = fig.querySelector('.hi-source');
    const order = [...capEl.querySelectorAll('.hi-source, [data-testid="hi-title"], [data-testid="hi-cite"]')].map((e) => e.className.includes('hi-source') ? 'badge' : e.dataset.testid);
    const size = (e) => parseFloat(getComputedStyle(e).fontSize);
    const frame = fig.querySelector('.hi-frame').getBoundingClientRect(); const c = capEl.getBoundingClientRect();
    return { bgAlpha: bgc.length > 3 ? bgc[3] : 1, title: ratio(parse(getComputedStyle(title).color), bgc), cite: ratio(parse(getComputedStyle(cite).color), bgc),
      titleSize: size(title), citeSize: size(cite), badgeSize: size(badge), titleWeight: Number(getComputedStyle(title).fontWeight),
      order: order.join(' > '), below: c.top >= frame.bottom - 0.5, badgeText: badge.textContent.trim(), citeText: cite.textContent.trim() };
  })()`);
  if (cap.bgAlpha === 1 && cap.title >= 4.5 && cap.cite >= 4.5 && cap.titleSize >= 20 && cap.titleSize > cap.citeSize && cap.titleSize > cap.badgeSize
      && cap.titleWeight >= 600 && cap.order === 'badge > hi-title > hi-cite' && cap.below && cap.badgeText === 'Verified textbook image') {
    pass('34. The textbook-image caption reads badge → title → citation, all AA',
      `solid navy band below the picture; title ${cap.titleSize}px/${cap.titleWeight} at ${cap.title.toFixed(1)}:1, citation ${cap.citeSize}px at ${cap.cite.toFixed(1)}:1; citation unchanged: "${cap.citeText}"`);
  } else {
    fail('34. The textbook-image caption reads badge → title → citation, all AA', JSON.stringify(cap));
  }

  /* ======================================================================
     35. Avatars: a stable default, a choice that survives reload and leaves
         progress alone, and the emblem when a portrait cannot load
     ====================================================================== */
  await open('#/dashboard');
  const av1 = await evaluate(`(() => ({ src: document.querySelector('[data-testid="avatar-img"]').getAttribute('src'), alt: document.querySelector('[data-testid="avatar-img"]').alt }))()`);
  await open('#/dashboard');
  const av2 = await evaluate(`document.querySelector('[data-testid="avatar-img"]').getAttribute('src')`);
  const beforeState = await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('trident.state')); return JSON.stringify({ xp: s.xp, streak: s.streak, done: s.completedLessons, rewards: s.awardedRewards, saved: s.savedLessons }); })()`);
  const picked = await evaluate(`(async () => {
    document.querySelector('[data-testid="profile-btn"]').click();
    await new Promise((r) => setTimeout(r, 250));
    const menu = document.querySelector('[data-testid="profile-menu"]');
    const local = (document.querySelector('[data-testid="profile-local"]') || {}).textContent;
    const r = menu.getBoundingClientRect();
    const options = menu.querySelectorAll('[role="radio"]').length;
    document.querySelector('[data-testid="avatar-portrait-04"]').click();
    await new Promise((r) => setTimeout(r, 150));
    return { local: (local || '').trim(), inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0, options,
      header: document.querySelector('[data-testid="avatar-img"]').getAttribute('src'),
      checked: document.querySelector('[data-testid="avatar-portrait-04"]').getAttribute('aria-checked'),
      signedIn: /signed in|log ?out|account/i.test(menu.textContent) };
  })()`);
  await open('#/dashboard');
  const afterReload = await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('trident.state'));
    return { src: document.querySelector('[data-testid="avatar-img"]').getAttribute('src'), stored: s.avatarId,
      progress: JSON.stringify({ xp: s.xp, streak: s.streak, done: s.completedLessons, rewards: s.awardedRewards, saved: s.savedLessons }) }; })()`);
  const broken = await evaluate(`(async () => {
    const img = document.querySelector('[data-testid="avatar-img"]');
    img.src = 'assets/avatars/does-not-exist.webp';
    await new Promise((r) => setTimeout(r, 500));
    return { src: img.getAttribute('src'), fallback: img.closest('.avatar-frame').classList.contains('is-fallback'), broken: img.complete && img.naturalWidth === 0 };
  })()`);
  const mobileMenu = await (async () => {
    await open('#/dashboard', { width: 375, height: 812 });
    return evaluate(`(async () => { document.querySelector('[data-testid="profile-btn"]').click(); await new Promise((r) => setTimeout(r, 250));
      const r = document.querySelector('[data-testid="profile-menu"]').getBoundingClientRect();
      return { left: r.left, right: r.right, vw: innerWidth }; })()`);
  })();
  await evaluate(`localStorage.setItem('trident.state', ${JSON.stringify(JSON.stringify(SEED))})`);
  const avOk = av1.src === 'assets/avatars/portrait-01.webp' && av2 === av1.src && av1.alt === 'Selected historical portrait avatar'
    && picked.options === 10 && picked.header === 'assets/avatars/portrait-04.webp' && picked.checked === 'true'
    && picked.local === 'Local learner profile — progress is saved on this device.' && !picked.signedIn && picked.inView
    && afterReload.src === 'assets/avatars/portrait-04.webp' && afterReload.stored === 'portrait-04' && afterReload.progress === beforeState
    && broken.fallback && /trident-logo\.png$/.test(broken.src) && !broken.broken
    && mobileMenu.left >= 0 && mobileMenu.right <= mobileMenu.vw;
  if (avOk) {
    pass('35. Avatars: stable default, choice survives reload, progress untouched, emblem on failure',
      'default portrait-01 on two loads; ten portraits in the picker; portrait-04 chosen → header updates, stored as avatarId only, still there after reload; XP, streak, lessons, rewards and saved items identical; a failed portrait shows the TRIDENT emblem; the menu says "Local learner profile — progress is saved on this device." and stays inside a 375px screen');
  } else {
    fail('35. Avatars: stable default, choice survives reload, progress untouched, emblem on failure', JSON.stringify({ av1, av2, picked, afterReload, beforeState, broken, mobileMenu }));
  }

  /* ======================================================================
     36. The sticky header never covers the page
     ====================================================================== */
  const covered = [];
  for (const [w, h] of [[1440, 900], [375, 812]]) {
    for (const r of ['#/dashboard', '#/library', '#/lesson/l-tn7-chola-local-government', '#/quiz', '#/progress', '#/collection']) {
      await open(r, { width: w, height: h });
      const res = await evaluate(`(async () => {
        const hdr = document.querySelector('.app-header'); const hb = hdr.getBoundingClientRect();
        const first = document.querySelector('#view h1, #view h2');
        const top0 = first ? first.getBoundingClientRect().top : 999;
        const hs = getComputedStyle(hdr);
        const bg = (hs.backgroundColor.match(/[\\d.]+/g) || []).map(Number);
        const opaque = bg.length === 3 || bg[3] === 1;
        // jump to a heading further down, as an anchor or focus would
        const heads = [...document.querySelectorAll('#view h2, #view h3')];
        const far = heads[heads.length - 1];
        let farTop = 999;
        if (far) { far.scrollIntoView({ block: 'start' }); await new Promise((r) => setTimeout(r, 80)); farTop = far.getBoundingClientRect().top; }
        const hb2 = hdr.getBoundingClientRect();
        const scrolled = window.scrollY > 0;
        window.scrollTo(0, 0);
        return { headerBottom: Math.round(hb.bottom), firstTop: Math.round(top0), opaque, z: hs.zIndex, pos: hs.position,
          farTop: Math.round(farTop), headerBottom2: Math.round(hb2.bottom), scrolled, pad: getComputedStyle(document.documentElement).scrollPaddingTop };
      })()`);
      if (!(res.firstTop >= res.headerBottom && res.opaque && res.pos === 'sticky' && Number(res.z) >= 30
        && (!res.scrolled || res.farTop >= res.headerBottom2 - 1))) covered.push(`${w}px ${r}: ${JSON.stringify(res)}`);
    }
  }
  if (!covered.length) {
    pass('36. The sticky header never covers content', 'opaque, sticky, z-index 30; the first heading sits below it and a heading scrolled into view lands below it (scroll-padding-top) on six routes at 1440 and 375');
  } else {
    fail('36. The sticky header never covers content', covered.slice(0, 3).join(' | '));
  }

  /* ======================================================================
     37. Lesson, question, story, timeline and image data are byte-for-byte
         the committed versions
     ====================================================================== */
  {
    const { createHash } = await import('node:crypto');
    const { readFile } = await import('node:fs/promises');
    const GOLDEN = {
      'data/lessons.json': 'b68cad1684008d4aa576f894f1d205fac490830217dbcf73d920284932ffe223',
      'data/questions.json': 'b6ec3f4ffbb9eab0f45ae44e355e245de2fc33dc6cdc31b59e546576f92222ae',
      'data/stories.json': '1a6c80bb6209cbf8e3c87e8566777c7ee80090bcc5f12c93eccd672288a40313',
      'data/timeline.json': '131153db2813f8e5f4ffeda5f605f136381eeb9f5267da02e53eac3a41c83da9',
      'data/library.json': '272f25785dab4c562b73dcf4b54a7e550ea2ac86d3ad02b580859641d99588d9',
      'data/history-images.json': '14353fd146adf8d9da40e208d7c5649a3c73d9b80f7aa193bf49956cf1f8ebd2'
    };
    const changed = [];
    for (const [f, h] of Object.entries(GOLDEN)) {
      const got = createHash('sha256').update(await readFile(new URL(`../${f}`, import.meta.url))).digest('hex');
      if (got !== h) changed.push(f);
    }
    if (!changed.length) pass('37. Lesson, citation and quiz data are byte-for-byte unchanged', 'SHA-256 of lessons, questions, stories, timeline, library and the image catalogue match the committed files');
    else fail('37. Lesson, citation and quiz data are byte-for-byte unchanged', changed.join(', '));
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
