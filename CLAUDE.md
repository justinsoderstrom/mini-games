# Mini Games — notes for Claude

A collection of tiny browser games for a **toddler (about 3 years old) playing on a tablet**. Live at https://justinsoderstrom.com/mini-games/ (GitHub Pages, deploys from `main`). `README.md` has the full details for people; this file covers what matters when adding or changing a game.

## Who it's for, and what that means for design
The player can't read, has small imprecise fingers, and loses interest fast. Every game should:
- **Use one input: tap or drag anywhere.** No small buttons, multi-touch, precision timing, or text the child has to read.
- **Have no fail states.** Nothing to lose, no timers, no "game over". Bumping into things is a soft "boop", never a penalty.
- **Keep one simple loop**, with maybe one small second step (the vacuum empties its bin at the dock; the mower hands off to a weed trimmer). Finish a round in about 1–3 minutes.
- **Celebrate a lot.** Stars or a fill bar for progress, synthesized sounds, a spoken voice counting ("One! Two!") or cheering, confetti and "Hooray!" at the end, then a big button to play again with a fresh random layout.
- **Help instead of making the child hunt.** Finish off the last few percent automatically (see `AUTO_FINISH` in the mower game), and after a few idle seconds show a bouncing arrow pointing at what's left.
- **Be friendly and safe.** Characters get cute faces. Keep tools gentle and cartoonish (the weed trimmer is a smiling yellow ball, not a realistic power tool). No scary sounds, and nothing that models unsafe real-world behavior.

## Hard technical rules
- **Plain HTML/CSS/JS, no build step, no frameworks, no CDNs or outside URLs.** Everything a game loads must come from its own folder or `shared/`, or it breaks offline play (`sw.js` only caches same-origin files linked from each game's `index.html`).
- **No asset downloads needed:** draw art in code (canvas) and synthesize sound with Web Audio. Small local image files are OK.
- **Sound starts on the first tap** (browsers block audio before a gesture). Speech uses `speechSynthesis`; iOS needs it primed inside a tap (`Voice.prime()`).
- Handle **portrait and landscape**, and scale by `devicePixelRatio` (capped at 2).
- Keep the screen awake with `navigator.wakeLock` (re-request after a tap and on `visibilitychange`).

## Adding a new game (checklist)
1. `cp -r games/_template games/<id>`, using a short kebab-case id. Or copy an existing game (`vroom-vroom-vacuum`, `mow-mow-mower`) when it's closer to what you want. They share the same structure: a helpers block, a tuning block of constants at the top, `Sound`, `Voice`, a world/view transform, input, an update loop, drawing, and HUD.
2. Keep in `index.html`: the viewport meta, `touch-action: none` / `user-select: none` CSS, `<link rel="manifest" href="../../manifest.webmanifest">`, the apple-touch-icon link, and `<script src="../../shared/home-button.js"></script>` (hold-to-exit back to the menu). An element with `id="controls"` gets the home button slotted into it, next to the sound and fullscreen buttons.
3. Make a bold square `icon.svg` for the menu tile.
4. Add an entry to `games/games.json` (`id`, `title`, `description`, `icon`, `color`). Order in the file is menu order.
5. Add a `README.md` in the game folder (how it plays, what to tweak), and a row in the **Games** table in the root `README.md`.
6. Expose a small test hook (`window.__<name>` with the game state and a `toScreen` helper), then write `tests/games/<id>.spec.js`, where a bot plays a full round to the win screen and starts the next one. The generic smoke, registry, menu and offline tests cover every registered game automatically.

## Testing
```
npm ci
npx playwright test                           # all tests, landscape + portrait tablet
npx playwright test tests/games/<id>.spec.js  # one game
```
The tests start `serve.py` themselves. CI runs them on every PR (`.github/workflows/test.yml`). Local dev server: `python serve.py`, then open http://localhost:8080 (not `file://`).

## Conventions
- Match the existing games' code style: `'use strict'`, one IIFE per `game.js`, a `// ---------- section ----------` comment for each part, tunable constants at the top in UPPER_CASE.
- Games are self-contained. Don't share code between game folders, apart from `shared/home-button.js`.
- Work-in-progress games can be registered with `"hidden": true` to keep them off the menu.
