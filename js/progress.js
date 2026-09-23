/**
 * The Historian's Passport — the learner's record of everything they have done.
 *
 * Level and XP, streaks, learning-path progress, the badge shelf, the artefact
 * collection, a quiz-performance trend, a revision queue, completed eras and
 * recent activity. Every chart here is plain HTML, CSS and inline SVG; no chart
 * library is used and no figure is invented — each number is computed from
 * stored activity.
 */

import { el, clear, xpBar, tag } from './ui.js';
import { icon, levelEmblem, badgeArt, artefactArt, eraIcon, eraEmblem, milestoneFlag } from './icons.js';
import * as store from './storage.js';
import * as gamify from './gamify.js';
import { todayKey, prettyDate, lastNDateKeys, daysBetween } from './daily.js';
import { lessonById, bookById } from './library.js';
import * as profile from './profile.js';

let DATA = null;
export function init(data) { DATA = data; }

/* --------------------------------------------------------------- analysis */

function topicStats(state) {
  const map = new Map();
  state.quizAttempts.forEach((att) => {
    (att.answers || []).forEach((a) => {
      if (!a.topic) return;
      if (!map.has(a.topic)) map.set(a.topic, { topic: a.topic, asked: 0, correct: 0, lastWrongAt: null });
      const rec = map.get(a.topic);
      rec.asked += 1;
      if (a.correct) rec.correct += 1;
      else if (!rec.lastWrongAt || new Date(a.at) > new Date(rec.lastWrongAt)) rec.lastWrongAt = a.at;
    });
  });
  return [...map.values()].map((r) => ({ ...r, accuracy: r.asked ? r.correct / r.asked : 0 }));
}

export function revisionSuggestions(state, today) {
  const ranked = topicStats(state)
    .filter((t) => t.lastWrongAt)
    .map((t) => {
      const wrongKey = t.lastWrongAt.slice(0, 10);
      const age = Math.max(0, daysBetween(wrongKey, today));
      return { ...t, ageDays: age };
    })
    .filter((t) => t.accuracy < 0.75 || t.ageDays >= 3)
    .sort((a, b) => (b.ageDays - a.ageDays) || (a.accuracy - b.accuracy));
  // topics from the learner's own path surface first; nothing is dropped
  return profile.rank(ranked);
}

export function strongTopics(state) {
  return topicStats(state)
    .filter((t) => t.asked >= 2 && t.accuracy >= 0.75)
    .sort((a, b) => b.accuracy - a.accuracy);
}

export function overallAccuracy(state) {
  let asked = 0; let correct = 0;
  state.quizAttempts.forEach((att) => {
    asked += att.total || 0;
    correct += att.score || 0;
  });
  return { asked, correct, pct: asked ? Math.round((correct / asked) * 100) : 0 };
}

/* ---------------------------------------------------------------- render */

