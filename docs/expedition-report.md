# TRIDENT — Your History Expedition

This extends the existing app. It does not rebuild it. Lessons, citations,
quizzes, stories, timelines, profiles, XP, streaks, badges, saved items, the
Gemini briefing and guide, and every stored learner record are unchanged. The
data files that hold them (`lessons.json`, `library.json`, `questions.json`,
`stories.json`, `timeline.json`) are byte-identical to before. The `APP DATABASE`
folder, the trusted chunk files and the source PDFs were not modified.

## What a student sees in the first ten seconds

The **Today's Expedition** panel on Home answers the four questions at once:

| Question | Answer on screen |
|---|---|
| What is today's mission? | "The Medieval India expedition", for their board and class |
| How long is it? | "3 short activities · about 5 minutes" (2 + 2 + 1 minutes, the real task lengths) |
| What do I get? | "earn up to 150 XP" |
| Where did I stop? | *Continue your journey*: the illustrated chapter card, "2 of 10 chapters explored", the book and pages |

There is one saffron button: **Start today's 5-minute mission** for a new day,
**Continue your expedition** once it has started. One tap opens the first
activity. Once the mission is done, the panel says "Today's mission is complete"
and the button takes the student to their next lesson.

Under the panel, from top to bottom:

- **Today in History** (Wikimedia)
- **Mission route**: Story → Quiz → Event → Reward. Each checkpoint shows an
  icon, time, XP, state and action on one connected route.
- **Next badge**
- **Ask TRIDENT**

## Visual system

- **Palette:**
  - Colours keep their jobs: saffron starts or continues, green means finished,
    teal means explore or external, gold means reward.
  - Sky `#DCEEF5` is new. It is the wash behind the progress route and the
    Today in History panel.
- **Type:** mission title 40–52px, page titles 36–48px, sections 24–30px,
  cards 17–21px, body 16–18px, metadata 13–14px minimum.
- **Progress:** now reads in words, e.g. "2 of 10 Class 7 chapters explored",
  on an era route: *explored*, *you are here*, *started*, *not started yet*.
  - "You are here" is the era of the lesson Home offers next.
  - The percentage is still there for screen readers.
- **Motion:** each moment happens once, in response to the student:
  - a checkpoint fills;
  - XP counts up (650 ms);
  - a badge is revealed;
  - a saved image moves into the Visual Archive.

  Reduced motion turns all of these off.

## Images

### Textbook images

| | |
|---|---|
| Images inside the cited page ranges | 226 |
| After size, repeat and shape filters | 89 |
| Accepted after review by eye | **62** |
| Rejected, with reasons recorded | 13 (decorations, logos, whole pages, unreadable) |
| Not selected (duplicates or weak) | 14 |
| Stored as | WebP, max 1200px wide, 2.2 MB in total, 35 KB on average |
| Source PDFs | SHA-256 identical before and after |

What these images cover:

- **Lessons:** 25 of 30 have a lead image.
  - Five have none: `l-tn10-plassey-wealth`, `l-tn8-plassey`, `l-tn8-revenue`,
    `l-tn9-arikkamedu` and `l-tn9-industrial`.
  - In four of them, the cited pages held no usable picture. The fifth had
    candidates, and none passed review.
- **Stories:** 4 of 7 have an image.
- **Timeline events:** 8 of 18 show a thumbnail.
- **How stories and events are matched:** only when an image comes from the
  same book and overlapping pages as their own citation. Nothing is guessed.

Every textbook image is labelled **Verified textbook image**, with the book and
pages beneath it. It appears in:

- the dashboard hero;
- the lesson, large, with a keyboard-accessible enlarged view;
- the story;
- the timeline answers, after the student checks their order;
- onboarding;
- the Visual Archive.

### Wikimedia Commons (the external source)

A lesson has a **More pictures from Wikimedia Commons** drawer. How it behaves:

- **When it asks:** nothing is requested until the drawer is opened.
- **What is kept:** a record is shown only if it has a thumbnail, a source
  page, a licence and a licence link.
- **How many:** at most six.
- **Caching:** kept for seven days (`trident:commons:TOPIC`). One request goes
  out per topic, however many times it is asked for.
- **Labelling:** every picture is tagged *Wikimedia Commons*, with its source
  page and licence linked. None is ever called a textbook image.
- **When Commons can't be reached:** the drawer says so and offers
  **Try again**. The lesson is unaffected.

### Europeana (optional)

Europeana is reached only through the server, at `GET /api/images/europeana`.
The server reads `EUROPEANA_API_KEY` from its environment. No key is set here,
so the route answers 501 and the app carries on with Commons alone.

### Catalogue

