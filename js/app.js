/** TRIDENT application shell: data loading, chrome, dashboard, features, settings. */

import { el, clear, toast, openModal, citationBlock, tag, xpBar, announceToScreenReader, pages } from './ui.js';
import { icon, iconSolid, levelEmblem, gatewayMotif, journeyThreads, expeditionPath, tricolourRule, badgeArt, artefactArt, eraEmblem, expeditionRoute, milestoneFlag } from './icons.js';
import * as store from './storage.js';
import { route, setNotFound, start, go, onAfterNavigate, currentPath } from './router.js';
import { todayKey, prettyDate, pickDailyStory, pickDailyEvent } from './daily.js';
import { fetchEventsForDate } from './wikipedia.js';
import * as openlibrary from './openlibrary.js';
import * as gamify from './gamify.js';
import * as library from './library.js';
import * as quiz from './quiz.js';
import * as progress from './progress.js';
import * as timeline from './timeline.js';
import * as profile from './profile.js';
import * as onboarding from './onboarding.js';
import * as brief from './brief.js';
import * as companion from './companion.js';
import * as images from './images.js';

const view = document.getElementById('view');
const header = document.getElementById('appHeader');
const footer = document.getElementById('appFooter');
const bottomNav = document.getElementById('bottomNav');
let DATA = null;

/* ----------------------------------------------------------- data loading */

async function loadJSON(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
}

async function loadData() {
  const [libraryData, lessons, questions, stories, timelineData, historyImages] = await Promise.all([
    loadJSON('data/library.json'), loadJSON('data/lessons.json'),
    loadJSON('data/questions.json'), loadJSON('data/stories.json'),
    loadJSON('data/timeline.json'),
    // the image catalogue is optional: a missing or broken file leaves the app
    // running with no pictures rather than not running at all
    loadJSON('data/history-images.json').catch(() => ({ images: [] }))
  ]);
  return { library: libraryData, lessons, questions, stories, timeline: timelineData, historyImages };
}

/* ------------------------------------------------------------ view helper */

function beginView() {
  view.dispatchEvent(new CustomEvent('trident:teardown'));
  clear(view);
  window.scrollTo({ top: 0, behavior: 'auto' });
  return view;
}

function requireGuest() {
  if (!store.load().profile.mode) { go('/welcome'); return false; }
  // a learner who has not chosen a board, class or examination yet is sent
  // through onboarding once — and never again while that choice stays valid
  if (!store.hasLearningProfile()) { go('/onboarding'); return false; }
  return true;
}

/* ------------------------------------------------------------- the chrome */

/* The four destinations. Everything else in TRIDENT lives inside one of them:
   Learn holds the library, the daily story and today's event; Practice holds
   the daily quiz and the Timeline Challenge; Progress holds the passport and
   the collection. Settings and the learning path sit in the profile menu. */
const DESTINATIONS = [
  { nav: 'home', href: '#/dashboard', label: 'Home', ic: 'home' },
  { nav: 'learn', href: '#/library', label: 'Learn', ic: 'learn' },
  { nav: 'practice', href: '#/quiz', label: 'Practice', ic: 'practice' },
  { nav: 'progress', href: '#/progress', label: 'Progress', ic: 'progress' }
];

/** Which destination a route belongs to. */
const ROUTE_HOME = {
  dashboard: 'home', event: 'learn', library: 'learn', lesson: 'learn', story: 'learn',
  quiz: 'practice', timeline: 'practice',
  progress: 'progress', collection: 'progress', settings: 'progress', profile: 'progress'
};

/** Put the family icons into the header links once, at boot. */
function decoratePrimaryNav() {
  DESTINATIONS.forEach((d) => {
    const a = document.querySelector(`#primaryNav a[data-nav="${d.nav}"]`);
    if (!a || a.querySelector('svg')) return;
    a.prepend(icon(d.ic, 21));
  });
}

/** Swap outline for solid on the destination the learner is currently on. */
function paintNavIcons(active) {
  DESTINATIONS.forEach((d) => {
    document.querySelectorAll(`[data-nav="${d.nav}"]`).forEach((a) => {
      const size = a.closest('.bottom-nav') ? 24 : 21;
      const svg = a.querySelector('svg');
      const want = d.nav === active ? iconSolid(d.ic, size) : icon(d.ic, size);
      if (svg) svg.replaceWith(want); else a.prepend(want);
    });
  });
}

/**
 * The header's right-hand side: how far through the class, the streak, the XP,
 * and the profile button that holds settings and the learning path.
 *
 * The board and class are named here once. No screen repeats them.
 */
function renderHud() {
  const hud = document.getElementById('hud');
  clear(hud);
  const state = store.load();
  const today = todayKey();
  const streak = store.effectiveStreak(state, today);
  const course = library.courseProgress(state);

  hud.append(
    el('a', {
      class: 'hud-course', href: '#/progress', 'data-testid': 'hud-course',
      'aria-label': `${course.label}: ${course.done} of ${course.total} lessons complete`
    }, [
      el('b', { text: course.label }),
      el('span', { text: `${course.done} of ${course.total} lessons` })
    ]),
    el('span', {
      class: 'hud-streak', 'data-testid': 'hud-streak',
      'aria-label': `Current streak: ${streak} ${streak === 1 ? 'day' : 'days'}`
    }, [icon('flame', 15), String(streak)]),
    xpCounter(state.xp || 0),
    profileControl(state)
  );
}

/**
 * The XP figure in the header. When XP has just risen it counts up to the new
 * total once — a single, short movement tied to something the learner did.
 * Under reduced motion it simply shows the new number.
 */
