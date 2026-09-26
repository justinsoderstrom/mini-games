'use strict';

// Starter game: tap anywhere to make a bubble. Replace with your own game.

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff', '#ff9f43'];
  const bubbles = [];
  let w = 0, h = 0, dpr = 1;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  }
  window.addEventListener('resize', resize);
  resize();

  // Keep the tablet's screen from dimming mid-game (HTTPS only; quietly does
  // nothing elsewhere). Browsers drop the lock when the page is hidden, so it
  // is re-requested on every tap.
  let wakeLock = null;
  async function keepScreenAwake() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) { /* not allowed here; that's fine */ }
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    keepScreenAwake();
    bubbles.push({
      x: e.clientX, y: e.clientY, r: 10, vy: -40 - Math.random() * 40,
      color: COLORS[Math.floor(Math.random() * COLORS.length)], life: 4,
    });
  });

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    for (const b of bubbles) {
      b.r = Math.min(60, b.r + 120 * dt);
      b.y += b.vy * dt;
      b.life -= dt;
    }
    for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].life <= 0) bubbles.splice(i, 1);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#2b2d42';
    ctx.fillRect(0, 0, w, h);
    for (const b of bubbles) {
      ctx.globalAlpha = Math.min(1, b.life);
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!bubbles.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Tap anywhere!', w / 2, h / 2);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
