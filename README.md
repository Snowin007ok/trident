# TRIDENT

**Learn the Past. Shape the Future.**

An English-language interactive history-learning adventure built on verified Tamil Nadu
State Board and CBSE textbook passages. Every lesson, quiz question, story and timeline event
cites the book and page it came from.

The interface is a bright Indian heritage reading room: warm parchment and ivory surfaces,
white panels, saffron and green as the working accents, antique gold for achievement, and
navy kept for typography, navigation details, outlines and the footer. A dark night-reading
theme is available in Settings.

Learning is gamified — XP, five levels, a daily quest, six badges, six collectible artefacts,
an era journey map and a daily Timeline Challenge — but nothing is ever rewarded for activity
that did not happen.

On first run it asks what you are preparing for, and personalises what it shows you first.
See `docs/gamification-system.md` and `docs/ui-redesign-report.md`.

There is no account system: everything a learner does is kept in their own browser. The app
runs behind a small Node server of its own, which serves the application and holds the one
AI feature — the **TRIDENT Daily Briefing** on the dashboard — behind an endpoint, so the
Gemini API key stays on the machine running the server and never reaches the browser.

---

## Live demo

**https://snowin007ok.github.io/trident/**

The demo is the real application, served as static files. Choose a learning profile and
everything works: the Class 7 and Class 8 lessons with their citations, quizzes, the daily
quest, the timeline, the era journey, badges and artefacts, and the twin-fish guide.

One thing differs. GitHub Pages serves files; it cannot run the Node server, so the
`/api/daily-brief` endpoint is not there. The dashboard briefing falls back to the local
one it was built to fall back to — written from your own progress, with no AI call. For
the Gemini-written briefing and the Ask TRIDENT guide, run the app locally as below.

---

## Running it

The app uses JavaScript modules and `fetch`, so it must be served over HTTP. Opening
`index.html` from the file system will not work — browsers block module and JSON loading on
`file://`.

From this folder:

```bash
npm install
npm start
```

Then open **http://localhost:8080** in your browser.

`npm install` fetches one package, the Gemini SDK. `npm start` serves the application and the
`/api/daily-brief` endpoint on port 8080.

Press **Continue as Guest** on the welcome screen. Guest mode is the complete application.

### The Daily Briefing, and the API key

The briefing is optional. **Everything works without it** — with no key configured the
dashboard builds the same card from local templates and says so.

To switch it on, create a `.env` file beside `package.json`:

```
GEMINI_API_KEY=your-key-here
```

`.env.example` shows the shape; `.env` itself is in `.gitignore` and must never be committed.
The key is read from `process.env.GEMINI_API_KEY` on the server and nowhere else: it is not
in any HTML, JSON, JavaScript file, localStorage entry, URL or log line, and `npm run
diagnose` prints only its length, never its value.

**What is sent to Gemini.** Only an anonymous summary: the selected board and class, level,
XP total, streak, lessons-completed and lessons-available counts, quiz accuracy, the titles
and ids of at most three unfinished lessons, today's quest flags, and the title, year and
one-line description of today's Wikimedia event. **Never** the student's name, browser
history, saved books, full progress history, device information, file paths or any other
localStorage field. Gemini receives no textbook content and returns no citations.

**What Gemini is allowed to decide.** The wording of five short sentences, and which of the
three supplied lessons to recommend. Every number on the card is computed in the browser
from local state; the server rejects any sentence containing a figure it did not supply, and
any recommended lesson id that was not in its own list.

**Ask TRIDENT.** A pair of fish float at the bottom-right of every signed-in page. They are a
launcher, not a navigation tab: clicking them opens a drawer (a bottom sheet on a phone) without
changing the URL or leaving the page. Inside are four openings — *What should I study next?*,
*Explain today's historical event*, *How is my progress?*, *Quiz me on today's lesson* — a
200-character question box, and your last three questions.

It answers about four things only: your progress figures, today's mission, the lesson the
dashboard recommends, and today's Wikimedia event. Anything else is refused, including general
history questions, which belong in a lesson. It runs through the same protected endpoint, is
given the same anonymous summary and no conversation history, awards no XP, and has any answer
withheld if it contains a figure the server did not supply. Your last three questions live in
the page's memory only, so they survive neither a reload nor a look at `localStorage`.