let lastXpShown = null;
function xpCounter(xp) {
  const num = el('span', { 'data-testid': 'hud-xp-num', text: String(lastXpShown ?? xp) });
  const node = el('span', { class: 'hud-xp', 'data-testid': 'hud-xp', 'aria-label': `${xp} experience points` },
    [icon('xp', 15), num]);
  const from = lastXpShown;
  lastXpShown = xp;
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (from === null || xp <= from || still) { num.textContent = String(xp); return node; }
  node.classList.add('is-rising');
  const start = performance.now();
  const span = 650;
  const step = (now) => {
    const k = Math.min(1, (now - start) / span);
    num.textContent = String(Math.round(from + (xp - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) requestAnimationFrame(step);
    else setTimeout(() => node.classList.remove('is-rising'), 400);
  };
  requestAnimationFrame(step);
  return node;
}

/** The profile button and its menu: settings, learning path, theme. */
function profileControl(state) {
  const prof = profile.current(state);
  const wrap = el('div', { class: 'profile-wrap' });
  const btn = el('button', {
    class: 'profile-btn', type: 'button', 'data-testid': 'profile-btn',
    'aria-haspopup': 'true', 'aria-expanded': 'false',
    'aria-label': 'Your profile, settings and learning path'
  }, [el('span', { class: 'avatar', 'aria-hidden': 'true', text: 'L' }), icon('down', 14)]);

  let menu = null;
  function close() {
    if (!menu) return;
    menu.remove(); menu = null;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('mousedown', onOutside, true);
  }
  function onKey(e) { if (e.key === 'Escape') { close(); btn.focus(); } }
  function onOutside(e) { if (!wrap.contains(e.target)) close(); }

  btn.addEventListener('click', () => {
    if (menu) { close(); return; }
    menu = el('div', { class: 'profile-menu', role: 'menu', 'data-testid': 'profile-menu' }, [
      el('div', { class: 'pm-head' }, [
        el('b', { text: 'Guest learner' }),
        el('span', { 'data-testid': 'profile-path', text: prof ? profile.label(prof) : 'No learning path chosen' })
      ]),
      el('a', { href: '#/profile', role: 'menuitem', onclick: close },
        [icon('learn', 17), 'Change class or board']),
      el('a', { href: '#/collection', role: 'menuitem', onclick: close },
        [icon('collection', 17), 'Your collection']),
      el('a', { href: '#/settings', role: 'menuitem', onclick: close },
        [icon('settings', 17), 'Settings'])
    ]);
    wrap.append(menu);
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onOutside, true);
    (menu.querySelector('a') || menu).focus();
  });

  wrap.append(btn);
  return wrap;
}

function buildBottomNav() {
  const list = document.getElementById('bottomNavList');
  clear(list);
  DESTINATIONS.forEach((item) => {
    list.append(el('li', {}, [
      el('a', { href: item.href, 'data-nav': item.nav, 'data-testid': `bottomnav-${item.nav}` }, [
        icon(item.ic, 22), el('span', { text: item.label })
      ])
    ]));
  });
}

/** "Welcome back, class 10 CBSE explorer" — the learner's own words for it. */
function profileGreeting(state) {
  const prof = profile.current(state);
  if (!prof) return 'Welcome back, explorer';
  if (prof.mode === 'school') {
    const b = profile.boardByValue(prof.board);
    return `Welcome back — ${b ? b.short : 'your board'}, class ${prof.classLevel}`;
  }
  const e = profile.examByValue(prof.exam);
  return `Welcome back — ${e ? e.name : 'exam'} preparation`;
}

/* ------------------------------------------------------- learning profile */

/** First-time selection. The dashboard stays out of reach until this is done. */
function renderOnboarding() {
  if (!store.load().profile.mode) { go('/welcome'); return; }
  if (store.hasLearningProfile()) { go('/dashboard'); return; }
  const v = beginView();
  onboarding.render(v, {
    change: false,
    onDone: () => { library.applyProfileDefaults(); go('/dashboard'); }
  });
}

/** "Change Learning Path" from Settings. Cancelling leaves the profile alone. */
function renderChangePath() {
  if (!requireGuest()) return;
  const v = beginView();
  onboarding.render(v, {
    change: true,
    onDone: () => { library.applyProfileDefaults(); go('/settings'); },
    onCancel: () => go('/settings')
  });
}

/* ---------------------------------------------------------------- welcome */

function renderWelcome() {
  const v = beginView();
  header.hidden = true; footer.hidden = true; bottomNav.hidden = true;

  v.append(el('div', { class: 'welcome' }, [
    journeyThreads(),
    el('div', { class: 'welcome-inner' }, [
      el('img', {
        class: 'welcome-logo', src: 'assets/trident-logo.png', width: 200, height: 200,
        alt: 'TRIDENT logo: a vel rising from an open book above stylised waves'
      }),
      el('h1', { text: 'TRIDENT' }),
      el('p', { class: 'tagline', text: 'Learn the Past. Shape the Future.' }),
      tricolourRule(),
      el('p', { class: 'lede', text: 'A history adventure built on verified Tamil Nadu State Board and CBSE textbook passages. Earn XP, recover artefacts and build a streak — with every fact citing the book and page it came from.' }),
      el('div', { class: 'welcome-actions' }, [
        el('button', {
          class: 'btn btn-primary btn-lg', type: 'button', 'data-testid': 'guest-btn',
          onclick: () => {
            store.startGuest();
            toast('Guest mode ready. Progress is saved in this browser.');
            go(store.hasLearningProfile() ? '/dashboard' : '/onboarding');
          }
        }, [icon('compassRose', 20), 'Continue as Guest']),
        el('button', {
          class: 'btn btn-secondary btn-lg', type: 'button', text: 'Sign In / Create Account',
          onclick: showAccountModal
        })
      ]),
      el('p', { class: 'ob-next-hint', 'data-testid': 'welcome-next', text: 'You’ll choose your board, class or examination in the next step.' }),
      el('p', { class: 'hint', style: 'margin-top:1.25rem' }, [
        icon('check', 16), ' Guest mode is the whole application. Nothing is uploaded anywhere.'
      ])
    ])
  ]));
  v.append(el('div', { class: 'welcome-footer' }, [
    el('p', { text: 'TRIDENT local prototype · Built on verified Tamil Nadu State Board and CBSE textbook passages.' })
  ]));
}

function showAccountModal() {
  openModal({
    title: 'Cloud accounts are not built yet',
    bodyNodes: [
      el('p', { text: 'TRIDENT has no sign-in, no server and no account system at this stage. Rather than show a login form that does nothing, this prototype is honest about it.' }),
      el('p', { text: 'Guest mode gives you the entire application — lessons, quizzes, XP, badges, artefacts and streaks — stored in this browser using localStorage.' }),
      el('p', { text: 'The trade-off: progress lives on this device and in this browser only. Clearing browser site data will remove it, and it will not follow you to another machine.' })
    ],
    actions: [
      el('button', {
        class: 'btn btn-primary', type: 'button', text: 'Continue as Guest',
        onclick: (e) => { e.target.closest('.modal-backdrop').remove(); store.startGuest(); go('/dashboard'); }
      })
    ]
  });
}

/* -------------------------------------------------------------- dashboard */

/**
 * The dashboard, kept deliberately short.
 *
 * Three cards, and nothing below them: where you are, what today asks of you,
 * and the guide's briefing. Everything that used to sit underneath still
 * exists — the gateways and era journey moved to the Library, the statistics
 * to the Passport, the story to its own page and the day's event to a page of
 * its own — because a dashboard that shows everything shows nothing.
 *
 * The learner's board and class appear once, in the header chip, and are not
 * repeated here.
 */
/**
 * Home — Today's Expedition.
 *
 * Within ten seconds a student should know what today asks of them, how long
 * it takes, what it pays, where they stopped, and what there is to look at.
 * So the screen is built in that order and stops: the expedition hero, the
 * lesson they left and today's live event side by side, the mission route,
 * then the next reward and the guide.
 *
 * Every figure comes from stored activity. Nothing here is illustrative.
 */
function renderDashboard() {
  if (!requireGuest()) return;
  const v = beginView();
  const state = store.load();
  const today = todayKey();
  const streak = store.effectiveStreak(state, today);
  const quest = gamify.questProgress(state, today);
  const course = library.courseProgress(state);
  const cont = library.continueLesson();
  const resuming = cont ? !!state.readingPositions[cont.id] : false;
  const outside = cont ? library.isOutsideClass(cont) : false;
  const prof = profile.current(state);

  const openXp = quest.tasks.filter((x) => !x.done).reduce((sum, x) => sum + x.xp, 0);
  // the time still needed, summed from each activity's own estimate
  const minutes = quest.tasks.filter((x) => !x.done).reduce((m, x) => m + (x.minutes || 2), 0);
  const totalMinutes = quest.tasks.reduce((m, x) => m + (x.minutes || 2), 0);
  // the hero and the journey card never show the same picture: the card shows
  // the lesson in hand, the hero a different image from the same class, chosen
  // by date so it changes day to day without being random
  const journeyImg = cont ? images.primaryFor(cont.id) : null;
  const heroImage = heroImageFor(course, journeyImg, today);
  const era = cont ? gamify.ERAS.find((e) => e.id === cont.era) : null;

  /* ---- 1. Today's Expedition ---- */
  v.append(el('section', { class: 'expedition', 'data-testid': 'expedition' }, [
    el('div', { class: 'exp-art' }, [
      heroImage
        ? images.figure(heroImage, { size: 'hero' })
        : images.motif('16 / 10', 'An illustrated stand-in while this expedition has no picture')
    ]),
    el('div', { class: 'exp-body' }, [
      el('p', { class: 'exp-where', 'data-testid': 'exp-where' }, [
        icon('compassRose', 15),
        prof ? profile.label(prof) : 'Your expedition'
      ]),
      el('h1', { class: 'title-serif exp-title', 'data-testid': 'exp-title',
        text: era ? `The ${era.label} expedition` : 'Today’s expedition' }),
      el('p', { class: 'exp-facts', 'data-testid': 'exp-facts' }, [
        el('b', { text: `${quest.total} short ${quest.total === 1 ? 'activity' : 'activities'}` }),
        el('span', { text: minutes ? ` · about ${minutes} minute${minutes === 1 ? '' : 's'} · ` : ' · ' }),
        el('b', { class: 'exp-xp', text: openXp ? `earn up to ${openXp} XP` : 'all XP earned today' })
      ]),
      // once today's three are done, the next thing worth doing is the lesson
      // in hand — so the one big button moves on to it rather than announcing
      // that there is nothing left
      el('a', {
        class: 'btn btn-primary btn-lg', 'data-testid': 'expedition-cta',
        href: quest.done < quest.total ? firstOpenTask(quest) : (cont ? `#/lesson/${cont.id}` : '#/library'),
        text: quest.done === 0 ? `Start today’s ${totalMinutes}-minute mission` : 'Continue your expedition'
      }),
      quest.done === quest.total
        ? el('p', { class: 'exp-done', 'data-testid': 'exp-done' }, [icon('check', 15), 'Today’s mission is complete.'])
        : null,
      el('ol', { class: 'exp-route', 'aria-label': 'Today’s route' }, quest.tasks.map((task, i) => el('li', {
        class: `exp-stop${task.done ? ' is-done' : ''}${!task.done && isFirstOpen(quest, i) ? ' is-now' : ''}`
      }, [
        el('span', { class: 'exp-dot', 'aria-hidden': 'true' }, [icon(task.done ? 'check' : task.icon, 14)]),
        el('span', { text: task.title })
      ])))
    ])
  ]));

  /* ---- 2. where you stopped, and what the world offers today ---- */
  v.append(el('div', { class: 'home-pair' }, [
    journeyCard(cont, course, state, resuming, outside),
    el('section', { class: 'today-history', 'data-testid': 'today-history' }, [
      el('div', { class: 'th-head' }, [
        el('h2', { text: 'Today in History' }),
        el('span', { class: 'api-tag', 'data-testid': 'home-api-tag' },
          [icon('api', 14), 'Live API · Wikimedia'])
      ]),
      el('div', { class: 'th-body', 'data-testid': 'th-body' }, [
        el('div', { class: 'state-box' }, [el('span', { class: 'spinner' }), ' Contacting the Wikimedia API…'])
      ])
    ])
  ]));
  renderHomeEvent(v.querySelector('[data-testid="th-body"]'), today);

  /* ---- 3. the mission route ---- */
  v.append(missionRoute(quest, state, today));

  /* ---- 4. the next reward, and the guide ---- */
  const reward = gamify.nextReward ? gamify.nextReward(state) : null;
  v.append(el('div', { class: 'home-pair home-pair-low' }, [
    reward
      ? el('section', { class: 'next-reward', 'data-testid': 'next-reward' }, [
        el('div', { class: 'nr-art' }, [badgeArt(reward.id, 52)]),
        el('div', { class: 'nr-body' }, [
          el('span', { class: 'nr-kicker', text: 'Next to unlock' }),
          el('b', { text: reward.name }),
          el('span', { class: 'hint', text: reward.requirement })
        ]),
        el('a', { class: 'btn btn-ghost btn-sm', href: '#/collection', text: 'Your collection' })
      ])
      : el('section', { class: 'next-reward' }, [
        el('div', { class: 'nr-body' }, [
          el('b', { text: 'Every badge earned' }),
          el('span', { class: 'hint', text: 'All six badges and their artefacts are yours.' })
        ])
      ]),
    el('section', { class: 'guide-invite', 'data-testid': 'guide-invite' }, [
      el('div', { class: 'gi-fish', 'aria-hidden': 'true' }, [
        el('img', { src: 'assets/trident-fish.png', alt: '', width: '46', height: '46' })
      ]),
      el('div', {}, [
        el('b', { text: 'Ask TRIDENT' }),
        el('span', { class: 'hint', text: 'Your guide can explain today’s activities and suggest what to study next.' })
      ]),
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', 'data-testid': 'open-guide',
        text: 'Ask a question', onclick: () => companion.openPanel()
      })
    ])
  ]));

  renderHud();
}

