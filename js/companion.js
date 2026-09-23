/**
 * The Ask TRIDENT companion — two fish, floating bottom-right on every page a
 * signed-in learner can reach, and the panel they open.
 *
 * It is a launcher and a drawer, not a navigation destination: opening it
 * changes nothing about the URL, and closing it leaves the page exactly where
 * it was. There is one of each per session, mounted once at start-up.
 *
 * Everything it asks goes through js/brief.js — the same protected endpoint,
 * the same anonymous summary, the same server-side scope and figure checks.
 * Nothing here writes XP, progress or localStorage: the question list lives in
 * a module variable and is gone on reload, by design.
 */

import { el, clear } from './ui.js';
import { icon } from './icons.js';
import * as brief from './brief.js';

function reducedMotion() {
  try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (err) { return false; }
}

const TITLE = 'Ask TRIDENT';
const SUBTITLE = 'Your personal history learning guide';

/** The four openings, exactly as offered. Each is sent as typed. */
const SUGGESTIONS = [
  'What should I study next?',
  'Explain today’s historical event',
  'How is my progress?',
  'Quiz me on today’s lesson'
];

/* ------------------------------------------------------------ the pieces */

let root = null;
let launcher = null;
let panel = null;
let backdrop = null;
let answerHost = null;
let historyHost = null;
let input = null;
let sendBtn = null;
let liveRegion = null;
let open = false;

/** The briefing currently on the dashboard, so answers match what is shown. */
let context = {};

function setContext(next) { context = next || {}; }

/* ------------------------------------------------------------- the panel */

function paintHistory() {
  clear(historyHost);
  const list = brief.history();
  if (!list.length) return;
  historyHost.append(
    el('span', { class: 'brief-label', text: 'Your last questions' }),
    el('ul', { class: 'companion-history-list' }, list.map((q) => el('li', {}, [
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: q,
        title: q,
        onclick: () => { input.value = q; input.focus(); }
      })
    ])))
  );
}

function say(message) {
  if (liveRegion) liveRegion.textContent = message;
}

async function run(question) {
  const q = String(question || '').trim().slice(0, brief.ASK_MAX_CHARS);
  if (!q) return;
  // one request per click, however fast the clicking
  if (brief.asking()) return;

  input.value = '';
  sendBtn.disabled = true;
  panel.classList.add('is-busy');
  clear(answerHost);
  answerHost.append(el('p', { class: 'companion-asked', 'data-testid': 'companion-asked', text: q }));
  answerHost.append(el('p', { class: 'hint' }, [el('span', { class: 'spinner' }), ' Asking your guide…']));
  say('Asking your guide.');

  const body = await brief.ask(q, context);

  clear(answerHost);
  answerHost.append(el('p', { class: 'companion-asked', 'data-testid': 'companion-asked', text: q }));

  if (body && body.ok && body.inScope === false) {
    answerHost.append(el('p', {
      class: 'companion-refused', 'data-testid': 'companion-refused', text: body.message
    }));
    say('Your guide cannot answer that one.');
  } else if (body && body.ok && body.answer) {
    answerHost.append(el('p', {
      class: 'companion-reply', 'data-testid': 'companion-reply', text: body.answer
    }));
    say(`Your guide says: ${body.answer}`);
  } else {
    answerHost.append(el('p', {
      class: 'companion-refused', 'data-testid': 'companion-unavailable',
      text: (body && body.message) || brief.GUIDE_DOWN
    }));
    say('Your guide is unavailable just now.');
  }

  paintHistory();
  sendBtn.disabled = false;
  panel.classList.remove('is-busy');
}