The fish swim gently and glint now and then; they hold still while the drawer is open, and stop
entirely under `prefers-reduced-motion`. The drawer traps focus, closes on Escape, returns focus
to the fish, and announces each answer to a screen reader.

**Quota.** The briefing is generated **once per calendar date per learning profile** and
cached in `localStorage` under `trident:daily-brief:YYYY-MM-DD:PROFILE_ID`. Reloading or
revisiting the dashboard on the same day makes no request at all. One extra request is
allowed per day, through the "Refresh after my progress changed" control, and only once the
figures have actually moved. On Google's free tier that is comfortably inside the daily
limit.

**When it fails.** A missing key, an exhausted quota, a busy model or no network all produce
the same thing: the deterministic briefing, plus the line *"Personal AI briefing is
temporarily unavailable. Your progress and daily activities are still available."* No
technical error is shown and nothing retries in a loop.

A fallback is **never cached and never called "Up to date"** — it is not a briefing, and
storing one would hand you a template all day over a ten-minute outage. Instead the card
offers a live **Retry AI Briefing** button, and simply returning to the dashboard tries again.
When the guide does answer, the card is replaced in place, with no reload, and only then is it
cached for the rest of the day.

```bash
npm run diagnose   # checks the key, lists usable models, makes one real request
```

## What is in here

```
TRIDENT_APP/
├── index.html              application shell
├── README.md               this file
├── assets/
│   ├── trident-logo.png    the TRIDENT logo
│   └── trident-fish.png    the twin fish, the Ask TRIDENT companion
├── css/
│   ├── tokens.css          colour, spacing, type, shape and texture tokens
│   ├── base.css            reset, layout, header, tricolour rule, bottom nav, motion
│   ├── components.css      panels, gateways, quest, era map, quiz, passport, badges
│   └── responsive.css      desktop, tablet, mobile, print
├── js/
│   ├── app.js              bootstrap, welcome, dashboard, story, collection, settings
│   ├── router.js           hash router
│   ├── storage.js          the only module that touches localStorage (schema v4)
│   ├── profile.js          the learning profile and the personalisation it drives
│   ├── onboarding.js       the guided board / class / examination flow
│   ├── gamify.js           XP, levels, quest, badges, artefacts, eras
│   ├── icons.js            every icon, emblem, motif and artefact drawing, inline SVG
│   ├── timeline.js         the daily Timeline Challenge
│   ├── daily.js            date-driven selection (quiz, story, event)
│   ├── wikipedia.js        Wikimedia "On this day" client (one request per date)
│   ├── openlibrary.js      Open Library search client (cached, rate-limited)
│   ├── brief.js            the Daily Briefing card, and the one call that asks the guide
│   ├── companion.js        the floating twin-fish launcher and its drawer
│   ├── library.js          library browsing and the lesson reader
│   ├── quiz.js             daily quiz and story mini-quizzes
│   ├── progress.js         the Historian's Passport
│   └── ui.js               DOM helpers, modal, toast, citations, XP bar
├── data/
│   ├── library.json        12 books, chapters, class availability
│   ├── lessons.json        20 lessons with verbatim cited excerpts
│   ├── questions.json      42 hand-written questions, 5 formats
│   ├── stories.json        7 daily stories with mini-quizzes
│   └── timeline.json       18 cited events for the Timeline Challenge
├── server/                 the Node backend (never served to the browser)
│   ├── server.js           static files + GET/POST /api/daily-brief
│   ├── brief.js            validate the summary, check the briefing, fall back locally
│   ├── gemini.js           the only file that touches the SDK or the key
│   ├── diagnose.js         npm run diagnose — checks the key without printing it
│   └── config.js           the model name and every limit, in one place
├── package.json            one dependency: @google/genai
├── .env.example            GEMINI_API_KEY= (empty — never commit a real key)
└── docs/
    ├── data-export-report.md     how the data was produced and what was excluded
    ├── gamification-system.md    XP, levels, badges, artefacts, the reward ledger
    ├── ui-redesign-report.md     the visual system and how the tricolour is used
    ├── test-report.md            what was tested and how
    ├── browser-tests.mjs         the automated browser harness
    ├── server-tests.mjs          the Daily Briefing server harness (no key needed)
    └── screenshots/              eight reference screenshots
```

