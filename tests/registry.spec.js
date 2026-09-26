// Checks games/games.json against what's actually in the games/ folder.
// These run without a browser, so a mistake shows up as a clear message.
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { GAMES_DIR, loadRegistry } = require('./helpers');

test.describe('games.json registry', () => {
  // The registry is plain files, so there's no need to repeat it per device.
  test.beforeEach(({}, info) => test.skip(info.project.name !== 'tablet-landscape', 'device independent'));

  const games = loadRegistry();

  test('lists at least one game', () => {
    expect(Array.isArray(games)).toBe(true);
    expect(games.length).toBeGreaterThan(0);
  });

  test('ids are unique and URL friendly', () => {
    const ids = games.map(g => g.id);
    expect(new Set(ids).size, 'duplicate id in games.json').toBe(ids.length);
    for (const id of ids) expect(id, 'use lowercase letters, numbers and dashes').toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });

  for (const g of games) {
    test(`${g.id}: folder, page, icon and shared pieces are in place`, () => {
      expect(typeof g.title === 'string' && g.title.trim(), 'title is required').toBeTruthy();

      const dir = path.join(GAMES_DIR, g.id);
      expect(fs.existsSync(dir), `games/${g.id}/ folder is missing`).toBe(true);

      const indexFile = path.join(dir, 'index.html');
      expect(fs.existsSync(indexFile), `games/${g.id}/index.html is missing`).toBe(true);

      const icon = g.icon || 'icon.svg';
      expect(fs.existsSync(path.join(dir, icon)), `games/${g.id}/${icon} (menu icon) is missing`).toBe(true);

      const html = fs.readFileSync(indexFile, 'utf8');
      expect(html, 'include ../../shared/home-button.js so kids (and parents) can get back to the menu')
        .toContain('../../shared/home-button.js');
      expect(html, 'link ../../manifest.webmanifest so "Add to Home Screen" opens the menu')
        .toContain('../../manifest.webmanifest');
    });
  }

  test('every game folder is registered', () => {
    const registered = new Set(games.map(g => g.id));
    const folders = fs.readdirSync(GAMES_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('_'))
      .map(d => d.name);
    for (const f of folders) {
      expect(registered.has(f), `games/${f}/ exists but isn't listed in games.json (prefix the folder with _ to exclude it)`).toBe(true);
    }
  });
});
