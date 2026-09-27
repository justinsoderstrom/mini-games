# Mini Games 🎮

A little collection of simple, toddler-friendly browser games, made to be played on a tablet.

## ▶️ Play: [justinsoderstrom.com/mini-games](https://justinsoderstrom.com/mini-games/)

The site is hosted on GitHub Pages and redeploys automatically whenever `main` changes.

When you open it, you get a **menu of big picture tiles**, one per game. Tap a tile to play. Inside a game, **press and hold** the 🏠 button in the corner for about a second to return to the menu. The hold is there so little fingers don't exit by accident.

Everything is plain HTML, CSS, and JavaScript:
- **No build step, no frameworks.** The only npm package is the test runner, and the games don't need it.
- **Works offline.** After the site has been opened once, a service worker (`sw.js`) keeps a copy of the menu and every game on the tablet. The games keep working with no connection, like in the car or on a plane. When the tablet is back online, it picks up new versions automatically.
- **No downloads while playing.** The games draw their art in code and generate their sounds in the browser.

## Games

| Game | What it is |
|---|---|
| [Vroom Vroom Vacuum](https://justinsoderstrom.com/mini-games/games/vroom-vroom-vacuum/) ([code](games/vroom-vroom-vacuum/)) | Drive a robot vacuum around the house, clean up the messes, and go home to the dock. |
| [Mow Mow Mower](https://justinsoderstrom.com/mini-games/games/mow-mow-mower/) ([code](games/mow-mow-mower/)) | Mow the tall grass in the backyard, then zip the weeds with a little trimmer. |
| [Whoosh Whoosh Leaves](https://justinsoderstrom.com/mini-games/games/whoosh-whoosh-leaves/) ([code](games/whoosh-whoosh-leaves/)) | Blow the autumn leaves into a big pile, then watch a puppy jump in. |

## Setting up the tablet

### Make it feel like an app
- **iPad:** open the link above in Safari and tap **Share → Add to Home Screen**. It launches full screen, straight into the menu.
- **Android:** open it in Chrome and tap **⋮ → Add to Home screen** (or **Install app**).

Open it once while online so everything is saved for offline play. The games also keep the screen from dimming while a kid is playing.

### Keep little fingers inside the games
- **iPad:** turn on **Guided Access** (Settings → Accessibility → Guided Access), then triple-click the side/home button. It locks the tablet to the app until you enter your passcode.
- **Android:** turn on **App pinning** (Settings → Security → App pinning).

## Running it locally (for development)

Start any static web server from the **root of this repo**:

```
python serve.py                              # port 8080; prints a LAN address for trying it on a tablet
dotnet serve -a 0.0.0.0 -p 8080              # after: dotnet tool install -g dotnet-serve
npx serve -l 8080
```

Open `http://localhost:8080`. To try a change on a real tablet before merging, open the LAN address `serve.py` prints. On Windows, allow Python through the firewall on **Private** networks when asked.

Notes:
- Opening `index.html` straight from disk (`file://`) won't work. Browsers block the menu from reading `games/games.json` that way.
- Offline saving and keep-screen-awake only work over HTTPS or on `localhost`. On a plain `http://192.168…` LAN address they're skipped, and the games otherwise work normally.

## Repo layout

```
index.html              The game menu (reads games/games.json)
CLAUDE.md               Guidance for Claude (and people) on the audience and how to add a game
manifest.webmanifest    "Add to Home Screen" settings for the whole collection
icon.svg, icon-*.png    App icon for the collection
sw.js                   Service worker: saves everything for offline play
serve.py                Local dev server that also prints a LAN address
tests/                  Automated browser tests (see below)
.github/workflows/      Runs the tests on every pull request
shared/
  home-button.js        Hold-to-exit "back to menu" button used by every game
games/
  games.json            The list of games shown on the menu
  _template/            Starter game to copy when making a new one
  vroom-vroom-vacuum/   One folder per game (mow-mow-mower/ has the same layout)
    index.html          The game's own page (its entry point)
    game.js
    icon.svg            Its tile on the menu
    README.md
```

Each game is a **self-contained web page in its own folder**. Games don't share code or depend on each other. The only things they share are the home button, the app manifest, and the offline service worker. The service worker finds and saves each game's files automatically, so there's nothing to register with it. You can build one with plain canvas (like the vacuum game), DOM elements, or a library dropped into its folder. The menu only needs a page to link to.

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

5. **Try it locally.** Run `python serve.py` and open `http://localhost:8080`. Once it's merged to `main`, GitHub Pages publishes it within a minute or two, and tablets pick it up the next time they open the menu while online.

6. **Run the tests** (see below). Your game is covered by the smoke tests automatically.

Optionally, add a `README.md` in the game folder describing how it plays and what to tweak, and add a row to the **Games** table above.

## Automated tests

Every pull request, and every push to `main`, runs the test suite on GitHub Actions (`.github/workflows/test.yml`). The suite uses [Playwright](https://playwright.dev) to drive a real headless Chrome, sized like a tablet in both landscape and portrait.

| Test file | What it checks |
|---|---|
| `tests/registry.spec.js` | `games.json` is valid: ids are unique, and each game's folder, `index.html`, and icon exist. Each page includes the shared home button and manifest. Every game folder is registered (prefix a folder with `_` to exclude it). |
| `tests/menu.spec.js` | The menu shows one tile per visible game, in order, with icons that load. Tapping a tile opens the game. |
| `tests/games.spec.js` | **Runs for every game automatically.** The page loads with no JS errors or missing files, the canvas draws something, 25 random taps don't crash it, a quick tap on 🏠 stays in the game, and holding it goes back to the menu. |
| `tests/offline.spec.js` | After one visit, the network is cut. The menu and every game must still load and run from the saved copy. |
| `tests/games/<id>.spec.js` | Optional checks for one game. For example, `vroom-vroom-vacuum.spec.js` has a bot play a full round: clean every mess, empty the bin at the dock, win, then start the next room. |

A failed run attaches a `playwright-report` artifact to the workflow run, with screenshots and a step-by-step trace of what went wrong.

**Running the tests locally** requires Node.js 18+ and Python. The tests start `serve.py` themselves.
```
npm install
npx playwright install chromium     # one-time browser download
npx playwright test                 # add --ui for an interactive runner
```

**Writing a game-specific test:** create `tests/games/<your-game-id>.spec.js`. It helps to expose a small hook from your game for the test to read, like `window.__vacuum` in the vacuum game, so the test can check the game's state directly instead of guessing from pixels. The shared helpers in `tests/helpers.js` (`trackProblems`, `canvasHasContent`, `holdHomeButton`) are there to reuse.

To **block merging when tests fail**, go to repo **Settings → Branches** (or **Rules → Rulesets**), add a rule for `main`, enable *Require status checks to pass*, and pick **playwright**.

### Tips for games aimed at toddlers
- **One input: tap or drag anywhere.** Avoid small buttons, multi-touch, or anything that needs reading.
- **No fail states.** Make progress visible (stars, fill bars) and celebrate a lot (sounds, confetti, a spoken "Hooray!").
- **Sound needs a tap first.** Browsers only allow audio after a user gesture, so start the Web Audio context in your first `pointerdown`. See `Sound.init()` in the vacuum game.
- **Spoken words** work through the browser's built-in `speechSynthesis`. The vacuum game's `Voice` helper is easy to copy.
- **Size to the screen.** Handle both portrait and landscape, and use `devicePixelRatio` so canvases look crisp.
- **Keep the screen awake.** Use `navigator.wakeLock` (see `keepScreenAwake()` in the template) so the tablet doesn't dim mid-game.
- **Load everything from the game's own folder.** Don't use CDNs or other outside links. The offline saver only keeps files from this site, so a game that loads something from elsewhere breaks offline.
