const { test, expect } = require('@playwright/test');
const { loadRegistry, trackProblems } = require('./helpers');

test('menu shows a tile for every visible game, in order', async ({ page }) => {
  const problems = trackProblems(page);
  const visible = loadRegistry().filter(g => !g.hidden);

  await page.goto('/');
  const tiles = page.locator('.tile');
  await expect(tiles).toHaveCount(visible.length);

  for (let i = 0; i < visible.length; i++) {
    const tile = tiles.nth(i);
    await expect(tile).toHaveText(visible[i].title);
    await expect(tile).toHaveAttribute('href', `games/${visible[i].id}/`);
    // The icon image actually loaded.
    await expect.poll(() => tile.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
  }

  expect(problems).toEqual([]);
});

test('tapping a tile opens that game', async ({ page }) => {
  const [first] = loadRegistry().filter(g => !g.hidden);
  await page.goto('/');
  await page.locator('.tile').first().click();
  await expect(page).toHaveURL(new RegExp(`/games/${first.id}/$`));
});
