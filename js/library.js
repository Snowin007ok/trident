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

/**
 * How far through their OWN class the learner is. This is the figure the
 * header, Home and Progress all show, so they can never disagree: board and
 * class together, never the whole board.
 */
export function courseProgress(state) {
  const s = state || store.load();
  const prof = profile.current(s);
  const scope = profile.scopedLessons(prof);
  const done = scope.filter((l) => s.completedLessons[l.id]).length;
  const total = scope.length;
  return {
    done,
    total,
    percent: total ? Math.round((done / total) * 100) : 0,
    label: courseLabel(prof),
    lessons: scope
  };
}

/** "Class 7 history" — named once, and never repeated on the same screen. */
export function courseLabel(prof) {
  const p = prof === undefined ? profile.current() : prof;
  if (!p) return 'History';
  if (p.mode === 'competitive') {
    const e = profile.examByValue(p.exam);
    return `${e ? e.name : 'Exam'} practice`;
  }
  return `Class ${p.classLevel} history`;
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
  const state = store.load();
  const course = courseProgress(state);
  const rerender = () => renderLibrary(view);

  /* ---- where you are in your own class ---- */
  view.append(el('section', { class: 'course-head section', 'data-testid': 'course-head' }, [
    el('div', { class: 'course-top' }, [
      el('div', {}, [
        el('h1', { text: course.label }),
        el('p', { class: 'lede', 'data-testid': 'course-count',
          text: `${course.done} of ${course.total} lessons read — ${course.percent}% of the course.` })
      ]),
      course.done < course.total
        ? el('a', { class: 'btn btn-primary', href: `#/lesson/${(continueLesson() || {}).id || ''}`, text: 'Continue reading' })
        : el('span', { class: 'stamp stamp-done' }, [icon('check', 15), 'Course complete'])
    ]),
    railFor(course.lessons, state, 'course-rail')
  ]));

  /* ---- the chapter journey: books as waypoints on one line ---- */
  view.append(chapterJourney(state));

  /* ---- three filters, and a drawer for the rest ---- */
  view.append(filterBar(rerender));

  const results = el('div', { 'data-testid': 'library-results' });
  view.append(results);
  renderResults(results);
}

/** One segment per lesson, filled as they are read. The app's signature. */
function railFor(lessons, state, testId) {
  const nextId = (continueLesson() || {}).id;
  return el('div', {
    class: 'rail rail-lg', 'data-testid': testId || null, role: 'img',
    'aria-label': `${lessons.filter((l) => state.completedLessons[l.id]).length} of ${lessons.length} lessons complete`
  }, lessons.map((l) => el('i', {
    class: state.completedLessons[l.id] ? 'is-done' : (l.id === nextId ? 'is-now' : ''),
    title: l.title
  })));
}

/**
 * The chapter journey — the books of this class strung along one line, each
 * showing how much of it has been read. Clicking a waypoint filters to it.
 */
function chapterJourney(state) {
  const prof = profile.current(state);
  const scope = profile.scopedLessons(prof);
  const bookIds = [...new Set(scope.map((l) => l.bookId))];
  if (bookIds.length < 2) return el('div');

  return el('section', { class: 'journey section', 'data-testid': 'chapter-journey' }, [
    el('div', { class: 'section-head' }, [el('h2', { text: 'Your journey through the books' })]),
    el('ol', { class: 'journey-track' }, bookIds.map((id, i) => {
      const book = bookById(id);
      const mine = scope.filter((l) => l.bookId === id);
      const done = mine.filter((l) => state.completedLessons[l.id]).length;
      const complete = done === mine.length;
      const started = done > 0;
      return el('li', { class: `waypoint${complete ? ' is-complete' : started ? ' is-started' : ''}` }, [
        el('button', {
          type: 'button', class: 'wp-btn', 'data-testid': `waypoint-${i}`,
          'aria-label': `${book.title}: ${done} of ${mine.length} lessons read. Show only this book.`,
          onclick: () => { filters.bookId = id; filters.chapterId = 'all'; renderLibrary(document.getElementById('view')); }
        }, [
          el('span', { class: 'wp-mark', 'aria-hidden': 'true' }, [icon(complete ? 'check' : 'learn', 18)]),
          el('span', { class: 'wp-name', text: shortBookName(book) }),
          el('span', { class: 'wp-count', text: `${done}/${mine.length}` })
        ])
      ]);
    }))
  ]);
}

