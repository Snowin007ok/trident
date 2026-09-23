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

  view.append(el('div', { class: 'section-head' }, [
    el('span', { class: 'eyebrow', 'data-testid': 'quiz-kicker', text: set.mixed ? 'Mixed History Challenge' : 'Daily challenge' }),
    el('h1', { text: set.mixed ? 'Mixed History Challenge' : 'Daily Quiz' }),
    el('span', { class: 'hint', text: prettyDate(dateKey) })
  ]));

  // when a class does not yet have five questions of its own, say so plainly
  // rather than passing another class's questions off as this one's
  if (set.mixed && prof) {
    view.append(el('p', { class: 'notice section', 'data-testid': 'quiz-mixed-note' }, [
      el('strong', { text: 'Mixed History Challenge. ' }),
      `${profile.label(prof)} has ${set.matching} verified question${set.matching === 1 ? '' : 's'} so far — `
      + 'fewer than the five a day needs, so today\u2019s set is drawn from every class in the verified library. '
      + 'Every question still cites the textbook and page it came from.'
    ]));
  } else if (prof) {
    view.append(el('p', { class: 'hint section', 'data-testid': 'quiz-profile-note',
      text: `Five questions from ${profile.label(prof)}.` }));
  }

  if (existing) {
    const alreadyAnswers = questions.map((q) => {
      const rec = (existing.answers || []).find((a) => a.questionId === q.id);
      return rec ? rec.answer : blankAnswer(q);
    });
    view.append(
      trail(questions, alreadyAnswers, true, -1),
      summaryPanel(questions, alreadyAnswers, existing.score, existing.total, {
        alreadyDone: true, timedOut: existing.timedOut, xpLine: xpLineFor(dateKey, existing)
      }),
      el('div', { class: 'notice section', 'data-testid': 'quiz-locked' }, [
        el('p', {}, [
          'The same five questions stay in place for the rest of today, and the XP for today is already recorded. A new set appears tomorrow.'
        ])
      ])
    );
    renderReview(view, questions, existing.answers);
    return;
  }

  const answers = questions.map((q) => blankAnswer(q));
  const touched = new Set();
  let submitted = false;
  let timerId = null;
  let remaining = TIMER_SECONDS;
  let timedOut = false;
  let timerStarted = false;
  let currentIndex = 0;

  const trailHost = el('div');
  const timerNode = el('span', { class: 'timer', text: '05:00', role: 'timer', 'aria-live': 'off' });
  const timerStatus = el('p', { class: 'hint', 'aria-live': 'polite', text: 'The timer is optional. Nothing is locked when it ends, and no answers are taken away.' });

  const startTimerBtn = el('button', {
    class: 'btn btn-secondary btn-sm', type: 'button',
    onclick: () => {
      if (timerStarted) return;
      timerStarted = true;
      startTimerBtn.disabled = true;
      timerId = setInterval(tick, 1000);
      timerStatus.textContent = 'Timer running. You can still answer after it reaches zero.';
    }
  }, [icon('clock', 16), 'Start 5-minute timer']);

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
      clearInterval(timerId);
      timerId = null;
      timedOut = true;
      timerNode.classList.remove('is-low');
      timerNode.classList.add('is-out');
      timerNode.textContent = 'Time up';
      timerStatus.textContent = 'Time is up. The attempt is recorded as timed out, but you can still finish it and read every explanation.';
    }
  }

  const host = el('div', { class: 'section stack' });
  const summaryHost = el('div', { class: 'section' });
  const submitBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Submit answers' });

  function paintTrail() {
    clear(trailHost);
    trailHost.append(trail(questions, answers, submitted, currentIndex, touched));
  }

  function paint() {
    clear(host);
    questions.forEach((q, qi) => {
      const name = `q-${qi}`;
      let body;
      if (q.type === 'match') {
        body = matchRows(q, name, submitted, answers[qi]);
        body.addEventListener('change', (e) => {
          if (e.target.tagName === 'SELECT') {
            const idx = Number(e.target.id.split('-m-')[1]);
            answers[qi][idx] = e.target.value;
            currentIndex = qi;
            paintTrail();
          }
        });
      } else if (q.type === 'chronology') {
        body = orderList(q, name, submitted, answers[qi], (pos, dir) => {
          const arr = answers[qi];
          const target = pos + dir;
          if (target < 0 || target >= arr.length) return;
          [arr[pos], arr[target]] = [arr[target], arr[pos]];
          touched.add(q.id);
          currentIndex = qi;
          paint();
          paintTrail();
        });
      } else {
        body = optionList(q, name, submitted, answers[qi]);
        body.addEventListener('change', (e) => {
          if (e.target.type === 'radio') {
            answers[qi] = Number(e.target.value);
            currentIndex = qi;
            paintTrail();
          }
        });
      }

      const era = eraForQuestion(q);
      const article = el('article', {
        class: `question${!submitted && qi === currentIndex ? ' is-current' : ''}`,
        'data-testid': `question-${qi}`
      }, [
        el('div', { class: 'question-head' }, [
          el('span', { class: 'question-index', text: `Q${qi + 1}` }),
          el('span', { class: 'question-type', text: TYPE_LABEL[q.type] || q.type }),
          el('span', { class: 'pill', text: q.topic }),
          era ? el('span', { class: 'pill', text: era }) : null,
          el('span', { class: 'pill', text: `Class ${q.classLevel}` }),
          el('span', { class: 'question-xp', text: submitted ? '' : `${qi + 1} of ${questions.length}` })
        ]),
        el('h2', { class: 'question-prompt', text: q.prompt }),
        body,
        submitted ? explanationBlock(q, isCorrect(q, answers[qi])) : null
      ]);
      article.addEventListener('focusin', () => {
        if (submitted || currentIndex === qi) return;
        currentIndex = qi;
        paintTrail();
        questions.forEach((_, i) => {
          const node = host.children[i];
          if (node) node.classList.toggle('is-current', i === qi);
        });
      });
      host.append(article);
    });
  }

  submitBtn.addEventListener('click', () => {
    if (submitted) return;
    const missing = questions.findIndex((q, i) => !answered(q, answers[i], touched));
    if (missing >= 0 && !timedOut) {
      toast(`Question ${missing + 1} has no answer yet.`);
      const node = host.children[missing];
      if (node) {
        node.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
        const first = node.querySelector('input, select, button');
        if (first) first.focus();
      }
      return;
    }
    submitted = true;
    if (timerId) { clearInterval(timerId); timerId = null; }

    const detail = questions.map((q, i) => ({
      questionId: q.id, topic: q.topic, path: q.path, classLevel: q.classLevel,
      correct: isCorrect(q, answers[i]), at: new Date().toISOString(),
      answer: answers[i]
    }));
    const score = detail.filter((d) => d.correct).length;
    const before = store.load().streak.current;
    store.recordQuizAttempt({
      dateKey, kind: 'daily', score, total: questions.length,
      timedOut, timerUsed: timerStarted, answers: detail
    });
    const after = store.load().streak.current;

    // XP: the quiz itself, then the perfect-score bonus. Both key on the date.
    const ctx = { lessons: DATA.lessons.lessons };
    const quizAward = gamify.award('quiz', dateKey, ctx);
    let bonus = 0;
    if (score === questions.length) bonus = gamify.award('quizPerfect', dateKey, ctx).xp;
    const gained = quizAward.xp + bonus;

    submitBtn.disabled = true;
    paint();
    paintTrail();

    const streakMsg = after > before ? ` Streak is now ${after} day${after === 1 ? '' : 's'}.` : '';
    clear(summaryHost);
    summaryHost.append(summaryPanel(questions, answers, score, questions.length, {
      timedOut,
      xpLine: gained > 0
        ? `+${gained} XP added${bonus ? ` (${gamify.XP_RULES.quiz} for the quiz, ${gamify.XP_RULES.quizPerfect} perfect-score bonus)` : ''}.`
        : 'Today’s quiz XP was already recorded, so no XP was added this time.',
      streakMsg
    }));
    summaryHost.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' });

    const resultNode = view.querySelector('#quizResult');
    resultNode.hidden = false;
    resultNode.textContent =
      `You scored ${score} of ${questions.length}${timedOut ? ' (timed out)' : ''}.${streakMsg}`;

    toast(`Scored ${score} of ${questions.length}.${streakMsg}`, gained ? 'xp' : '');
    if (score === questions.length) celebrate();
    document.dispatchEvent(new CustomEvent('trident:hud'));
  });

  view.append(
    el('div', { class: 'panel row' }, [
      el('div', {}, [
        el('h2', { text: 'Five questions, one per format' }),
        el('p', { class: 'hint', text: 'Every question is drawn from a verified textbook passage and shows the page it came from.' }),
        el('div', { class: 'pill-row', style: 'margin-top:var(--sp-3)' }, [
          tag(`+${gamify.XP_RULES.quiz} XP for finishing`, 'xp', 'bolt'),
          tag(`+${gamify.XP_RULES.quizPerfect} XP bonus for 5 of 5`, 'gold', 'star')
        ])
      ]),
      el('div', { class: 'row push' }, [timerNode, startTimerBtn])
    ]),
    timerStatus,
    trailHost,
    summaryHost,
    host,
    el('p', { id: 'quizResult', class: 'notice', hidden: true }),
    el('div', { class: 'reader-actions' }, [submitBtn]),
    el('p', { class: 'hint', text: 'There are no lives and nothing is locked. A wrong answer still shows you the explanation and the page it came from.' })
  );

  paint();
  paintTrail();

  view.addEventListener('trident:teardown', () => {
    if (timerId) clearInterval(timerId);
  }, { once: true });
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
  const colours = ['var(--india-saffron)', 'var(--ivory)', 'var(--india-green)', 'var(--gold)'];
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

  const btn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Check answers' });
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
