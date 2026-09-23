/**
 * Daily Quiz — five deterministic questions per date, presented as a challenge
 * with a progress trail, an optional timer, evidence cards and a summary.
 *
 * Learning is never blocked: there are no lives, nothing is lost on a wrong
 * answer, and every question's explanation and citation are shown afterwards
 * whether the answer was right or wrong.
 *
 * XP is granted through gamify.award(), which keys on the date, so reloading
 * or revisiting the finished quiz can never pay out twice.
 */

import { el, clear, toast, evidenceCard, tag } from './ui.js';
import { icon } from './icons.js';
import * as store from './storage.js';
import * as gamify from './gamify.js';
import { todayKey, prettyDate, dailyQuizSet, seededShuffle, hashString } from './daily.js';
import * as profile from './profile.js';

let DATA = null;
const TIMER_SECONDS = 5 * 60;

export function init(data) { DATA = data; }

/**
 * The day's five questions, and whether they had to reach outside the
 * learner's own class to find five.
 *
 * A Class 6 profile gets Class 6 questions when Class 6 has five to give. When
 * it does not, the day is drawn from the whole bank and is labelled a Mixed
 * History Challenge — the student is told, rather than quietly handed Class 9.
 */
export function dailySet(dateKey) {
  return dailyQuizSet(DATA.questions.questions, dateKey, 5, profile.strictFn());
}

export function questionsForDate(dateKey) {
  return dailySet(dateKey).questions;
}

function reducedMotion() {
  try {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (err) { return false; }
}

/* ------------------------------------------------------------ era labels */

/** The era a question sits in, taken from the lesson index — never invented. */
function eraForQuestion(q) {
  const lessons = (DATA.lessons && DATA.lessons.lessons) || [];
  const match = lessons.find((l) => l.topic === q.topic)
    || lessons.find((l) => q.lessonId && l.id === q.lessonId);
  if (!match || !match.era) return null;
  return (gamify.ERAS.find((e) => e.id === match.era) || {}).label || null;
}

/* --------------------------------------------------------------- answers */

const TYPE_LABEL = {
  mcq: 'Multiple choice',
  date: 'Identify the date',
  cause: 'Cause and consequence',
  match: 'Match person and event',
  chronology: 'Arrange in order'
};

function isCorrect(q, answer) {
  if (q.type === 'match') return q.pairs.every((p, i) => answer[i] === p.right);
  if (q.type === 'chronology') return answer.every((itemIdx, pos) => q.items[itemIdx].order === pos + 1);
  return answer === q.answerIndex;
}

function blankAnswer(q) {
  if (q.type === 'match') return q.pairs.map(() => '');
  if (q.type === 'chronology') return shuffledStart(q);
  return null;
}

/**
 * A starting order that is deterministic for the day but never the answer.
 *
 * A seeded shuffle can land on the correct sequence, which would hand the
 * student the answer and let them submit without touching anything. Reseed
 * until the order differs from the solution.
 */
function shuffledStart(q) {
  const solved = (arr) => arr.every((itemIdx, pos) => q.items[itemIdx].order === pos + 1);
  const indices = q.items.map((_, i) => i);
  if (indices.length < 2) return indices;
  for (let salt = 0; salt < 12; salt += 1) {
    const candidate = seededShuffle(indices, hashString(`${q.id}o${salt}`));
    if (!solved(candidate)) return candidate;
  }
  // unreachable in practice; a swap guarantees it regardless
  const fallback = indices.slice();
  [fallback[0], fallback[1]] = [fallback[1], fallback[0]];
  return fallback;
}

/**
 * `touched` carries the ids of ordering questions the student has actually
 * moved. Without it an untouched list would count as answered simply because
 * it has a sequence, and the quiz could be submitted with nothing done.
 */
function answered(q, a, touched) {
  if (q.type === 'match') return a.every((v) => v !== '');
  if (q.type === 'chronology') return !!(touched && touched.has(q.id));
  return a !== null && a !== undefined;
}

/* ----------------------------------------------------------- input parts */

function optionList(q, name, disabled, chosen) {
  const seed = hashString(q.id);
  const order = seededShuffle(q.options.map((text, i) => ({ text, i })), seed);
  return el('ul', { class: 'options' }, order.map(({ text, i }) => {
    const id = `${name}-opt-${i}`;
    const input = el('input', {
      type: 'radio', name, id, value: String(i),
      checked: chosen === i, disabled
    });
    const label = el('label', { class: 'option', for: id }, [
      input,
      el('span', { text }),
      el('span', { class: 'opt-mark' })
    ]);
    if (disabled) {
      const mark = label.querySelector('.opt-mark');
      if (i === q.answerIndex) {
        label.classList.add('is-correct');
        mark.append(icon('check', 16), 'Correct answer');
      } else if (chosen === i) {
        label.classList.add('is-wrong');
        mark.append(icon('cross', 16), 'Your answer');
      } else if (chosen === null || chosen === undefined) {
        label.classList.add('is-unanswered');
      }
    }
    return el('li', {}, [label]);
  }));
}

function matchRows(q, name, disabled, chosen) {
  const seed = hashString(q.id + 'r');
  const rights = seededShuffle(q.pairs.map((p) => p.right), seed);
  return el('div', {}, q.pairs.map((pair, i) => {
    const id = `${name}-m-${i}`;
    const sel = el('select', { id, disabled, name: id }, [
      el('option', { value: '', selected: chosen[i] === undefined || chosen[i] === '' }, '— choose —'),
      ...rights.map((r) => el('option', { value: r, selected: chosen[i] === r }, r))
    ]);
    if (disabled) sel.classList.add(chosen[i] === pair.right ? 'is-correct' : 'is-wrong');
    return el('div', { class: 'match-row' }, [
      el('label', { class: 'match-left', for: id, text: pair.left }),
      sel
    ]);
  }));
}

function orderList(q, name, disabled, currentOrder, onMove) {
  return el('ul', { class: 'order-list' }, currentOrder.map((itemIdx, pos) => {
    const item = q.items[itemIdx];
    return el('li', { class: 'order-item' }, [
      el('span', { class: 'order-pos', text: String(pos + 1) }),
      el('span', { class: 'order-label' }, [
        item.label,
        disabled && item.hint ? el('span', { class: 'li-meta', text: ` (${item.hint})` }) : null
      ]),
      disabled ? null : el('span', { class: 'order-controls' }, [
        el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', disabled: pos === 0,
          'aria-label': `Move ${item.label} earlier`, onclick: () => onMove(pos, -1)
        }, [icon('up', 16)]),
        el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', disabled: pos === currentOrder.length - 1,
          'aria-label': `Move ${item.label} later`, onclick: () => onMove(pos, 1)
        }, [icon('down', 16)])
      ])
    ]);
  }));
}

