/** TRIDENT application shell: data loading, chrome, dashboard, features, settings. */

import { el, clear, toast, openModal, citationBlock, tag, xpBar, announceToScreenReader, pages } from './ui.js';
import { icon, levelEmblem, gatewayMotif, journeyThreads, expeditionPath, tricolourRule, badgeArt, artefactArt } from './icons.js';
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
  const [libraryData, lessons, questions, stories, timelineData] = await Promise.all([
    loadJSON('data/library.json'), loadJSON('data/lessons.json'),
    loadJSON('data/questions.json'), loadJSON('data/stories.json'),
    loadJSON('data/timeline.json')
  ]);
  return { library: libraryData, lessons, questions, stories, timeline: timelineData };
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

function renderHud() {
  const hud = document.getElementById('hud');
  clear(hud);
  const state = store.load();
  const today = todayKey();
  const prog = gamify.levelProgress(state.xp || 0);
  const streak = store.effectiveStreak(state, today);

  hud.append(
    el('a', { class: 'hud-level', href: '#/progress', 'data-testid': 'hud-level' }, [
      levelEmblem(prog.current.level, 30, 'hud-emblem'),
      el('span', { class: 'hud-level-text' }, [
        el('b', { text: `Level ${prog.current.level}` }),
        el('span', { text: `${state.xp || 0} XP` })
      ])
    ]),
    el('span', {
      class: 'hud-streak', 'data-testid': 'hud-streak',
      title: `${streak} day streak`, 'aria-label': `Current streak: ${streak} ${streak === 1 ? 'day' : 'days'}`
    }, [icon('flame', 15), String(streak)])
  );

  const prof = profile.current(state);
  if (prof) {
    hud.append(el('a', {
      class: 'hud-profile', href: '#/settings', 'data-testid': 'hud-profile',
      'aria-label': `Learning path: ${profile.label(prof)}. Change it in Settings.`
    }, [icon('learn', 15), el('span', { text: profile.label(prof) })]));
  }
}

const BOTTOM_NAV = [
  { href: '#/dashboard', nav: 'dashboard', label: 'Home', ic: 'home' },
  { href: '#/library', nav: 'library', label: 'Learn', ic: 'learn' },
  { href: '#/quiz', nav: 'quiz', label: 'Quest', ic: 'quest' },
  { href: '#/collection', nav: 'collection', label: 'Saved', ic: 'saved' },
  { href: '#/progress', nav: 'progress', label: 'Progress', ic: 'progress' }
];

