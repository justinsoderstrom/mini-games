// Game-specific test: a bot plays a whole round of Vroom Vroom Vacuum —
// cleaning every mess, emptying the bin at the dock when it's full, and parking
// at home to win — then starts the next room.
const { test, expect } = require('@playwright/test');
const { trackProblems } = require('../helpers');

// Runs in the page. Plans a route to (tx, ty) around the furniture with a
// breadth-first search over the room grid, and returns the screen point of the
// farthest spot along that route the vacuum can drive to in a straight line.
// Like a kid steering around the couch instead of pushing into it.
function nextTap([tx, ty]) {
  const { vac, toScreen, world, canFit } = window.__vacuum;
  const { W, H, CELL } = world();
  const cols = Math.floor(W / CELL), rows = Math.floor(H / CELL);
  const center = (c, r) => ({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 });
  const free = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && canFit(center(c, r).x, center(c, r).y);
  const nearestFree = (x, y) => {
    const c0 = Math.floor(x / CELL), r0 = Math.floor(y / CELL);
    for (let d = 0; d < 6; d++)
      for (let dc = -d; dc <= d; dc++)
        for (let dr = -d; dr <= d; dr++)
          if (free(c0 + dc, r0 + dr)) return [c0 + dc, r0 + dr];
    return null;
  };
  const clearLine = (a, b) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 10);
    for (let i = 1; i <= n; i++) if (!canFit(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n)) return false;
    return true;
  };

  const start = nearestFree(vac.x, vac.y), goal = nearestFree(tx, ty);
  if (!start || !goal) return toScreen(tx, ty);
  const prev = new Map([[start.join(), null]]);
  const queue = [start];
  while (queue.length) {
    const [c, r] = queue.shift();
    if (c === goal[0] && r === goal[1]) break;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const n = [c + dc, r + dr];
      if (prev.has(n.join()) || !free(n[0], n[1])) continue;
      prev.set(n.join(), [c, r]);
      queue.push(n);
    }
  }
  if (!prev.has(goal.join())) return toScreen(tx, ty);

  const path = [];
  for (let k = goal; k; k = prev.get(k.join())) path.unshift(center(k[0], k[1]));
  path[path.length - 1] = { x: tx, y: ty };
  let pick = path[Math.min(1, path.length - 1)];
  for (const pt of path) if (clearLine(vac, pt)) pick = pt;
  return toScreen(pick.x, pick.y);
}

test('a bot can clean the whole house and win', async ({ page }) => {
  test.setTimeout(240_000);
  const problems = trackProblems(page);

  await page.goto('/games/vroom-vroom-vacuum/');
  const readState = () => page.evaluate(() => {
    const { game, vac } = window.__vacuum;
    return {
      state: game.state, bin: game.bin, needDock: game.needDock, cleaned: game.cleaned, total: game.total,
      messes: game.messes.filter(m => m.state === 'idle').map(m => ({ x: m.x, y: m.y })),
      vac: { x: vac.x, y: vac.y }, dock: { x: game.dock.x, y: game.dock.y },
    };
  });

  expect((await readState()).state).toBe('title');
  const { width, height } = page.viewportSize();
  await page.mouse.click(width / 2, height / 2);
  const start = await readState();
  expect(start.state).toBe('play');
  expect(start.total).toBeGreaterThanOrEqual(6);

  let emptiedAtDock = false;
  let s = start;
  for (let step = 0; step < 500 && s.state !== 'win'; step++) {
    if (s.state === 'docking') {
      emptiedAtDock ||= s.bin > 0;
      await page.waitForTimeout(250);
    } else {
      // Drive to the nearest mess, or home if the bin is full / the house is clean.
      let target = s.dock;
      if (!s.needDock && s.messes.length) {
        target = s.messes.reduce((best, m) =>
          Math.hypot(m.x - s.vac.x, m.y - s.vac.y) < Math.hypot(best.x - s.vac.x, best.y - s.vac.y) ? m : best);
      }
      const p = await page.evaluate(nextTap, [target.x, target.y]);
      await page.mouse.click(p.x, p.y);
      await page.waitForTimeout(250);
    }
    s = await readState();
  }

  expect(s.state, 'reached the win screen').toBe('win');
  expect(s.cleaned).toBe(s.total);
  expect(s.messes).toHaveLength(0);
  if (start.total > 5) expect(emptiedAtDock, 'bin filled up and was emptied at the dock').toBe(true);

  // After the celebration, a tap starts the next (bigger) room.
  // Wait on the game's own clock, which can run slower than real time on a busy machine.
  await expect.poll(() => page.evaluate(() => window.__vacuum.game.winT), { timeout: 20_000 }).toBeGreaterThan(2.4);
  await page.mouse.click(width / 2, height / 2);
  const next = await readState();
  expect(next.state).toBe('play');
  expect(next.cleaned).toBe(0);
  expect(next.total).toBeGreaterThanOrEqual(start.total);

  expect(problems).toEqual([]);
});
