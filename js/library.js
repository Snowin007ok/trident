/** Library browsing and the lesson reader (exploration pages). */

import { el, clear, toast, citationBlock, tag, xpBar, pages } from './ui.js';
import { icon, eraIcon } from './icons.js';
import * as store from './storage.js';
import * as gamify from './gamify.js';
import { todayKey } from './daily.js';
import * as profile from './profile.js';
import * as openlibrary from './openlibrary.js';

let DATA = null;
const filters = { path: 'all', classLevel: 'all', bookId: 'all', chapterId: 'all', era: 'all', q: '' };

export function init(data) {
  DATA = data;
  const saved = store.load().selectedEra;
  if (saved) filters.era = saved;
  applyProfileDefaults();
}

/**
 * Point the library's default filters at the learner's own board and class.
 * These are defaults, not restrictions: the selects still offer every board,
 * class, book and chapter, and one click clears back to everything.
 */
export function applyProfileDefaults() {
  const prof = profile.current();
  if (!prof) return;
  const path = profile.pathId(prof);
  const cls = profile.classLevel(prof);
  // the TNPSC beta draws on both boards, so it gets no single default board
  filters.path = (path && path !== 'tnpsc') ? path : 'all';
  filters.classLevel = cls || 'all';
  filters.bookId = 'all';
  filters.chapterId = 'all';
}

export function currentFilters() { return { ...filters }; }

export function setPathFilter(pathId) { filters.path = pathId || 'all'; filters.bookId = 'all'; filters.chapterId = 'all'; }
export function setEraFilter(eraId) { filters.era = eraId || 'all'; }

export function lessonsFor(bookId) { return DATA.lessons.lessons.filter((l) => l.bookId === bookId); }
export function lessonById(id) { return DATA.lessons.lessons.find((l) => l.id === id) || null; }
export function bookById(id) { return DATA.library.books.find((b) => b.id === id) || null; }
export function chapterLabel(book, chapterId) {
  const c = (book.chapters || []).find((x) => x.id === chapterId);
  return c ? c.label : null;
}

export function bookProgress(bookId) {
  const state = store.load();
  const all = lessonsFor(bookId);
  const completed = all.filter((l) => state.completedLessons[l.id]).length;
  return { completed, total: all.length, percent: all.length ? Math.round((completed / all.length) * 100) : 0 };
}

export function remainingMinutes(bookId) {
  const state = store.load();
  return lessonsFor(bookId)
    .filter((l) => !state.completedLessons[l.id])
    .reduce((sum, l) => sum + (l.readingMinutes || 4), 0);
}

export function relatedLessonForTopic(topic) {
  return DATA.lessons.lessons.find((l) => l.topic === topic) || null;
}

function visibleLessons() {
  const q = filters.q.trim().toLowerCase();
  return DATA.lessons.lessons.filter((l) => {
    if (filters.path !== 'all' && l.path !== filters.path) return false;
    if (filters.classLevel !== 'all' && l.classLevel !== filters.classLevel) return false;
    if (filters.bookId !== 'all' && l.bookId !== filters.bookId) return false;
    if (filters.chapterId !== 'all' && (l.chapterId || '') !== filters.chapterId) return false;
    if (filters.era !== 'all' && l.era !== filters.era) return false;
    if (!q) return true;
    const book = bookById(l.bookId);
    return [l.title, l.topic, l.intro, l.excerpt, book ? book.title : '', (l.keyPoints || []).join(' ')]
      .join(' ').toLowerCase().includes(q);
  });
}

function selectField(id, label, options, value, onChange) {
  const sel = el('select', { id, onchange: (e) => onChange(e.target.value) },
    options.map((o) => el('option', { value: o.value, selected: o.value === value }, o.label)));
  return el('div', { class: 'field' }, [el('label', { for: id, text: label }), sel]);
}

