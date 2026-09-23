# TRIDENT visual redesign — a bright Indian heritage interface

> **Revision 2 (22 September 2026).** The first pass of this redesign was
> correct in structure but wrong in weight: it was still a dark navy
> application. The interface has since been rebuilt around warm parchment,
> ivory and white, with saffron and green as the working accents and navy
> confined to typography, navigation details, outlines and the footer. Section 0
> records the new colour system and the measured result; the rest of the
> document describes the structure, which is unchanged.

## 0. Colour balance — the correction

### Default surfaces

```
--page-background: #F7F1E4     --surface-primary:   #FFFFFF
--surface-secondary: #F2E5CB   --surface-saffron:   #FFF0DC
--surface-green: #E5F2E7

--india-saffron: #FF9933   --india-green:    #138808   --chakra-navy: #172B4D
--heritage-gold: #C9952E   --terracotta:     #B95F42   --peacock:     #167D7F
--text-primary:  #172632   --text-secondary: #52616B   --border-neutral: #D8CDBA
```

Flag saffron and green, heritage gold, terracotta and peacock are used exactly
as specified — for buttons, borders, markers and progress — with their pale
tints (`--surface-saffron`, `--surface-green`) carrying the larger backgrounds.
Because those mid-tones cannot carry small text on a light surface, each has a
darkened partner used wherever the colour becomes words: `--saffron-text
#9A4E00`, `--green-text #0C6606`, `--gold-text #7A5810`, `--terracotta-text
#9A4326`, `--peacock-text #0D6C6C`. Every pair clears 4.5:1 on white, on
parchment and on its own tint, which the contrast test verifies on every screen.

### Where each surface is used

| Area | Surface |
|---|---|
| Page | warm parchment `#F7F1E4` with a muted-gold map and contour texture |
| Adventure header | ivory → parchment, gold hairline |
| Today's Quest | white, saffron left edge, saffron header, green completed rows |
| Current expedition | parchment folio |
| Learning gateways | pale saffron / white / pale green, one each |
| Era journey and learning-path progress | pale green |
| Statistics strip | pale green |
| Daily Story | white with gold rules and kicker |
| Historical Event | pale green with a peacock edge |
| Timeline Challenge | parchment board, white cards, tricolour threads |
| Lesson reader | parchment page, ink text, gold chapter marks, saffron key facts, pale-green completion panel |
| Historian's Passport | ivory pages, navy cover strip, gold border, saffron milestone edge, green achievements |
| Citation / evidence cards | warm ivory with a navy border |
| Navigation | white to ivory, navy text, saffron active item, tricolour rule beneath |
| Footer, mobile bottom bar | navy — the only large dark areas |

### Gamification colours

XP bar segmented saffron / ivory / green in a parchment trough · level medallion
gold with navy text · completed quests green with a check · current quest saffron
· locked quests neutral parchment-grey with a dashed border · earned badges gold
with a restrained tricolour ribbon · locked badges a neutral dashed outline only
· correct answers pale green · incorrect answers pale muted red · citation cards
warm ivory with a navy border.

### Measured result

The distribution was measured by rendering five full pages (dashboard, quiz,
Passport, library, collection) in headless Chromium, decoding the PNGs and
classifying every second pixel by hue, saturation and lightness:

| Bucket | Target | Measured |
|---|---:|---:|
| Warm ivory and parchment | 55% | **53.0%** |
| White | 18% | **23.7%** |
| Saffron (flag and pale tint) | 10% | **9.4%** |
| Green (flag and pale tint) | 8% | **6.4%** |
| Navy | ≤ 15% | **4.9%** |
| Gold, terracotta and other supporting | — | 2.6% |

Navy sits far below its ceiling: it survives as type, rules, outlines, the
footer and the mobile bar, and nowhere as a page background. Green runs slightly
under target because green in this system *means* completion — quest rows, era
markers, achievements — so its share grows with the learner's own progress
rather than being painted on. On a fresh account there is little to mark
complete, and the Historical Event panel, which is pale green, cannot load in
the test environment.