## Screens

| Screen | Route | What it does |
|---|---|---|
| Welcome | `#/welcome` | Logo, tagline, guest entry, honest note about accounts |
| Onboarding | `#/onboarding` | Choose a learning goal, then a board and class or an examination |
| Change path | `#/profile` | The same flow, reached from Settings, with a no-op Cancel |
| Dashboard | `#/dashboard` | Adventure header with level and XP, Today's Quest, current expedition, three learning gateways, era journey map, statistics strip, event of the day, daily story |
| Library | `#/library` | Filter by board, class, book, chapter and search term |
| Lesson reader | `#/lesson/:id` | Excerpt, key points, timeline, citation, save, complete, next/previous |
| Daily quiz | `#/quiz` | Five questions on a progress trail, optional 5-minute timer, evidence-card citations, completion summary |
| Timeline Challenge | `#/timeline` | Four cited events to arrange in order, by drag or by keyboard |
| Collection | `#/collection` | Badges, artefacts and saved items |
| Daily story | `#/story` | A cited story with a three-question mini-quiz |
| Passport | `#/progress` | Level and XP, streaks, path progress, eras, badge shelf, artefact collection, quiz trend, revision queue, recent activity |
| Settings | `#/settings` | Learning profile, theme, XP and level rules, storage and migration explanation, date preview, reset |

## Things worth knowing

**You choose a learning path first.** On first run TRIDENT asks what you are preparing
for — School Education (Tamil Nadu State Board or CBSE, then a class) or a Competitive
Examination (TNPSC, in Beta). The classes offered are read from the shipped data, with the
real lesson count beside each; a class with nothing verified yet is shown and disabled with
the reason. UPSC is listed but disabled, because the verified database contains no UPSC
material and none has been invented.

**The profile reorders, it never hides.** It sets the greeting, what you are offered to
carry on with, the library's opening filters, which questions the daily quiz prefers, which
story and which timeline events come first, and what the Passport leads with. Every other
board, class, book and saved item stays one click away, and the library says so. You can
change path at any time from Settings; changing it never deletes XP, lessons, quiz history,
badges, artefacts or saved items.

**Your existing progress is kept.** State saved by earlier versions is migrated
automatically on first load. Lessons, quizzes, streaks, saved items and selected path all
carry across, and XP is back-credited for activity already recorded — once, and only once.
Settings shows what the migration did.

**XP cannot be earned twice.** Every award is keyed by a reward id and written to a ledger
before the total changes, so reloading, revisiting or navigating backward never pays out
again. The rules are in `docs/gamification-system.md`.

**Guest progress lives in this browser only.** Completed lessons, saved items, streaks and
quiz history are stored in `localStorage` under the key `trident.state`. It survives closing
the tab and restarting the browser. It does not sync between devices or browsers, and
**clearing browser site data deletes it permanently.** This is explained inside the app, on
the Settings screen.

**The day matters.** The daily quiz, the daily story and the historical event are all chosen
from your local calendar date. The same day always gives the same five questions; the next day
gives a different set. The streak can rise at most once per date. Settings has a date preview
control if you want to see tomorrow's content today.

**Two external APIs, no keys.** The Historical Event of the Day comes from the Wikimedia
"On this day" feed, and "Explore More Books" from Open Library's public search. Neither needs
credentials, so there is nothing secret in the front-end code. Both cache their results, both
degrade to a plain message rather than inventing content, and Open Library is asked only when
a student opens the section — never during start-up, and no more than once a second.

**Nothing unverified is shipped.** The `data/` folder contains only short cited excerpts from
the 12 verified history books. The full 1,026-passage corpus stays in
`TRIDENT_DATABASE_PREP`, outside this web root, ready for a protected retrieval backend later.
See `docs/data-export-report.md`.

## TRIDENT Daily Briefing (optional, needs a Gemini key)

One AI feature, in one place: a card at the top of the dashboard that welcomes the student
back, states their progress, names one next step, explains today's Wikimedia event and sets a
mission for the day. It is not a chat window and has no question field.

