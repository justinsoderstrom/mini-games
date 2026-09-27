# Whoosh Whoosh Leaves 🍂💨

Blow the autumn leaves off the lawn with a friendly little leaf blower, pile them all up in the corner, then watch a puppy jump in. Made for a 3-year-old, in the same style as the vacuum and mower games.

## How it plays
- **Tap or drag anywhere** and the blower drives there. Puffs of air come out of its nozzle, and every leaf in front of it (or right next to it) whooshes up into the air, tumbles along, and curves over to land on the leaf pile in the corner. The pile grows as the leaves land. There's nothing to read and no way to lose. Bumping into a tree just makes a soft "boop".
- **An orange bar at the top fills as you blow.** A star lights up at each quarter, with a cheer ("Whoosh!", "Keep going!", "Almost done!").
- **The last leaves finish themselves.** Once about 90% are blown, the rest sparkle and fly to the pile, so nobody has to hunt for one stray leaf. If the child stops making progress for a few seconds, a bouncing arrow points at the closest leaf.
- **Then a puppy comes to play.** The blower rolls aside, a puppy pops up next to the big pile, and the voice says "Tap to jump in the leaves!" Every tap (anywhere) makes the puppy jump in: leaves go flying, only its ears and wagging tail poke out, and the voice counts "One! Two! Three!"
- **Three jumps** win: confetti, a big leaf fountain, stars, and *"Hooray! What a fun leaf pile!"* Tap to play again in a new yard (new trees, pile corner, blower color, and a few more leaves each time, up to 170).

The blower is a round, smiling buddy with a short fat nozzle and a gentle "whoosh" sound. There's no person holding it and nothing that looks like a real power tool.

## Tweaking
The knobs are at the top of `game.js`:
- `BLOWER_SPEED`: how fast it drives
- `GRAB_R`, `WIND_LEN`, `WIND_W`: how close to the blower, and how far in front of it, leaves get picked up (bigger = faster clean-up)
- `AUTO_FINISH`: how many of the leaves need blowing before the rest fly off by themselves
- `HINT_AFTER`: seconds of no progress before the hint arrow shows up
- `JUMPS`: how many puppy jumps it takes to win
- leaf count: see `want` in `scatterLeaves()`
- `CHEERS`, `NUMBERS`, and the `Voice.say(...)` lines: what the voice says

## Files
| File | What it is |
|---|---|
| `index.html` | Page shell, sound and fullscreen buttons |
| `game.js` | Everything else: yard generator, leaves and their flight to the pile, blower driving, the puppy, drawing, synthesized whoosh sounds, voice |
| `icon.svg` | Tile icon on the game menu |
