# Vroom Vroom Vacuum 🧹🤖

A tiny robot-vacuum game made for a 3-year-old. You drive a friendly little vacuum around the house, suck up the messes, and head back to the charging dock.

- **Tap or drag anywhere** and the vacuum drives there. There's nothing to read and no way to lose.
- **Suck up messes** (dust bunnies, crumbs, cereal, leaves, paper, dirt). The vacuum counts out loud: "One! Two! Three!"
- **The bin holds 5 things.** When it's full the vacuum says *"I'm full! Let's go home!"* and a big yellow arrow bounces over the dock. Drive onto the dock and it empties the bin.
- **Clean everything and go home** to win: confetti, stars, and a *Hooray!* Tap to play again in a new, randomly arranged room. Each room adds a couple more messes, up to 18.

It's plain HTML, JavaScript, and canvas. There's no build step, no dependencies, and no internet needed. All the art is drawn in code and all the sounds are synthesized, so there are no asset files.

## Play it on a tablet over your home network

Run a static file server from this folder on any computer on the same Wi-Fi, then open the address on the tablet.

**Python (simplest, prints the address for you):**
```
python serve.py          # or: python3 serve.py 8080
```

**.NET:**
```
dotnet tool install -g dotnet-serve
dotnet serve -a 0.0.0.0 -p 8080
```

**Node:**
```
npx serve -l 8080
```

Then on the tablet open `http://<your-computer's-IP>:8080`. On Windows, `ipconfig` shows the IPv4 address. The first time, Windows Firewall will ask to allow the connection. Allow it on **Private** networks.

### Make it feel like an app (recommended)
- **iPad:** in Safari tap **Share → Add to Home Screen**. It then launches full screen with no browser bars.
- **Android:** in Chrome tap **⋮ → Add to Home screen** (or **Install app**).

### Keep little fingers inside the game
- **iPad:** turn on **Guided Access** (Settings → Accessibility → Guided Access), then triple-click the side/home button while the game is open. It locks the tablet to the game until you enter your passcode.
- **Android:** turn on **App pinning** (Settings → Security → App pinning).

### No-server option
Because it's just static files, you can also host it free on **GitHub Pages** (repo Settings → Pages → deploy from branch). Then the tablet just needs a bookmark and your computer doesn't have to be on.

## Parent controls
Two small buttons in the top-right corner:
- 🔊 mute/unmute all sound and the voice
- ⛶ fullscreen, where the browser supports it (the Home Screen install is better on iPad)

## Files
| File | What it is |
|---|---|
| `index.html` | Page shell and the two parent buttons |
| `game.js` | The whole game: room generator, vacuum physics, drawing, sounds, voice |
| `serve.py` | Tiny LAN server that prints the tablet URL |
| `manifest.webmanifest`, `icon*.{svg,png}` | "Add to Home Screen" support |

## Tweaking
The knobs are at the top of `game.js`:
- `VAC_SPEED`: how fast the vacuum drives
- `BIN_CAPACITY`: how many messes before it has to go empty (default 5, good for counting practice)
- mess count per level: see `want` in `layoutRoom()`
- `NUMBERS` and the `Voice.say(...)` lines: change what the vacuum says (it uses the tablet's built-in text-to-speech)
