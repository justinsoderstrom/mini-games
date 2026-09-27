// Game-specific test: a bot plays a whole round of Whoosh Whoosh Leaves —
// blowing every leaf onto the pile and winning — then starts the next yard.
const { test, expect } = require('@playwright/test');
const { trackProblems } = require('../helpers');

test('a bot can blow every leaf onto the pile and win', async ({ page }) => {
  test.setTimeout(240_000);
  const problems = trackProblems(page);

  await page.goto('/games/whoosh-whoosh-leaves/');
  const readState = () => page.evaluate(() => {
    const { game, blower, pile, nearestLeaf } = window.__leaves;
    return {
      state: game.state, blown: game.blown, piled: game.piled, leafTotal: game.leafTotal,
      onGround: game.leaves.filter(l => l.state === 'ground').length,
      blower: { x: blower.x, y: blower.y },
      pileR: pile.r,
      nextLeaf: nearestLeaf(blower.x, blower.y),
    };
  });
  const tapWorld = async (x, y) => {
    const p = await page.evaluate(([x, y]) => window.__leaves.toScreen(x, y), [x, y]);
    await page.mouse.click(p.x, p.y);
  };

  expect((await readState()).state).toBe('title');
  const { width, height } = page.viewportSize();
  await page.mouse.click(width / 2, height / 2);
  const start = await readState();
  expect(start.state).toBe('blow');
  expect(start.leafTotal).toBeGreaterThan(80);
  expect(start.blown).toBe(0);

  // Drive to the closest leaf, again and again, until the rest fly off by themselves.
  let s = start;
  for (let step = 0; step < 400 && s.state === 'blow'; step++) {
    if (s.nextLeaf) await tapWorld(s.nextLeaf.x, s.nextLeaf.y);
    await page.waitForTimeout(200);
    s = await readState();
  }
  expect(s.state, 'finished blowing').not.toBe('blow');
  expect(s.blown).toBe(s.leafTotal);
  expect(s.onGround).toBe(0);
  expect(s.nextLeaf).toBeNull();

  // Every leaf lands on the pile, and that's a win.
  await expect.poll(async () => (await readState()).state, { timeout: 20_000 }).toBe('win');
  s = await readState();
  expect(s.piled).toBe(s.leafTotal);
  expect(s.pileR).toBeGreaterThan(100);

  // After the celebration, a tap starts the next yard.
  // Wait on the game's own clock, which can run slower than real time on a busy machine.
  await expect.poll(() => page.evaluate(() => window.__leaves.game.winT), { timeout: 20_000 }).toBeGreaterThan(2.4);
  await page.mouse.click(width / 2, height / 2);
  const next = await readState();
  expect(next.state).toBe('blow');
  expect(next.blown).toBe(0);
  expect(next.onGround).toBe(next.leafTotal);

  expect(problems).toEqual([]);
});
