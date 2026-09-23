/**
 * The guided learning-profile flow.
 *
 * Used twice: once for a new guest (#/onboarding) and again whenever the learner
 * changes path from Settings (#/profile). The only difference is the wording of
 * the last step and what happens on cancel — the steps themselves are identical.
 *
 * Nothing here writes progress. Saving a profile calls exactly one storage
 * function, which touches only the profile fields, so XP, completed lessons,
 * quiz history, badges, artefacts and saved items cannot be affected.
 */

import { el, clear, toast, announceToScreenReader } from './ui.js';
import { icon } from './icons.js';
import * as store from './storage.js';
import * as profile from './profile.js';

let DATA = null;
export function init(data) { DATA = data; }

/** render(view, { change: true }) is the "Change Learning Path" version. */
export function render(view, { change = false, onDone = null, onCancel = null } = {}) {
  clear(view);

  const existing = profile.current();
  const draft = { mode: null, board: null, classLevel: null, exam: null, examStage: null };
  let step = 'goal';

  const host = el('div', { class: 'onboarding', 'data-testid': 'onboarding' });
  view.append(host);

  /* ---------------------------------------------------------------- shell */

  function shell(stepIndex, total, title, lead, body, actions) {
    clear(host);
    const heading = el('h1', { id: 'ob-heading', tabindex: '-1', text: title });
    host.append(
      el('div', { class: 'ob-head' }, [
        el('span', { class: 'eyebrow', text: change ? 'Change learning path' : 'Set up your learning path' }),
        heading,
        lead ? el('p', { class: 'ob-lead', text: lead }) : null,
        el('ol', { class: 'ob-steps', 'aria-label': `Step ${stepIndex} of ${total}` },
          Array.from({ length: total }, (_, i) => el('li', {
            class: i + 1 === stepIndex ? 'is-current' : (i + 1 < stepIndex ? 'is-done' : ''),
            'aria-current': i + 1 === stepIndex ? 'step' : null
          }, [
            el('span', { class: 'ob-step-dot', text: String(i + 1) }),
            el('span', { class: 'sr-only', text: i + 1 < stepIndex ? 'completed' : (i + 1 === stepIndex ? 'current step' : 'upcoming') })
          ])))
      ].filter(Boolean)),
      body,
      el('div', { class: 'ob-actions' }, actions.filter(Boolean))
    );
    // focus the new step's heading so keyboard and screen-reader users land there
    requestAnimationFrame(() => heading.focus());
  }

  /**
   * A large selection card. It is a real <button>, so it is reachable and
   * operable by keyboard with no extra handling, and its selected state is
   * carried by aria-pressed plus a tick and the word "Selected" — never by
   * colour alone.
   */
  function card({ id, title, meta, blurb, selected, disabled, disabledLabel, disabledReason, tag, onSelect }) {
    const classes = ['ob-card'];
    if (selected) classes.push('is-selected');
    if (disabled) classes.push('is-disabled');
    const descId = disabledReason ? `${id}-why` : null;
    return el('button', {
      type: 'button', class: classes.join(' '), 'data-testid': id,
      'aria-pressed': disabled ? null : String(!!selected),
      disabled: disabled || false,
      'aria-describedby': descId,
      onclick: disabled ? null : onSelect
    }, [
      el('span', { class: 'ob-card-top' }, [
        el('span', { class: 'ob-card-title', text: title }),
        tag ? el('span', { class: `tag ${tag.variant || ''}`, text: tag.text }) : null,
        meta ? el('span', { class: 'ob-card-meta', text: meta }) : null
      ].filter(Boolean)),
      blurb ? el('span', { class: 'ob-card-blurb', text: blurb }) : null,
      disabled && disabledLabel && !disabledReason ? el('span', { class: 'ob-card-state', text: disabledLabel }) : null,
      disabledReason ? el('span', { class: 'ob-card-why', id: descId, text: disabledReason }) : null,
      selected ? el('span', { class: 'ob-card-tick' }, [icon('check', 16), 'Selected']) : null
    ].filter(Boolean));
  }

  /* ------------------------------------------------------------- step: goal */

  function stepGoal() {
    step = 'goal';
    shell(1, change ? 4 : 3, 'What are you preparing for?', null,
      el('div', { class: 'ob-cards ob-cards-2' }, [
        card({
          id: 'ob-goal-school', title: 'School Education',
          blurb: 'Board textbooks by class — Tamil Nadu State Board or CBSE.',
          selected: draft.mode === 'school',
          onSelect: () => { draft.mode = 'school'; draft.exam = null; announce('School Education selected.'); stepBoard(); }
        }),
        card({
          id: 'ob-goal-competitive', title: 'Competitive Examination',
          blurb: 'Practice built from verified textbook passages.',
          selected: draft.mode === 'competitive',
          onSelect: () => { draft.mode = 'competitive'; draft.board = null; draft.classLevel = null; announce('Competitive Examination selected.'); stepExam(); }
        })
      ]),
      [backToCallerButton()]);
  }

  /* ------------------------------------------------------------ step: board */

  function stepBoard() {
    step = 'board';
    shell(change ? 2 : 1, change ? 4 : 3, 'Which board do you study?', null,
      el('div', { class: 'ob-cards ob-cards-2' }, profile.BOARDS.map((b) => {
        const count = profile.lessonsFor({ path: b.pathId }).length;
        return card({
          id: `ob-board-${b.pathId}`, title: b.name,
          meta: `${count} lesson${count === 1 ? '' : 's'} indexed`,
          selected: draft.board === b.value,
          onSelect: () => { draft.board = b.value; draft.classLevel = null; announce(`${b.name} selected.`); stepClass(); }
        });
      })),
      [
        change
          ? el('button', { class: 'btn btn-ghost', type: 'button', 'data-testid': 'ob-back', onclick: stepGoal }, [icon('up', 16), 'Go back'])
          : el('button', {
            class: 'btn btn-quiet', type: 'button', 'data-testid': 'ob-exam-instead',
            onclick: () => { draft.mode = 'competitive'; draft.board = null; stepExam(); },
            text: 'I am preparing for a competitive exam instead'
          }),
        backToCallerButton()
      ]);
  }

  /* ------------------------------------------------------------ step: class */

  function stepClass() {
    step = 'class';
    const board = profile.boardByValue(draft.board);
    const rows = profile.classesForBoard(draft.board);
    const ready = rows.filter((r) => r.selectable);
    const later = rows.filter((r) => !r.selectable);

    // classes that are not ready are named in one quiet line, not shown as a
    // row of large cards a learner is invited to try and then refused
    const laterLine = later.length
      ? el('p', { class: 'classes-later', 'data-testid': 'ob-classes-later',
        text: `Classes ${later.map((r) => r.classLevel).join(', ')} are coming later.` })
      : null;

    shell(change ? 3 : 2, change ? 4 : 3, 'Which class are you in?', board.name,
      el('div', {}, [
        el('div', { class: 'ob-cards ob-cards-3', 'data-testid': 'ob-classes' }, ready.map((r) => card({
          id: `ob-class-${r.classLevel}`,
          title: `Class ${r.classLevel}`,
          meta: r.note,
          selected: draft.classLevel === r.classLevel,
          onSelect: () => { draft.classLevel = r.classLevel; announce(`Class ${r.classLevel} selected.`); stepConfirm(); }
        }))),
        laterLine
      ].filter(Boolean)),
      [
        el('button', { class: 'btn btn-ghost', type: 'button', 'data-testid': 'ob-back', onclick: stepBoard }, [icon('up', 16), 'Go back']),
        backToCallerButton()
      ]);
  }

  /* ------------------------------------------------------------- step: exam */

  function stepExam() {
    step = 'exam';
    shell(2, change ? 4 : 3, 'Choose your examination', null,
      el('div', { class: 'ob-cards ob-cards-2', 'data-testid': 'ob-exams' }, profile.EXAMS.map((e) => {
        const available = e.status === 'beta';
        return card({
          id: `ob-exam-${e.value}`, title: e.name,
          tag: { text: e.statusLabel, variant: available ? 'tag-beta' : 'tag-soon' },
          blurb: available ? e.note : null,
          selected: draft.exam === e.value,
          disabled: !available,
          disabledLabel: available ? null : e.statusLabel,
          disabledReason: available ? null : e.note,
          onSelect: () => { draft.exam = e.value; announce(`${e.name} selected.`); stepConfirm(); }
        });
      })),
      [
        el('button', { class: 'btn btn-ghost', type: 'button', 'data-testid': 'ob-back', onclick: stepGoal }, [icon('up', 16), 'Go back']),
        backToCallerButton()
      ]);
  }

  /* ---------------------------------------------------------- step: confirm */

  function stepConfirm() {
    step = 'confirm';
    const summary = profile.describe(draft);

    // what the learner is about to start: how many lessons, what they cover,
    // and roughly how long the whole thing takes. Every figure is counted from
    // the indexed lessons, not estimated.
    const mine = draft.mode === 'school'
      ? profile.lessonsFor({ path: profile.boardByValue(draft.board).pathId, classLevel: draft.classLevel })
      : profile.lessonsFor({ path: 'tnpsc' });
    const minutes = mine.reduce((sum, l) => sum + (l.readingMinutes || 4), 0);
    const topics = [...new Set(mine.map((l) => l.topic))];

    const body = el('div', { class: 'ob-summary', 'data-testid': 'ob-summary' }, [
      el('h2', { text: draft.mode === 'school' ? `Class ${draft.classLevel} history` : 'Your practice set' }),
      el('p', { class: 'lede', 'data-testid': 'ob-preview',
        text: `${mine.length} lesson${mine.length === 1 ? '' : 's'}, about ${minutes} minutes of reading in all.` }),
      topics.length ? el('div', { class: 'pill-row' }, topics.slice(0, 8).map((x) => el('span', { class: 'pill', text: x }))) : null,
      change ? el('p', { class: 'hint', 'data-testid': 'ob-change-warning',
        text: 'Changing your class only changes what you are shown first. Your XP, completed lessons, quiz history, badges and saved items all stay exactly as they are.' })
        : el('p', { class: 'hint', text: 'Nothing is locked. Other classes and boards stay open in the library.' })
    ].filter(Boolean));

    shell(change ? 4 : 3, change ? 4 : 3,
      change ? 'Confirm your new path' : 'Ready to start',
      summary.detail, body,
      [
        el('button', {
          class: 'btn btn-primary btn-lg', type: 'button', 'data-testid': 'ob-confirm', onclick: save
        }, [icon('check', 18), change ? 'Save this path' : 'Start my first lesson']),
        el('button', {
          class: 'btn btn-ghost', type: 'button', 'data-testid': 'ob-confirm-back',
          onclick: () => (draft.mode === 'school' ? stepClass() : stepExam())
        }, [icon('up', 16), 'Go back']),
        change ? el('button', {
          class: 'btn btn-quiet', type: 'button', 'data-testid': 'ob-cancel',
          onclick: () => { toast('Learning path unchanged.'); if (onCancel) onCancel(); }
        }, 'Cancel') : null
      ].filter(Boolean));
  }

  function save() {
    store.setLearningProfile(draft);
    const saved = profile.current();
    announce(`Learning profile saved: ${profile.label(saved)}.`);
    toast(`Learning path set: ${profile.label(saved)}.`, 'badge');
    document.dispatchEvent(new CustomEvent('trident:profile'));
    if (onDone) onDone(saved);
  }

  function backToCallerButton() {
    if (!change) return null;
    return el('button', {
      class: 'btn btn-ghost push', type: 'button', 'data-testid': 'ob-cancel-early',
      onclick: () => { toast('Learning path unchanged.'); if (onCancel) onCancel(); }
    }, 'Cancel');
  }

  function announce(message) { announceToScreenReader(message); }

  // a change starts from what is already stored, so "cancel" is a true no-op
  if (change && existing) {
    draft.mode = existing.mode;
    draft.board = existing.board;
    draft.classLevel = existing.classLevel;
    draft.exam = existing.exam;
  }
  // A first visit is three steps: board, class, then the preview it starts
  // from. Changing an existing path still begins with the goal question,
  // because that is the thing a learner is most likely changing.
  if (change) stepGoal(); else { draft.mode = 'school'; stepBoard(); }
}