export function renderLibrary(view) {
  clear(view);
  const books = DATA.library.books;
  const rerender = () => renderLibrary(view);

  const pathOptions = [{ value: 'all', label: 'All learning paths' }]
    .concat(DATA.library.paths.map((p) => ({ value: p.id, label: p.name })));
  const classOptions = [{ value: 'all', label: 'All classes' }]
    .concat(['6', '7', '8', '9', '10', '11', '12'].map((c) => {
      const avail = DATA.library.classAvailability[c];
      return { value: c, label: `Class ${c}${avail.state === 'available' ? '' : ` — ${avail.label}`}` };
    }));
  const bookPool = books
    .filter((b) => filters.path === 'all' || b.path === filters.path)
    .filter((b) => filters.classLevel === 'all' || b.classLevel === filters.classLevel);
  const bookOptions = [{ value: 'all', label: 'All books' }]
    .concat(bookPool.map((b) => ({ value: b.id, label: `${b.title} (class ${b.classLevel})` })));
  const selectedBook = filters.bookId !== 'all' ? bookById(filters.bookId) : null;
  const chapterOptions = [{
    value: 'all',
    label: selectedBook && !selectedBook.chaptersDetected ? 'Chapters not recorded' : 'All chapters'
  }].concat(selectedBook ? selectedBook.chapters.map((c) => ({ value: c.id, label: c.label })) : []);
  const eraOptions = [{ value: 'all', label: 'All eras' }]
    .concat(gamify.ERAS.map((e) => ({ value: e.id, label: `${e.label} · ${e.period}` })));

  view.append(
    el('div', { class: 'section-head' }, [
      el('h1', { text: 'Library' }),
      el('span', { class: 'hint', text: `${DATA.lessons.lessons.length} lessons from ${books.length} verified books` })
    ]),
    el('div', { class: 'panel stack' }, [
      el('div', { class: 'filters' }, [
        selectField('f-path', 'Board or path', pathOptions, filters.path, (v) => {
          filters.path = v; filters.bookId = 'all'; filters.chapterId = 'all'; rerender();
        }),
        selectField('f-class', 'Class', classOptions, filters.classLevel, (v) => {
          filters.classLevel = v; filters.bookId = 'all'; filters.chapterId = 'all'; rerender();
        }),
        selectField('f-era', 'Era', eraOptions, filters.era, (v) => {
          filters.era = v; store.setSelectedEra(v === 'all' ? null : v); rerender();
        }),
        selectField('f-book', 'Book', bookOptions, filters.bookId, (v) => {
          filters.bookId = v; filters.chapterId = 'all'; rerender();
        }),
        selectField('f-chapter', 'Chapter', chapterOptions, filters.chapterId, (v) => {
          filters.chapterId = v; rerender();
        }),
        el('div', { class: 'field' }, [
          el('label', { for: 'f-search', text: 'Search' }),
          el('input', {
            id: 'f-search', type: 'search', value: filters.q, placeholder: 'Plassey, Harappa, mills…',
            oninput: (e) => { filters.q = e.target.value; renderResults(resultsHost); }
          })
        ])
      ]),
      el('div', { class: 'row' }, [
        el('button', {
          class: 'btn btn-ghost btn-sm', type: 'button', text: 'Show everything',
          onclick: () => {
            filters.path = 'all'; filters.classLevel = 'all'; filters.bookId = 'all';
            filters.chapterId = 'all'; filters.era = 'all'; filters.q = '';
            store.setSelectedEra(null); rerender();
          }
        })
      ])
    ])
  );

  const prof = profile.current();
  if (prof) {
    const showingMine = filters.path === profile.pathId(prof)
      || (profile.pathId(prof) === 'tnpsc' && filters.path === 'all');
    view.append(el('div', { class: 'notice section', 'data-testid': 'library-profile-note' }, [
      el('p', {}, [
        el('strong', { text: `${profile.label(prof)}. ` }),
        showingMine
          ? 'These filters start on your own learning path. Change any of them, or use “Show everything”, to read outside it — nothing is locked.'
          : 'You are browsing outside your learning path. Everything here is open to you; your path only decides what TRIDENT suggests first.'
      ])
    ]));
  }

  if (filters.era !== 'all') {
    const era = gamify.ERAS.find((e) => e.id === filters.era);
    if (era) {
      view.append(el('div', { class: 'notice section', 'data-testid': 'era-notice' }, [
        el('p', {}, [el('strong', { text: `${era.label}. ` }), `Showing lessons from ${era.period}.`])
      ]));
    }
  }
  if (filters.classLevel !== 'all') {
    const avail = DATA.library.classAvailability[filters.classLevel];
    const note = DATA.library.notices[filters.classLevel];
    if (avail.state !== 'available') {
      view.append(el('div', { class: 'notice section' }, [
        el('p', {}, [el('strong', { text: `Class ${filters.classLevel}: ${avail.label}. ` }), note || ''])
      ]));
    }
  }
  if (filters.path === 'tnpsc') {
    view.append(el('div', { class: 'notice section' }, [
      el('p', {}, [el('strong', { text: 'TNPSC preparation is in beta. ' }), DATA.library.notices.tnpsc])
    ]));
  }

  const resultsHost = el('div', { class: 'section' });
  view.append(resultsHost);
  renderResults(resultsHost);
}