export function renderProgress(view) {
  clear(view);
  const state = store.load();
  const today = todayKey();
  const lessons = DATA.lessons.lessons;
  // the class summary is measured against the learner's own class; everything
  // they have ever finished on any path still counts towards XP and badges,
  // which the statistics below report separately
  const scope = profile.scopedLessons();
  const totalLessons = scope.length;
  const completed = scope.filter((l) => state.completedLessons[l.id]).length;
  const completedAnywhere = Object.keys(state.completedLessons).filter((id) => lessonById(id)).length;
  const classProfile = profile.current(state);
  const scopeLabel = classProfile && classProfile.mode === 'school'
    ? `Class ${classProfile.classLevel} lessons` : 'lessons';
  const acc = overallAccuracy(state);
  const streak = store.effectiveStreak(state, today);
  const activeMinutes = Math.floor((state.activeSeconds || 0) / 60);
  const xp = state.xp || 0;
  const lp = gamify.levelProgress(xp);

  const pct = totalLessons ? Math.round((completed / totalLessons) * 100) : 0;
  const nextLevel = lp.next ? `${lp.toNext} XP to ${lp.next.name}` : 'Highest level reached';
  const questToday = gamify.questProgress(state, today);

  view.append(el('div', { class: 'section-head' }, [
    el('h1', { text: 'Your progress' }),
    el('span', { class: 'meta', text: prettyDate(today) })
  ]));

  /* --- the number that matters: how far through this class, with a flag
     marking the milestone being walked towards --- */
  const milestone = nextMilestone(completed, totalLessons, lp);
  view.append(el('section', { class: 'section', 'data-testid': 'passport-head' }, [
    el('div', { class: 'passport-head' }, [
      el('div', { class: 'passport-figure' }, [
        el('span', { class: 'big-figure', 'data-testid': 'course-figure', text: `${completed} of ${totalLessons}` }),
        el('p', { class: 'lede', style: 'margin:.35rem 0 0', text: `${scopeLabel} read — ${pct}% of the course.` })
      ]),
      el('div', { class: 'milestone', 'data-testid': 'milestone' }, [
        milestoneFlag(milestone.percent, 52),
        el('div', {}, [
          el('span', { class: 'ms-kicker', text: 'Next milestone' }),
          el('b', { text: milestone.label }),
          el('span', { class: 'hint', text: milestone.note })
        ]),
        completed < totalLessons
          ? el('a', { class: 'btn btn-primary', href: '#/library', text: 'Continue reading' })
          : el('span', { class: 'stamp stamp-done' }, [icon('check', 15), 'Course complete'])
      ])
    ]),
    el('div', {
      class: 'rail rail-lg', 'data-testid': 'progress-rail', role: 'img',
      'aria-label': `${completed} of ${totalLessons} lessons complete`
    }, scope.map((l) => el('i', { class: state.completedLessons[l.id] ? 'is-done' : '', title: l.title })))
  ]));

  /* --- four systems, kept apart so none is mistaken for another --- */
  view.append(el('div', { class: 'figure-grid', 'data-testid': 'passport-figures' }, [
    el('div', { class: 'figure is-course' }, [
      el('b', { text: `${acc.pct}%` }),
      el('span', { text: acc.asked ? `quiz accuracy, ${acc.correct} of ${acc.asked} right` : 'no questions answered yet' })
    ]),
    el('div', { class: 'figure is-streak' }, [
      el('b', { text: String(streak) }),
      el('span', { text: `day streak — best ${state.streak.best || 0}` })
    ]),
    el('div', { class: 'figure is-level' }, [
      el('b', { text: `Level ${lp.current.level}` }),
      el('span', { text: nextLevel })
    ]),
    el('div', { class: 'figure' }, [
      el('b', { text: `${questToday.done} of ${questToday.total}` }),
      el('span', { text: 'of today\u2019s activities done' })
    ])
  ]));

  // everything below the surface figures collects here and folds away
  const detail = el('div', { 'data-testid': 'passport-detail' });

  /* ------------------------------------------------------ recent activity */
  view.append(...[el('section', { class: 'section' }, [
    el('div', { class: 'section-head' }, [el('h2', { text: 'Recent activity' })]),
    (() => {
      const items = recentActivity(state, lessons).slice(0, 10);
      return items.length
        ? el('ol', { class: 'list', 'data-testid': 'recent-activity' }, items.map((a) => el('li', { class: 'list-item' }, [
          el('div', { class: 'row' }, [
            icon(a.icon, 18),
            el('div', { class: 'li-main' }, [
              el('div', { class: 'li-title', text: a.title }),
              el('div', { class: 'li-meta', text: prettyDate(a.at.slice(0, 10)) })
            ])
          ]),
          a.xp ? el('span', { class: 'badge', text: `+${a.xp} XP` }) : null
        ])))
        : el('p', { class: 'empty', text: 'Nothing recorded yet. Complete a lesson or the Daily Quiz to start the record.' });
    })()
  ])].filter(Boolean));

  /* ----------------------------------------------------- daily quiz history */
  const dailyHistory = Object.entries(state.dailyQuizByDate)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 10);
  detail.append(el('section', { class: 'panel section' }, [
    el('h2', { text: 'Daily quiz history' }),
    dailyHistory.length
      ? el('ul', { class: 'list' }, dailyHistory.map(([k, r]) => el('li', { class: 'list-item' }, [
        el('div', { class: 'li-main' }, [
          el('div', { class: 'li-title', text: prettyDate(k) }),
          el('div', { class: 'li-meta', text: `${r.timedOut ? 'Timed out' : 'Completed within time'}${r.timerUsed ? ' · timer used' : ''}` })
        ]),
        el('span', { class: r.total && r.score === r.total ? 'badge badge-ok' : 'badge', text: `${r.score}/${r.total}` })
      ])))
      : el('p', { class: 'empty', text: 'No daily quizzes completed yet.' })
  ]));

  /* ------------------------------------------------------------- saved */
  const savedLessons = state.savedLessons.map(lessonById).filter(Boolean);
  const savedStories = state.savedStories
    .map((id) => DATA.stories.stories.find((s) => s.id === id)).filter(Boolean);
  detail.append(el('div', { class: 'grid grid-2 section' }, [
    el('section', { class: 'panel' }, [
      el('h2', { text: 'Saved lessons' }),
      savedLessons.length
        ? el('ul', { class: 'list' }, savedLessons.map((l) => el('li', { class: 'list-item' }, [
          el('div', { class: 'li-main' }, [
            el('div', { class: 'li-title', text: l.title }),
            el('div', { class: 'li-meta', text: `${bookById(l.bookId).title} · pp. ${l.citation.pageStart}–${l.citation.pageEnd}` })
          ]),
          el('a', { class: 'btn btn-ghost btn-sm', href: `#/lesson/${l.id}`, text: 'Open' })
        ])))
        : el('p', { class: 'empty', text: 'No saved lessons yet.' })
    ]),
    el('section', { class: 'panel' }, [
      el('h2', { text: 'Saved events and stories' }),
      (state.savedEvents.length || savedStories.length)
        ? el('ul', { class: 'list' }, [
          ...state.savedEvents.slice(0, 8).map((e) => el('li', { class: 'list-item' }, [
            el('div', { class: 'li-main' }, [
              el('div', { class: 'li-title', text: `${e.year} — ${e.title}` }),
              el('div', { class: 'li-meta', text: `Saved from Event of the Day · ${e.date}` })
            ]),
            el('a', { class: 'btn btn-ghost btn-sm', href: e.url, target: '_blank', rel: 'noopener noreferrer', text: 'Wikipedia' })
          ])),
          ...savedStories.map((s) => el('li', { class: 'list-item' }, [
            el('div', { class: 'li-main' }, [
              el('div', { class: 'li-title', text: s.title }),
              el('div', { class: 'li-meta', text: 'Saved story' })
            ]),
            el('a', { class: 'btn btn-ghost btn-sm', href: '#/story', text: 'Open' })
          ]))
        ])
        : el('p', { class: 'empty', text: 'Nothing saved yet.' })
    ])
  ]));


  /* --- the rest folds away --- */

  /* ------------------------------------------------- learning-path bars */
  const pathRows = DATA.library.paths.map((p) => {
    const inPath = lessons.filter((l) => l.path === p.id);
    const done = inPath.filter((l) => state.completedLessons[l.id]).length;
    return { id: p.id, name: p.shortName || p.name, done, total: inPath.length };
  });

  detail.append(el('section', { class: 'panel panel-green section' }, [
    el('h2', { text: 'Learning paths' }),
    el('div', { class: 'path-progress' }, pathRows.map((r) => {
      const pct = r.total ? (r.done / r.total) * 100 : 0;
      return el('div', { class: 'path-progress-row' }, [
        el('div', { class: 'pp-head' }, [
          el('span', { text: r.name }),
          el('span', { class: 'hint', text: r.total ? `${r.done} of ${r.total}` : 'no lessons indexed yet' })
        ]),
        el('div', {
          class: 'pp-track', role: 'progressbar',
          'aria-valuenow': String(Math.round(pct)), 'aria-valuemin': '0', 'aria-valuemax': '100',
          'aria-label': `${r.name}: ${r.done} of ${r.total} lessons complete`
        }, [el('div', { class: `pp-fill ${r.id}`, style: `width:${pct}%` })])
      ]);
    }))
  ]));

  /* ----------------------------------------------------- eras completed */
  const eras = gamify.eraStatus(lessons, state);
  detail.append(el('section', { class: 'panel panel-green section' }, [
    el('h2', { text: 'Eras' }),
    el('p', { class: 'hint', text: 'An era is marked complete only when every indexed lesson in it is complete.' }),
    el('ul', { class: 'list', 'data-testid': 'passport-eras' }, eras.map((era) => el('li', { class: 'list-item' }, [
      el('div', { class: 'row' }, [
        eraIcon(era.id, 22),
        el('div', { class: 'li-main' }, [
          el('div', { class: 'li-title', text: era.label }),
          el('div', { class: 'li-meta', text: `${era.period} · ${era.completed} of ${era.total} lessons` })
        ])
      ]),
      era.status === 'complete'
        ? el('span', { class: 'badge badge-ok', text: 'Complete' })
        : era.status === 'locked'
          ? el('span', { class: 'badge', text: 'No lessons indexed yet' })
          : el('span', { class: 'badge', text: era.status === 'current' ? 'In progress' : 'Available' })
    ])))
  ]));

  /* --------------------------------------------------------- badge shelf */
  const badges = gamify.earnedBadges(state);
  detail.append(...[el('section', { class: 'panel section' }, [
    el('div', { class: 'section-head' }, [
      el('h2', { text: 'Badge shelf' }),
      el('span', { class: 'hint', text: `${badges.filter((b) => b.earnedAt).length} of ${badges.length} earned` }),
      el('a', { class: 'btn btn-ghost btn-sm push', href: '#/collection', text: 'Open collection' })
    ]),
    el('div', { class: 'shelf', 'data-testid': 'passport-badges' }, badges.map((b) => el('div', {
      class: `badge-tile${b.earnedAt ? ' is-earned' : ' is-locked'}`,
      'data-testid': `badge-${b.id}`
    }, [
      badgeArtFor(b.id, !!b.earnedAt),
      el('div', { class: 'b-name', text: b.name }),
      el('div', { class: 'b-req', text: b.earnedAt ? `Earned ${prettyDate(b.earnedAt.slice(0, 10))}` : b.requirement }),
      el('span', { class: 'b-state' }, b.earnedAt ? ['Earned'] : [icon('lock', 14), ' Locked']),
      b.earnedAt ? el('span', { class: 'ribbon', 'aria-hidden': 'true' }, [el('i'), el('i'), el('i')]) : null
    ])))
  ])].filter(Boolean));

  /* --------------------------------------------------- artefact collection */
  const artefacts = gamify.collectedArtefacts(state);
  detail.append(el('section', { class: 'panel section' }, [
    el('div', { class: 'section-head' }, [
      el('h2', { text: 'Artefact collection' }),
      el('span', { class: 'hint', text: `${artefacts.filter((a) => a.unlockedAt).length} of ${artefacts.length} recovered` })
    ]),
    el('div', { class: 'shelf', 'data-testid': 'passport-artefacts' }, artefacts.map((a) => el('div', {
      class: `artefact-tile${a.unlockedAt ? ' is-unlocked' : ' is-locked'}`,
      'data-testid': `artefact-${a.id}`
    }, [
      artefactArt(a.id, 88),
      el('div', { class: 'a-name', text: a.name }),
      el('div', { class: 'a-note', text: a.unlockedAt ? a.note : `Locked — ${a.requirement}` })
    ]))),
    el('p', { class: 'hint', text: gamify.ARTEFACT_DISCLAIMER })
  ]));

  /* --------------------------------------------------- quiz performance */
  const week = lastNDateKeys(10, today);
  const trendData = week.map((k) => {
    const rec = state.dailyQuizByDate[k];
    return {
      key: k,
      score: rec ? rec.score : null,
      total: rec ? rec.total : 5
    };
  });
  detail.append(el('section', { class: 'panel section' }, [
    el('h2', { text: 'Daily quiz trend' }),
    el('p', { class: 'hint', text: 'Score out of five on each of the last ten days. A day with no quiz is shown as an empty column.' }),
    el('div', { class: 'trend', role: 'img', 'data-testid': 'trend',
      'aria-label': trendLabel(trendData) },
      trendData.map((d) => {
        const pct = d.score === null ? 0 : (d.score / (d.total || 5)) * 100;
        const perfect = d.score !== null && d.total && d.score === d.total;
        return el('div', { class: 'trend-col' }, [
          el('span', { class: 'trend-label', text: d.score === null ? '—' : String(d.score) }),
          el('div', {
            class: `trend-bar${perfect ? ' is-perfect' : ''}${d.score === null ? ' is-empty' : ''}`,
            style: `height:${d.score === null ? 4 : Math.max(6, pct)}%`
          }),
          el('span', { class: 'trend-label', text: d.key.slice(8) })
        ]);
      })),
    el('p', { class: 'hint', text: 'Green columns are perfect scores.' })
  ]));

  /* ------------------------------------------------------ revision queue */
  const revise = revisionSuggestions(state, today);
  const strong = strongTopics(state);
  detail.append(el('div', { class: 'grid grid-2 section' }, [
    el('section', { class: 'panel' }, [
      el('h2', { text: 'Revision queue' }),
      revise.length
        ? el('ul', { class: 'list' }, revise.slice(0, 6).map((t) => el('li', { class: 'list-item' }, [
          el('div', { class: 'li-main' }, [
            el('div', { class: 'li-title', text: t.topic }),
            el('div', { class: 'li-meta', text: t.ageDays === 0
              ? `Missed today · ${Math.round(t.accuracy * 100)}% accuracy`
              : `Last missed ${t.ageDays} day${t.ageDays === 1 ? '' : 's'} ago · ${Math.round(t.accuracy * 100)}% accuracy` })
          ]),
          el('a', { class: 'btn btn-ghost btn-sm', href: '#/library', text: 'Revise' })
        ])))
        : el('p', { class: 'empty', text: 'Nothing flagged for revision yet.' })
    ]),
    el('section', { class: 'panel' }, [
      el('h2', { text: 'Strong topics' }),
      strong.length
        ? el('ul', { class: 'list' }, strong.slice(0, 6).map((t) => el('li', { class: 'list-item' }, [
          el('div', { class: 'li-main' }, [
            el('div', { class: 'li-title', text: t.topic }),
            el('div', { class: 'li-meta', text: `${t.correct} of ${t.asked} correct` })
          ]),
          el('span', { class: 'badge badge-ok', text: `${Math.round(t.accuracy * 100)}%` })
        ])))
        : el('p', { class: 'empty', text: 'Answer a few quizzes and your strongest topics will appear here.' })
    ])
  ]));

  detail.append(el('p', { class: 'hint', text: 'Study time is measured only while a lesson or quiz is open and this tab is visible. It is not an estimate.' }));

  view.append(
    el('details', { class: 'drawer', 'data-testid': 'drawer-detail' }, [
      el('summary', { text: 'Boards, eras, badges, quiz history and saved items' }),
      detail
    ])
  );
}

