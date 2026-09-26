// Smoke test that runs automatically for EVERY game in games/games.json (plus
// the starter template). A new game gets these checks for free:
//   - the page loads with no JS errors or missing files
//   - it draws something on its canvas
//   - a toddler bashing the screen doesn't crash it
//   - a quick tap on the home button does NOT leave, holding it DOES
//
// For checks specific to one game, add tests/games/<game-id>.spec.js.
const { test, expect } = require('@playwright/test');
const { loadRegistry, trackProblems, canvasHasContent, holdHomeButton } = require('./helpers');

const targets = [
  ...loadRegistry().map(g => ({ id: g.id, title: g.title })),
  { id: '_template', title: 'starter template' },
];

for (const { id, title } of targets) {
  test.describe(`${title} (games/${id})`, () => {
    test('loads, draws, survives lots of taps, and holds-to-exit to the menu', async ({ page }) => {
      const problems = trackProblems(page);
      await page.goto(`/games/${id}/`);
      await page.waitForTimeout(600);

      await expect(page.locator('.mg-home'), 'shared home button is on the page').toBeVisible();

      const drawn = await canvasHasContent(page);
      if (drawn !== null) expect(drawn, 'canvas should show more than a blank background').toBe(true);

      // Toddler mode: tap all over the screen (staying clear of the corner buttons).
      const { width, height } = page.viewportSize();
      for (let i = 0; i < 25; i++) {
        const x = width * (0.15 + 0.7 * ((i * 37) % 100) / 100);
        const y = height * (0.2 + 0.7 * ((i * 61) % 100) / 100);
        await page.mouse.click(x, y);
        await page.waitForTimeout(60);
      }
      await page.waitForTimeout(1000);
      expect(problems, 'no errors while playing').toEqual([]);

      // A quick tap on home should not leave the game...
      await holdHomeButton(page, 120);
      await page.waitForTimeout(400);
      await expect(page).toHaveURL(new RegExp(`/games/${id}/$`));

      // ...but holding it should.
      await holdHomeButton(page);
      await expect(page).toHaveURL(/\/$/);
      await expect(page.locator('h1')).toHaveText('Mini Games');

      expect(problems).toEqual([]);
    });
  });
}