/** A class image for the hero, other than the one the journey card uses. */
function heroImageFor(course, avoid, dateKey) {
  const pool = course.lessons
    .map((l) => images.primaryFor(l.id))
    .filter((img) => img && (!avoid || img.id !== avoid.id));
  if (!pool.length) return avoid || null;
  let h = 0;
  for (const ch of dateKey) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return pool[h % pool.length];
}

/** The first activity still to do — what the one big button points at. */
function firstOpenTask(quest) {
  const open = quest.tasks.find((t) => !t.done);
  return open ? open.href : '#/progress';
}
function isFirstOpen(quest, i) {
  return quest.tasks.findIndex((t) => !t.done) === i;
}

/**
 * Continue your journey — the lesson left part-read, as an illustrated
 * chapter card with its real completion and its book and page.
 */
function journeyCard(cont, course, state, resuming, outside) {
  if (!cont) {
    return el('section', { class: 'journey-card', 'data-testid': 'journey-card' }, [
      el('div', { class: 'jc-body' }, [
        el('h2', { text: 'Continue your journey' }),
        el('p', { text: 'You have read every lesson in your class.' }),
        el('a', { class: 'btn btn-ghost', href: '#/library', text: 'Open the library' })
      ])
    ]);
  }
  const book = library.bookById(cont.bookId);
  const img = images.primaryFor(cont.id);
  const era = gamify.ERAS.find((e) => e.id === cont.era);

  return el('section', { class: 'journey-card', 'data-testid': 'journey-card' }, [
    el('div', { class: 'jc-art' }, [
      img ? el('img', {
        src: img.url, alt: img.alt, loading: 'lazy', decoding: 'async',
        width: img.width || null, height: img.height || null
      }) : images.motif('4 / 3', 'An illustrated stand-in for this chapter')
    ]),
    el('div', { class: 'jc-body' }, [
      el('h2', { class: 'jc-heading', text: 'Continue your journey' }),
      era ? el('span', { class: 'era-chip', style: `--era: var(--era-${era.id})`, text: era.label }) : null,
      el('p', { class: 'jc-title title-serif', 'data-testid': 'continue-title', text: cont.title }),
      outside ? el('span', { class: 'stamp stamp-warn', 'data-testid': 'mission-outside' },
        [icon('info', 14), `From Class ${cont.classLevel}`]) : null,
      el('div', { class: 'jc-progress' }, [
        el('div', { class: 'rail-legend' }, [
          el('b', { 'data-testid': 'course-figure',
            text: `${course.done} of ${course.total} chapters explored` }),
          el('span', { class: 'sr-only', text: `${course.percent} per cent complete` })
        ]),
        el('div', {
          class: 'rail', 'data-testid': 'home-rail', role: 'img',
          'aria-label': `${course.done} of ${course.total} lessons complete, ${course.percent} per cent`
        }, course.lessons.map((l) => el('i', {
          class: state.completedLessons[l.id] ? 'is-done' : (l.id === cont.id ? 'is-now' : ''),
          title: l.title
        })))
      ]),
      el('a', {
        class: 'btn btn-ghost', href: `#/lesson/${cont.id}`, 'data-testid': 'continue-learning',
        text: resuming ? 'Continue reading' : 'Open this lesson'
      }),
      el('p', { class: 'jc-source', 'data-testid': 'jc-source' }, [
        icon('evidence', 13),
        `${book ? book.title : ''}, ${pages(cont.citation)}`
      ])
    ].filter(Boolean))
  ]);
}

/**
 * The mission route: four checkpoints on one visible path. A finished
 * checkpoint does not merely change a number — its marker fills, its rule goes
 * green and its action becomes a struck stamp.
 */
function missionRoute(quest, state, today) {
  const reward = {
    id: 'reward', title: 'Unlock today’s reward', icon: 'xp',
    sub: 'Finish all three to complete today’s expedition.',
    action: 'See your collection', href: '#/collection',
    xp: 0, done: quest.done === quest.total
  };
  const stops = [...quest.tasks, reward];
  const firstOpen = stops.findIndex((s) => !s.done);

  return el('section', { class: 'route section', 'data-testid': 'quest-panel' }, [
    el('div', { class: 'section-head' }, [
      el('h2', { text: 'Mission route' }),
      el('span', { class: 'meta', 'data-testid': 'quest-count',
        text: `${quest.done} of ${quest.total} done` })
    ]),
    el('ol', { class: 'route-track' }, stops.map((stop, i) => {
      const active = i === firstOpen;
      const locked = stop.id === 'reward' && !stop.done;
      return el('li', {
        class: `checkpoint${stop.done ? ' is-done' : ''}${active ? ' is-active' : ''}${locked ? ' is-locked' : ''}`,
        'data-testid': `quest-${stop.id}`
      }, [
        el('span', { class: 'cp-mark', 'aria-hidden': 'true' }, [icon(stop.done ? 'check' : stop.icon, 22)]),
        el('div', { class: 'cp-body' }, [
          el('span', { class: 'cp-title' }, [
            stop.title,
            stop.source === 'api'
              ? el('span', { class: 'api-tag' }, [icon('api', 12), stop.sourceLabel])
              : null
          ].filter(Boolean)),
          el('span', { class: 'cp-sub', text: stop.done ? 'Done today' : stop.sub })
        ]),
        el('div', { class: 'cp-side' }, [
          stop.xp ? el('span', { class: 'cp-xp', text: `+${stop.xp} XP` }) : null,
          stop.done
            ? el('span', { class: 'stamp stamp-done stamp-press', text: 'Done' })
            : el('a', {
              class: `btn ${active ? 'btn-next' : 'btn-ghost'} btn-sm`,
              href: stop.href, 'data-testid': `quest-action-${stop.id}`,
              text: stop.id === 'reward' ? 'Finish the route' : stop.action
            })
        ].filter(Boolean))
      ]);
    }))
  ]);
}

