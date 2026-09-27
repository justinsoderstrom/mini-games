// Game-specific test: a bot plays a whole round of Mow Mow Mower — mowing the
// lawn until it finishes itself off, trimming every weed that pops up, and
// winning — then starts the next yard.
const { test, expect } = require('@playwright/test');
const { trackProblems } = require('../helpers');

test('a bot can mow the lawn, trim the weeds, and win', async ({ page }) => {
  test.setTimeout(240_000);
  const problems = trackProblems(page);

  await page.goto('/games/mow-mow-mower/');
  const readState = () => page.evaluate(() => {
    const { game, mower, trimmer, nearestTall } = window.__mower;
    return {
      state: game.state, mowed: game.mowed, grassTotal: game.grassTotal, trimmed: game.trimmed,
      weeds: game.weeds.filter(w => w.state === 'idle').map(w => ({ x: w.x, y: w.y })),
      weedTotal: game.weeds.length,
      mower: { x: mower.x, y: mower.y }, trimmer: { x: trimmer.x, y: trimmer.y },
      nextGrass: nearestTall(mower.x, mower.y),
    };
  });
  const tapWorld = async (x, y) => {
    const p = await page.evaluate(([x, y]) => window.__mower.toScreen(x, y), [x, y]);
    await page.mouse.click(p.x, p.y);
  };

  expect((await readState()).state).toBe('title');
  const { width, height } = page.viewportSize();
  await page.mouse.click(width / 2, height / 2);
  const start = await readState();
  expect(start.state).toBe('mow');
  expect(start.grassTotal).toBeGreaterThan(1000);
  expect(start.mowed).toBeLessThan(start.grassTotal * 0.05);

  // Mow back and forth in rows, like a grown-up would...
  const lawn = await page.evaluate(() => window.__mower.lawn);
  const driveTo = async (x, y) => {
    await tapWorld(x, y);
    await expect.poll(async () => {
      const m = (await readState()).mower;
      return Math.hypot(m.x - x, m.y - y) < 20 || (await readState()).state !== 'mow';
    }, { timeout: 15_000, intervals: [100] }).toBe(true).catch(() => {}); // blocked by a tree: move on
  };
  const R = 60;
  let leftToRight = true;
  for (let y = lawn.y + R; y < lawn.y + lawn.h && (await readState()).state === 'mow'; y += 220) {
    const row = Math.min(y, lawn.y + lawn.h - R);
    await driveTo(leftToRight ? lawn.x + lawn.w - R : lawn.x + R, row);
    leftToRight = !leftToRight;
    if ((await readState()).state === 'mow') await driveTo(leftToRight ? lawn.x + R : lawn.x + lawn.w - R, Math.min(row + 110, lawn.y + lawn.h - R));
  }

  // ...then clean up whatever the tree was hiding, until the lawn finishes itself.
  let s = await readState();
  for (let step = 0; step < 300 && s.state === 'mow'; step++) {
    if (s.nextGrass) await tapWorld(s.nextGrass.x, s.nextGrass.y);
    await page.waitForTimeout(200);
    s = await readState();
  }
  expect(s.state, 'finished mowing').not.toBe('mow');
  expect(s.mowed).toBe(s.grassTotal);
  expect(s.nextGrass).toBeNull();

  // The weeds sprout and the trimmer comes out.
  await expect.poll(async () => (await readState()).state, { timeout: 20_000 }).toBe('trim');
  s = await readState();
  expect(s.weedTotal).toBeGreaterThanOrEqual(5);

  // Trim: drive to the closest weed each time.
  for (let step = 0; step < 200 && s.state === 'trim'; step++) {
    if (s.weeds.length) {
      const w = s.weeds.reduce((best, m) =>
        Math.hypot(m.x - s.trimmer.x, m.y - s.trimmer.y) < Math.hypot(best.x - s.trimmer.x, best.y - s.trimmer.y) ? m : best);
      await tapWorld(w.x, w.y);
    }
    await page.waitForTimeout(250);
    s = await readState();
  }
  expect(s.state, 'reached the win screen').toBe('win');
  expect(s.trimmed).toBe(s.weedTotal);

  // After the celebration, a tap starts the next yard.
  // Wait on the game's own clock, which can run slower than real time on a busy machine.
  await expect.poll(() => page.evaluate(() => window.__mower.game.winT), { timeout: 20_000 }).toBeGreaterThan(2.4);
  await page.mouse.click(width / 2, height / 2);
  const next = await readState();
  expect(next.state).toBe('mow');
  expect(next.mowed).toBeLessThan(next.grassTotal * 0.05);
  expect(next.weedTotal).toBe(0);

  expect(problems).toEqual([]);
});