/* ----------------------------------------------------------------- trail */

/**
 * Five steps, one per question. Before submission it shows which questions
 * have an answer; afterwards it shows which were right.
 */
function trail(questions, answers, submitted, currentIndex, touched) {
  return el('ol', { class: 'quiz-trail', 'data-testid': 'quiz-trail', 'aria-label': 'Quiz progress' },
    questions.map((q, i) => {
      let cls = '';
      let stateWord = 'not answered yet';
      if (submitted) {
        const ok = isCorrect(q, answers[i]);
        cls = ok ? 'is-correct' : 'is-wrong';
        stateWord = ok ? 'correct' : 'incorrect';
      } else if (answered(q, answers[i], touched) && answers[i] !== null) {
        cls = 'is-answered';
        stateWord = 'answered';
      }
      if (!submitted && i === currentIndex) cls += ' is-current';
      return el('li', { class: cls.trim() }, [
        el('span', {
          class: 'step', 'data-testid': `trail-step-${i}`,
          'aria-label': `Question ${i + 1}, ${stateWord}`
        }, [
          submitted ? icon(isCorrect(q, answers[i]) ? 'check' : 'cross', 15) : String(i + 1)
        ]),
        el('span', { class: 'link', 'aria-hidden': 'true' })
      ]);
    }));
}

/* ------------------------------------------------------------ daily quiz */