function renderResults(host) {
  clear(host);
  const state = store.load();
  const list = visibleLessons();

  if (filters.classLevel === '11') {
    host.append(el('div', { class: 'state-box' }, [
      el('p', { text: 'No verified class 11 history material is indexed yet. Content coming soon.' })
    ]));
    return;
  }
  if (!list.length) {
    host.append(el('div', { class: 'state-box' }, [
      el('p', { text: 'No lessons match these filters. Try clearing the search box or choosing another era.' })
    ]));
    return;
  }

  const byBook = new Map();
  list.forEach((l) => {
    if (!byBook.has(l.bookId)) byBook.set(l.bookId, []);
    byBook.get(l.bookId).push(l);
  });

  host.append(el('p', { class: 'hint', text: `${list.length} lesson${list.length === 1 ? '' : 's'}` }));

  byBook.forEach((lessons, bookId) => {
    const book = bookById(bookId);
    const avail = DATA.library.classAvailability[book.classLevel];
    const prog = bookProgress(bookId);
    host.append(...[el('section', { class: 'section' }, [
      el('div', { class: 'section-head' }, [
        el('h2', { text: book.title }),
        el('span', { class: 'pill', text: `${book.board} · Class ${book.classLevel}` }),
        avail.state !== 'available' ? tag(avail.label, avail.state === 'limited' ? 'limited' : 'soon') : null,
        el('span', { class: 'hint push', text: `${prog.completed}/${prog.total} complete` })
      ]),
      book.note ? el('p', { class: 'hint', text: book.note }) : null,
      el('ul', { class: 'list' }, lessons.map((l) => {
        const done = !!state.completedLessons[l.id];
        const saved = state.savedLessons.includes(l.id);
        const chap = l.chapterId ? chapterLabel(book, l.chapterId) : null;
        return el('li', { class: 'list-item' }, [
          el('div', { class: 'li-main' }, [
            el('div', { class: 'li-title', text: l.title }),
            el('div', { class: 'li-meta', text: `${l.topic} · ${chap ? `${chap} · ` : ''}${pages(l.citation)} · ${l.readingMinutes} min` })
          ]),
          el('div', { class: 'row' }, [
            done ? tag('Completed', 'done', 'check') : tag(`+${gamify.XP_RULES.lesson} XP`, null, 'bolt'),
            saved ? tag('Saved', null, 'saved') : null,
            el('a', { class: 'btn btn-secondary btn-sm', href: `#/lesson/${l.id}` }, ['Open', icon('arrowRight', 16)])
          ])
        ]);
      }))
    ])].filter(Boolean));
  });
}

/* ------------------------------------------------------------------ reader */