/** "Term I" out of "Social Science, Standard Seven, Term I (Volume 3)". */
function shortBookName(book) {
  const m = book.title.match(/Term\s+[IVX]+/i);
  if (m) return m[0];
  const parts = book.title.split(',');
  return parts[parts.length - 1].trim().replace(/\s*\(.*\)$/, '') || book.title;
}

function filterBar(rerender) {
  const classOptions = [{ value: 'all', label: 'All classes' }]
    .concat(['6', '7', '8', '9', '10', '11', '12'].map((c) => {
      const avail = DATA.library.classAvailability[c];
      return { value: c, label: `Class ${c}${avail.state === 'available' ? '' : ' — coming later'}` };
    }));
  const eraOptions = [{ value: 'all', label: 'All eras' }]
    .concat(gamify.ERAS.map((e) => ({ value: e.id, label: e.label })));

  const search = el('input', {
    type: 'search', id: 'lib-q', value: filters.q, placeholder: 'Search lessons',
    'data-testid': 'library-search'
  });
  let timer = null;
  search.addEventListener('input', (e) => {
    clearTimeout(timer);
    const v = e.target.value;
    timer = setTimeout(() => { filters.q = v; rerender(); requestAnimationFrame(() => {
      const box = document.getElementById('lib-q');
      if (box) { box.focus(); box.setSelectionRange(v.length, v.length); }
    }); }, 260);
  });

  const books = DATA.library.books
    .filter((b) => filters.path === 'all' || b.path === filters.path)
    .filter((b) => filters.classLevel === 'all' || b.classLevel === filters.classLevel);
  const selectedBook = filters.bookId !== 'all' ? bookById(filters.bookId) : null;

  const more = el('details', { class: 'more-filters', 'data-testid': 'more-filters' }, [
    el('summary', { text: 'More filters' }),
    el('div', { class: 'filter-grid' }, [
      selectField('f-path', 'Board', [{ value: 'all', label: 'All boards' }]
        .concat(DATA.library.paths.map((x) => ({ value: x.id, label: x.name }))),
      filters.path, (v) => { setPathFilter(v); rerender(); }),
      selectField('f-book', 'Book', [{ value: 'all', label: 'All books' }]
        .concat(books.map((b) => ({ value: b.id, label: b.title }))),
      filters.bookId, (v) => { filters.bookId = v; filters.chapterId = 'all'; rerender(); }),
      selectField('f-chapter', 'Chapter', [{ value: 'all', label: 'All chapters' }]
        .concat(selectedBook ? (selectedBook.chapters || []).map((c) => ({ value: c.id, label: c.label })) : []),
      filters.chapterId, (v) => { filters.chapterId = v; rerender(); })
    ])
  ]);

  const dirty = filters.path !== 'all' || filters.bookId !== 'all'
    || filters.chapterId !== 'all' || filters.era !== 'all' || filters.q;

  return el('section', { class: 'filters section', 'data-testid': 'library-filters' }, [
    el('div', { class: 'filter-row' }, [
      selectField('f-class', 'Class', classOptions, filters.classLevel,
        (v) => { filters.classLevel = v; filters.bookId = 'all'; filters.chapterId = 'all'; rerender(); }),
      selectField('f-era', 'Era', eraOptions, filters.era, (v) => { setEraFilter(v); store.setSelectedEra(v === 'all' ? null : v); rerender(); }),
      el('div', { class: 'field field-search' }, [
        el('label', { for: 'lib-q', text: 'Search' }),
        el('div', { class: 'search-wrap' }, [icon('search', 17), search])
      ])
    ]),
    el('div', { class: 'filter-foot' }, [
      more,
      dirty ? el('button', {
        class: 'btn btn-quiet btn-sm', type: 'button', text: 'Clear filters',
        onclick: () => {
          filters.path = 'all'; filters.bookId = 'all'; filters.chapterId = 'all';
          filters.era = 'all'; filters.q = '';
          store.setSelectedEra(null);
          applyProfileDefaults();
          rerender();
        }
      }) : null
    ].filter(Boolean))
  ]);
}

