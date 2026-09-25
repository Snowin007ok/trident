/**
 * Portrait avatars — the learner's profile picture, chosen from the portraits
 * in data/avatars.json. They are a profile preference, not historical sources:
 * none is shown in a lesson and none carries a citation. A name appears only
 * where the original file's name stated it; nothing is guessed from a face.
 *
 * Only the chosen id is stored (state.avatarId). With nothing chosen the
 * manifest's fixed default is shown, so the header never changes on reload.
 * If a portrait fails to load, the TRIDENT emblem takes its place.
 */

import * as store from './storage.js';
import { el, clear } from './ui.js';

const FALLBACK = 'assets/trident-logo.png';
let MANIFEST = { default: null, avatars: [] };

export function init(manifest) {
  if (manifest && Array.isArray(manifest.avatars)) MANIFEST = manifest;
}

export function all() { return MANIFEST.avatars; }

/** The avatar to show: the stored choice if it still exists, else the default. */
export function current(state) {
  const s = state || store.load();
  const list = MANIFEST.avatars;
  return list.find((a) => a.id === s.avatarId)
    || list.find((a) => a.id === MANIFEST.default)
    || list[0]
    || null;
}

/** The accessible name for an avatar in the picker. */
export function describe(a) {
  return a.name ? `${a.name} — ${a.alt.charAt(0).toLowerCase()}${a.alt.slice(1)}` : a.alt;
}

/**
 * A portrait in its frame. A load failure swaps in the TRIDENT emblem, never a
 * broken-image icon, and marks the frame so it can be styled and tested.
 */
export function portrait(a, { size = 'header', alt = 'Selected historical portrait avatar' } = {}) {
  const img = el('img', {
    src: a ? a.src : FALLBACK, alt, width: '256', height: '256',
    decoding: 'async', loading: size === 'header' ? 'eager' : 'lazy',
    'data-testid': size === 'header' ? 'avatar-img' : null
  });
  const frame = el('span', { class: `avatar-frame avatar-${size}${a ? '' : ' is-fallback'}` }, [img]);
  img.addEventListener('error', () => {
    if (img.dataset.fallback) return;
    img.dataset.fallback = '1';
    img.src = FALLBACK;
    frame.classList.add('is-fallback');
  });
  return frame;
}

/**
 * The picker: a radio group of thumbnails. Choosing one stores its id and
 * calls onChange; XP, streaks and progress are never read or written here.
 */
export function picker(onChange) {
  const chosen = current();
  const group = el('div', {
    class: 'avatar-grid', role: 'radiogroup', 'aria-label': 'Choose your portrait avatar',
    'data-testid': 'avatar-picker'
  });

  function paint() {
    clear(group);
    const now = current();
    MANIFEST.avatars.forEach((a, i) => {
      const on = now && now.id === a.id;
      const btn = el('button', {
        type: 'button', class: `avatar-option${on ? ' is-on' : ''}`, role: 'radio',
        'aria-checked': String(!!on), 'aria-label': describe(a),
        title: a.name || '', tabindex: on || (!now && i === 0) ? '0' : '-1',
        'data-avatar': a.id, 'data-testid': `avatar-${a.id}`
      }, [portrait(a, { size: 'thumb', alt: '' })]);
      btn.addEventListener('click', () => choose(a.id));
      btn.addEventListener('keydown', (e) => {
        const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        if (!(e.key in keys)) return;
        e.preventDefault();
        const n = MANIFEST.avatars.length;
        const next = MANIFEST.avatars[(i + keys[e.key] + n) % n];
        choose(next.id, true);
      });
      group.append(btn);
    });
  }

  function choose(id, keepFocus) {
    store.setAvatar(id);
    paint();
    const btn = group.querySelector(`[data-avatar="${id}"]`);
    if (btn && keepFocus) btn.focus();
    if (onChange) onChange(id);
  }

  paint();
  return { node: group, chosen };
}