export function renderLesson(view, lessonId) {
  clear(view);
  const lesson = lessonById(lessonId);
  if (!lesson) {
    view.append(el('div', { class: 'state-box is-error' }, [
      el('p', { text: 'That lesson could not be found.' }),
      el('a', { class: 'btn btn-secondary', href: '#/library', text: 'Back to the library' })
    ]));
    return;
  }

  const book = bookById(lesson.bookId);
  const state = store.load();
  const siblings = lessonsFor(lesson.bookId);
  const idx = siblings.findIndex((l) => l.id === lesson.id);
  const prev = idx > 0 ? siblings[idx - 1] : null;
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  const chap = lesson.chapterId ? chapterLabel(book, lesson.chapterId) : null;
  const era = gamify.ERAS.find((e) => e.id === lesson.era);
  const prog = bookProgress(lesson.bookId);

  const nextStep = el('div', { class: 'notice notice-done', hidden: !state.completedLessons[lesson.id], 'data-testid': 'next-step' });
  function paintNextStep() {
    clear(nextStep);
    nextStep.append(el('p', {}, [
      el('strong', { text: 'Lesson complete. ' }),
      next ? 'Next up in this book, or test what you just read.' : 'That is the last lesson indexed from this book.'
    ]));
    nextStep.append(...[el('div', { class: 'row', style: 'margin-top:.75rem' }, [
      next ? el('a', { class: 'btn btn-primary btn-sm', href: `#/lesson/${next.id}`, text: `Next: ${next.title}` }) : null,
      el('a', { class: 'btn btn-secondary btn-sm', href: '#/quiz', text: 'Daily Quiz' }),
      el('a', { class: 'btn btn-secondary btn-sm', href: '#/timeline', text: 'Timeline Challenge' })
    ])].filter(Boolean));
  }
  paintNextStep();

  const completeBtn = el('button', {
    class: 'btn btn-primary', type: 'button', 'data-testid': 'complete-lesson',
    'aria-pressed': String(!!state.completedLessons[lesson.id])
  }, [icon('check', 18), state.completedLessons[lesson.id] ? 'Completed' : `Mark complete (+${gamify.XP_RULES.lesson} XP)`]);
  completeBtn.addEventListener('click', () => {
    const s = store.load();
    if (s.completedLessons[lesson.id]) {
      store.unmarkLessonComplete(lesson.id);
      clear(completeBtn);
      completeBtn.append(icon('check', 18), `Mark complete (+${gamify.XP_RULES.lesson} XP)`);
      completeBtn.setAttribute('aria-pressed', 'false');
      nextStep.hidden = true;
      toast('Marked as not complete. XP already earned is kept.');
    } else {
      store.markLessonComplete(lesson.id, todayKey());
      gamify.award('lesson', lesson.id, { lessons: DATA.lessons.lessons });
      clear(completeBtn);
      completeBtn.append(icon('check', 18), 'Completed');
      completeBtn.setAttribute('aria-pressed', 'true');
      nextStep.hidden = false;
      paintNextStep();
      document.dispatchEvent(new CustomEvent('trident:hud'));
    }
  });

  const saveBtn = el('button', {
    class: 'btn btn-secondary', type: 'button', 'data-testid': 'save-lesson',
    'aria-pressed': String(state.savedLessons.includes(lesson.id))
  }, [icon('saved', 18), state.savedLessons.includes(lesson.id) ? 'Saved' : 'Save lesson']);
  saveBtn.addEventListener('click', () => {
    const s = store.toggleSavedLesson(lesson.id);
    const on = s.savedLessons.includes(lesson.id);
    clear(saveBtn);
    saveBtn.append(icon('saved', 18), on ? 'Saved' : 'Save lesson');
    saveBtn.setAttribute('aria-pressed', String(on));
    toast(on ? 'Lesson saved.' : 'Removed from saved lessons.');
  });

  view.append(...[
    el('nav', { class: 'breadcrumb', 'aria-label': 'Breadcrumb' }, [
      el('a', { href: '#/library', text: 'Library' }), ' / ', book.title
    ]),
    el('header', { class: 'stack' }, [
      el('div', { class: 'pill-row' }, [
        el('span', { class: 'pill', text: book.board }),
        el('span', { class: 'pill', text: `Class ${lesson.classLevel}` }),
        era ? el('span', { class: 'pill' }, [eraIcon(era.id, 13), ` ${era.label}`]) : null,
        el('span', { class: 'pill', text: `${lesson.readingMinutes} min read` })
      ]),
      el('h1', { text: lesson.title })
    ]),

    /* sticky source control */
    el('div', { class: 'source-bar', 'data-testid': 'source-bar' }, [
      icon('evidence', 18),
      el('span', { class: 'sb-book', text: book.title }),
      el('span', { class: 'hint', text: chap ? `${chap} · ${pages(lesson.citation)}` : `${pages(lesson.citation)} · chapter title not recorded in the source` }),
      el('span', { class: 'push hint', text: `Book progress ${prog.completed}/${prog.total}` })
    ]),

    el('div', { class: 'section reader-shell stack' }, [
      el('p', { text: lesson.intro }),
      el('div', { class: 'parchment' }, [
        el('span', { class: 'excerpt-mark', text: 'Verbatim excerpt from the textbook' }),
        ...lesson.excerpt.split('\n\n').map((p) => el('p', { text: p }))
      ]),
      citationBlock(lesson.citation, `${book.board}, class ${lesson.classLevel}`)
    ]),

    lesson.keyPoints && lesson.keyPoints.length ? el('section', { class: 'section keyfact' }, [
      el('span', { class: 'eyebrow', text: 'Key facts from this passage' }),
      el('ul', {}, lesson.keyPoints.map((k) => el('li', { text: k })))
    ]) : null,

    lesson.timeline && lesson.timeline.length ? el('section', { class: 'section panel' }, [
      el('h2', { text: 'Timeline' }),
      el('ul', { class: 'timeline' }, lesson.timeline.map((t) => el('li', {}, [
        el('span', { class: 't-year', text: t.year }),
        el('span', { class: 't-event', text: t.event })
      ]))),
      el('a', { class: 'btn btn-ghost btn-sm', href: '#/timeline', text: 'Try the Timeline Challenge' })
    ]) : null,

    el('div', { class: 'reader-actions' }, [completeBtn, saveBtn]),
    el('div', { class: 'section' }, [nextStep]),
    exploreBooksSection(lesson, era),

    el('nav', { class: 'reader-nav', 'aria-label': 'Lesson navigation' }, [
      prev ? el('a', { class: 'btn btn-ghost', href: `#/lesson/${prev.id}`, text: `← ${prev.title}` }) : el('span', {}),
      next ? el('a', { class: 'btn btn-ghost', href: `#/lesson/${next.id}`, text: `${next.title} →` }) : el('span', {})
    ])
  ].filter(Boolean));

  const saved = state.readingPositions[lesson.id];
  if (saved && typeof saved.scroll === 'number') {
    requestAnimationFrame(() => window.scrollTo({ top: saved.scroll, behavior: 'auto' }));
  }
  let scrollTimer = null;
  const onScroll = () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => store.setReadingPosition(lesson.id, window.scrollY), 400);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  view.addEventListener('trident:teardown', () => {
    window.removeEventListener('scroll', onScroll);
    clearTimeout(scrollTimer);
  }, { once: true });
}