function renderResults(host) {
  clear(host);
  const state = store.load();
  const list = visibleLessons();

  if (!list.length) {
    const avail = DATA.library.classAvailability[filters.classLevel];
    host.append(el('div', { class: 'empty-state', 'data-testid': 'library-empty' }, [
      el('h3', { text: avail && avail.state !== 'available'
        ? `Class ${filters.classLevel} is not ready yet`
        : 'No lessons match those filters' }),
      el('p', { text: avail && avail.state !== 'available'
        ? 'Verified source material exists for this class, but its lessons are still being prepared.'
        : 'Widen the search, or go back to your own class.' }),
      el('button', {
        class: 'btn btn-primary', type: 'button', text: 'Back to my class',
        onclick: () => {
          filters.q = ''; filters.era = 'all'; filters.bookId = 'all'; filters.chapterId = 'all';
          applyProfileDefaults();
          renderLibrary(document.getElementById('view'));
        }
      })
    ]));
    return;
  }

  const byBook = new Map();
  list.forEach((l) => {
    if (!byBook.has(l.bookId)) byBook.set(l.bookId, []);
    byBook.get(l.bookId).push(l);
  });

  byBook.forEach((lessons, bookId) => {
    const book = bookById(bookId);
    const mine = lessonsFor(bookId);
    const doneAll = mine.filter((l) => state.completedLessons[l.id]).length;
    host.append(el('section', { class: 'section book-block' }, [
      el('div', { class: 'section-head' }, [
        el('h2', { text: book.title }),
        el('span', { class: 'meta', text: `${doneAll} of ${mine.length} read` })
      ]),
      el('ul', { class: 'lesson-list' }, lessons.map((l) => {
        const done = !!state.completedLessons[l.id];
        const outside = isOutsideClass(l);
        const chap = l.chapterId ? chapterLabel(book, l.chapterId) : null;
        return el('li', { class: `lesson-row${done ? ' is-done' : ''}` }, [
          el('span', { class: 'lr-mark', 'aria-hidden': 'true' }, [icon(done ? 'check' : 'learn', 18)]),
          el('a', { class: 'lr-main', href: `#/lesson/${l.id}` }, [
            el('span', { class: 'lr-title', text: l.title }),
            el('span', { class: 'lr-meta', text: chap ? `${chap}, ${pages(l.citation)}` : pages(l.citation) })
          ]),
          el('span', { class: 'lr-side' }, [
            outside ? el('span', { class: 'stamp stamp-warn', text: `Class ${l.classLevel}` }) : null,
            el('span', { class: 'lr-time', text: `${l.readingMinutes} min` }),
            done ? el('span', { class: 'stamp stamp-done', text: 'Read' }) : null
          ].filter(Boolean))
        ]);
      }))
    ]));
  });
}

/* ------------------------------------------------------------------ reader */

