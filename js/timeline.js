/**
 * Timeline Challenge — arrange four verified events in chronological order.
 * Drag and drop, plus keyboard move-up / move-down controls that do the same job.
 * Every event and date comes from data/timeline.json, which mirrors facts already
 * cited in the lessons. Nothing is invented.
 */

import { el, clear, toast } from './ui.js';
import { icon, tricolourRule } from './icons.js';
import * as store from './storage.js';
import * as gamify from './gamify.js';
import { todayKey, prettyDate, hashString, seededShuffle } from './daily.js';
import * as profile from './profile.js';

let DATA = null;
export function init(data) { DATA = data; }

/** Deterministic four events for a date, with distinct years. */
export function challengeFor(dateKey) {
  const pool = DATA.timeline.events;
  const seed = hashString(`trident-timeline-${dateKey}`);
  // events cited from the learner's own books come first; the rest still fill
  // the board, so every day is four events whatever the profile says
  const prefer = profile.preferTimelineFn();
  const base = seededShuffle(pool, seed);
  // four events need four distinct years, so a profile earns its own board
  // only when it can supply that many; otherwise the day is openly mixed
  const mine = prefer ? base.filter(prefer) : base;
  const distinctYears = new Set(mine.map((e) => e.sortYear)).size;
  const mixed = !!prefer && distinctYears < 4;
  const shuffled = mixed || !prefer
    ? base
    : [...mine, ...base.filter((e) => !prefer(e))];
  const picked = [];
  const years = new Set();
  for (const ev of shuffled) {
    if (years.has(ev.sortYear)) continue;
    picked.push(ev);
    years.add(ev.sortYear);
    if (picked.length === 4) break;
  }
  const solution = picked.slice().sort((a, b) => a.sortYear - b.sortYear);
  // present them out of order: rotate the solution deterministically so the
  // starting arrangement is never already correct
  let start = seededShuffle(picked, seed + 11);
  if (start.every((e, i) => e.id === solution[i].id)) start = start.slice().reverse();
  return { events: picked, solution, start, mixed, matching: distinctYears };
}