/**
 * What to carry on with. A lesson genuinely left part-read always wins; after
 * that the learner's own board and class are preferred, and only then anything
 * else — so a profile changes the order of suggestions, never their existence.
 */
export function continueLesson() {
  const state = store.load();
  const positions = Object.entries(state.readingPositions)
    .sort((a, b) => new Date(b[1].at) - new Date(a[1].at));
  for (const [id] of positions) {
    if (!state.completedLessons[id] && lessonById(id)) return lessonById(id);
  }
  const unfinished = DATA.lessons.lessons.filter((l) => !state.completedLessons[l.id]);
  const ranked = profile.rank(unfinished);
  return ranked[0] || DATA.lessons.lessons[0] || null;
}

/* ==========================================================================
   Explore More Books — supplementary suggestions from Open Library
   --------------------------------------------------------------------------
   These are library records, not syllabus sources. Nothing here is cited, none
   of it becomes lesson text or quiz material, and the section says so.

   Nothing is requested until the learner opens the section: the fetch is bound
   to the <details> element's first expansion, so opening a lesson never calls
   the API and a page full of lessons never calls it at all.
   ========================================================================== */

function exploreBooksSection(lesson, era) {
  const topic = openlibrary.topicFor(lesson, era ? era.label : null);
  const body = el('div', { class: 'books-body', 'data-testid': 'books-body' }, [
    el('p', { class: 'hint', text: 'Open this section to look for related books.' })
  ]);
  let started = false;

  const details = el('details', { class: 'panel books-panel section', 'data-testid': 'explore-books' }, [
    el('summary', { class: 'books-summary', 'data-testid': 'explore-books-toggle' }, [
      icon('learn', 18),
      el('span', {}, [
        el('span', { class: 'books-title', text: 'Explore More Books' }),
        el('span', { class: 'hint', text: `Suggestions for “${topic}”` })
      ])
    ]),
    body,
    el('p', { class: 'books-attribution', 'data-testid': 'ol-attribution' }, [
      icon('info', 14),
      ` ${openlibrary.ATTRIBUTION}. These are public library records suggested by topic — they are not part of TRIDENT’s verified syllabus material, and nothing in this lesson comes from them.`
    ])
  ]);

  details.addEventListener('toggle', () => {
    if (!details.open || started) return;
    started = true;
    loadBooks(body, topic);
  });
  return details;
}