### The dark theme

The previous navy interface is kept intact as an opt-in night reading theme
under `[data-theme="dark"]`, switchable in Settings. Schema v3 re-points the
stored theme preference at the new default once; it touches nothing else.

## The problem this addresses

The first prototype worked but looked like a generic admin dashboard: every
section was the same navy rounded rectangle, four oversized statistic boxes
dominated the top of the dashboard, the learning paths were business product
cards, and there was no journey, mission, achievement or reward anywhere. It
presented information. It did not invite anyone to play.

Nothing about the underlying data, routes, citations or storage was wrong, so
none of it was rebuilt. The redesign is a new visual and interaction layer over
the same verified content.

---

## 1. Foundations

**Colour.** Deep ink-blue foundations, warm parchment reading surfaces, tricolour
accents for structure, antique gold for achievement.

```
--ink #071923   --navy #0E2A3B      --navy-raised #16384B
--parchment #F5E8D0   --parchment-deep #E8D3AC   --ivory #FFF9ED
--india-saffron #FF9933   --india-white #FFFFFF   --india-green #138808
--chakra-navy #000080   --gold #F2B84B
--terracotta #C65F43   --peacock #168C8C   --indigo #566BC6
--success #3D9B69   --danger #C94F4F
--ink-text #172632   --muted-light #B8C8D0
```

Saffron and green at their exact flag values do not reach 4.5:1 against the navy
surfaces, so the palette adds **text-safe variants** — `--saffron-text #FFB05C`,
`--green-text #5FC98C`, `--peacock-text #3FC0C0`, `--danger-text #F09090` — used
wherever those colours carry words. The flag values themselves are used for
fills, bars, rules and borders, where contrast rules do not apply. Every text
and background pair in the app was measured; the result is in the test report.

**Typography.** An editorial serif (Iowan/Palatino/Georgia stack) for headings,
titles, XP figures and era names; a clean system UI sans for interface text; a
monospace face for numbers, dates and page citations, so a figure never reads as
prose.

**Texture.** Three inline-SVG textures used at low opacity and never as
decoration for its own sake: a faint map grid behind the page, contour lines
behind the passport header, a paper fibre grain on parchment reading surfaces.

**Shape.** The app deliberately stops using one rounded rectangle for everything:

- `--clip-folio` — cut top-left and bottom-right corners, for reading folios
- `--clip-notch-tl` / `--clip-notch-br` — a single notched corner, for gateways
- circular medallions for badges, and a pill for the XP track
- square-cornered panels with a gold hairline for editorial sections

## 2. The tricolour, used as structure

The tricolour appears in exactly three roles, all structural:

1. **The navigation rule** — a 3px saffron/white/green line under the header,
   built from three flex bands. Horizontal, never rotated, never animated.
2. **The journey threads** — three low-contrast threads behind the adventure
   header and behind the Timeline Challenge board, which converge into one navy
   line when the challenge is solved.
3. **The XP bar and the badge ribbon** — the experience track fills in three
   segments (saffron, ivory, green) inside a navy trough; an earned badge carries
   a small tricolour ribbon at its corner.

**What is deliberately not done**, in line with the brief:

- the national flag is never used as a page background, button, loading
  indicator or game token;
- no flag is rotated, torn, distorted or animated;
- no text is placed over a literal flag;
- no Ashoka Chakra is drawn — `--chakra-navy` is used only as a selection
  outline colour, never to render an inaccurate wheel;
- no tricolour appears on a failed, damaged or locked state — locked badges and
  artefacts are rendered in muted grey;
- saffron and green are accents on a navy and parchment base, not the dominant
  colours;
- nothing in the interface suggests TRIDENT is an official government product;
  the footer states it is a local prototype.

## 3. Dashboard