/* -------------------------------------------------------------- helpers */

/**
 * The next thing worth walking towards: finishing the class if that is close,
 * otherwise the next level. Both are computed from stored activity.
 */
function nextMilestone(completed, total, lp) {
  const left = total - completed;
  if (left > 0 && (left <= 3 || !lp.next)) {
    return {
      label: `${left} lesson${left === 1 ? '' : 's'} to finish the course`,
      note: `${completed} of ${total} read so far.`,
      percent: total ? (completed / total) * 100 : 0
    };
  }
  if (lp.next) {
    return {
      label: `Level ${lp.next.level} — ${lp.next.name}`,
      note: `${lp.toNext} XP to go.`,
      percent: lp.percent
    };
  }
  return { label: 'Every level reached', note: 'Keep reading to finish the course.', percent: 100 };
}

function badgeArtFor(id, earned) {
  const art = badgeArt(id, 62);
  art.style.color = earned ? 'var(--gold)' : 'var(--muted-light)';
  return art;
}

function stripItem(value, label) {
  return el('div', { class: 'strip-cell' }, [
    el('b', { text: value }),
    el('span', { text: label })
  ]);
}

function trendLabel(data) {
  const parts = data.map((d) => `${d.key}: ${d.score === null ? 'no quiz' : `${d.score} of ${d.total}`}`);
  return `Daily quiz scores. ${parts.join('. ')}.`;
}