function buildPanel() {
  answerHost = el('div', { class: 'companion-answer', 'data-testid': 'companion-answer' });
  historyHost = el('div', { class: 'companion-history', 'data-testid': 'companion-history' });
  liveRegion = el('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });

  input = el('input', {
    type: 'text', class: 'companion-input', id: 'companion-input',
    'data-testid': 'companion-input', maxlength: String(brief.ASK_MAX_CHARS),
    placeholder: 'What should I study next?', autocomplete: 'off'
  });

  sendBtn = el('button', {
    class: 'btn btn-primary btn-sm companion-send', type: 'submit',
    'data-testid': 'companion-send', 'aria-label': 'Send question'
  }, [icon('arrowRight', 16), 'Send']);

  const form = el('form', { class: 'companion-form', 'data-testid': 'companion-form' }, [
    el('label', { class: 'sr-only', for: 'companion-input', text: 'Your question for Ask TRIDENT' }),
    input,
    sendBtn
  ]);
  form.addEventListener('submit', (e) => { e.preventDefault(); run(input.value); });

  const closeBtn = el('button', {
    class: 'btn btn-ghost btn-sm companion-close', type: 'button',
    'data-testid': 'companion-close', 'aria-label': 'Close Ask TRIDENT'
  }, [icon('cross', 16)]);
  closeBtn.addEventListener('click', () => close());

  panel = el('aside', {
    class: 'companion-panel', id: 'companion-panel', 'data-testid': 'companion-panel',
    role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'companion-title', hidden: true
  }, [
    el('div', { class: 'companion-head' }, [
      el('img', {
        class: 'companion-head-fish', src: 'assets/trident-fish.png', alt: '', width: '38', height: '38'
      }),
      el('div', { class: 'stack' }, [
        el('h2', { class: 'companion-title', id: 'companion-title', 'data-testid': 'companion-title', text: TITLE }),
        el('p', { class: 'companion-subtitle', 'data-testid': 'companion-subtitle', text: SUBTITLE })
      ]),
      closeBtn
    ]),

    el('p', { class: 'companion-scope', 'data-testid': 'companion-scope',
      text: 'Your progress, today’s mission, the lesson you were recommended and today’s historical event. Open a lesson for the history itself.' }),

    el('div', { class: 'companion-suggestions', 'data-testid': 'companion-suggestions' },
      SUGGESTIONS.map((q) => el('button', {
        class: 'btn btn-secondary btn-sm', type: 'button', text: q,
        onclick: () => run(q)
      }))),

    form,
    answerHost,
    historyHost,
    el('p', { class: 'companion-note' }, [icon('info', 13),
      ' Answered from your own progress and today’s verified TRIDENT content. Nothing here is saved, and asking earns no XP.']),
    liveRegion
  ]);

  backdrop = el('div', { class: 'companion-backdrop', 'data-testid': 'companion-backdrop', hidden: true });
  backdrop.addEventListener('click', () => close());
}

/* ---------------------------------------------------------- focus trapping */

function focusable() {
  return [...panel.querySelectorAll('button, input, a[href], [tabindex]:not([tabindex="-1"])')]
    .filter((n) => !n.disabled && n.offsetParent !== null);
}

function onKeydown(e) {
  if (!open) return;
  if (e.key === 'Escape') { e.preventDefault(); close(); return; }
  if (e.key !== 'Tab') return;
  const items = focusable();
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/* ------------------------------------------------------------ open / close */

export function isOpen() { return open; }

export function openPanel() {
  if (open || !panel) return;
  open = true;
  panel.hidden = false;
  backdrop.hidden = false;
  // the fish hold still while the student is reading
  root.classList.add('is-open');
  launcher.setAttribute('aria-expanded', 'true');
  document.addEventListener('keydown', onKeydown, true);
  paintHistory();
  requestAnimationFrame(() => input.focus());
  say('Ask TRIDENT opened.');
}

export function close() {
  if (!open || !panel) return;
  open = false;
  panel.hidden = true;
  backdrop.hidden = true;
  root.classList.remove('is-open');
  launcher.setAttribute('aria-expanded', 'false');
  document.removeEventListener('keydown', onKeydown, true);
  // the dialog is only ever opened from the launcher, so the launcher is where
  // focus belongs afterwards — not wherever the page happened to have it
  launcher.focus();
}

export function toggle() { return open ? close() : openPanel(); }

/* ----------------------------------------------------------------- mount */

/**
 * Put the companion on the page. Called once; `setVisible` then decides which
 * routes show it, so the welcome screen and first-run setup stay uncluttered.
 */
export function mount() {
  if (root) return root;

  launcher = el('button', {
    class: 'companion-launcher', type: 'button', id: 'companion-launcher',
    'data-testid': 'companion-launcher',
    'aria-label': `${TITLE} — ${SUBTITLE}`,
    'aria-haspopup': 'dialog', 'aria-controls': 'companion-panel', 'aria-expanded': 'false'
  }, [
    el('span', { class: 'companion-fish-wrap' }, [
      el('img', {
        class: 'companion-fish', src: 'assets/trident-fish.png', alt: '',
        width: '64', height: '64', 'data-testid': 'companion-fish'
      }),
      el('span', { class: 'companion-sparkle', 'aria-hidden': 'true' }),
      el('span', { class: 'companion-sparkle companion-sparkle-2', 'aria-hidden': 'true' })
    ]),
    el('span', { class: 'companion-splash', 'aria-hidden': 'true', 'data-testid': 'companion-splash' }),
    el('span', { class: 'companion-tip', 'aria-hidden': 'true', 'data-testid': 'companion-tip', text: TITLE })
  ]);
  launcher.addEventListener('click', () => toggle());

  /**
   * One leap, then a rest.
   *
   * `is-leaping` drives the whole animation from CSS; it is removed when the
   * animation ends, and a cooldown stops a pointer resting on the icon from
   * restarting it over and over. Pointer, keyboard focus and touch all play the
   * same thing once. Under prefers-reduced-motion the class is never added —
   * the stylesheet gives those viewers a glow instead.
   */
  let leapUntil = 0;
  const LEAP_MS = 640;
  const COOLDOWN_MS = 900;

  function leap() {
    if (open) return;
    const now = Date.now();
    if (now < leapUntil) return;
    if (reducedMotion()) { root.classList.add('is-glowing'); setTimeout(() => root.classList.remove('is-glowing'), 700); return; }
    leapUntil = now + LEAP_MS + COOLDOWN_MS;
    root.classList.remove('is-leaping');
    // forcing a reflow lets the same animation be played again later
    void launcher.offsetWidth;
    root.classList.add('is-leaping');
    setTimeout(() => root.classList.remove('is-leaping'), LEAP_MS);
  }

  launcher.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') leap(); });
  launcher.addEventListener('focus', leap);
  launcher.addEventListener('touchstart', leap, { passive: true });

  buildPanel();

  root = el('div', { class: 'companion', 'data-testid': 'companion', hidden: true }, [
    backdrop, panel, launcher
  ]);
  document.body.append(root);

  // the dashboard tells us which briefing is on screen; until it does, the
  // guide still answers from the same anonymous summary, just without a mission
  window.addEventListener('trident:brief', (e) => setContext(e.detail));
  // a changed learning path invalidates the briefing we were told about
  window.addEventListener('trident:profile', () => setContext({}));

  return root;
}

/** Shown on every signed-in route; hidden on welcome and first-run setup. */
export function setVisible(visible) {
  if (!root) return;
  root.hidden = !visible;
  if (!visible && open) close();
}