export function render(view) {
  clear(view);
  const dateKey = todayKey();
  const { solution, start, mixed } = challengeFor(dateKey);
  const state = store.load();
  const previous = state.timelineResults[dateKey];
  const alreadySolved = !!(previous && previous.solved);

  let order = start.slice();
  let checked = false;

  view.append(
    el('div', { class: 'section-head' }, [
      el('h1', { 'data-testid': 'tl-title', text: 'Timeline Challenge' }),
      el('span', { class: 'meta', 'data-testid': 'tl-xp', text: `+${gamify.XP_RULES.timeline} XP` })
    ]),
    el('p', { class: 'tl-intro', text: 'Drag the cards, or use the arrows, until the four are in order with the earliest at the top. The dates appear once you check.' })
  );

  // the challenge is labelled before it starts whenever the four events are
  // not all from the learner's own class
  const myClass = (profile.current() || {}).classLevel || null;
  const offClass = myClass
    && solution.some((e) => e.citation && String(e.citation.classLevel) !== String(myClass));
  if (mixed || offClass) {
    view.append(el('p', { class: 'stamp stamp-warn', 'data-testid': 'tl-mixed' },
      [icon('info', 15), 'Mixed History Challenge — today\u2019s four events come from more than one class.']));
  }

  const threads = el('div', { html: threadsSVG() }).firstElementChild;
  const board = el('ol', { class: 'tl-cards', 'data-testid': 'tl-board' });
  const rail = el('div', { class: 'tl-rail' }, [board]);
  const liveRegion = el('p', { class: 'sr-only', 'aria-live': 'polite', 'data-testid': 'tl-live' });
  const feedback = el('div', {});

  const checkBtn = el('button', {
    class: 'btn btn-primary', type: 'button', 'data-testid': 'tl-check',
    text: alreadySolved ? 'Show the answer' : 'Check the order'
  });
  const resetBtn = el('button', {
    class: 'btn btn-ghost', type: 'button', text: 'Shuffle again',
    onclick: () => { order = seededShuffle(order, Date.now() % 100000); checked = false; clear(feedback); paint(); }
  });

  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    liveRegion.textContent = `${order[target].label} moved to position ${target + 1} of ${order.length}.`;
    paint(target);
    // a card that just moved says so for a beat, so the change is visible and
    // not only announced
    const moved = board.children[target];
    if (moved) {
      moved.classList.add('is-moving');
      setTimeout(() => moved.classList.remove('is-moving'), 420);
    }
  }

  function paint(focusIndex = null) {
    clear(board);
    order.forEach((ev, i) => {
      const correctHere = checked && solution[i].id === ev.id;
      const card = el('li', {
        class: `tl-card${checked ? (correctHere ? ' is-right' : ' is-wrong') : ''}${checked ? ' is-revealed' : ''}`,
        draggable: !checked, 'data-idx': String(i), 'data-testid': `tl-card-${i}`
      }, [
        el('span', { class: 'tl-pos', text: String(i + 1) }),
        el('span', { class: 'tl-body' }, [
          el('span', { class: 'tl-label', text: ev.label }),
          // the date is the answer, so it appears only once the order is checked
          checked ? el('span', { class: 'tl-year', text: ev.year }) : null,
          el('span', { class: 'tl-cite', text: citationLine(ev.citation) })
        ]),
        checked
          ? el('span', { class: correctHere ? 'tag tag-done' : 'tag' }, [
            icon(correctHere ? 'check' : 'cross', 13),
            correctHere ? 'In place' : 'Move me'
          ])
          : el('span', { class: 'order-controls' }, [
            el('span', { class: 'tl-grip', 'aria-hidden': 'true' }, [icon('grip', 18)]),
            el('button', {
              class: 'btn btn-ghost btn-sm', type: 'button', disabled: i === 0,
              'aria-label': `Move "${ev.label}" earlier`, 'data-testid': `tl-up-${i}`,
              onclick: () => move(i, -1)
            }, [icon('up', 16)]),
            el('button', {
              class: 'btn btn-ghost btn-sm', type: 'button', disabled: i === order.length - 1,
              'aria-label': `Move "${ev.label}" later`, 'data-testid': `tl-down-${i}`,
              onclick: () => move(i, 1)
            }, [icon('down', 16)])
          ])
      ]);

      if (!checked) {
        card.addEventListener('dragstart', (e) => {
          card.classList.add('is-dragging');
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', String(i));
        });
        card.addEventListener('dragend', () => card.classList.remove('is-dragging'));
        card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('is-over'); });
        card.addEventListener('dragleave', () => card.classList.remove('is-over'));
        card.addEventListener('drop', (e) => {
          e.preventDefault();
          card.classList.remove('is-over');
          const from = Number(e.dataTransfer.getData('text/plain'));
          const to = i;
          if (Number.isNaN(from) || from === to) return;
          const [moved] = order.splice(from, 1);
          order.splice(to, 0, moved);
          liveRegion.textContent = `${moved.label} moved to position ${to + 1}.`;
          paint(to);
        });
      }
      board.append(card);
    });

    if (focusIndex !== null) {
      const btn = board.querySelector(`[data-idx="${focusIndex}"] .order-controls button:not([disabled])`);
      if (btn) btn.focus();
    }
  }

  checkBtn.addEventListener('click', () => {
    if (checked) return;
    const solved = order.every((ev, i) => ev.id === solution[i].id);
    checked = true;
    store.recordTimelineResult(dateKey, solved);
    paint();
    checkBtn.disabled = true;
    threads.classList.toggle('is-joined', solved);

    clear(feedback);
    let xpLine = '';
    if (solved) {
      const res = gamify.award('timeline', dateKey, { lessons: DATA.lessons.lessons });
      xpLine = res.xp > 0
        ? `+${res.xp} XP added.`
        : 'You already earned the XP for today’s challenge — it is awarded once per date.';
    }

    feedback.append(el('div', { class: `explanation ${solved ? 'is-correct' : 'is-wrong'}`, 'data-testid': 'tl-feedback' }, [
      el('h4', { text: solved ? 'Correct order' : 'Not the right order' }),
      el('p', { text: solved
        ? `All four are in sequence. ${xpLine}`
        : 'Here is the correct sequence, with the date each book gives. Nothing is hidden — read the reasoning and try tomorrow’s challenge.' }),
      el('ol', { class: 'timeline', style: 'border-left:2px solid var(--line-gold); list-style:none; padding-left:0' },
        solution.map((ev) => el('li', {}, [
          el('span', { class: 't-year', text: ev.year }),
          el('span', { class: 't-event', text: ev.label }),
          el('span', { class: 'tl-cite', style: 'display:block', text: citationLine(ev.citation) })
        ])))
    ]));
    liveRegion.textContent = solved
      ? `Correct. ${xpLine}`
      : 'Not the right order. The correct sequence is now shown with citations.';
    if (solved) toast(xpLine || 'Timeline solved.', 'xp');
  });

  view.append(
    rail,
    liveRegion,
    el('div', { class: 'next-step' }, [checkBtn, resetBtn]),
    feedback
  );
  if (alreadySolved) {
    view.append(el('div', { class: 'notice section', 'data-testid': 'tl-already' }, [
      el('p', { text: 'You already solved today’s challenge. You can replay it for practice, but the 75 XP is awarded once per date.' })
    ]));
  }
  view.append(el('p', { class: 'hint', text: 'A new set of four events appears tomorrow.' }));

  paint();
}

function citationLine(c) {
  const pages = c.pageStart === c.pageEnd ? `p. ${c.pageStart}` : `pp. ${c.pageStart}–${c.pageEnd}`;
  return [c.book, c.chapter, pages].filter(Boolean).join(' · ');
}

/** Three threads that converge into one navy line once the order is right. */
function threadsSVG() {
  return `
  <svg class="tl-threads" viewBox="0 0 600 46" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path class="th-s" d="M4 8 C 160 8, 300 20, 596 23"/>
    <path class="th-i" d="M4 23 C 160 23, 300 23, 596 23"/>
    <path class="th-g" d="M4 38 C 160 38, 300 26, 596 23"/>
    <path class="th-join" d="M300 23 H 596"/>
  </svg>`;
}