/** Flatten stored activity into one dated list. Nothing here is estimated. */
function recentActivity(state, lessons) {
  const out = [];
  Object.entries(state.completedLessons || {}).forEach(([id, at]) => {
    const lesson = lessons.find((l) => l.id === id);
    out.push({
      at, icon: 'learn',
      title: `Completed “${lesson ? lesson.title : id}”`,
      xp: (state.awardedRewards[`lesson:${id}`] || {}).xp || 0
    });
  });
  Object.entries(state.dailyQuizByDate || {}).forEach(([date, rec]) => {
    out.push({
      at: rec.completedAt || `${date}T00:00:00.000Z`, icon: 'quiz',
      title: `Daily Quiz — ${rec.score} of ${rec.total}`,
      xp: ((state.awardedRewards[`quiz:${date}`] || {}).xp || 0)
        + ((state.awardedRewards[`quiz-perfect:${date}`] || {}).xp || 0)
    });
  });
  Object.entries(state.timelineResults || {}).forEach(([date, rec]) => {
    out.push({
      at: rec.at || `${date}T00:00:00.000Z`, icon: 'map',
      title: rec.solved ? 'Timeline Challenge solved' : 'Timeline Challenge attempted',
      xp: (state.awardedRewards[`timeline:${date}`] || {}).xp || 0
    });
  });
  Object.entries(state.badges || {}).forEach(([id, at]) => {
    const badge = gamify.BADGES.find((b) => b.id === id);
    out.push({ at, icon: 'trophy', title: `Badge earned: ${badge ? badge.name : id}`, xp: 0 });
  });
  return out.filter((a) => a.at).sort((a, b) => (a.at < b.at ? 1 : -1));
}