export function renderLesson(view, lessonId) {
  clear(view);
  const lesson = lessonById(lessonId);
  if (!lesson) {
    view.append(el('div', { class: 'empty-state' }, [
      el('h3', { text: 'That lesson is not in the library' }),
      el('p', { text: 'The link may be out of date.' }),
      el('a', { class: 'btn btn-primary', href: '#/library', text: 'Back to Learn' })
    ]));
    return;
  }

  const book = bookById(lesson.bookId);
  const state = store.load();
  const siblings = lessonsFor(lesson.bookId);
  const idx = siblings.findIndex((l) => l.id === lesson.id);
  const next = idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  const chap = lesson.chapterId ? chapterLabel(book, lesson.chapterId) : null;
  const era = gamify.ERAS.find((e) => e.id === lesson.era);
  const course = courseProgress(state);
  const done = !!state.completedLessons[lesson.id];

  /* --- mark complete: the one saffron control on this screen --- */
  const completeBtn = el('button', {
    class: `btn ${done ? 'btn-done' : 'btn-primary'} btn-block`, type: 'button',
    'data-testid': 'complete-lesson', 'aria-pressed': String(done)
  }, [icon('check', 18), done ? 'Lesson complete' : 'Mark this lesson complete']);

  const afterBox = el('div', { class: 'after-lesson', hidden: !done, 'data-testid': 'next-step' });
  function paintAfter() {
    clear(afterBox);
    afterBox.append(
      el('span', { class: 'stamp stamp-xp stamp-press' }, [icon('xp', 15), `+${gamify.XP_RULES.lesson} XP`]),
      next
        ? el('a', { class: 'btn btn-primary', href: `#/lesson/${next.id}`, text: 'Next lesson' })
        : el('a', { class: 'btn btn-primary', href: '#/quiz', text: 'Answer today\u2019s questions' })
    );
  }
  paintAfter();

  completeBtn.addEventListener('click', () => {
    const s = store.load();
    if (s.completedLessons[lesson.id]) {
      store.unmarkLessonComplete(lesson.id);
      clear(completeBtn);
      completeBtn.className = 'btn btn-primary btn-block';
      completeBtn.append(icon('check', 18), 'Mark this lesson complete');
      completeBtn.setAttribute('aria-pressed', 'false');
      afterBox.hidden = true;
      toast('No longer marked complete. The XP you already earned is kept.');
    } else {
      store.markLessonComplete(lesson.id, todayKey());
      gamify.award('lesson', lesson.id, { lessons: DATA.lessons.lessons });
      clear(completeBtn);
      completeBtn.className = 'btn btn-done btn-block';
      completeBtn.append(icon('check', 18), 'Lesson complete');
      completeBtn.setAttribute('aria-pressed', 'true');
      afterBox.hidden = false;
      paintAfter();
      document.dispatchEvent(new CustomEvent('trident:hud'));
    }
    document.querySelectorAll('[data-testid="reader-rail"] i').forEach((seg, i) => {
      const l = course.lessons[i];
      if (l) seg.className = store.load().completedLessons[l.id] ? 'is-done' : (l.id === lesson.id ? 'is-now' : '');
    });
  });

  const saveBtn = el('button', {
    class: 'btn btn-ghost btn-sm', type: 'button', 'data-testid': 'save-lesson',
    'aria-pressed': String(state.savedLessons.includes(lesson.id))
  }, [icon('saved', 16), state.savedLessons.includes(lesson.id) ? 'Saved' : 'Save']);
  saveBtn.addEventListener('click', () => {
    const s = store.toggleSavedLesson(lesson.id);
    const on = s.savedLessons.includes(lesson.id);
    clear(saveBtn);
    saveBtn.append(icon('saved', 16), on ? 'Saved' : 'Save');
    saveBtn.setAttribute('aria-pressed', String(on));
    toast(on ? 'Lesson saved to your collection.' : 'Removed from your collection.');
  });

  const outside = isOutsideClass(lesson);

  view.append(el('article', { class: 'reader', 'data-testid': 'reader' }, [
    /* --- where this sits: one line, no repeated board and class --- */
    el('div', { class: 'reader-top' }, [
      el('a', { class: 'back-link', href: '#/library' }, [icon('left', 16), 'Learn']),
      el('span', { class: 'reader-time', text: `${lesson.readingMinutes} min read` }),
      saveBtn
    ]),

    outside ? el('p', { class: 'stamp stamp-warn', 'data-testid': 'outside-class' },
      [icon('info', 15), `This lesson is from Class ${lesson.classLevel}, not your own class.`]) : null,

    el('h1', { class: 'title-serif reader-title', text: lesson.title }),

    el('div', { class: 'reader-rail' }, [
      el('div', { class: 'rail-legend' }, [
        el('b', { text: course.label }),
        el('span', { 'data-testid': 'reader-progress', text: `${course.done} of ${course.total} lessons` })
      ]),
      el('div', {
        class: 'rail', 'data-testid': 'reader-rail', role: 'img',
        'aria-label': `${course.done} of ${course.total} lessons in this class complete`
      }, course.lessons.map((l) => el('i', {
        class: state.completedLessons[l.id] ? 'is-done' : (l.id === lesson.id ? 'is-now' : ''), title: l.title
      })))
    ]),

    el('p', { class: 'reader-intro', text: lesson.intro }),

    el('div', { class: 'passage', 'data-testid': 'passage' },
      lesson.excerpt.split('\n\n').map((para) => el('p', { text: para }))),

    el('p', { class: 'passage-note', text: 'Quoted word for word from the textbook.' }),

    lesson.keyPoints && lesson.keyPoints.length ? el('section', { class: 'key-ideas' }, [
      el('h2', { text: 'Key ideas' }),
      el('ul', {}, lesson.keyPoints.map((k) => el('li', { text: k })))
    ]) : null,

    /* --- the source, compact on the surface and complete inside --- */
    el('details', { class: 'source', 'data-testid': 'source' }, [
      el('summary', {}, [
        icon('evidence', 16),
        el('span', { class: 'src-line', text: `${shortBookName(book)}, ${pages(lesson.citation)}` }),
        el('span', { class: 'src-more', text: 'View source' })
      ]),
      el('dl', { class: 'src-detail' }, [
        el('dt', { text: 'Book' }), el('dd', { text: book.title }),
        el('dt', { text: 'Chapter' }), el('dd', { text: chap || 'Not recorded in the source' }),
        el('dt', { text: 'Pages' }), el('dd', { text: pages(lesson.citation) }),
        el('dt', { text: 'Board' }), el('dd', { text: `${book.board}, class ${lesson.classLevel}` }),
        el('dt', { text: 'Passage' }), el('dd', { class: 'src-id', text: lesson.citation.passageId || 'n/a' })
      ])
    ]),

    /* --- one quick check, then the one action --- */
    el('div', { class: 'check-host', 'data-testid': 'lesson-check' }),

    el('div', { class: 'reader-finish' }, [completeBtn, afterBox]),

    era ? exploreBooksSection(lesson, era) : null
  ].filter(Boolean)));

  /* --- a reading position is restored only when it is worth restoring:
     the learner genuinely stopped part-way and has not finished the lesson --- */
  const saved = state.readingPositions[lesson.id];
  if (!done && saved && typeof saved.scroll === 'number' && saved.scroll > 240) {
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
  // the learner's own class comes first and is exhausted before anything else
  // is offered, so Home never quietly hands a Class 7 student another class's
  // lesson without saying so
  const mine = profile.scopedLessons().filter((l) => !state.completedLessons[l.id]);
  if (mine.length) return profile.rank(mine)[0] || mine[0];
  const unfinished = DATA.lessons.lessons.filter((l) => !state.completedLessons[l.id]);
  return profile.rank(unfinished)[0] || null;
}

/** True when a lesson sits outside the learner's own board and class. */
export function isOutsideClass(lesson) {
  const strict = profile.strictFn();
  return !!(strict && lesson && !strict(lesson));
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