async function loadBooks(body, topic) {
  clear(body);
  body.append(el('div', { class: 'state-box', 'data-testid': 'books-loading' }, [
    el('span', { class: 'spinner' }), ' Looking for related books…'
  ]));

  const result = await openlibrary.searchBooks(topic);
  clear(body);

  if (result.status === 'offline') {
    body.append(el('div', { class: 'state-box is-error', 'data-testid': 'books-offline' }, [
      el('p', { text: 'Online book recommendations are temporarily unavailable.' }),
      el('p', { class: 'hint', text: 'The lesson above is complete and unaffected — every cited passage is stored in this application.' }),
      el('button', {
        class: 'btn btn-secondary btn-sm', type: 'button',
        onclick: () => loadBooks(body, topic)
      }, [icon('refresh', 16), 'Try again'])
    ]));
    return;
  }

  if (result.status === 'empty') {
    body.append(el('div', { class: 'state-box', 'data-testid': 'books-empty' }, [
      el('p', { text: `No books matched “${topic}” in the Open Library catalogue.` }),
      el('p', { class: 'hint', text: 'Nothing is invented to fill the gap.' })
    ]));
    return;
  }

  body.append(
    el('p', { class: 'hint', 'data-testid': 'books-status', text: result.status === 'cache'
      ? `${result.books.length} suggestion${result.books.length === 1 ? '' : 's'}, kept on this device from an earlier search.`
      : result.status === 'stale'
        ? `${result.books.length} suggestion${result.books.length === 1 ? '' : 's'} from an earlier search — Open Library could not be reached just now.`
        : `${result.books.length} suggestion${result.books.length === 1 ? '' : 's'} from Open Library.` }),
    el('ul', { class: 'book-grid', 'data-testid': 'book-grid' }, result.books.map((b) => bookCard(b, topic)))
  );
}

function bookCard(book, topic) {
  const id = openlibrary.bookId(book);
  const record = {
    id, key: book.key, title: book.title, authors: book.authors,
    year: book.year, cover: book.cover, url: book.url, topic
  };
  const byline = book.authors && book.authors.length ? book.authors.join(', ') : 'Author not recorded';

  const saveBtn = el('button', {
    class: 'btn btn-ghost btn-sm', type: 'button', 'data-testid': `save-book-${book.key.replace(/\W+/g, '')}`,
    'aria-pressed': String(store.isBookSaved(id))
  }, [icon('saved', 15), store.isBookSaved(id) ? 'Saved' : 'Save book']);

  saveBtn.addEventListener('click', () => {
    // saving a suggestion is a bookmark, never a completion — no XP is granted
    store.toggleSavedBook(record);
    const on = store.isBookSaved(id);
    clear(saveBtn);
    saveBtn.append(icon('saved', 15), on ? 'Saved' : 'Save book');
    saveBtn.setAttribute('aria-pressed', String(on));
    toast(on ? 'Book saved to your collection.' : 'Book removed from your collection.');
  });

  const blankCover = () => el('div', { class: 'book-cover is-blank', 'aria-hidden': 'true' }, [icon('learn', 26)]);
  let cover = blankCover();
  if (book.cover) {
    const img = el('img', {
      class: 'book-cover', src: book.cover, loading: 'lazy', width: 120, height: 180,
      alt: `Cover of “${book.title}” by ${byline}`
    });
    // Open Library serves a cover id that sometimes has no file behind it
    img.addEventListener('error', () => { img.replaceWith(blankCover()); }, { once: true });
    cover = img;
  }

  return el('li', { class: 'book-card' }, [
    cover,
    el('div', { class: 'book-meta' }, [
      el('span', { class: 'book-title', text: book.title }),
      el('span', { class: 'book-author', text: byline }),
      el('span', { class: 'book-year', text: book.year ? `First published ${book.year}` : 'Publication year not recorded' })
    ]),
    el('div', { class: 'book-actions' }, [
      saveBtn,
      el('a', {
        class: 'btn btn-ghost btn-sm', href: book.url,
        target: '_blank', rel: 'noopener noreferrer'
      }, ['View on Open Library', icon('arrowRight', 14)])
    ])
  ]);
}
