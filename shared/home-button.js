'use strict';

// Shared "back to the game menu" button for every mini game.
//
// Include it in a game's index.html with:
//   <script src="../../shared/home-button.js"></script>
//
// It's press-and-HOLD (about 1 second) so a toddler tapping around the screen
// doesn't accidentally leave the game. A ring fills up while it's held.
//
// If the page has an element with id="controls", the button is added to the
// front of it (so it lines up with the game's own corner buttons). Otherwise it
// floats in the top-left corner.

(() => {
  const HOLD_MS = 900;
  const menuUrl = new URL('../', document.currentScript.src).href;

  const css = `
    .mg-home {
      position: relative;
      width: 46px;
      height: 46px;
      border-radius: 50%;
      border: none;
      padding: 0;
      background: rgba(0, 0, 0, 0.28);
      color: #fff;
      display: grid;
      place-items: center;
      cursor: pointer;
      touch-action: none;
      -webkit-tap-highlight-color: transparent;
    }
    .mg-home.mg-floating {
      position: fixed;
      z-index: 1000;
      top: max(12px, env(safe-area-inset-top));
      left: max(12px, env(safe-area-inset-left));
    }
    .mg-home svg.mg-icon { width: 24px; height: 24px; }
    .mg-home svg.mg-ring {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
      pointer-events: none;
    }
    .mg-home.mg-nudge { animation: mg-nudge 0.4s; }
    @keyframes mg-nudge {
      25% { transform: translateX(-4px); }
      75% { transform: translateX(4px); }
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const R = 21;
  const C = 2 * Math.PI * R;
  const btn = document.createElement('button');
  btn.className = 'mg-home';
  btn.setAttribute('aria-label', 'Hold to go back to the game menu');
  btn.innerHTML = `
    <svg class="mg-icon" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 3 2 11.5h3V21h5.5v-6h3v6H19v-9.5h3z"/>
    </svg>
    <svg class="mg-ring" viewBox="0 0 46 46">
      <circle cx="23" cy="23" r="${R}" fill="none" stroke="#ffd60a" stroke-width="4"
              stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C}"/>
    </svg>`;
  const ring = btn.querySelector('.mg-ring circle');

  let start = 0;
  let raf = 0;

  function setProgress(p) {
    ring.setAttribute('stroke-dashoffset', String(C * (1 - p)));
  }

  function tick(now) {
    const p = Math.min(1, (now - start) / HOLD_MS);
    setProgress(p);
    if (p >= 1) {
      window.location.href = menuUrl;
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  function cancel() {
    if (!start) return;
    const heldBriefly = performance.now() - start < HOLD_MS * 0.5;
    start = 0;
    cancelAnimationFrame(raf);
    setProgress(0);
    if (heldBriefly) {
      // Quick tap: wiggle so a grown-up knows it needs a longer press.
      btn.classList.remove('mg-nudge');
      void btn.offsetWidth;
      btn.classList.add('mg-nudge');
    }
  }

  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    e.stopPropagation();
    btn.setPointerCapture?.(e.pointerId);
    start = performance.now();
    raf = requestAnimationFrame(tick);
  });
  btn.addEventListener('pointerup', cancel);
  btn.addEventListener('pointercancel', cancel);
  btn.addEventListener('contextmenu', e => e.preventDefault());

  function mount() {
    const controls = document.getElementById('controls');
    if (controls) {
      controls.insertBefore(btn, controls.firstChild);
    } else {
      btn.classList.add('mg-floating');
      document.body.appendChild(btn);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