/**
 * Today in History, on the dashboard. The same one request per date that the
 * event page uses — the result is cached, so opening both does not call the
 * API twice.
 */
async function renderHomeEvent(host, today) {
  if (!host) return;
  const result = await fetchEventsForDate(today);
  if (!host.isConnected) return;
  clear(host);

  if (result.status === 'offline' || result.status === 'empty') {
    host.append(
      images.motif('16 / 10', 'No picture: the Wikimedia API could not be reached'),
      el('p', { class: 'th-down', 'data-testid': 'home-event-down',
        text: 'Today’s Wikimedia event could not be loaded.' }),
      el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', 'data-testid': 'home-event-retry',
        onclick: () => {
          clear(host);
          host.append(el('div', { class: 'state-box' }, [el('span', { class: 'spinner' }), ' Retrying…']));
          renderHomeEvent(host, today);
        }
      }, [icon('refresh', 15), 'Retry'])
    );
    return;
  }

  const evt = pickDailyEvent(result.events, today);
  if (!evt) {
    host.append(el('p', { class: 'th-down', text: 'Today’s Wikimedia event could not be loaded.' }));
    return;
  }

  host.append(
    evt.image
      ? (() => {
        const frame = el('div', { class: 'th-frame' });
        const im = el('img', {
          src: evt.image.src, alt: `Picture from the Wikipedia article on ${evt.title}`,
          loading: 'lazy', decoding: 'async'
        });
        im.addEventListener('error', () => {
          frame.replaceWith(images.motif('16 / 10', 'Wikipedia offered no picture for this event'));
        }, { once: true });
        frame.append(im);
        return frame;
      })()
      : images.motif('16 / 10', 'Wikipedia offered no picture for this event'),
    el('p', { class: 'th-year', text: evt.year }),
    el('p', { class: 'th-title', text: evt.title }),
    el('a', { class: 'btn btn-ghost btn-sm', href: '#/event', text: 'Explore event' })
  );
}

/**
 * Today in History — the one screen whose content comes from outside TRIDENT.
 *
 * Everything else in the app is a verified textbook passage with a page
 * citation. This is fetched live from the Wikimedia "On this day" API, so the
 * page says so in a teal badge, names the date it was fetched for, keeps the
 * link to the source article, and states plainly that it is not syllabus
 * material. When the feed cannot be reached nothing is invented and no XP is
 * granted — the screen offers a retry and waits.
 */
function renderEventPage() {
  if (!requireGuest()) return;
  const v = beginView();
  const today = todayKey();

  v.append(el('div', { class: 'reader-top' }, [
    el('a', { class: 'back-link', href: '#/dashboard' }, [icon('left', 16), 'Home'])
  ]));

  v.append(el('div', { class: 'section-head' }, [
    el('h1', { text: 'Today in History' }),
    el('span', { class: 'stamp stamp-live', 'data-testid': 'wikimedia-label' },
      [icon('api', 15), 'Live from the Wikimedia API'])
  ]));

  v.append(el('p', { class: 'api-note', 'data-testid': 'api-note' }, [
    icon('info', 15),
    el('span', { text: `Fetched from the Wikimedia “On this day” API for ${prettyDate(today)}. `
      + 'This is live encyclopaedia content, not TRIDENT syllabus material: it carries no textbook '
      + 'citation, and nothing in your lessons or quizzes comes from it.' })
  ]));

  const host = el('section', { class: 'section', 'data-testid': 'event-host' }, [
    el('div', { class: 'state-box' }, [el('span', { class: 'spinner' }), ' Contacting the Wikimedia API…'])
  ]);
  v.append(host);
  renderEventOfTheDay(host);
}

/* ------------------------------------------------------- event of the day */

async function renderEventOfTheDay(host) {
  const today = todayKey();
  const result = await fetchEventsForDate(today);
  const body = host.lastChild;

  if (result.status === 'offline') {
    // no substitute event, no placeholder text that could be mistaken for
    // one, and no XP: the day's event is simply not there yet
    body.replaceWith(el('div', { class: 'api-down', 'data-testid': 'event-offline' }, [
      el('span', { class: 'stamp stamp-error' }, [icon('api', 15), 'Wikimedia API unreachable']),
      el('h2', { text: 'Today’s Wikimedia event could not be loaded.' }),
      el('p', { text: 'Nothing is shown in its place. This screen stays empty until the real event arrives, and no experience is granted for it.' }),
      el('button', {
        class: 'btn btn-primary', type: 'button', 'data-testid': 'event-retry',
        onclick: () => {
          clear(host);
          host.append(el('div', { class: 'state-box' }, [el('span', { class: 'spinner' }), ' Contacting the Wikimedia API…']));
          renderEventOfTheDay(host);
        }
      }, [icon('refresh', 16), 'Retry']),
      el('a', { class: 'btn btn-ghost', href: '#/quiz', text: 'Answer today’s questions instead' })
    ]));
    return;
  }
  if (result.status === 'empty') {
    body.replaceWith(el('div', { class: 'api-down', 'data-testid': 'event-empty' }, [
      el('span', { class: 'stamp stamp-warn' }, [icon('api', 15), 'Wikimedia API returned nothing']),
      el('h2', { text: 'Today’s Wikimedia event could not be loaded.' }),
      el('p', { text: 'The feed answered, but had no event for this date. Nothing is invented in its place.' })
    ]));
    return;
  }

  const evt = pickDailyEvent(result.events, today);
  if (!evt) {
    body.replaceWith(el('div', { class: 'state-box' }, [el('p', { text: 'No event available for today.' })]));
    return;
  }

  const state = store.load();
  const isSaved = state.savedEvents.some((e) => e.id === evt.id);
  const explored = store.hasReward(gamify.rewardId('event', today));

  const saveBtn = el('button', {
    class: 'btn btn-secondary btn-sm', type: 'button',
    'aria-pressed': String(isSaved), text: isSaved ? 'Saved' : 'Save event'
  });
  saveBtn.addEventListener('click', () => {
    const s = store.toggleSavedEvent(evt);
    const on = s.savedEvents.some((e) => e.id === evt.id);
    saveBtn.textContent = on ? 'Saved' : 'Save event';
    saveBtn.setAttribute('aria-pressed', String(on));
    toast(on ? 'Event saved.' : 'Event removed from saved items.');
  });

  const detail = el('p', { class: 'hint', hidden: !explored, text: evt.extract || '' });
  const exploreBtn = el('button', {
    class: 'btn btn-primary btn-sm', type: 'button', 'data-testid': 'explore-event',
    disabled: explored,
    text: explored ? 'Explored today' : `Explore this event (+${gamify.XP_RULES.event} XP)`
  });
  exploreBtn.addEventListener('click', () => {
    // this handler only exists on a card built from a genuine API event —
    // fetched now or restored from this device's copy of an earlier fetch
    if (!evt || !evt.text) return;
    const res = gamify.award('event', today, { lessons: DATA.lessons.lessons });
    detail.hidden = false;
    exploreBtn.disabled = true;
    exploreBtn.textContent = 'Explored today';
    if (res.xp > 0) renderHud();
    renderQuestPanelIfPresent();
  });

  const indian = /india|indian|tamil|delhi|mughal|chola|bengal|punjab|asia|asian|china|japan|persia|ceylon|sri lanka|burma|nepal|pakistan/i
    .test(`${evt.title} ${evt.text}`);

  body.replaceWith(el('article', { class: 'event-card', 'data-testid': 'event-card' }, [
    evt.image ? eventImage(evt) : noImagePlaceholder(),
    el('div', { class: 'event-body' }, [
      el('div', { class: 'event-meta' }, [
        el('span', { class: 'event-year', text: evt.year }),
        el('span', { class: 'stamp stamp-live', 'data-testid': 'event-scope' },
          [icon('api', 14), indian ? 'On this day' : 'World history today'])
      ]),
      el('h2', { class: 'title-serif', text: evt.title }),
      el('p', { text: evt.text }),
      detail,
      el('div', { class: 'event-actions' }, [
        exploreBtn, saveBtn,
        el('a', {
          class: 'btn btn-ghost btn-sm', href: evt.url,
          target: '_blank', rel: 'noopener noreferrer'
        }, [icon('api', 15), 'Read on Wikipedia'])
      ]),
      el('p', { class: 'hint', 'data-testid': 'event-attribution' }, [
        `${evt.source}, loaded for ${prettyDate(today)}`,
        result.status === 'cache' ? ' — from this device’s copy, because the API could not be reached just now'
          : result.status === 'cache-hit' ? ' — already fetched once today, so the API was not called again' : ''
      ])
    ])
  ]));
}