function buildBottomNav() {
  const list = document.getElementById('bottomNavList');
  clear(list);
  BOTTOM_NAV.forEach((item) => {
    list.append(el('li', {}, [
      el('a', { href: item.href, 'data-nav': item.nav, 'data-testid': `bottomnav-${item.nav}` }, [
        icon(item.ic, 21), el('span', { text: item.label })
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
function renderDashboard() {
  if (!requireGuest()) return;
  const v = beginView();
  const state = store.load();
  const today = todayKey();
  const prog = gamify.levelProgress(state.xp || 0);
  const streak = store.effectiveStreak(state, today);
  const quest = gamify.questProgress(state, today);

  /* ---- 1. where you are, and the one thing to do next ---- */
  const cont = library.continueLesson();
  const pos = cont ? state.readingPositions[cont.id] : null;
  const book = cont ? library.bookById(cont.bookId) : null;

  v.append(el('section', { class: 'panel standing section', 'data-testid': 'standing' }, [
    journeyThreads(),
    el('div', { class: 'standing-top' }, [
      el('div', { class: 'standing-who' }, [
        levelEmblem(prog.current.level, 44),
        el('div', { class: 'stack-tight' }, [
          el('span', { class: 'eyebrow', 'data-testid': 'greeting', text: 'Welcome back' }),
          el('h1', { class: 'standing-level', text: `Level ${prog.current.level} — ${prog.current.name}` })
        ])
      ]),
      el('div', { class: 'standing-figures', 'data-testid': 'standing-figures' }, [
        el('span', {}, [el('b', { text: String(state.xp || 0) }), ' XP']),
        el('span', { class: 'hud-streak' }, [icon('flame', 14), `${streak} day streak`])
      ])
    ]),

    xpBar(prog.percent, 'Experience', prog.next ? `${prog.toNext} XP to ${prog.next.name}` : 'Highest level reached', 'standing-xp'),

    cont
      ? el('div', { class: 'standing-next' }, [
        el('div', { class: 'stack-tight' }, [
          el('span', { class: 'brief-label', text: pos ? 'Pick up where you stopped' : 'Start here' }),
          el('p', { class: 'standing-next-title', 'data-testid': 'continue-title', text: cont.title }),
          el('span', { class: 'hint', text: `${book ? book.title : ''} · Class ${cont.classLevel}` })
        ]),
        el('a', {
          class: 'btn btn-primary btn-lg standing-go', href: `#/lesson/${cont.id}`, 'data-testid': 'continue-learning'
        }, [icon('arrowRight', 18), 'Continue Learning'])
      ])
      : el('div', { class: 'standing-next' }, [
        el('p', { class: 'standing-next-title', text: 'Every lesson on your path is complete.' }),
        el('a', { class: 'btn btn-primary standing-go', href: '#/library', 'data-testid': 'continue-learning' },
          [icon('arrowRight', 18), 'Browse the library'])
      ])
  ]));

  /* ---- 2. today's quest ---- */
  v.append(el('section', { class: 'panel quest section', 'data-testid': 'quest-panel' }, [
    el('div', { class: 'quest-head' }, [
      el('span', { class: 'eyebrow', text: 'Today’s quest' }),
      el('span', { class: 'quest-count', 'data-testid': 'quest-count', text: `${quest.done}/${quest.total} complete` })
    ]),
    el('ul', { class: 'quest-list' }, quest.tasks.map((t) => el('li', {
      class: `quest-item${t.done ? ' is-done' : ''}`, 'data-testid': `quest-${t.id}`
    }, [
      el('span', { class: 'q-icon' }, [icon(t.done ? 'check' : t.icon, 21)]),
      el('span', { class: 'q-main' }, [
        el('span', { class: 'q-title', text: t.title }),
        el('span', { class: 'q-sub', text: t.sub })
      ]),
      el('span', { class: 'q-xp', text: `+${t.xp} XP` }),
      t.done
        ? el('span', { class: 'quest-stamp', text: 'Done' })
        : el('a', { class: 'btn btn-secondary btn-sm', href: t.href, text: 'Start' }),
      el('span', { class: 'sr-only', text: t.done ? `${t.title}: complete, ${t.xp} XP earned.` : `${t.title}: not started, worth ${t.xp} XP.` })
    ])))
  ]));

  /* ---- 3. the daily briefing ---- */
  const briefHost = el('section', { class: 'panel brief section', 'data-testid': 'daily-brief' });
  v.append(briefHost);
  brief.render(briefHost);

  /* ---- a quiet line to everything that moved ---- */
  v.append(el('nav', { class: 'moved-to section', 'data-testid': 'moved-to', 'aria-label': 'More of TRIDENT' }, [
    el('a', { href: '#/library' }, [icon('learn', 15), 'Gateways and the era journey']),
    el('a', { href: '#/progress' }, [icon('progress', 15), 'Your statistics']),
    el('a', { href: '#/timeline' }, [icon('quest', 15), 'Timeline Challenge'])
  ]));

  renderHud();
}

/* ------------------------------------------------- the day's event page -- */

/**
 * The Historical Event of the Day, on a page of its own.
 *
 * It used to sit on the dashboard with its full Wikimedia description; the
 * dashboard now links here from the quest, and the reading happens on arrival.
 */
function renderEventPage() {
  if (!requireGuest()) return;
  const v = beginView();
  const host = el('section', { class: 'section', 'data-testid': 'event-host' }, [
    el('div', { class: 'section-head' }, [
      el('h1', { text: 'Historical Event of the Day' }),
      el('span', { class: 'hint', 'data-testid': 'wikimedia-label', text: 'Live data from Wikimedia' })
    ]),
    el('div', { class: 'state-box' }, [el('span', { class: 'spinner' }), ' Loading today’s event…'])
  ]);
  v.append(host);
  renderEventOfTheDay(host);
  v.append(el('a', { class: 'btn btn-ghost btn-sm section', href: '#/dashboard', text: '← Back to the dashboard' }));
}

/* ------------------------------------- sections that moved to the library */

/** The learning gateways, including the TNPSC practice area. */
function gatewaysSection(state) {
  return el('section', { class: 'section' }, [
    el('div', { class: 'section-head' }, [el('h2', { text: 'Learning gateways' })]),
    el('div', { class: 'gateways', 'data-testid': 'gateways' }, DATA.library.paths.map((p) => gatewayCard(p, state)))
  ]);
}

function gatewayCard(p, state) {
  const lessons = DATA.lessons.lessons.filter((l) => l.path === p.id);
  const done = lessons.filter((l) => state.completedLessons[l.id]).length;
  const classes = [...new Set(DATA.library.books.filter((b) => b.path === p.id).map((b) => b.classLevel))]
    .sort((a, b) => Number(a) - Number(b));
  const pct = lessons.length ? Math.round((done / lessons.length) * 100) : 0;

  return el('a', {
    class: `gateway gateway-${p.id}`, href: '#/library', 'data-testid': `gateway-${p.id}`,
    onclick: () => { store.setPath(p.id); library.setPathFilter(p.id); }
  }, [
    gatewayMotif(p.id),
    el('div', { class: 'row' }, [
      el('span', { class: 'g-name', text: p.name }),
      p.status === 'beta' ? tag('Beta', 'beta') : null
    ]),
    el('p', { class: 'g-blurb', text: p.blurb }),
    el('div', { class: 'g-stats' }, [
      el('span', { class: 'g-stat' }, [
        el('span', { text: p.id === 'tnpsc' ? 'Practice set' : 'Classes' }),
        el('b', { text: p.id === 'tnpsc' ? 'Verified only' : classes.join(', ') || '—' })
      ]),
      el('span', { class: 'g-stat' }, [el('span', { text: 'Lessons completed' }), el('b', { text: `${done} / ${lessons.length}` })]),
      xpBar(pct, '', '', null)
    ]),
    el('span', { class: 'btn btn-secondary btn-sm g-action' }, [
      p.id === 'tnpsc' ? 'Open practice area' : 'Enter gateway', icon('arrowRight', 16)
    ])
  ]);
}

function eraMap(state) {
  const eras = gamify.eraStatus(DATA.lessons.lessons, state);
  const selected = state.selectedEra;
  // the era journey is a progress view, so it sits on the progress surface
  return el('section', { class: 'section panel panel-green era-map', 'data-testid': 'era-map' }, [
    el('div', { class: 'section-head' }, [
      el('h2', { text: 'Era journey' }),
      el('span', { class: 'hint', text: 'Choose an era to filter the library' }),
      selected ? el('button', {
        class: 'btn btn-ghost btn-sm', type: 'button', text: 'Clear era filter',
        onclick: () => { store.setSelectedEra(null); renderDashboard(); }
      }) : null
    ]),
    el('ol', { class: 'era-track' }, eras.map((era) => {
      const locked = era.status === 'locked';
      return el('li', { style: 'display:contents' }, [
        el('button', {
          type: 'button',
          class: `era-node is-${era.status}`,
          'data-testid': `era-${era.id}`,
          'aria-pressed': String(selected === era.id),
          disabled: locked,
          'aria-label': `${era.label}, ${era.period}. ${locked ? 'No lessons indexed yet.' : `${era.completed} of ${era.total} lessons complete.`}`,
          onclick: () => {
            if (locked) return;
            const next = selected === era.id ? null : era.id;
            store.setSelectedEra(next);
            library.setEraFilter(next);
            if (next) go('/library'); else renderDashboard();
          }
        }, [
          el('span', { class: 'era-marker' }, [icon(era.status === 'complete' ? 'check' : 'map', 20)]),
          el('span', { class: 'era-label', text: era.label }),
          el('span', { class: 'era-sub', text: locked ? 'Coming soon' : `${era.completed}/${era.total}` }),
          el('span', { class: 'era-sub', text: era.period })
        ])
      ]);
    }))
  ]);
}

/* ------------------------------------------------------- event of the day */

async function renderEventOfTheDay(host) {
  const today = todayKey();
  const result = await fetchEventsForDate(today);
  const body = host.lastChild;

  if (result.status === 'offline') {
    body.replaceWith(el('div', { class: 'state-box is-error', 'data-testid': 'event-offline' }, [
      el('p', { text: 'Today’s online historical event is temporarily unavailable.' }),
      el('p', { class: 'hint', text: 'Nothing is invented here — this stays empty until a real event can be fetched. Everything else on this page works as usual.' }),
      el('button', {
        class: 'btn btn-secondary btn-sm', type: 'button',
        onclick: () => {
          clear(host);
          host.append(
            el('div', { class: 'section-head' }, [el('h2', { text: 'Historical Event of the Day' })]),
            el('div', { class: 'state-box' }, [el('span', { class: 'spinner' }), ' Retrying…'])
          );
          renderEventOfTheDay(host);
        }
      }, [icon('refresh', 16), 'Try again'])
    ]));
    return;
  }
  if (result.status === 'empty') {
    body.replaceWith(el('div', { class: 'state-box' }, [el('p', { text: 'The feed returned no events for today’s date.' })]));
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

  body.replaceWith(el('article', { class: 'feature-event', 'data-testid': 'event-card' }, [
    el('div', {}, [
      evt.image ? eventImage(evt) : noImagePlaceholder(),
      el('div', { class: 'f-year', style: 'margin-top:.6rem', text: evt.year })
    ]),
    el('div', { class: 'stack' }, [
      el('span', { class: 'f-kicker', text: 'On this day' }),
      el('h3', { style: 'margin:0', text: evt.title }),
      el('p', { text: evt.text }),
      detail,
      el('div', { class: 'row' }, [exploreBtn, saveBtn,
        el('a', { class: 'btn btn-ghost btn-sm', href: evt.url, target: '_blank', rel: 'noopener noreferrer', text: 'Read on Wikipedia' })]),
      el('p', { class: 'citation', 'data-testid': 'event-attribution' }, [
        el('strong', { text: 'Source: ' }), evt.source
      ]),
      el('p', { class: 'hint', 'data-testid': 'event-loaded-for' }, [
        icon('info', 14),
        ` Live data from Wikimedia · loaded for ${prettyDate(today)}`,
        result.status === 'cache'
          ? ' · shown from this device’s copy because the feed could not be reached just now'
          : result.status === 'cache-hit' ? ' · already fetched today, served from this device' : ''
      ])
    ])
  ]));
}

function noImagePlaceholder() {
  return el('div', { class: 'state-box', style: 'min-height:110px;display:grid;place-items:center' }, [
    el('span', { class: 'hint', text: 'No image available' })
  ]);
}

/** A thumbnail that quietly becomes the placeholder if the remote file 404s. */
function eventImage(evt) {
  const img = el('img', {
    src: evt.image.src,
    alt: `Image from the Wikipedia article “${evt.title}”`,
    loading: 'lazy', width: evt.image.width || null, height: evt.image.height || null
  });
  img.addEventListener('error', () => { img.replaceWith(noImagePlaceholder()); }, { once: true });
  return img;
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

function renderStory() {
  if (!requireGuest()) return;
  const v = beginView();
  const today = todayKey();
  const story = pickDailyStory(DATA.stories.stories, today, profile.preferStoryFn());
  if (!story) {
    v.append(el('div', { class: 'state-box' }, [el('p', { text: 'No story available.' })]));
    return;
  }
  const state = store.load();
  const saved = state.savedStories.includes(story.id);
  const alreadyRead = store.hasReward(gamify.rewardId('story', today));

  const saveBtn = el('button', {
    class: 'btn btn-secondary', type: 'button', 'data-testid': 'save-story',
    'aria-pressed': String(saved), text: saved ? 'Saved' : 'Save story'
  });
  saveBtn.addEventListener('click', () => {
    const s = store.toggleSavedStory(story.id);
    const on = s.savedStories.includes(story.id);
    saveBtn.textContent = on ? 'Saved' : 'Save story';
    saveBtn.setAttribute('aria-pressed', String(on));
    gamify.checkUnlocks({ lessons: DATA.lessons.lessons });
    toast(on ? 'Story saved.' : 'Story removed from saved items.');
  });

  const readBtn = el('button', {
    class: 'btn btn-primary', type: 'button', 'data-testid': 'finish-story',
    disabled: alreadyRead,
    text: alreadyRead ? 'Read today · +30 XP earned' : `Mark as read (+${gamify.XP_RULES.story} XP)`
  });
  readBtn.addEventListener('click', () => {
    const res = gamify.award('story', today, { lessons: DATA.lessons.lessons });
    readBtn.disabled = true;
    readBtn.textContent = 'Read today · +30 XP earned';
    if (res.xp > 0) renderHud();
  });

  const related = library.relatedLessonForTopic(story.topic);

  v.append(...[
    el('div', { class: 'section-head' }, [
      el('h1', { text: 'Daily Story' }),
      el('span', { class: 'hint', text: prettyDate(today) }),
      tag(`+${gamify.XP_RULES.story} XP`, null, 'bolt')
    ]),
    el('article', { class: 'feature-story section', 'data-testid': 'story-article' }, [
      el('span', { class: 'f-kicker', text: `${story.topic} · ${story.readingMinutes} minute read` }),
      el('div', { class: 'f-era', style: 'margin:.3rem 0 .2rem', text: story.title }),
      el('div', { style: 'height:2px;background:linear-gradient(90deg,var(--india-saffron),transparent);margin:.8rem 0 1.2rem' }),
      ...story.narrative.split('\n\n').map((p) => el('p', { text: p }))
    ]),
    el('div', { class: 'keyfact section' }, [
      el('span', { class: 'eyebrow', text: 'Key takeaway' }),
      el('p', { style: 'margin:0', text: story.takeaway })
    ]),
    el('div', { class: 'section stack' }, story.citations.map((c) => citationBlock(c, `${c.board}, class ${c.classLevel}`))),
    el('p', { class: 'hint', text: DATA.stories.authoring }),
    el('div', { class: 'reader-actions' }, [
      readBtn, saveBtn,
      related ? el('a', { class: 'btn btn-ghost', href: `#/lesson/${related.id}`, text: `Related lesson: ${related.title}` }) : null
    ]),
    el('section', { class: 'section' }, [el('h2', { text: 'Three quick questions' })])
  ].filter(Boolean));
  const quizHost = el('div', { class: 'stack' });
  v.append(quizHost);
  quiz.renderMiniQuiz(quizHost, story);
}

/* ------------------------------------------------- collection (badges etc) */

function renderCollection() {
  if (!requireGuest()) return;
  const v = beginView();
  const state = store.load();
  const badges = gamify.earnedBadges(state);
  const artefacts = gamify.collectedArtefacts(state);

  v.append(...[
    el('div', { class: 'section-head' }, [
      el('h1', { text: 'Collection' }),
      el('span', { class: 'hint', text: `${badges.filter((b) => b.earnedAt).length} of ${badges.length} badges · ${artefacts.filter((a) => a.unlockedAt).length} of ${artefacts.length} artefacts` })
    ]),
    el('section', { class: 'section' }, [
      el('h2', { text: 'Badges' }),
      el('div', { class: 'shelf', 'data-testid': 'badge-shelf' }, badges.map((b) => el('div', {
        class: `badge-tile ${b.earnedAt ? 'is-earned' : 'is-locked'}`, 'data-testid': `badge-${b.id}`
      }, [
        b.earnedAt ? el('span', { class: 'ribbon', 'aria-hidden': 'true' }, [el('i'), el('i'), el('i')]) : null,
        badgeArtFor(b.id, !!b.earnedAt),
        el('div', { class: 'b-name', text: b.name }),
        el('div', { class: 'b-req', text: b.requirement }),
        el('span', { class: 'b-state', text: b.earnedAt ? 'Earned' : 'Locked' })
      ])))
    ]),
    el('section', { class: 'section' }, [
      el('h2', { text: 'Artefacts' }),
      el('p', { class: 'hint', text: gamify.ARTEFACT_DISCLAIMER }),
      el('div', { class: 'shelf', 'data-testid': 'artefact-shelf' }, artefacts.map((a) => el('div', {
        class: `artefact-tile ${a.unlockedAt ? 'is-unlocked' : 'is-locked'}`, 'data-testid': `artefact-${a.id}`
      }, [
        artefactArtFor(a.id),
        el('div', { class: 'a-name', text: a.name }),
        el('div', { class: 'a-note', text: a.unlockedAt ? `Recovered with the ${a.badgeName} badge. ${a.note}` : `Locked — ${a.requirement}` }),
        a.unlockedAt ? null : el('span', { class: 'b-state', style: 'color:var(--text-muted)' }, [icon('lock', 14), ' Locked'])
      ])))
    ]),
    el('section', { class: 'section' }, [
      el('div', { class: 'section-head' }, [
        el('h2', { text: 'Saved items' }),
        (state.savedBooks || []).length
          ? el('span', { class: 'hint', text: `${state.savedBooks.length} book suggestion${state.savedBooks.length === 1 ? '' : 's'} kept` })
          : null
      ].filter(Boolean)),
      savedItemsList(state),
      (state.savedBooks || []).length
        ? el('p', { class: 'hint', text: `${openlibrary.ATTRIBUTION}. Saved books are reading suggestions, not verified syllabus sources, and they earn no XP.` })
        : null
    ].filter(Boolean))
  ].filter(Boolean));
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
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const alias = { lesson: 'library', collection: 'collection', story: 'story', timeline: 'timeline' };
    const target = alias[name] || name;
    const bottomAlias = { quiz: 'quiz', timeline: 'quiz', story: 'library', lesson: 'library', settings: 'progress' };
    const isBottom = a.closest('.bottom-nav');
    const want = isBottom ? (bottomAlias[name] || target) : target;
    if (a.dataset.nav === want) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
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
  route('/library', () => {
    if (!requireGuest()) return;
    const v = beginView();
    library.renderLibrary(v);
    // the gateways and the era journey live here now, above the catalogue
    v.prepend(gatewaysSection(store.load()));
    v.append(eraMap(store.load()));
  });
  route('/lesson/:id', (p) => { if (requireGuest()) library.renderLesson(beginView(), p.id); });
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
    document.getElementById('main').focus({ preventScroll: true });
  });

  // badges that depend only on stored state (e.g. after a migration) are checked once
  if (store.load().profile.mode) gamify.checkUnlocks({ lessons: DATA.lessons.lessons });

  if (!window.location.hash) {
    window.location.hash = store.load().profile.mode ? '/dashboard' : '/welcome';
  }

  setupActiveTimeTracking();
  start();
}

export function refreshHud() { renderHud(); }

boot();