| Before | After |
|---|---|
| "Good morning" greeting | **Adventure header** — level emblem, level name as the page heading, segmented XP bar, streak, and one clear mission with a single primary action |
| Four oversized statistic boxes | **Compact statistics strip** — four figures in one bordered row, below the fold |
| Three identical path cards | **Three learning gateways**, each with its own silhouette, colour and motif |
| — | **Today's Quest** panel: three real tasks, XP each, a done stamp, and an honest reward line |
| — | **Current expedition**: the book in progress, percentage complete, lessons done, reading time left, and a drawn path |
| — | **Era journey map**: Origins → Ancient India → Medieval India → Colonial India → Independence, each node showing real lesson counts, clicking through to a filtered library |
| — | **Mobile bottom navigation**: Home, Learn, Quest, Saved, Progress |

The three gateways are visually distinct rather than recoloured copies:

- **Tamil Nadu State Board** — notched top-left, saffron rule, terracotta warmth, a temple-and-river motif
- **CBSE** — square corners, indigo rule on ivory, an archive-box motif
- **TNPSC Preparation** — notched bottom-right, green rule, peacock teal, a globe motif, and a Beta tag with an honest explanation of what is and is not indexed

## 4. Daily Quiz

A five-step progress trail replaces a bare list. Each question carries its
number, its format, its topic, its era and its class. The selected answer takes
a heavy navy outline rather than a faint tint. After submission every question
shows its explanation and its citation **as an evidence card** — a document icon,
the label "Evidence", the book, chapter and page — so the source reads as proof
rather than as a footnote.

Feedback colours: current question saffron, selected answer navy outline, correct
green with a check and the words "Correct answer", incorrect muted red with the
explanation, unanswered ivory with a navy border.

There are **no lives** and nothing is locked after a mistake. The timer is
optional, can be started once, and when it expires it records the attempt as
timed out without taking anything away. A perfect score triggers a short,
restrained shower of saffron, ivory, green and gold slips, which is skipped
entirely when the viewer prefers reduced motion.

The completion summary gives the score, the percentage, the XP breakdown, the
streak change, and a "worth another look" list of the questions that were missed.

## 5. Lesson reader

Rebuilt as an exploration page: breadcrumb, board/class/era/reading-time pills,
a **sticky source bar** that keeps the book, chapter, page citation and book
progress visible while scrolling, the verified excerpt on a parchment surface
with a fibre grain, key facts in a gold-ruled callout, a timeline strip that
links into the Timeline Challenge, and a next-step panel that appears when the
lesson is completed.

## 6. Daily Story and Event of the Day

Deliberately different treatments, so the two never read as the same component.
The **story** is a warm parchment folio with cut corners, a kicker, a serif title
and a reading time. The **event** is a cool navy card with a peacock rule, a
large year, the Wikipedia image beside the text, and its source line. The event
keeps its original behaviour exactly: the Wikimedia "On this day" fetch, the
per-date cache, the graceful offline state that invents nothing, and the image
placeholder when an article has no thumbnail.

## 7. Historian's Passport

The progress page is now a record rather than a report: a passport header with
the level emblem, level name, XP bar and streak; a compact five-figure strip;
learning-path bars; era completion; the badge shelf; the artefact collection; a
ten-day quiz trend drawn as plain HTML and CSS columns with a full text
alternative; the revision queue; strong topics; recent activity; quiz history;
and saved items. No chart library is used.

## 8. Motion

Six short animations, all 260–700ms, all meaningful: a panel rise on first paint,
a stamp for a completed quest, a pulse on a correct answer, a reveal for a newly
recovered artefact, the confetti, and the spinner. A single
`@media (prefers-reduced-motion: reduce)` block reduces every animation and
transition to a millisecond and hides the confetti outright; the quiz also checks
the same media query in JavaScript and never creates the confetti nodes at all.

## 9. Accessibility

- All text meets WCAG AA (4.5:1, or 3:1 for large text) — measured across eight
  routes in the test suite.