function noImagePlaceholder() {
  const box = el('div', { class: 'event-motif', 'data-testid': 'event-motif', role: 'img', 'aria-label': 'No photograph available for this event' });
  box.innerHTML = `
    <svg viewBox="0 0 120 90" preserveAspectRatio="xMidYMid slice" focusable="false" aria-hidden="true">
      <rect width="120" height="90" fill="var(--wash-teal)"/>
      <g fill="none" stroke="var(--teal)" stroke-width="1.2" opacity="0.5">
        <path d="M0 62c14-8 24 4 38-2s24 6 40-2 28 2 42-4"/>
        <path d="M0 72c16-7 26 5 40-1s24 6 40-3 26 3 40-3"/>
      </g>
      <g fill="none" stroke="var(--teal)" stroke-width="1.6">
        <circle cx="60" cy="34" r="13"/>
        <path d="m65 29-3.4 8.2L53 40.6l3.4-8.2z"/>
      </g>
    </svg>
    <span>No picture for this one</span>`;
  return box;
}

/** A thumbnail that becomes the drawn motif if the remote file cannot load. */
function eventImage(evt) {
  const frame = el('div', { class: 'event-frame' });
  const img = el('img', {
    src: evt.image.src,
    alt: `Picture from the Wikipedia article on ${evt.title}`,
    loading: 'lazy'
  });
  img.addEventListener('error', () => { frame.replaceWith(noImagePlaceholder()); }, { once: true });
  frame.append(img);
  return frame;
}

/** After an XP-granting action, refresh the quest panel in place if it is on screen. */
function renderQuestPanelIfPresent() {
  const panel = document.querySelector('[data-testid="quest-panel"]');
  if (!panel) return;
  const state = store.load();
  const q = gamify.questProgress(state, todayKey());
  panel.querySelector('[data-testid="quest-count"]').textContent = `${q.done}/${q.total} complete`;
  q.tasks.forEach((t) => {
    const li = panel.querySelector(`[data-testid="quest-${t.id}"]`);
    if (!li || !t.done || li.classList.contains('is-done')) return;
    li.classList.add('is-done');
    const action = li.querySelector('a.btn');
    if (action) action.replaceWith(el('span', { class: 'quest-stamp', text: 'Done' }));
    const ic = li.querySelector('.q-icon');
    if (ic) { clear(ic); ic.append(icon('check', 21)); }
  });
}

/* ------------------------------------------------------------ daily story */

/**
 * The daily story, read in four beats: the hook, the turn, what followed and
 * what to take away. The narrative paragraphs the source provides are mapped
 * onto those beats in order; nothing is rewritten or invented.
 */
const STORY_BEATS = ['How it begins', 'The turning point', 'What followed'];

function renderStory() {
  if (!requireGuest()) return;
  const v = beginView();
  const today = todayKey();
  const story = pickDailyStory(DATA.stories.stories, today, profile.preferStoryFn());
  if (!story) {
    v.append(el('div', { class: 'empty-state' }, [
      el('h3', { text: 'No story for today' }),
      el('a', { class: 'btn btn-primary', href: '#/library', text: 'Open the library' })
    ]));
    return;
  }
  const state = store.load();
  const prof = profile.current(state);
  const saved = state.savedStories.includes(story.id);
  const alreadyRead = store.hasReward(gamify.rewardId('story', today));
  const otherClass = prof && prof.mode === 'school'
    && story.citations && story.citations.length
    && String(story.citations[0].classLevel) !== String(prof.classLevel)
    ? story.citations[0].classLevel : null;

  const saveBtn = el('button', {
    class: 'btn btn-ghost btn-sm', type: 'button', 'data-testid': 'save-story',
    'aria-pressed': String(saved)
  }, [icon('saved', 16), saved ? 'Saved' : 'Save']);
  saveBtn.addEventListener('click', () => {
    const s = store.toggleSavedStory(story.id);
    const on = s.savedStories.includes(story.id);
    clear(saveBtn);
    saveBtn.append(icon('saved', 16), on ? 'Saved' : 'Save');
    saveBtn.setAttribute('aria-pressed', String(on));
    gamify.checkUnlocks({ lessons: DATA.lessons.lessons });
    toast(on ? 'Story saved to your collection.' : 'Removed from your collection.');
  });

  const readBtn = el('button', {
    class: `btn ${alreadyRead ? 'btn-done' : 'btn-primary'} btn-block`, type: 'button',
    'data-testid': 'finish-story', disabled: alreadyRead,
    text: alreadyRead ? 'Read today' : 'Mark as read'
  });
  readBtn.addEventListener('click', () => {
    const res = gamify.award('story', today, { lessons: DATA.lessons.lessons });
    readBtn.disabled = true;
    readBtn.className = 'btn btn-done btn-block';
    readBtn.textContent = 'Read today';
    if (res.xp > 0) document.dispatchEvent(new CustomEvent('trident:hud'));
  });

  const paras = story.narrative.split('\n\n').filter(Boolean);
  const perBeat = Math.max(1, Math.ceil(paras.length / STORY_BEATS.length));
  const beats = STORY_BEATS.map((name, i) => ({
    name, paras: paras.slice(i * perBeat, (i + 1) * perBeat)
  })).filter((b) => b.paras.length);

  const related = library.relatedLessonForTopic(story.topic);

  v.append(el('article', { class: 'story', 'data-testid': 'story-article' }, [
    el('div', { class: 'reader-top' }, [
      el('a', { class: 'back-link', href: '#/dashboard' }, [icon('left', 16), 'Home']),
      el('span', { class: 'reader-time', text: `${story.readingMinutes} min read` }),
      saveBtn
    ]),
    otherClass ? el('p', { class: 'stamp stamp-warn', 'data-testid': 'story-other-class' },
      [icon('info', 15), `Today\u2019s story comes from Class ${otherClass}.`]) : null,
    el('h1', { class: 'title-serif story-title', text: story.title }),
    // an editorial image only when one was extracted from the very pages this
    // story is drawn from; otherwise the drawn motif stands in
    images.forStory(story)
      ? images.figure(images.forStory(story), { size: 'lesson', expandable: true, onSave: () => {} })
      : storyMotif(),
    ...beats.flatMap((b) => [
      el('h2', { class: 'beat', text: b.name }),
      ...b.paras.map((para) => el('p', { text: para }))
    ]),
    el('section', { class: 'takeaway' }, [
      el('h2', { text: 'What to take away' }),
      el('p', { text: story.takeaway })
    ]),
    el('details', { class: 'source' }, [
      el('summary', {}, [icon('evidence', 16), el('span', { class: 'src-line', text: 'Where this comes from' }),
        el('span', { class: 'src-more', text: 'View sources' })]),
      el('div', {}, story.citations.map((c) => citationBlock(c, `${c.board}, class ${c.classLevel}`)))
    ]),
    el('div', { class: 'reader-finish' }, [readBtn]),
    related ? el('p', {}, [
      'Related lesson: ',
      el('a', { href: `#/lesson/${related.id}`, text: related.title })
    ]) : null,
    el('section', { class: 'section' }, [el('h2', { text: 'Three quick questions' })])
  ].filter(Boolean)));

  const quizHost = el('div');
  v.append(quizHost);
  quiz.renderMiniQuiz(quizHost, story);
}

