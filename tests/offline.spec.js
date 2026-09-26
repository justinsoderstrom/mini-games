// After one visit to the menu, the whole collection should keep working with
// no connection at all (the service worker in sw.js saves it).
const { test, expect } = require('@playwright/test');
const { loadRegistry, trackProblems, canvasHasContent } = require('./helpers');

test('menu and every game work offline after the first visit', async ({ page, context }) => {
  const problems = trackProblems(page);

  await page.goto('/');
  // Wait until the service worker has finished saving everything and is in control.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);

  await page.reload();
  const visible = loadRegistry().filter(g => !g.hidden);
  await expect(page.locator('.tile')).toHaveCount(visible.length);

  for (const g of loadRegistry()) {
    await page.goto(`/games/${g.id}/`);
    await page.waitForTimeout(500);
    await expect(page.locator('.mg-home'), `${g.id}: home button loads offline`).toBeVisible();
    const drawn = await canvasHasContent(page);
    if (drawn !== null) expect(drawn, `${g.id}: draws offline`).toBe(true);
    await page.mouse.click(300, 300);
    await page.waitForTimeout(300);
  }

  expect(problems).toEqual([]);
});
