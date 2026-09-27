# Mow Mow Mower 🌱🚜

Mow the tall grass in the backyard with a friendly little lawn mower, then tidy up the weeds with a smiling trimmer. Made for a 3-year-old who loves lawn mowing and weed whacking.

## How it plays
- **Tap or drag anywhere** and the mower drives there, cutting a wide stripe through the tall grass. Clippings fly out the side, and now and then a butterfly flutters up. There's nothing to read and no way to lose. Bumping into the tree just makes a soft "boop".
- **A green bar at the top fills as you mow.** A star lights up at each quarter, with a cheer ("Great job!", "Keep going!", "Almost done!").
- **The last bits finish themselves.** Once about 92% is mowed, the rest sparkles away, so nobody has to hunt for a missed corner. If the child stops making progress for a few seconds, a bouncing arrow points at grass that's still tall.
- **Then the weeds pop up** (5 to 8 of them) along the fence, the flower beds, and by the tree. The mower rolls aside and a little yellow trimmer buddy comes out. Drive it to each weed to zip it. The voice counts "One! Two! Three!" and the puffball weeds scatter floating seeds.
- **Trim every weed** to win: confetti, stars, and *"Hooray! The yard looks great!"* Tap to play again in a new yard (a new tree layout and mower color, plus one more weed each time, up to 8).

The weed trimmer is deliberately cartoonish, a round smiling ball with a spinning string. There's no person holding it and nothing that looks like a real power tool.

## Tweaking
The knobs are at the top of `game.js`:
- `MOWER_SPEED`, `TRIMMER_SPEED`: how fast they drive
- `MOW_R`: how wide a stripe the mower cuts (bigger = faster mowing)
- `AUTO_FINISH`: how much of the lawn needs mowing before the rest finishes itself
- `HINT_AFTER`: seconds of no progress before the hint arrow shows up
- weed count: see `want` in `placeWeeds()`
- `CHEERS`, `NUMBERS`, and the `Voice.say(...)` lines: what the voice says

## Files
| File | What it is |
|---|---|
| `index.html` | Page shell, sound and fullscreen buttons |
| `game.js` | Everything else: yard generator, grass grid, mower and trimmer driving, drawing, synthesized engine sounds, voice |
| `icon.svg` | Tile icon on the game menu |