`data/history-images.json` holds the full record schema, the review counts and
the rejection reasons. Only records with `verified: true` and complete
provenance are ever shown. A failed image is replaced by a drawn motif, never a
broken frame.

## Companion

The launcher keeps its idle float, gold glint and single leap on hover, and gains a slow ripple ring every few seconds. Reduced motion stops all of them.

The drawer now opens with a **today** block:

- today's progress ("2 of 10 chapters explored, 0 of 3 of today's activities
  done");
- the recommended next activity, as a link;
- the state of today's event.

Its fourth suggested question names the student's next lesson.

## Onboarding

Onboarding ends on **Your first expedition is ready**, with a picture from the
first lesson's own textbook and **Start your first expedition**.

## Security

- The Gemini key is still read only from `process.env.GEMINI_API_KEY`.
- The Europeana key is read only from `process.env.EUROPEANA_API_KEY`, on the
  server.
- `.env.example` lists both, empty.
- Check 28 scans every served file for key names and key-shaped strings, and
  finds none.

## Files changed

| File | Change |
|---|---|
| `js/images.js` | **new** — catalogue, figure, motif, lightbox, Commons search, Europeana client |
| `server/europeana.js` | **new** — keyed proxy, filtering, cap, cache, timeout |
| `server/server.js` | `GET /api/images/europeana` (501 without a key, rate limited) |
| `data/history-images.json` | **new** — 62 records and the review log |
| `assets/history/textbooks/` | **new** — 62 WebP images |
| `js/app.js` | expedition hero, journey card, mission route, XP count-up, Visual Archive, story image |
| `js/gamify.js` | per-task minutes, actions and sources; next reward |
| `js/library.js` | lesson image; Commons drawer |
| `js/timeline.js` | thumbnails on revealed answers |
| `js/progress.js` | progress in words; era route |
| `js/onboarding.js` | "Your first expedition is ready" |
| `js/companion.js` | today block and suggestions |
| `js/storage.js` | schema v6: `savedImages`, with v5 → v6 migration |
| `js/ui.js` | badge reveal |
| `css/*.css` | sky token, type scale, expedition, route, image, archive, era-route and companion-ripple styles |
| `docs/redesign-checks.mjs` | check 21 rewritten; checks 25–31 added |
| `docs/server-tests.mjs` | B34: Europeana without a key |
| `README.md`, `.env.example` | image sources and the optional key |

## Test results

**`npm run test:ui` — 31 of 31 checks pass** at 1440, 768 and 375px. The new
checks:

| Check | What it proves |
|---|---|
| 25 | One dominant button, and one tap starts the mission |
| 26 | Every image has attribution and alt text, and none is broken |
| 27 | Every textbook image carries its book and pages; the PDFs are recorded as unchanged |
| 28 | No API key reaches the browser |
| 29 | A reward is paid once: asked for twice, it pays 30 XP, then 0 |
| 30 | Commons results are filtered, capped at six, cached and deduplicated |
| 31 | The Commons drawer asks only when opened, and labels every picture with its licence, never as a textbook image |

The earlier 24 checks still pass. These include:

- WCAG AA contrast, measured on every text node;
- 44px targets;
- keyboard reach;
- reduced motion;
- no overflow;
- no console errors;
- stored progress untouched: 2 lessons, 280 XP, a 3-day streak.

**`npm test` — 36 of 36** server checks pass. That is the 35 from before plus
the new Europeana check.

## Screenshots (`docs/screenshots/expedition/`)

1. First visit, Home
2. Returning learner, Home
3. Completed mission
4. Lesson with its textbook image
5. Today in History with the API blocked
6. The API failure on Home
7. Mobile (375px)
8. Companion open
9. Visual Archive
10. Progress route
11. Onboarding ending on the first expedition
12. The lesson's Commons drawer, filled with **stand-in records** (see below)

## Limitations — stated plainly

- **I can't show a live Wikimedia picture.** Neither this sandbox nor the
  development machine's shell can reach Wikimedia, because of network policy.
  - Screenshots 5 and 6 show the real failure path.
  - Screenshot 12 and checks 30–31 use stand-in responses in the documented
    Commons shape. The thumbnails in them are the app's own textbook images,
    reused as layout filler and captioned "test fixture".
  - This proves the filtering and labelling logic. It does not prove Commons
    is reachable from a given school network.
- **Europeana is unconfigured,** so the route returns 501 until a key is set
  on a server. GitHub Pages has no server, so the hosted site uses Commons
  only.
- **Five lessons have no lead image** (listed above). Nothing is shown rather
  than an unrelated picture.
- **Reuse rights for the textbook images** rest on the rights you told me this
  project holds. Each image is credited to its book and pages.