/**
 * An original map-style motif for the head of the story: contour lines and a
 * survey marker, drawn here. It illustrates nothing specific and stands in for
 * no textbook picture.
 */
function storyMotif() {
  const wrap = el('div', { class: 'story-motif', 'aria-hidden': 'true' });
  wrap.innerHTML = `
    <svg viewBox="0 0 640 96" preserveAspectRatio="none" focusable="false">
      <g fill="none" stroke="var(--saffron)" stroke-width="1.4" opacity="0.5">
        <path d="M-10 62c70-30 130 18 210-6s150 22 230-8 150 10 220-14"/>
      </g>
      <g fill="none" stroke="var(--teal)" stroke-width="1.4" opacity="0.55">
        <path d="M-10 78c80-26 140 16 220-6s150 20 230-10 140 8 210-10"/>
      </g>
      <g fill="none" stroke="var(--ink)" stroke-width="1.6" opacity="0.65">
        <circle cx="320" cy="44" r="13"/>
        <path d="M320 24v-8M320 72v-8M296 44h-8M352 44h-8"/>
      </g>
    </svg>`;
  return wrap;
}

/* ------------------------------------------------- collection (badges etc) */

/**
 * The collection leads with the one reward actually within reach and what
 * earns it. Everything still locked is folded away, so a learner who has just
 * arrived does not meet twelve grey squares.
 */
function renderCollection() {
  if (!requireGuest()) return;
  const v = beginView();
  const state = store.load();
  const badges = gamify.earnedBadges(state);
  const artefacts = gamify.collectedArtefacts(state);
  const earned = badges.filter((b) => b.earnedAt);
  const locked = badges.filter((b) => !b.earnedAt);
  const next = locked[0] || null;
  const gotArtefacts = artefacts.filter((a) => a.unlockedAt);

  v.append(el('div', { class: 'section-head' }, [
    el('h1', { text: 'Your collection' }),
    el('span', { class: 'meta', text: `${earned.length} of ${badges.length} badges earned` })
  ]));

  /* ---- the one to go for next ---- */
  if (next) {
    v.append(el('section', { class: 'goal section', 'data-testid': 'next-goal' }, [
      el('div', { class: 'goal-art' }, [badgeArtFor(next.id, false)]),
      el('div', { class: 'goal-body' }, [
        el('span', { class: 'goal-kicker', text: 'Next badge' }),
        el('h2', { text: next.name }),
        el('p', { text: next.requirement }),
        el('a', { class: 'btn btn-primary', href: goalHref(next.id), text: goalAction(next.id) })
      ])
    ]));
  } else {
    v.append(el('section', { class: 'goal section', 'data-testid': 'next-goal' }, [
      el('div', { class: 'goal-body' }, [
        el('h2', { text: 'Every badge earned' }),
        el('p', { text: 'All six badges and their artefacts are yours.' })
      ])
    ]));
  }

  /* ---- what you already hold ---- */
  if (earned.length) {
    v.append(el('section', { class: 'section' }, [
      el('div', { class: 'section-head' }, [el('h2', { text: 'Earned' })]),
      el('div', { class: 'shelf', 'data-testid': 'badge-shelf' }, earned.map((b) => el('div', {
        class: 'badge-tile is-earned', 'data-testid': `badge-${b.id}`
      }, [
        badgeArtFor(b.id, true),
        el('div', { class: 'b-name', text: b.name }),
        el('div', { class: 'b-req', text: b.requirement })
      ])))
    ]));
  }

  if (gotArtefacts.length) {
    v.append(el('section', { class: 'section' }, [
      el('div', { class: 'section-head' }, [el('h2', { text: 'Artefacts recovered' })]),
      el('p', { class: 'hint', text: gamify.ARTEFACT_DISCLAIMER }),
      el('div', { class: 'shelf', 'data-testid': 'artefact-shelf' }, gotArtefacts.map((a) => el('div', {
        class: 'artefact-tile is-unlocked', 'data-testid': `artefact-${a.id}`
      }, [
        artefactArtFor(a.id),
        el('div', { class: 'a-name', text: a.name }),
        el('div', { class: 'a-note', text: a.note })
      ])))
    ]));
  }

  /* ---- the rest, folded away ---- */
  if (locked.length > 1) {
    v.append(el('details', { class: 'section locked-drawer', 'data-testid': 'locked-drawer' }, [
      el('summary', { text: `View all locked rewards (${locked.length})` }),
      el('div', { class: 'shelf' }, locked.map((b) => el('div', {
        class: 'badge-tile is-locked', 'data-testid': `badge-${b.id}`
      }, [
        badgeArtFor(b.id, false),
        el('div', { class: 'b-name', text: b.name }),
        el('div', { class: 'b-req', text: b.requirement })
      ])))
    ]));
  }

  /* ---- the Visual Archive ---- */
  v.append(visualArchive(state));

  /* ---- saved items ---- */
  v.append(el('section', { class: 'section' }, [
    el('div', { class: 'section-head' }, [el('h2', { text: 'Saved' })]),
    savedItemsList(state),
    (state.savedBooks || []).length
      ? el('p', { class: 'hint', text: `${openlibrary.ATTRIBUTION}. Saved books are reading suggestions, not verified syllabus sources, and they earn no XP.` })
      : null
  ].filter(Boolean)));
}

/**
 * The Visual Archive: historical images the learner chose to keep. Each one
 * carries the caption, credit and licence it was shown with, so the archive is
 * a record of evidence, not a scrapbook. It earns no XP — keeping a picture is
 * not an achievement.
 */
function visualArchive(state) {
  const kept = state.savedImages || [];
  const prof = profile.current(state);
  const browse = prof && prof.mode === 'school'
    ? images.forClass(profile.boardByValue(prof.board).name, prof.classLevel).slice(0, 8)
    : [];

  const section = el('section', { class: 'section', 'data-testid': 'visual-archive' }, [
    el('div', { class: 'section-head' }, [
      el('h2', { text: 'Visual Archive' }),
      el('span', { class: 'meta', 'data-testid': 'archive-count',
        text: `${kept.length} image${kept.length === 1 ? '' : 's'} kept` })
    ])
  ]);

  if (kept.length) {
    section.append(el('div', { class: 'archive-grid', 'data-testid': 'archive-grid' },
      kept.map((img) => archiveTile(img, true))));
  } else {
    section.append(el('p', { class: 'lede', text:
      'Keep historical images here with their sources. Save one from any lesson, or from the pictures of your class below.' }));
  }

  if (browse.length) {
    const unsaved = browse.filter((b) => !kept.some((k) => k.id === b.id));
    if (unsaved.length) {
      section.append(
        el('h3', { class: 'archive-sub', text: 'From your class’s textbooks' }),
        el('div', { class: 'archive-grid', 'data-testid': 'archive-browse' },
          unsaved.slice(0, 6).map((img) => archiveTile(img, false)))
      );
    }
  }
  return section;
}

function archiveTile(img, isKept) {
  const tile = el('article', { class: 'archive-tile', 'data-testid': isKept ? 'archive-kept' : 'archive-offer' }, [
    el('div', { class: 'at-frame' }, [
      el('img', {
        src: img.url, alt: img.alt, loading: 'lazy', decoding: 'async',
        width: img.width || null, height: img.height || null
      })
    ]),
    el('div', { class: 'at-body' }, [
      el('span', { class: 'at-cap', text: img.caption }),
      el('div', { class: 'at-foot' }, [
        img.sourceType === 'textbook'
          ? el('span', { class: 'hi-source is-textbook' }, [icon('evidence', 13), 'Verified textbook image'])
          : el('a', { class: 'hi-source is-api', href: img.sourcePage, target: '_blank', rel: 'noopener noreferrer' },
            [icon('api', 13), img.credit]),
        el('button', {
          class: `hi-save${isKept ? ' is-on' : ''}`, type: 'button',
          'aria-pressed': String(isKept),
          'data-testid': isKept ? 'archive-remove' : 'archive-add',
          onclick: (e) => {
            store.toggleSavedImage({
              id: img.id, title: img.title, caption: img.caption, alt: img.alt, url: img.url,
              sourceType: img.sourceType, credit: img.credit, sourcePage: img.sourcePage || null,
              licence: img.licence, licenceUrl: img.licenceUrl || null,
              width: img.width, height: img.height
            });
            // the tile visibly moves into (or out of) the archive
            const card = e.currentTarget.closest('.archive-tile');
            card.classList.add(isKept ? 'is-leaving' : 'is-arriving');
            setTimeout(() => renderCollection(), 260);
          }
        }, [icon('saved', 13), isKept ? 'Remove' : 'Keep in archive'])
      ])
    ])
  ]);
  return tile;
}

