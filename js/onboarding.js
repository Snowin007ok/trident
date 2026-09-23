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
    shell(2, change ? 4 : 3, 'Choose your board', null,
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
        el('button', { class: 'btn btn-ghost', type: 'button', 'data-testid': 'ob-back', onclick: stepGoal }, [icon('up', 16), 'Go back']),
        backToCallerButton()
      ]);
  }

  /* ------------------------------------------------------------ step: class */

  function stepClass() {
    step = 'class';
    const board = profile.boardByValue(draft.board);
    const rows = profile.classesForBoard(draft.board);
    shell(2, change ? 4 : 3, 'Choose your class',
      `${board.name}. Only classes with verified, indexed lessons can be selected.`,
      el('div', { class: 'ob-cards ob-cards-3', 'data-testid': 'ob-classes' }, rows.map((r) => card({
        id: `ob-class-${r.classLevel}`,
        title: `Class ${r.classLevel}`,
        meta: r.note,
        selected: draft.classLevel === r.classLevel,
        disabled: !r.selectable,
        disabledLabel: r.selectable ? null : (r.state === 'coming_soon' ? 'Content coming soon' : 'Not available yet'),
        disabledReason: r.disabledReason,
        onSelect: () => { draft.classLevel = r.classLevel; announce(`Class ${r.classLevel} selected.`); stepConfirm(); }
      }))),
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
    const rows = draft.mode === 'school'
      ? [['Goal', 'School Education'], ['Board', profile.boardByValue(draft.board).name], ['Class', draft.classLevel]]
      : [['Goal', 'Competitive Examination'], ['Examination', `${profile.examByValue(draft.exam).name} — ${profile.examByValue(draft.exam).statusLabel}`]];

    const body = el('div', { class: 'stack' }, [
      el('div', { class: 'panel ob-summary', 'data-testid': 'ob-summary' }, [
        el('h2', { text: 'Your learning profile' }),
        el('dl', { class: 'ob-summary-list' }, rows.flatMap(([k, v]) => [
          el('dt', { text: k }), el('dd', { text: String(v) })
        ])),
        el('p', { class: 'hint', text: 'Your dashboard, lessons and daily practice will be personalised using this selection.' })
      ]),
      change ? el('div', { class: 'notice', 'data-testid': 'ob-change-warning' }, [
        el('p', {}, [
          el('strong', { text: 'Changing your learning path will personalise future recommendations. ' }),
          'Your existing XP, completed lessons, quiz history, badges, artefacts and saved items will not be deleted.'
        ])
      ]) : null,
      el('p', { class: 'hint', text: 'Nothing is hidden. Lessons from other boards and classes stay in the library, and everything you have already done stays in your Passport.' })
    ].filter(Boolean));

    shell(change ? 4 : 3, change ? 4 : 3,
      change ? 'Confirm your new learning path' : 'Confirm your learning profile',
      summary.detail, body,
      [
        el('button', {
          class: 'btn btn-primary btn-lg', type: 'button', 'data-testid': 'ob-confirm',
          onclick: save
        }, [icon('check', 18), change ? 'Save New Path' : 'Confirm and Start Learning']),
        el('button', {
          class: 'btn btn-secondary', type: 'button', 'data-testid': 'ob-confirm-back',
          onclick: () => (draft.mode === 'school' ? stepClass() : stepExam())
        }, [icon('up', 16), 'Go Back']),
        change ? el('button', {
          class: 'btn btn-ghost', type: 'button', 'data-testid': 'ob-cancel',
          onclick: () => { toast('Learning path unchanged.'); if (onCancel) onCancel(); }
        }, 'Cancel') : null
      ]);
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
  stepGoal();
}