- The header carries a `role="status"` live region; every XP award, badge unlock
  and artefact recovery is announced through it as well as shown.
- The Timeline Challenge has keyboard controls that do exactly what drag and drop
  does, with each move announced and focus following the moved card.
- Every form control is labelled; every image has alt text; there is one `h1`
  per view; the skip link is preserved.
- The bottom navigation is a labelled `<nav>`; the current page is marked with
  `aria-current`.
- Progress bars carry `role="progressbar"` with real values, and the trend chart
  carries a full text description of every column.

## 10. Files changed

**Rewritten:** `index.html`, `css/tokens.css`, `css/base.css`,
`css/components.css`, `css/responsive.css`, `js/app.js`, `js/ui.js`,
`js/storage.js`, `js/library.js`, `js/quiz.js`, `js/progress.js`.

**New:** `js/icons.js`, `js/gamify.js`, `js/timeline.js`, `data/timeline.json`,
`docs/gamification-system.md`, `docs/ui-redesign-report.md`,
`docs/screenshots/`.

**Extended, additively:** `data/lessons.json` — an `era` field on each of the
twenty lessons, plus a note recording how eras were assigned. Every title,
excerpt and citation is byte-for-byte unchanged.

**Updated:** `docs/browser-tests.mjs`, `docs/test-report.md`, `README.md`.

**Untouched:** `js/router.js`, `js/daily.js`, `js/wikipedia.js`,
`data/library.json`, `data/questions.json`, `data/stories.json`,
`assets/trident-logo.png`, and every file in the source database and the
original PDF library.


---

## 11. The learning-profile flow (added 22 September 2026)

A learner now chooses what they are preparing for before the application opens,
and can change that choice at any time from Settings.

**The steps.** Goal (School Education / Competitive Examination) → board and
class, or examination → confirmation. Each step is a page with one `h1`, a
numbered progress row, large selection cards and a *Go back* control. Focus
moves to the new step's heading, and each selection is announced through the
same live region the XP system uses.

**The cards are real buttons**, so they are focusable and operable by keyboard
with no extra handling. Selection is carried by `aria-pressed`, a heavier border,
a tick and the word "Selected" — never by colour alone. A disabled card states
why it is disabled, in text, linked with `aria-describedby`.

**Classes come from the data, not from a list.** For each board the flow reads
`data/library.json` and `data/lessons.json` and offers only classes that board
genuinely has, with the real lesson count beside each. A class with books but no
verified, indexed passage is shown and disabled with that explanation. Class 11
is always shown, disabled, labelled *Content coming soon*. Class 12 for CBSE is
selectable and labelled *Limited coverage*. TNPSC is offered as *Beta* with an
honest note about what it draws on; UPSC is shown, disabled and labelled
*Coming Soon*, because the verified database contains no UPSC material — no
UPSC lesson or question has been invented.

**During first-time setup the app's own navigation is not offered.** The header
keeps only the wordmark and the tricolour rule, and the dashboard route bounces
back to the flow until a profile exists.

**What the profile changes.** It reorders; it never hides. The greeting, the
current-expedition recommendation, the library's default board and class filter,
the daily quiz's question preference, the daily story, the Timeline Challenge's
event preference, the Passport's own-path panel and the revision queue all lead
with the learner's path. Every board, class, book and saved item remains
reachable — the library still offers every option and a *Show everything*
control, and says so in a notice on the page.

**Changing path never touches progress.** `storage.setLearningProfile()` writes
only the profile fields. The change flow shows the warning the brief specifies,
offers *Save New Path* and *Cancel*, and cancelling is a true no-op.

**Storage.** Schema v4 adds `learningProfile` and nothing else. Existing
learners arrive with it null, are sent through the flow once, and are never
redirected again; their XP, lessons, quizzes, streaks, badges, artefacts and
saved items are carried across untouched and nothing is re-credited.

---

## 12. The two external APIs (added 22 September 2026)

