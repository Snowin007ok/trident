# TRIDENT visual redesign — what changed and why

The application did its job but looked like an administrative dashboard: eight
equal navigation links, every section a rounded card with a coloured left
stripe, tracked-out capital labels above everything, and hierarchy carried by
colour rather than by type. This pass keeps every lesson, citation, question,
XP record, badge, artefact and streak exactly as it was, and rebuilds the
surface around one idea.

## The idea: the rail

Medieval Indian history is the subject, and the material it survives in is
inscription — the Chola village assembly's election rules were cut into the
temple wall at Uttaramerur, which is the Class 7 lesson the app teaches. The
interface is built from that vernacular: ruled lines, struck marks, survey
traverses. Not a game kit.

One device carries the whole app. **The rail** is a line divided into one
segment per real lesson — ten segments for ten Class 7 lessons — filled as they
are read. It is the class progress bar on Home, the position indicator in the
reader, the spine of the chapter journey in Learn, the question counter in the
quiz, and the headline figure on Progress. It says *which* lessons, not an
abstract percentage, so it carries more than the progress ring a dashboard
usually reaches for.

Everything else stays quiet: no cards for their own sake, no gradients, no
coloured side stripes, no capital-letter eyebrows.

## Colour, used as meaning

| Role | Value | Where it is allowed |
| --- | --- | --- |
| Historical ink | `#142A43` | text, navigation, outlines, the rails |
| Warm paper | `#FFF8E8` | the page |
| Clear white | `#FFFFFF` | reading and answering surfaces |
| Action saffron | `#FF8A00` | the one thing to do next — never two at once |
| Victory green | `#138A4B` | work finished, answers right |
| Living teal | `#087F8C` | the companion and anything fetched live |
| Achievement gold | `#F4C542` | XP, badges, rewards unlocked |
| Error red | `#C73A32` | errors, answers wrong |

Each colour that becomes small text has a darkened partner (`--saffron-ink`,
`--gold-ink`, and so on) so every pairing clears 4.5:1 on both paper and white.
Check 13 measures this in the browser rather than asserting it.

The tricolour survives as one 3px rule under the header and nowhere else.

## Typography

One sans (`Avenir Next` → `Segoe UI` → `Inter` → `system-ui`) runs the entire
interface. The serif appears on exactly two things: a lesson title and a story
title. Sentence case throughout, no eyebrow labels, body measure held between
55 and 75 characters, and every button named for what it does — "Start lesson",
"Check answer", "Mark this lesson complete", "Continue reading".

## Icons

Eleven marks drawn as one family: 24px grid, 1.75 stroke, round caps,
`currentColor`. Compass, open book, target, expedition flag, scroll, dated
rail, question seal, archive chest, gear, flame, sun medallion. The four
destinations have filled twins, used only for the destination you are on. No
emoji anywhere.

## Navigation: eight links to four

| Destination | Holds |
| --- | --- |
| Home | the day |
| Learn | the library, the daily story, today's event |
| Practice | the daily quiz, the Timeline Challenge |
| Progress | the passport and the collection |

Settings and the learning path moved into a profile menu in the header. The
same four appear in the mobile bar with labels always visible, inside the
device safe area. Every route change lands at the top; the single exception is
a lesson the learner genuinely stopped part-way through, which restores its own
position.

## Screen by screen

**First visit** is three steps: board, class, then a preview that counts the
real lessons and reading minutes ("10 lessons, about 42 minutes of reading in
all") and starts the first one. Classes without indexed lessons are named in
one quiet line instead of being shown as large cards that refuse to be pressed.

**Home** answers three questions and stops: what to do now (one mission, one
saffron button), how far you have come (the rail and the streak), and what you
get next (the nearest badge and what earns it). The AI Daily Guide card is gone
— the companion provides AI help.

**Learn** opens on the learner's own class, its completion figure and its rail,
then the chapter journey, then three filters (class, era, search) with board,
book and chapter folded into "More filters". The Learning Gateways are gone;
TNPSC no longer sits beside the boards with nothing indexed behind it.

**The lesson reader** is a 720px centred column: title, class rail, intro,
passage, key ideas, one quick check, and one action. The full citation folds
into "View source" while the book and pages stay on the surface.

**The quiz** shows one question at a time with "Question 2 of 5", a percentage,
the five-segment rail, and the explanation and citation after each answer.

**The Timeline Challenge** is an actual rail — a line from *earliest* to
*latest* with the cards hung off it, a visible nudge when a card moves, and the
dates revealed only on checking. It is labelled "Mixed History Challenge"
before the student starts whenever the four events come from more than one
class.

**The daily story** is read in four beats — how it begins, the turning point,
what followed, what to take away — under an original survey-motif drawing.

**Today's event** is a tighter card, and a failed image is replaced by a drawn
contour motif rather than an empty frame.

**The collection** leads with the one badge within reach and the button that
earns it, then what you already hold. The remaining locks fold into "View all
locked rewards".

**Progress** leads with the class figure and its rail, then keeps the four
systems apart — course, today, level, streak — with boards, eras, badges, quiz
history and saved items in one drawer.

## Defects fixed

- **The blank outlined rectangle** at the bottom of every page was the toast:
  `position: fixed` with a `display` rule that overrode the `hidden` attribute,
  so an empty box painted on every screen. `[hidden] { display: none }` is now
  global; the companion drawer had the same latent bug.
- **The mobile bar showed on desktop** — it had no `display: none` above the
  breakpoint, so both navigations rendered at 1440px.
- **Routes opening halfway down** — `history.scrollRestoration` is now manual
  and every route change scrolls to the top.
- **Class-mismatched work without a warning** — "continue" now exhausts the
  learner's own class first, and anything from another class is stamped with
  the class it came from, on Home, in the reader and on the Timeline.
- **Repeated board and class labels** — named once in the header and nowhere
  else.
- **Blank image frames**, **six filters in a row**, **twelve grey locks**,
  **the giant AI card**, and the defensive copy about prototypes and localStorage
  are all gone.

## What the companion can and cannot promise

The twin fish is a 64px launcher (54px on phones) on a teal base with a gold
body, a black outline and a ripple shadow — the only circle and the only shadow
in the system. It breathes gently, glints gold occasionally, and leaps once for
640ms on hover, keyboard focus or first tap, with a cooldown. Under
`prefers-reduced-motion` it glows instead and nothing moves.

It is verified to stay clear of every primary action, every full-width control
and the bottom navigation at all three widths, and to own its own circle so no
tap meant for content is swallowed. It does float above content that scrolls
past underneath — that is what a floating launcher is, and no amount of
placement removes it on a 375px screen.

## Verification

`npm run test:ui` runs fifteen checks against the real application in a
headless browser at 1440, 768 and 375px. `npm test` runs the 35 backend checks,
which are unchanged and still pass.

The previous `docs/browser-tests.mjs` asserted against markup this redesign
replaced, so it was retired rather than left to fail misleadingly; its
behavioural coverage is carried by the new suite and the backend suite.

Before-and-after screenshots are in `docs/screenshots/before` and
`docs/screenshots/after`.