/** Where a learner goes to earn a given badge, and what the button says. */
function goalHref(badgeId) {
  const map = {
    'first-step': '#/library', timekeeper: '#/quiz', 'perfect-recall': '#/quiz',
    'three-day-flame': '#/quiz', 'ancient-explorer': '#/library', 'story-keeper': '#/story'
  };
  return map[badgeId] || '#/library';
}
function goalAction(badgeId) {
  const map = {
    'first-step': 'Read a lesson', timekeeper: 'Answer today\u2019s questions',
    'perfect-recall': 'Answer today\u2019s questions', 'three-day-flame': 'Answer today\u2019s questions',
    'ancient-explorer': 'Open the library', 'story-keeper': 'Read today\u2019s story'
  };
  return map[badgeId] || 'Keep going';
}

function badgeArtFor(id, earned) {
  const art = badgeArt(id, 62);
  art.style.color = earned ? 'var(--gold)' : 'var(--muted-light)';
  return art;
}
function artefactArtFor(id) { return artefactArt(id, 88); }

function savedItemsList(state) {
  const lessons = state.savedLessons.map(library.lessonById).filter(Boolean);
  const stories = state.savedStories.map((id) => DATA.stories.stories.find((s) => s.id === id)).filter(Boolean);
  const books = state.savedBooks || [];
  if (!lessons.length && !stories.length && !state.savedEvents.length && !books.length) {
    return el('p', { class: 'empty', text: 'Nothing saved yet. Use Save on a lesson, a story, the Event of the Day or a book suggestion.' });
  }
  return el('ul', { class: 'list' }, [
    ...lessons.map((l) => el('li', { class: 'list-item' }, [
      el('div', { class: 'li-main' }, [
        el('div', { class: 'li-title', text: l.title }),
        el('div', { class: 'li-meta', text: `${library.bookById(l.bookId).title} · ${pages(l.citation)}` })
      ]),
      el('a', { class: 'btn btn-ghost btn-sm', href: `#/lesson/${l.id}`, text: 'Open' })
    ])),
    ...stories.map((s) => el('li', { class: 'list-item' }, [
      el('div', { class: 'li-main' }, [
        el('div', { class: 'li-title', text: s.title }),
        el('div', { class: 'li-meta', text: 'Saved story' })
      ]),
      el('a', { class: 'btn btn-ghost btn-sm', href: '#/story', text: 'Open' })
    ])),
    ...state.savedEvents.slice(0, 10).map((e) => el('li', { class: 'list-item' }, [
      el('div', { class: 'li-main' }, [
        el('div', { class: 'li-title', text: `${e.year} — ${e.title}` }),
        el('div', { class: 'li-meta', text: `Event of the Day · ${e.date}` })
      ]),
      el('a', { class: 'btn btn-ghost btn-sm', href: e.url, target: '_blank', rel: 'noopener noreferrer', text: 'Wikipedia' })
    ])),
    ...books.map((b) => el('li', { class: 'list-item', 'data-testid': 'saved-book' }, [
      el('div', { class: 'li-main' }, [
        el('div', { class: 'li-title', text: b.title }),
        el('div', { class: 'li-meta', text: `${(b.authors && b.authors.length) ? b.authors.join(', ') : 'Author not recorded'}${b.year ? ` · ${b.year}` : ''} · suggested for “${b.topic}”` })
      ]),
      el('div', { class: 'row' }, [
        el('a', {
          class: 'btn btn-ghost btn-sm', href: b.url,
          target: '_blank', rel: 'noopener noreferrer', text: 'Open Library'
        }),
        el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', text: 'Remove',
          onclick: () => { store.toggleSavedBook(b); toast('Book removed from your collection.'); renderCollection(); }
        })
      ])
    ]))
  ]);
}

/* ---------------------------------------------------------------- settings */

function renderSettings() {
  if (!requireGuest()) return;
  const v = beginView();
  const state = store.load();

  const themeBtn = el('button', {
    class: 'btn btn-secondary', type: 'button',
    text: state.theme === 'dark' ? 'Switch to the heritage theme' : 'Switch to the night reading theme',
    onclick: () => {
      const next = store.load().theme === 'dark' ? 'light' : 'dark';
      store.setTheme(next); applyTheme(next); renderSettings();
    }
  });

  const simInput = el('input', {
    type: 'date', id: 'sim-date', value: state.simulatedDate || '', 'data-testid': 'sim-date',
    onchange: (e) => {
      store.setSimulatedDate(e.target.value);
      toast(e.target.value ? `Previewing ${e.target.value}.` : 'Back to the real date.');
      renderSettings();
    }
  });

  const prof = profile.current(state);
  const described = profile.describe(prof);

  v.append(...[
    el('h1', { text: 'Settings' }),

    el('section', { class: 'section panel edge-saffron stack', 'data-testid': 'settings-profile' }, [
      el('h2', { text: 'Learning Profile' }),
      el('div', { class: 'profile-card' }, [
        el('div', {}, [
          el('div', { class: 'profile-goal', text: described.goal }),
          el('div', { class: 'profile-detail', 'data-testid': 'profile-detail', text: described.detail })
        ]),
        el('a', {
          class: 'btn btn-secondary push', href: '#/profile', 'data-testid': 'change-path',
          text: 'Change Learning Path'
        })
      ]),
      el('p', { class: 'hint', text: 'This sets what TRIDENT shows you first. It never hides anything — every board, class and saved item stays reachable from the library and your Passport.' })
    ]),

    el('section', { class: 'section panel stack' }, [
      el('h2', { text: 'Your profile' }),
      el('p', { text: `Playing as a guest since ${state.profile.createdAt ? new Date(state.profile.createdAt).toLocaleDateString() : 'today'}.` }),
      el('div', { class: 'notice' }, [
        el('p', {}, [
          el('strong', { text: 'Where your progress lives. ' }),
          'Everything — XP, badges, artefacts, completed lessons, saved items, streak and quiz history — is stored in this browser’s localStorage on this device. It survives closing the tab and restarting the browser. It does not sync to other devices, and ',
          el('strong', { text: 'clearing your browser’s site data will delete it permanently.' })
        ])
      ]),
      el('p', { class: 'hint', text: `Data schema version ${state.schemaVersion}${state.migratedFrom ? ` (migrated from version ${state.migratedFrom}; earlier lessons and quizzes were credited with XP once)` : ''}. Storage is ${store.storageAvailable() ? 'available' : 'blocked in this browser'}.` })
    ]),

    el('section', { class: 'section panel stack' }, [
      el('h2', { text: 'How XP works' }),
      el('ul', {}, Object.entries(gamify.XP_RULES).map(([k, n]) =>
        el('li', { text: `${gamify.XP_LABELS[k]}: +${n} XP` }))),
      el('p', { class: 'hint', text: 'Each reward is granted once per lesson or once per date. Reloading, revisiting or going back never pays out again.' }),
      el('div', {}, gamify.LEVELS.map((l) => el('div', { class: 'g-stat', style: 'display:flex;justify-content:space-between;max-width:320px' }, [
        el('span', { text: `Level ${l.level} — ${l.name}` }),
        el('b', { style: 'font-family:var(--font-mono)', text: `${l.min} XP` })
      ])))
    ]),

    el('section', { class: 'section panel stack' }, [
      el('h2', { text: 'Appearance and motion' }),
      el('p', { text: 'The bright heritage theme is the default: warm parchment and ivory surfaces with saffron and green accents. The night reading theme darkens the whole interface for reading in low light.' }),
      themeBtn,
      el('p', { class: 'hint', text: 'TRIDENT follows your system’s reduced-motion setting. With it on, XP bars, stamps, reveals and confetti are switched off and the interface updates instantly instead.' })
    ]),

    el('section', { class: 'section panel stack' }, [
      el('h2', { text: 'Developer preview: simulate a date' }),
      el('p', { text: 'The daily quiz, daily story, historical event and Timeline Challenge all come from your local calendar date. Set a date here to preview another day.' }),
      el('div', { class: 'field' }, [el('label', { for: 'sim-date', text: 'Preview date' }), simInput]),
      state.simulatedDate ? el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: 'Clear and use the real date',
        onclick: () => { store.setSimulatedDate(null); renderSettings(); }
      }) : null,
      state.simulatedDate ? el('p', { class: 'notice', text: `Currently previewing ${state.simulatedDate}. Results recorded while previewing are stored against that date.` }) : null
    ]),

    el('section', { class: 'section panel stack' }, [
      el('h2', { text: 'Reset' }),
      el('p', { text: 'Clear all guest progress from this browser. This cannot be undone.' }),
      el('button', {
        class: 'btn btn-ghost', type: 'button', text: 'Erase all progress',
        onclick: () => openModal({
          title: 'Erase all progress?',
          bodyNodes: [el('p', { text: 'This removes XP, badges, artefacts, completed lessons, saved items, quiz history and streaks from this browser. It cannot be undone.' })],
          actions: [el('button', {
            class: 'btn btn-primary', type: 'button', text: 'Yes, erase everything',
            onclick: (e) => {
              e.target.closest('.modal-backdrop').remove();
              store.resetAll(); applyTheme('light');
              toast('All local progress erased.'); go('/welcome');
            }
          })]
        })
      })
    ])
  ].filter(Boolean));
}