export function renderDailyQuiz(view) {
  clear(view);
  const dateKey = todayKey();
  const state = store.load();
  const set = dailySet(dateKey);
  const questions = set.questions;
  const existing = state.dailyQuizByDate[dateKey];
  const prof = profile.current(state);

  /* ---- already done today: the record, not the form ---- */
  if (existing) {
    const alreadyAnswers = questions.map((q) => {
      const rec = (existing.answers || []).find((a) => a.questionId === q.id);
      return rec ? rec.answer : blankAnswer(q);
    });
    view.append(
      el('div', { class: 'quiz-head' }, [
        el('h1', { text: set.mixed ? 'Mixed History Challenge' : 'Today\u2019s questions' }),
        el('p', { class: 'lede', text: `You scored ${existing.score} of ${existing.total} today.` })
      ]),
      summaryPanel(questions, alreadyAnswers, existing.score, existing.total, {
        alreadyDone: true, timedOut: existing.timedOut, xpLine: xpLineFor(dateKey, existing)
      }),
      el('div', { class: 'next-step' }, [
        el('p', { text: 'A new set of five appears tomorrow.' }),
        el('a', { class: 'btn btn-primary', href: '#/timeline', text: 'Try the Timeline Challenge' })
      ])
    );
    renderReview(view, questions, existing.answers);
    return;
  }

  /* ---- state for the run ---- */
  const answers = questions.map((q) => blankAnswer(q));
  const touched = new Set();
  const revealed = questions.map(() => false);
  let at = 0;
  let timerId = null;
  let remaining = TIMER_SECONDS;
  let timedOut = false;
  let timerStarted = false;
  let finished = false;

  const stage = el('div', { class: 'quiz-stage', 'data-testid': 'quiz-stage' });
  const timerNode = el('span', { class: 'timer', text: '05:00', role: 'timer', 'aria-live': 'off' });
  const timerBtn = el('button', {
    class: 'btn btn-quiet btn-sm', type: 'button', 'data-testid': 'quiz-timer',
    onclick: () => {
      if (timerStarted) return;
      timerStarted = true;
      timerBtn.remove();
      timerNode.hidden = false;
      timerId = setInterval(tick, 1000);
    }
  }, [icon('clock', 15), 'Time me']);
  timerNode.hidden = true;

  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  function tick() {
    remaining -= 1;
    timerNode.textContent = fmt(Math.max(0, remaining));
    timerNode.classList.toggle('is-low', remaining <= 60 && remaining > 0);
    if (remaining <= 0) {
      clearInterval(timerId); timerId = null; timedOut = true;
      timerNode.classList.remove('is-low');
      timerNode.classList.add('is-out');
      timerNode.textContent = 'Time up';
    }
  }

  /* ---- the rail counts answers given, not where the cursor is: the first
     segment stays empty until question one has actually been answered ---- */
  function answeredCount() { return revealed.filter(Boolean).length; }

  function railNode() {
    return el('div', {
      class: 'rail', 'data-testid': 'quiz-rail', role: 'img',
      'aria-label': `${answeredCount()} of ${questions.length} questions answered`
    }, questions.map((q, i) => el('i', {
      class: revealed[i] ? (isCorrect(q, answers[i]) ? 'is-done' : 'is-wrong') : (i === at ? 'is-now' : '')
    })));
  }

  function paint() {
    clear(stage);
    if (finished) return;
    const q = questions[at];
    const name = `q-${at}`;
    const isOpen = !revealed[at];
    const pct = Math.round((answeredCount() / questions.length) * 100);

    let body;
    if (q.type === 'match') {
      body = matchRows(q, name, !isOpen, answers[at]);
      body.addEventListener('change', (e) => {
        if (e.target.tagName === 'SELECT') {
          answers[at][Number(e.target.id.split('-m-')[1])] = e.target.value;
          touched.add(q.id);
          refreshAction();
        }
      });
    } else if (q.type === 'chronology') {
      body = orderList(q, name, !isOpen, answers[at], (posn, dir) => {
        const arr = answers[at];
        const target = posn + dir;
        if (target < 0 || target >= arr.length) return;
        [arr[posn], arr[target]] = [arr[target], arr[posn]];
        touched.add(q.id);
        paint();
      });
    } else {
      body = optionList(q, name, !isOpen, answers[at]);
      body.addEventListener('change', (e) => {
        if (e.target.type === 'radio') {
          answers[at] = Number(e.target.value);
          touched.add(q.id);
          refreshAction();
        }
      });
    }

    const action = el('div', { class: 'quiz-action' });

    stage.append(el('article', { class: 'question', 'data-testid': `question-${at}` }, [
      el('div', { class: 'q-progress' }, [
        el('div', { class: 'rail-legend' }, [
          el('b', { 'data-testid': 'quiz-position', text: `Question ${at + 1} of ${questions.length}` }),
          el('span', { 'data-testid': 'quiz-percent', text: `${pct}% complete` })
        ]),
        railNode(),
        el('div', { class: 'q-timer' }, [timerBtn, timerNode])
      ]),
      el('div', { class: 'q-head' }, [
        // the question number, struck like a seal
        el('span', { class: 'q-medallion', 'aria-hidden': 'true' }, [
          el('b', { text: String(at + 1) }),
          el('i', { text: `of ${questions.length}` })
        ]),
        el('h1', { class: 'question-prompt', text: q.prompt })
      ]),
      body,
      revealed[at] ? explanationBlock(q, isCorrect(q, answers[at])) : null,
      action
    ].filter(Boolean)));

    function refreshAction() {
      clear(action);
      if (revealed[at]) {
        const last = at === questions.length - 1;
        action.append(el('button', {
          class: 'btn btn-primary btn-block', type: 'button', 'data-testid': 'quiz-next',
          text: last ? 'See your result' : 'Next question',
          onclick: () => { if (last) finish(); else { at += 1; paint(); focusStage(); } }
        }));
        return;
      }
      // the action is always there: an unanswered question is pointed at
      // rather than the button being taken away
      action.append(el('button', {
        class: 'btn btn-primary btn-block', type: 'button', 'data-testid': 'quiz-check',
        text: 'Check answer',
        onclick: () => {
          if (!answered(q, answers[at], touched) && !timedOut) {
            toast('Choose an answer first.');
            const firstInput = stage.querySelector('input, select');
            if (firstInput) firstInput.focus();
            return;
          }
          revealed[at] = true; paint(); focusStage();
        }
      }));
    }
    refreshAction();
  }

  function focusStage() {
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    const h = stage.querySelector('.question-prompt');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  function finish() {
    finished = true;
    if (timerId) { clearInterval(timerId); timerId = null; }

    const detail = questions.map((q, i) => ({
      questionId: q.id, topic: q.topic, path: q.path, classLevel: q.classLevel,
      correct: isCorrect(q, answers[i]), at: new Date().toISOString(), answer: answers[i]
    }));
    const score = detail.filter((d) => d.correct).length;
    const before = store.load().streak.current;
    store.recordQuizAttempt({
      dateKey, kind: 'daily', score, total: questions.length,
      timedOut, timerUsed: timerStarted, answers: detail
    });
    const after = store.load().streak.current;

    const ctx = { lessons: DATA.lessons.lessons };
    const quizAward = gamify.award('quiz', dateKey, ctx);
    let bonus = 0;
    if (score === questions.length) bonus = gamify.award('quizPerfect', dateKey, ctx).xp;
    const gained = quizAward.xp + bonus;
    const streakMsg = after > before ? ` Your streak is now ${after} day${after === 1 ? '' : 's'}.` : '';

    clear(stage);
    stage.append(
      summaryPanel(questions, answers, score, questions.length, {
        timedOut,
        xpLine: gained > 0
          ? `+${gained} XP added${bonus ? `, including the ${gamify.XP_RULES.quizPerfect} bonus for a perfect score` : ''}.`
          : 'Today\u2019s quiz XP was already recorded, so nothing was added this time.',
        streakMsg
      }),
      el('div', { class: 'next-step' }, [
        el('a', { class: 'btn btn-primary', href: '#/timeline', text: 'Try the Timeline Challenge' }),
        el('a', { class: 'btn btn-ghost', href: '#/library', text: 'Back to Learn' })
      ])
    );
    const resultNode = view.querySelector('#quizResult');
    resultNode.hidden = false;
    resultNode.textContent = `You scored ${score} of ${questions.length}${timedOut ? ', timed out' : ''}.${streakMsg}`;
    toast(`${score} of ${questions.length} right.${streakMsg}`, gained ? 'xp' : '');
    if (score === questions.length) celebrate();
    document.dispatchEvent(new CustomEvent('trident:hud'));
    window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    renderReview(view, questions, detail);
  }

  /* ---- the page ---- */
  view.append(el('div', { class: 'quiz-head' }, [
    el('h1', { 'data-testid': 'quiz-title', text: set.mixed ? 'Mixed History Challenge' : 'Today\u2019s questions' }),
    set.mixed && prof
      ? el('p', { class: 'lede', 'data-testid': 'quiz-mixed-note' },
        [`${profile.label(prof)} has only ${set.matching} verified question${set.matching === 1 ? '' : 's'} so far, `
          + 'so today\u2019s five come from across the whole verified library. Every one still cites its textbook and page.'])
      : el('p', { class: 'lede', 'data-testid': 'quiz-profile-note',
        text: 'Five questions from your class. Nothing is lost for a wrong answer.' })
  ]));
  view.append(stage);
  view.append(el('p', { id: 'quizResult', class: 'sr-only', role: 'status', 'aria-live': 'polite', hidden: true }));

  paint();

  view.addEventListener('trident:teardown', () => {
    if (timerId) clearInterval(timerId);
  }, { once: true });
}

/**
 * One question at the end of a lesson. It is a check, not a test: it records
 * nothing, grants no XP, and shows the explanation either way.
 */
export function renderLessonCheck(host, lesson) {
  if (!host || !lesson) return;
  // questions are tied to a lesson by its topic, board and class — the same
  // three things that decide whether a lesson is the learner's own
  const single = (x) => ['mcq', 'cause', 'date'].includes(x.type) && Array.isArray(x.options);
  const pool = DATA.questions.questions.filter(single);
  const q = pool.find((x) => x.topic === lesson.topic
      && x.path === lesson.path && String(x.classLevel) === String(lesson.classLevel))
    || pool.find((x) => x.topic === lesson.topic);
  if (!q) return;

  let chosen = null;
  let shown = false;
  const box = el('section', { class: 'check', 'data-testid': 'check' });

  function paint() {
    clear(box);
    const list = optionList(q, 'check', shown, chosen);
    list.addEventListener('change', (e) => {
      if (e.target.type === 'radio') { chosen = Number(e.target.value); paint(); }
    });
    box.append(
      el('h2', { text: 'Quick check' }),
      el('p', { class: 'question-prompt', text: q.prompt }),
      list,
      shown
        ? explanationBlock(q, isCorrect(q, chosen))
        : el('button', {
          class: 'btn btn-ghost', type: 'button', 'data-testid': 'check-reveal',
          disabled: chosen === null, text: 'Check my answer',
          onclick: () => { shown = true; paint(); }
        })
    );
  }
  paint();
  host.append(box);
}

/* --------------------------------------------------------------- summary */

function xpLineFor(dateKey, record) {
  const base = store.hasReward(gamify.rewardId('quiz', dateKey)) ? gamify.XP_RULES.quiz : 0;
  const bonus = store.hasReward(gamify.rewardId('quizPerfect', dateKey)) ? gamify.XP_RULES.quizPerfect : 0;
  if (!base && !bonus) return 'No XP is recorded for this date.';
  return `${base + bonus} XP recorded for this date${bonus ? ' (including the perfect-score bonus)' : ''}.`;
}

function summaryPanel(questions, answers, score, total, opts = {}) {
  const missed = questions.filter((q, i) => !isCorrect(q, answers[i]));
  const pct = total ? Math.round((score / total) * 100) : 0;
  return el('section', { class: 'summary-panel stack', 'data-testid': 'quiz-summary' }, [
    el('span', { class: 'eyebrow', text: opts.alreadyDone ? 'Today’s result' : 'Challenge complete' }),
    el('div', { class: 'row' }, [
      el('div', { class: 'summary-score', text: `${score}/${total}` }),
      el('div', {}, [
        el('p', { text: `${pct}% correct${opts.timedOut ? ' · the timer ran out before you submitted' : ''}.` }),
        el('p', { class: 'hint', text: `${opts.xpLine || ''}${opts.streakMsg || ''}` })
      ])
    ]),
    missed.length
      ? el('div', {}, [
        el('h3', { text: `Worth another look (${missed.length})` }),
        el('ul', { class: 'list' }, missed.map((q) => el('li', { class: 'list-item' }, [
          el('div', { class: 'li-main' }, [
            el('div', { class: 'li-title', text: q.prompt }),
            el('div', { class: 'li-meta', text: `${q.topic} · ${q.citation.book}` })
          ]),
          el('a', { class: 'btn btn-ghost btn-sm', href: '#/library', text: 'Revise' })
        ])))
      ])
      : el('p', { text: 'Every question correct. The full explanation for each is below.' })
  ]);
}

function explanationBlock(q, wasCorrect) {
  return el('div', { class: `explanation ${wasCorrect ? 'is-correct' : 'is-wrong'}` }, [
    el('h4', { text: wasCorrect ? 'Correct' : 'Not quite — here is why' }),
    el('p', { text: q.explanation }),
    evidenceCard({
      book: q.citation.book, chapter: q.citation.chapter,
      pageStart: q.citation.pageStart, pageEnd: q.citation.pageEnd
    })
  ]);
}

function renderReview(view, questions, savedAnswers) {
  const host = el('div', { class: 'section stack' });
  host.append(el('h2', { text: 'Review every question' }));
  questions.forEach((q, qi) => {
    const rec = (savedAnswers || []).find((a) => a.questionId === q.id);
    const wasCorrect = rec ? rec.correct : false;
    host.append(el('article', { class: 'question' }, [
      el('div', { class: 'question-head' }, [
        el('span', { class: 'question-index', text: `Q${qi + 1}` }),
        el('span', { class: 'question-type', text: TYPE_LABEL[q.type] || q.type }),
        el('span', { class: 'pill', text: q.topic }),
        el('span', { class: wasCorrect ? 'badge badge-ok' : 'badge', text: wasCorrect ? 'Correct' : 'Missed' })
      ]),
      el('h3', { class: 'question-prompt', text: q.prompt }),
      explanationBlock(q, wasCorrect)
    ]));
  });
  view.append(host);
}

/* ------------------------------------------------------------- celebrate */

/**
 * A short, restrained shower of saffron, ivory, green and gold slips.
 * Skipped entirely when the viewer prefers reduced motion.
 */
function celebrate() {
  if (reducedMotion()) return;
  const colours = ['var(--saffron)', 'var(--gold)', 'var(--green)', 'var(--teal)'];
  const wrap = el('div', { class: 'confetti', 'aria-hidden': 'true', 'data-testid': 'confetti' });
  for (let i = 0; i < 28; i += 1) {
    wrap.append(el('i', {
      style: `left:${Math.round(Math.random() * 100)}%;`
        + `background:${colours[i % colours.length]};`
        + `animation-delay:${Math.round(Math.random() * 700)}ms;`
        + `transform:rotate(${Math.round(Math.random() * 90)}deg)`
    }));
  }
  document.body.append(wrap);
  setTimeout(() => wrap.remove(), 3400);
}

/* -------------------------------------------------------- story mini quiz */

export function renderMiniQuiz(container, story) {
  const answers = story.miniQuiz.map(() => null);
  let done = false;
  const host = el('div', { class: 'stack' });

  function paint() {
    clear(host);
    story.miniQuiz.forEach((q, qi) => {
      const name = `mini-${story.id}-${qi}`;
      const list = el('ul', { class: 'options' }, q.options.map((text, i) => {
        const id = `${name}-${i}`;
        const label = el('label', { class: 'option', for: id }, [
          el('input', { type: 'radio', name, id, value: String(i), checked: answers[qi] === i, disabled: done }),
          el('span', { text }),
          el('span', { class: 'opt-mark' })
        ]);
        if (done) {
          const mark = label.querySelector('.opt-mark');
          if (i === q.answerIndex) { label.classList.add('is-correct'); mark.append(icon('check', 16), 'Correct answer'); }
          else if (answers[qi] === i) { label.classList.add('is-wrong'); mark.append(icon('cross', 16), 'Your answer'); }
        }
        return el('li', {}, [label]);
      }));
      list.addEventListener('change', (e) => {
        if (e.target.type === 'radio') answers[qi] = Number(e.target.value);
      });
      host.append(...[el('article', { class: 'question' }, [
        el('div', { class: 'question-head' }, [el('span', { class: 'question-index', text: `Q${qi + 1}` })]),
        el('h3', { class: 'question-prompt', text: q.prompt }),
        list,
        done ? el('div', { class: `explanation ${answers[qi] === q.answerIndex ? 'is-correct' : 'is-wrong'}` }, [
          el('h4', { text: answers[qi] === q.answerIndex ? 'Correct' : 'Not quite' }),
          el('p', { text: q.explanation })
        ]) : null
      ])].filter(Boolean));
    });
  }

  const btn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Check answers' });
  btn.addEventListener('click', () => {
    if (done) return;
    if (answers.some((a) => a === null)) { toast('Answer all three questions first.'); return; }
    done = true;
    btn.disabled = true;
    const detail = story.miniQuiz.map((q, i) => ({
      questionId: `${story.id}-mini-${i}`, topic: story.topic, path: story.path,
      classLevel: null, correct: answers[i] === q.answerIndex, at: new Date().toISOString()
    }));
    const score = detail.filter((d) => d.correct).length;
    store.recordQuizAttempt({
      dateKey: todayKey(), kind: 'story', score, total: detail.length,
      timedOut: false, timerUsed: false, answers: detail
    });
    paint();
    toast(`Story quiz: ${score} of ${detail.length}.`);
  });

  paint();
  container.append(host, el('div', { class: 'reader-actions' }, [btn]));
}
