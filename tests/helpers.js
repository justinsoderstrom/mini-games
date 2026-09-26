const fs = require('fs');
const path = require('path');
const { expect } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const GAMES_DIR = path.join(ROOT, 'games');

function loadRegistry() {
  return JSON.parse(fs.readFileSync(path.join(GAMES_DIR, 'games.json'), 'utf8')).games;
}

// Collects anything that indicates a broken page: uncaught JS errors,
// console.error calls, and files that failed to load (404s, typos in paths).
function trackProblems(page) {
  const problems = [];
  page.on('pageerror', e => problems.push(`JS error: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
  page.on('response', r => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  return problems;
}

// True when the page's main <canvas> has actually drawn something (it isn't one
// flat color). Returns null when the page has no 2D canvas to check.
async function canvasHasContent(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas && canvas.width && canvas.height && canvas.getContext('2d');
    if (!ctx) return null;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const first = data.slice(0, 3).join(',');
    const step = 4 * 7; // sample every 7th pixel
    for (let i = 0; i < data.length; i += step) {
      if (`${data[i]},${data[i + 1]},${data[i + 2]}` !== first) return true;
    }
    return false;
  });
}

// Press and hold the shared home button long enough to leave the game.
async function holdHomeButton(page, ms = 1300) {
  const box = await page.locator('.mg-home').boundingBox();
  expect(box, 'home button should be visible').not.toBeNull();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

module.exports = { ROOT, GAMES_DIR, loadRegistry, trackProblems, canvasHasContent, holdHomeButton };