Installation, the key, what is sent and what happens when it fails are all described under
[Running it](#running-it) above. What follows is the part that matters most.

### The rules it follows

- **Gemini supplies no numbers.** Lessons completed, quiz accuracy, streak and XP are
  computed in the browser from local state and rendered there as figures. The model is given
  them only so the sentence reads naturally, and the server discards any sentence containing
  a figure it did not itself supply.
- **Gemini supplies no lessons.** It may return one id, and only an id the server put in the
  prompt. The title and route the student clicks are the server's own, resolved from
  `data/lessons.json` — never the browser's and never the model's.
- **The Wikimedia event is never dressed up as a textbook.** Its year, title, image and
  Wikipedia link are rendered outside the model's text and labelled *Live historical data
  from Wikimedia*. The model may add at most two sentences of significance, visibly separate.
- **No XP.** Reading, refreshing or ignoring the briefing changes no progress value.
- **One request a day.** Cached per date and per learning profile; a second is allowed only
  through the manual refresh, and only after the figures have moved.
- **It fails quietly.** Any failure produces the deterministic card and one plain sentence.
  No status code, URL or provider message reaches the browser.

### The endpoint

```
GET  /api/daily-brief      -> { available: true | false }
POST /api/daily-brief      -> the anonymous summary in, a checked briefing out
POST /api/daily-brief/ask  -> the same summary plus one question, a scoped answer out
```

The server validates every field it is given: unknown keys are never read, text is stripped
of control characters and cut to length, counts are clamped, and a lesson id that is not in
the shipped lesson table is dropped along with whatever title or route was attached to it.
Requests are rate-limited per browser and time out; the body is capped at 8 KB.


## How this meets the assignment

**It gets something from the internet.** Two public APIs that need no key, plus
one optional keyed service:

| | Wikimedia | Open Library |
|---|---|---|
| What | The Historical Event of the Day on the dashboard | "Explore More Books" at the end of every lesson |
| Endpoint | the Wikimedia "On this day" feed | `openlibrary.org/search.json` |
| When | once per calendar date | only when the student opens the section |
| Cached as | `trident:wikimedia-event:YYYY-MM-DD`, for that date | `trident:openlibrary:TOPIC`, for seven days |
| If it fails | a cached event, else "Today's online historical event is temporarily unavailable" | cached results, else "Online book recommendations are temporarily unavailable" |

Both are isolated: everything that knows a remote service's URL and response
shape lives in one function (`requestOnThisDay` in `js/wikipedia.js`,
`requestSearch` in `js/openlibrary.js`), so either can be replaced without
touching the interface. Remote text is converted to plain text before it is
displayed — nothing from either service is ever inserted as markup.

Open Library results are **supplementary reading suggestions**, not syllabus
sources. No lesson text, quiz question or citation comes from either API.

The third is the **Daily Briefing**, which sends an anonymous progress summary
and today's Wikimedia event to Gemini and checks everything that comes back. It
is optional, needs a key you supply locally, and the application is fully usable
without it — see the section above.

**It remembers something.** Everything is in this browser's `localStorage` under
`trident.state`: the learning profile, completed lessons, saved lessons, stories,
events and books, XP and the reward ledger, badges, artefacts, streaks, quiz
history and reading positions.

**It responds to time.** The local calendar date decides the daily quiz, the
daily story, the Historical Event of the Day and the Timeline Challenge; the
streak rises at most once per date; and revision suggestions are ranked by how
long ago an answer was missed.

## Not built yet

- Cloud accounts and sync — the sign-in button opens an explanatory modal, not a fake form.
- Gemini or any other AI integration.
- Semantic search or embeddings; library search is a plain text match.
- TNPSC content of its own. The TNPSC path is marked **Beta** and reuses verified State Board
  and CBSE material. The Tamil TNPSC study materials failed text verification and are not used.
- Class 11 material. The library says **Content coming soon** for that class, because it is
  true.

## The artefact drawings

The six collectible artefacts are original abstract line drawings made for TRIDENT, written
inline as SVG in `js/icons.js`. They illustrate a *category* of object — a coin, an
inscription, a palm-leaf manuscript, a seal, a monument fragment, a navigation instrument.
They are not reproductions of any particular historical artefact, and the app says so.
