# Vroom Vroom Vacuum 🧹🤖

Drive a friendly little robot vacuum around the house, suck up the messes, and head back to the charging dock. Made for a 3-year-old who loves vacuums.

## How it plays
- **Tap or drag anywhere** and the vacuum drives there. There's nothing to read and no way to lose. Bumping into furniture just makes a soft "boop".
- **Suck up messes** (dust bunnies, crumbs, cereal, leaves, paper, dirt). The vacuum counts out loud: "One! Two! Three!"
- **The bin holds 5 things.** When it's full the vacuum says *"I'm full! Let's go home!"* and a big yellow arrow bounces over the dock. Drive onto the dock and it empties the bin.
- **Clean everything and go home** to win: confetti, stars, and a *Hooray!* Tap to play again in a new, randomly arranged room. Each room adds a couple more messes, up to 18.

A row of stars at the top shows progress, and the gauge in the top-left shows how full the bin is. Rooms are randomly generated, and a flood-fill check makes sure every mess can actually be reached.

## Tweaking
The knobs are at the top of `game.js`:
- `VAC_SPEED`: how fast the vacuum drives
- `BIN_CAPACITY`: how many messes before it has to go empty (default 5, good for counting practice)
- mess count per level: see `want` in `layoutRoom()`
- `NUMBERS` and the `Voice.say(...)` lines: change what the vacuum says (it uses the tablet's built-in text-to-speech)

## Files
| File | What it is |
|---|---|
| `index.html` | Page shell, sound and fullscreen buttons |
| `game.js` | Everything else: room generator, vacuum physics, drawing, synthesized sounds, voice |
| `icon.svg` | Tile icon on the game menu |