/* --------------------------------------------------------- shell plumbing */

function applyTheme(theme) {
  // the bright heritage theme is the default; 'dark' is the opt-in night theme
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}

function highlightNav(name) {
  const active = ROUTE_HOME[name] || null;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  paintNavIcons(active);
}

function setupActiveTimeTracking() {
  const TRACKED = ['lesson', 'quiz', 'story', 'timeline'];
  let ticking = null;
  let seconds = 0;
  function stop() {
    if (ticking) { clearInterval(ticking); ticking = null; }
    if (seconds > 0) { store.addActiveSeconds(seconds); seconds = 0; }
  }
  function maybeStart() {
    const name = currentPath().split('/').filter(Boolean)[0] || '';
    const shouldTrack = TRACKED.includes(name) && document.visibilityState === 'visible';
    if (shouldTrack && !ticking) {
      ticking = setInterval(() => {
        seconds += 1;
        if (seconds >= 30) { store.addActiveSeconds(seconds); seconds = 0; }
      }, 1000);
    } else if (!shouldTrack) stop();
  }
  document.addEventListener('visibilitychange', maybeStart);
  window.addEventListener('hashchange', () => { stop(); maybeStart(); });
  window.addEventListener('pagehide', stop);
  window.addEventListener('beforeunload', stop);
  maybeStart();
}

function renderError(message) {
  const v = beginView();
  header.hidden = true; footer.hidden = true; bottomNav.hidden = true;
  v.append(el('div', { class: 'state-box is-error' }, [
    el('h1', { text: 'TRIDENT could not start' }),
    el('p', { text: message }),
    el('p', { class: 'hint', text: 'This prototype must be served over http:// by a local web server. Opening index.html from the file system blocks module and data loading.' })
  ]));
}

async function boot() {
  try {
    DATA = await loadData();
  } catch (err) {
    console.error(err);
    renderError(err.message);
    return;
  }

  profile.init(DATA);
  onboarding.init(DATA);
  library.init(DATA);
  quiz.init(DATA);
  progress.init(DATA);
  timeline.init(DATA);
  brief.init(DATA);
  images.init(DATA.historyImages);

  // what the companion shows when it opens: facts computed here, from storage,
  // so the companion itself never reads or writes it
  companion.setTodayContext(() => {
    const st = store.load();
    const day = todayKey();
    const course = library.courseProgress(st);
    const q = gamify.questProgress(st, day);
    const nextTask = q.tasks.find((t) => !t.done);
    const nextLesson = library.continueLesson();
    const cached = (() => {
      try {
        const raw = localStorage.getItem(`trident:wikimedia-event:${day}`);
        const rec = raw ? JSON.parse(raw) : null;
        const evt = rec && rec.events ? pickDailyEvent(rec.events, day) : null;
        return evt ? `${evt.year} — ${evt.title}` : null;
      } catch (err) { return null; }
    })();
    return {
      progress: `${course.done} of ${course.total} chapters explored, ${q.done} of ${q.total} of today’s activities done.`,
      next: nextTask ? { label: `${nextTask.action} — ${nextTask.title}`, href: nextTask.href }
        : nextLesson ? { label: nextLesson.title, href: `#/lesson/${nextLesson.id}` } : null,
      event: cached,
      nextLessonTitle: nextLesson ? nextLesson.title : null
    };
  });
  companion.mount();

  gamify.setAnnouncer((message, kind) => {
    toast(message, kind);
    announceToScreenReader(message);
  });

  // any view can ask the header HUD to re-read state after XP is earned
  document.addEventListener('trident:hud', () => {
    if (!header.hidden) renderHud();
  });

  applyTheme(store.load().theme);
  buildBottomNav();

  route('/welcome', renderWelcome);
  route('/onboarding', renderOnboarding);
  route('/profile', renderChangePath);
  route('/dashboard', renderDashboard);
  route('/event', renderEventPage);
  route('/library', () => { if (requireGuest()) library.renderLibrary(beginView()); });
  route('/lesson/:id', (p) => {
    if (!requireGuest()) return;
    const v = beginView();
    library.renderLesson(v, p.id);
    quiz.renderLessonCheck(v.querySelector('.check-host'), library.lessonById(p.id));
  });
  route('/quiz', () => { if (requireGuest()) quiz.renderDailyQuiz(beginView()); });
  route('/timeline', () => { if (requireGuest()) timeline.render(beginView()); });
  route('/story', renderStory);
  route('/collection', renderCollection);
  route('/progress', () => { if (requireGuest()) progress.renderProgress(beginView()); });
  route('/settings', renderSettings);
  setNotFound(() => {
    const v = beginView();
    v.append(el('div', { class: 'state-box' }, [
      el('h1', { text: 'Page not found' }),
      el('a', { class: 'btn btn-secondary', href: '#/dashboard', text: 'Go to the dashboard' })
    ]));
  });

  onAfterNavigate((name) => {
    const isWelcome = name === 'welcome' || !name;
    const signedIn = !!store.load().profile.mode;
    const chromeHidden = isWelcome || !signedIn;
    // during first-time setup the app's navigation is not offered yet, so the
    // header keeps only the wordmark and the rule beneath it
    const setupOnly = name === 'onboarding';
    document.body.classList.toggle('is-onboarding', setupOnly);
    header.hidden = chromeHidden;
    footer.hidden = chromeHidden;
    bottomNav.hidden = chromeHidden || setupOnly;
    // the companion rides along with the chrome: every signed-in page, never
    // the welcome screen and never during first-run setup
    companion.setVisible(!chromeHidden && !setupOnly);
    if (!chromeHidden) renderHud();
    highlightNav(name);
    // a route change always lands at the top. The one exception is a lesson
    // the learner genuinely stopped part-way through, which restores its own
    // saved position after it renders.
    if (name !== 'lesson') window.scrollTo({ top: 0, behavior: 'auto' });
    document.getElementById('main').focus({ preventScroll: true });
  });

  // badges that depend only on stored state (e.g. after a migration) are checked once
  if (store.load().profile.mode) gamify.checkUnlocks({ lessons: DATA.lessons.lessons });

  if (!window.location.hash) {
    window.location.hash = store.load().profile.mode ? '/dashboard' : '/welcome';
  }

  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

  setupActiveTimeTracking();
  start();
}

export function refreshHud() { renderHud(); }

boot();
