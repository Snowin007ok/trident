/** Shared DOM helpers: element building, modals, toasts, citations. */

import { icon } from './icons.js';

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.entries(v).forEach(([dk, dv]) => { node.dataset[dk] = dv; });
    else node.setAttribute(k, v === true ? '' : v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c === null || c === undefined || c === false) return;
    node.append(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  });
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

let toastTimer = null;
/**
 * Show a toast. Screen readers get the same message from the live region in
 * index.html, so rewards are announced rather than only shown.
 */
export function toast(message, kind = '') {
  const node = document.getElementById('toast');
  clear(node);
  node.className = `toast${kind ? ` is-${kind}` : ''}${kind === 'badge' ? ' is-reveal' : ''}`;
  node.append(icon(kind === 'badge' ? 'trophy' : kind === 'xp' ? 'bolt' : 'info', 20), el('span', { text: message }));
  node.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.hidden = true; }, 4200);
}

export function announceToScreenReader(message) {
  const live = document.getElementById('liveRegion');
  if (!live) return;
  live.textContent = '';
  // a tick later so repeated identical messages are still announced
  setTimeout(() => { live.textContent = message; }, 40);
}

/** Accessible modal: focus trap, Escape to close, focus returned to the opener. */
export function openModal({ title, bodyNodes = [], actions = [] }) {
  const root = document.getElementById('modalRoot');
  const opener = document.activeElement;
  const titleId = `modal-title-${Date.now()}`;

  const closeBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Close', onclick: close });

  const dialog = el('div', {
    class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId
  }, [
    el('h2', { id: titleId, text: title }),
    ...bodyNodes,
    el('div', { class: 'modal-actions' }, [...actions, closeBtn])
  ]);

  const backdrop = el('div', { class: 'modal-backdrop' }, [dialog]);
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const focusables = dialog.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function close() {
    document.removeEventListener('keydown', onKey, true);
    backdrop.remove();
    if (opener && typeof opener.focus === 'function') opener.focus();
  }

  document.addEventListener('keydown', onKey, true);
  root.append(backdrop);
  (dialog.querySelector('button, a[href], input, select') || dialog).focus();
  return { close };
}

/* ------------------------------------------------------------- fragments */

export function pages(citation) {
  return citation.pageStart === citation.pageEnd
    ? `p. ${citation.pageStart}`
    : `pp. ${citation.pageStart}–${citation.pageEnd}`;
}

export function citationBlock(citation, extraNote) {
  if (!citation) return null;
  const bits = [citation.book];
  if (citation.chapter) bits.push(citation.chapter);
  bits.push(pages(citation));
  return el('p', { class: 'citation' }, [
    el('strong', { text: 'Source: ' }),
    bits.join(' · '),
    extraNote ? el('span', { text: ` — ${extraNote}` }) : null
  ]);
}

/** The citation, presented as an evidence card inside quiz explanations. */
export function evidenceCard(citation, note) {
  if (!citation) return null;
  const bits = [citation.book];
  if (citation.chapter) bits.push(citation.chapter);
  bits.push(pages(citation));
  return el('div', { class: 'evidence' }, [
    icon('evidence', 20),
    el('div', {}, [
      el('span', { class: 'e-label', text: 'Evidence' }),
      el('p', { text: bits.join(' · ') }),
      note ? el('p', { class: 'hint', text: note }) : null
    ])
  ]);
}

export function tag(text, variant, iconName) {
  return el('span', { class: `tag${variant ? ` tag-${variant}` : ''}` }, [
    iconName ? icon(iconName, 13) : null, text
  ]);
}

/**
 * The one progress component. Every "how far through" in the app — the
 * course, the lesson journey, the quiz, the learning paths — is drawn by this,
 * so the track, fill, height and arithmetic are the same everywhere.
 *
 *   value / max     the real counts (3 of 10), never a pre-rounded share
 *   label           the accessible name ("Class 6 history course progress")
 *   valueText       what a screen reader hears for the value
 *   variant         'quiz' uses the quiz accent; everything else is navy
 *   ticks           mark the boundaries between steps (only up to 12 steps)
 *
 * It returns the element; percent() gives the same share for any text beside it.
 */
export function percent(value, max) {
  const v = Math.max(0, Math.min(Number(value) || 0, Number(max) || 0));
  return max > 0 ? (v / max) * 100 : 0;
}

export function progressMeter({ value, max, label, valueText, variant = '', ticks = true, testId = null }) {
  const safeMax = Math.max(0, Number(max) || 0);
  const safeValue = Math.max(0, Math.min(Number(value) || 0, safeMax));
  const bar = el('progress', {
    max: String(safeMax || 1), value: String(safeValue),
    role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(safeMax),
    'aria-valuenow': String(safeValue), 'aria-label': label,
    'aria-valuetext': valueText || `${safeValue} of ${safeMax}`,
    'data-testid': testId
  });
  const steps = ticks && safeMax >= 2 && safeMax <= 12 ? String(safeMax) : null;
  return el('div', {
    class: `meter${variant ? ` is-${variant}` : ''}${safeMax && safeValue >= safeMax ? ' is-full' : ''}`,
    'data-steps': steps, 'data-percent': percent(safeValue, safeMax).toFixed(2)
  }, [bar, steps ? el('span', { class: 'meter-ticks', 'aria-hidden': 'true' }) : null]);
}

/** Level progress, drawn with the same component. */
export function xpBar(pct, leftLabel, rightLabel, testId) {
  const value = Math.round(Math.max(0, Math.min(100, pct)));
  return el('div', { 'data-testid': testId || null }, [
    (leftLabel || rightLabel) ? el('div', { class: 'meter-legend' }, [
      el('b', { text: String(leftLabel || '').replace(/<[^>]+>/g, '') }),
      el('span', { text: String(rightLabel || '').replace(/<[^>]+>/g, '') })
    ]) : null,
    progressMeter({ value, max: 100, label: 'Experience towards the next level', valueText: `${value} per cent`, ticks: false })
  ]);
}
