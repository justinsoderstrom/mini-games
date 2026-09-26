# Mini Games 🎮

A little collection of simple, toddler-friendly browser games, meant to be played on a tablet over your home network.

When you open it, you get a **menu of big picture tiles**, one per game. Tap a tile to play. Inside a game, **press and hold** the 🏠 button in the corner for about a second to return to the menu. The hold is there so little fingers don't exit by accident.

Everything is plain HTML, CSS, and JavaScript:
- **No build step, no npm install, no frameworks.** Any static file server can host it.
- **No internet needed.** The games draw their art in code and generate their sounds in the browser.

## Games

| Game | What it is |
|---|---|
| [Vroom Vroom Vacuum](games/vroom-vroom-vacuum/) | Drive a robot vacuum around the house, clean up the messes, and go home to the dock. |

## Running it

Start any static web server from the **root of this repo**, on a computer that's on the same Wi-Fi as the tablet.

**Python (simplest, prints the tablet URL for you):**
```
python serve.py            # port 8080 by default; or: python serve.py 9000
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

> Opening `index.html` straight from disk (`file://`) won't work. Browsers block the menu from reading `games/games.json` that way, so use a server.

### Make it feel like an app
- **iPad:** in Safari tap **Share → Add to Home Screen**. It launches full screen, straight into the menu.
- **Android:** in Chrome tap **⋮ → Add to Home screen** (or **Install app**).

### Keep little fingers inside the games
- **iPad:** turn on **Guided Access** (Settings → Accessibility → Guided Access), then triple-click the side/home button. It locks the tablet to the app until you enter your passcode.
- **Android:** turn on **App pinning** (Settings → Security → App pinning).

### Hosting without your computer on
Because it's just static files, **GitHub Pages** can host it for free: repo **Settings → Pages → Deploy from a branch**. The tablet then just needs a bookmark. For a private repo, Pages needs a paid GitHub plan.

## Repo layout

```
index.html              The game menu (reads games/games.json)
manifest.webmanifest    "Add to Home Screen" settings for the whole collection
icon.svg, icon-*.png    App icon for the collection
serve.py                Tiny LAN server that prints the tablet URL
shared/
  home-button.js        Hold-to-exit "back to menu" button used by every game
games/
  games.json            The list of games shown on the menu
  _template/            Starter game to copy when making a new one
  vroom-vroom-vacuum/   One folder per game
    index.html          The game's own page (its entry point)
    game.js
    icon.svg            Its tile on the menu
    README.md
```

Each game is a **self-contained web page in its own folder**. Games don't share code or depend on each other. The only things they share are the home button and the app manifest. You can build one with plain canvas (like the vacuum game), DOM elements, or a library dropped into its folder. The menu only needs a page to link to.

## Adding a new game

1. **Copy the template folder** and rename it with a short, URL-friendly id:
   ```
   cp -r games/_template games/bubble-pop
   ```
   The template is a tiny working game (tap to make bubbles), so you start from something that runs.

2. **Build your game** in `games/bubble-pop/`. Keep these bits from the template's `index.html`:
   - `<script src="../../shared/home-button.js"></script>` gives you the back-to-menu button. If your page has an element with `id="controls"`, the button slots into it. Otherwise it floats in the top-left corner.
   - the `<link rel="manifest" href="../../manifest.webmanifest">` and `apple-touch-icon` lines, so installing from inside a game still opens the menu
   - the viewport meta and the `touch-action: none` / `user-select: none` CSS, which stop pinch-zoom, text selection, and scroll bounce on tablets

3. **Give it an icon.** Replace `icon.svg` with a square picture. It shows on the menu tile, so make it bold and readable at a glance. PNG works too.

4. **Register it** by adding an entry to `games/games.json`:
   ```json
   {
     "id": "bubble-pop",
     "title": "Bubble Pop",
     "description": "Pop the bubbles before they float away.",
     "icon": "icon.svg",
     "color": "#4d96ff"
   }
   ```
   | Field | Required | Meaning |
   |---|---|---|
   | `id` | yes | Folder name under `games/`. The tile links to `games/<id>/` |
   | `title` | yes | Name shown on the tile |
   | `description` | no | Short blurb for grown-ups (shown as the tile's hover text) |
   | `icon` | no | Image file inside the game folder (default `icon.svg`) |
   | `color` | no | Tile background color (default teal) |
   | `hidden` | no | `true` keeps a work-in-progress game off the menu. You can still open it directly at `/games/<id>/` |

   Games show up on the menu in the order they're listed.

5. **Refresh the menu.** The server sends no-cache headers, so a reload on the tablet picks up the change.

Optionally, add a `README.md` in the game folder describing how it plays and what to tweak, and add a row to the **Games** table above.

### Tips for games aimed at toddlers
- **One input: tap or drag anywhere.** Avoid small buttons, multi-touch, or anything that needs reading.
- **No fail states.** Make progress visible (stars, fill bars) and celebrate a lot (sounds, confetti, a spoken "Hooray!").
- **Sound needs a tap first.** Browsers only allow audio after a user gesture, so start the Web Audio context in your first `pointerdown`. See `Sound.init()` in the vacuum game.
- **Spoken words** work through the browser's built-in `speechSynthesis`. The vacuum game's `Voice` helper is easy to copy.
- **Size to the screen.** Handle both portrait and landscape, and use `devicePixelRatio` so canvases look crisp.
