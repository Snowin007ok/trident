# TRIDENT — final UX pass

The four-part navigation and the simplified layouts were left alone. This pass
fixes what was still wrong and adds the small amount of history-specific
character the interface was missing.

## 1. Every progress indicator

The bug: the rail marked the *next* lesson with a saffron fill. At 0% that
painted one orange segment, which reads as progress already made.

A filled segment now means one thing everywhere — **that thing is finished**.
The segment you are on is marked with a heavier ink outline and no fill, so it
still says "you are here" without claiming credit.

| State | What the rail shows |
|---|---|
| 0 of 10 | ten empty segments |
| 1 of 3 | one green, two empty |
| 2 of 3 | two green, one empty |
| 3 of 3 | three green |

The quiz separates two different numbers that were previously conflated. The
**position** (`Question 1 of 5`) comes from where the cursor is. The
**completion** (`0% complete`, and the filled rail segments) counts answers
actually given — so the first segment stays empty until question one has been
answered, and the percentage moves from 0% to 20% at that moment, not before.

Checks 16, 17 and 18 measure this: computed background colours at 0%, the exact
fill count at 0, 1, 2 and 10 lessons, and the quiz percentage before choosing,
after choosing, and after checking.

## 2. The Wikimedia API, made unmistakable

**On Home**, the third activity is now:

> **Today in History**  `⊕ Live API · Wikimedia`
> A new historical event fetched for today. → **Explore event**

The teal globe, the tag and the action all sit on the row.

**On the event page**: a teal *Live from the Wikimedia API* badge, the date it
was fetched for, and a note stating in plain words that this is live
encyclopaedia content, carries no textbook citation, and that nothing in the
lessons or quizzes comes from it. The Wikipedia link stays. A failed image
becomes a drawn motif.

**When the API is unreachable**: "Today's Wikimedia event could not be loaded.",
a **Retry** button, nothing invented in its place, and no event XP. Check 20
proves this by blocking `fetch` to Wikimedia and reading the reward ledger
afterwards.

The daily cache and the one-request-per-date limit are unchanged, and no new
endpoint was added.

## 3. Today's rows

Each row is one link with a 42px mark, the activity name, one line of
description and a visible action — **Read story**, **Start quiz**, **Explore
event**. Hover raises a border, focus draws the outline, pressing shifts the row
a pixel. Saffron appears on exactly one row: the next one to do. Green appears
only on rows already finished. They are still rows, not cards.

## 4. Controlled visual energy

One history-specific element per area, each drawn here and illustrating nothing
in particular:

- **Home** — a dashed surveyor's route with three station marks along the foot
  of the mission panel.
- **Learn** — an era emblem beside each book group and each lesson row.
- **Lesson** — one chapter emblem with its era named, above the title.
- **Quiz** — the question number struck as a medallion; a selected answer gets
  a saffron edge, a right one green, a wrong one red.
- **Timeline** — chronological nodes on the rail that turn green or red when
  the order is checked.
- **Progress** — an expedition flag whose pennant fills towards the next
  milestone.

The five era accents are used only as emblem strokes and 9px chips:

| Era | Accent |
|---|---|
| Origins | `#6E716A` |
| Ancient India | `#087F8C` |
| Medieval India | `#6B4FA1` |
| Colonial India | `#B14F32` |
| Independence | `#138A4B` |

Check 22 walks the DOM and fails if any element larger than 44×44 uses an era
accent as a background.

## 5. Icons

Primary navigation icons went from 19px to 21px, and the mobile bar from 22px to
24px, both still paired with their labels. One new mark joined the family — a
globe with a signal arc, used wherever live API content appears. Same 24px grid,
same 1.75 stroke, same round caps. Filled when active, outlined otherwise.

## 6. Learn

Each lesson row now reads: era emblem, title, then chapter and pages as
secondary, reading time at the end, and a green tick **only** when the lesson is
read. Rows have their own hover and focus-within treatment. No gateways came
back, and the filter row is still three plus a drawer.

## 7. Timeline cards

Before checking, a card carries the event title, a small era marker and the
movement controls — nothing else. The date is the answer and the citation names
the book the date comes from, so both are held back. After checking: the date,
the full book, chapter and page, and a line explaining that each date is the one
its textbook gives, which is what puts the four in that order.

## 8. Companion copy

> I can guide your progress, recommend what to study next and explain today's
> activities. Open any lesson to study history from its verified textbook source.

The launcher, drawer behaviour, privacy rules and Gemini endpoint are untouched.

## 9. Companion behaviour

Check 24 confirms one leap on hover, the class clearing when the animation ends,
a resting pointer not restarting it, and the drawer opening without changing the
URL. Check 7 confirms it stays clear of every primary and full-width control and
of the bottom bar. Check 12 confirms reduced motion replaces movement with a
glow. It is the same size as before.

## Files changed

| File | Change |
|---|---|
| `css/tokens.css` | five era accent tokens |
| `css/base.css` | rail semantics: filled means finished, current is an ink outline |
| `css/components.css` | station rows, API treatments, era markers, medallion, timeline nodes, milestone flag |
| `css/responsive.css` | small-screen behaviour for the new rows and medallion |
| `js/icons.js` | the `api` globe, era emblems, the expedition route, the milestone flag |
| `js/gamify.js` | quest rows carry an action label and name their source |
| `js/app.js` | Home rows, the event page, larger nav icons |
| `js/library.js` | era emblems on rows and groups, chapter emblem, completion mark |
| `js/quiz.js` | rail counts answers, question medallion |
| `js/timeline.js` | citations held back, era markers, answer explanation |
| `js/progress.js` | milestone flag |
| `js/companion.js` | scope copy |
| `README.md` | the three-requirement mapping |
| `docs/redesign-checks.mjs` | checks 16–24 |
| `docs/ux-pass-report.md` | this file |

## Test results

- `npm run test:ui` — **24 of 24** checks pass at 1440, 768 and 375px, including
  measured WCAG AA contrast, keyboard reachability, reduced motion, no
  horizontal overflow and no console errors.
- `npm test` — **35 of 35** backend checks pass, unchanged.
- Check 14 confirms the stored data is untouched: 2 completed lessons, 280 XP,
  a 3-day streak, 10 Class 7 lessons and every citation complete with its
  passage id.