Both live services sit inside the existing parchment-and-tricolour system and
both are built the same way: one function owns the remote URL and the response
mapping, everything remote is converted to plain text before it can reach the
DOM, and every failure has a stated message rather than an invented answer.

### Historical Event of the Day — Wikimedia

On the dashboard, in the pale-green editorial card with a peacock edge. It shows
the year, the event in one sentence, the article image when there is one,
Wikipedia attribution, a "Read on Wikipedia" link that opens in a new tab with
`rel="noopener noreferrer"`, and the line *Live data from Wikimedia · loaded for
Tuesday, 22 September 2026*.

The date is the learner's own calendar day, and the event is picked
deterministically from it, so the card does not reshuffle on every reload. A
success is stored under `trident:wikimedia-event:YYYY-MM-DD` and served from
there for the rest of that date, so there is at most one successful request per
day; requests for the same date that overlap share one call. If the request
fails the cached event is used, and if nothing is cached the card says
*"Today's online historical event is temporarily unavailable"* and offers to try
again. The +20 XP control only exists on a card built from a real event, so a
failure can never pay out.

`js/wikipedia.js` keeps the endpoint and the transformation inside
`requestOnThisDay()`. Wikifeeds routes have been retired before; when this one
moves, that function is the only thing to rewrite.

### Explore More Books — Open Library

A collapsed panel at the end of every lesson, with a peacock edge to mark it as
supplementary rather than cited. Nothing is requested until the learner opens it
— the fetch is bound to the panel's first expansion, so opening a lesson, or a
library full of lessons, calls nothing.

The search topic is built from lesson metadata only — the lesson's own topic and
title, with the era appended — capped at a few words. The textbook passage is
never sent. Results are capped at six, cached for seven days under
`trident:openlibrary:TOPIC` using a normalised topic, spaced at least a second
apart, and a topic already in flight is shared rather than requested twice.

Each result shows its cover (or a marked placeholder when Open Library has none,
including when the cover file 404s), title, author, first publication year, a
"View on Open Library" link and a "Save book" control. Saved books live in their
own `savedBooks` store, appear in the Collection's Saved items, and grant no XP —
a recommendation is not a completed lesson. The panel's footer states *Book
discovery powered by Open Library* and says plainly that these are public library
records, not part of TRIDENT's verified syllabus material.

States, for both: loading, loaded, empty results, offline and error. None of them
shows a URL, a status code or raw JSON.

---

## 13. Ask TRIDENT (added 22 September 2026)

An indigo-edged panel between the lesson's completion notice and Explore More
Books — the third and last panel on a lesson page, and the only one that is not
part of the verified content itself.

It carries a standing label, `AI explanation based only on verified TRIDENT
textbook passages`, in a bordered strip above the question field, so the claim is
visible before anything is asked rather than only after an answer appears. Three
suggested questions are built from the lesson's own topic and its first key fact.
The field stops at 300 characters and a monospace counter shows the count.

An answer renders as an *Explanation* block on the sunken surface with an indigo
rule, followed by its sources in warm-ivory citation rows with navy borders — the
same treatment the quiz uses for evidence, so a cited source looks the same
wherever it appears. Underneath, a second line repeats that this is an
explanation and not a quotation, and points back to the verbatim passage above
it. A suggested follow-up, when there is one, sits below in muted text.

Five states are drawn: loading, answered, insufficient evidence (a saffron notice
beginning "Not enough verified evidence"), an error notice, and unavailable. The
last of these is what a student sees whenever the Node server is not running,
which is the default way this application is opened — so the panel's most common
state is the one that says, plainly, that every lesson, citation, quiz and story
on the page works exactly as usual and this panel is the only thing switched off.
When that is the case the question field and the suggestions are hidden entirely
rather than left to fail on use.

Nothing in the panel writes to storage. Asking a question grants no XP, completes
no lesson and saves nothing, which the browser suite checks by comparing the
whole stored state before and after a question.
