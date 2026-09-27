'use strict';

// Whoosh Whoosh Leaves — a tiny leaf-blowing game for little kids.
// Tap (or drag) anywhere and the leaf blower drives there, whooshing up every
// leaf in front of it. The leaves swirl through the air onto one big pile in
// the corner. Clear the whole lawn to win!

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // ---------- helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Custom so it works on older iPads that lack ctx.roundRect.
  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function circle(c, x, y, r) {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
  }

  function starPath(c, x, y, r, inner = 0.48, points = 5) {
    c.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const rr = i % 2 === 0 ? r : r * inner;
      const a = -Math.PI / 2 + (i * Math.PI) / points;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
  }

  // ---------- tuning ----------
  const EDGE = 70;            // flower beds along the sides and bottom
  const FENCE = 120;          // hedge and fence along the top
  const BLOWER_R = 46;        // how close the blower can get to the fence or a tree
  const BLOWER_SPEED = 500;
  const GRAB_R = 74;          // leaves this close to the blower whoosh up, even behind it
  const WIND_LEN = 200;       // how far in front of the nozzle the air reaches
  const WIND_W = 40;          // half-width of the air stream at the nozzle (it spreads out further along)
  const LEAF_SIZE = 44;
  const PILE_MIN_R = 40;      // the pile grows from this...
  const PILE_MAX_R = 125;     // ...to this, once every leaf is on it
  const AUTO_FINISH = 0.9;    // past this, the last few leaves fly to the pile by themselves
  const MILESTONES = [0.25, 0.5, 0.75, 1];
  const HINT_AFTER = 3.5;     // seconds without progress before an arrow points at what's left
  const FONT = '"Arial Rounded MT Bold", "Nunito", "Trebuchet MS", "Segoe UI", sans-serif';

  const BLOWER_COLORS = [
    { main: '#4d96ff', dark: '#2f6fcc', light: '#86b8ff' },
    { main: '#9b5de5', dark: '#7440b8', light: '#bb8ff0' },
    { main: '#19b3a6', dark: '#0f8278', light: '#63d4ca' },
    { main: '#e63946', dark: '#b02a35', light: '#f2727c' },
  ];
  const LEAF_COLORS = ['#e63946', '#ff7b25', '#ffb400', '#c1440e', '#a0522d', '#ffd23f'];
  const LEAF_SHAPES = ['maple', 'oak', 'round'];
  const FLOWER_COLORS = ['#ff9f43', '#ffd23f', '#e63946', '#c77dff', '#ffffff'];
  const CONFETTI = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff', '#ff9f43'];

  const CHEERS = { 0.25: 'Whoosh!', 0.5: 'Keep going!', 0.75: 'Almost done!' };

  // ---------- sound (all synthesized, no files) ----------
  const Sound = {
    ctx: null, master: null, noise: null,
    windGain: null, windF: null, humOsc: null,
    muted: false,

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = this.ctx = new AC();
      this.master = ac.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(ac.destination);

      const len = ac.sampleRate * 2;
      this.noise = ac.createBuffer(1, len, ac.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      // Blower: a soft rush of air (filtered noise) over a gentle hum.
      this.windGain = ac.createGain();
      this.windGain.gain.value = 0;
      this.windGain.connect(this.master);

      const n = ac.createBufferSource();
      n.buffer = this.noise;
      n.loop = true;
      this.windF = ac.createBiquadFilter();
      this.windF.type = 'bandpass';
      this.windF.Q.value = 0.7;
      this.windF.frequency.value = 900;
      n.connect(this.windF); this.windF.connect(this.windGain);

      this.humOsc = ac.createOscillator();
      this.humOsc.type = 'triangle';
      this.humOsc.frequency.value = 150;
      const hg = ac.createGain();
      hg.gain.value = 0.25;
      this.humOsc.connect(hg); hg.connect(this.windGain);

      n.start();
      this.humOsc.start();
    },

    setMuted(m) {
      this.muted = m;
      if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
      if (m) Voice.stop();
    },

    blower(on, level) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.windGain.gain.setTargetAtTime(on ? 0.14 + level * 0.08 : 0, t, 0.12);
      this.windF.frequency.setTargetAtTime(800 + level * 700, t, 0.2);
      this.humOsc.frequency.setTargetAtTime(140 + level * 40, t, 0.2);
    },

    tone(freq, dur, { type = 'sine', vol = 0.3, to = null, delay = 0 } = {}) {
      if (!this.ctx) return;
      const ac = this.ctx;
      const t = ac.currentTime + delay;
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + dur + 0.05);
    },

    hiss(dur, from, to, vol, delay = 0) {
      if (!this.ctx) return;
      const ac = this.ctx;
      const t = ac.currentTime + delay;
      const src = ac.createBufferSource();
      src.buffer = this.noise;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.5;
      f.frequency.setValueAtTime(from, t);
      f.frequency.exponentialRampToValueAtTime(to, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t);
      src.stop(t + dur + 0.05);
    },

    rustle() { this.hiss(0.22, rand(2500, 3500), 1400, 0.16); },
    plop()  { this.tone(rand(700, 1000), 0.08, { type: 'triangle', to: rand(400, 500), vol: 0.07 }); },
    boing(delay = 0) { this.tone(rand(260, 320), 0.22, { to: rand(620, 720), vol: 0.3, delay }); },
    bump()  { this.tone(170, 0.16, { type: 'triangle', to: 80, vol: 0.45 }); },
    crunch() { this.hiss(0.5, 3500, 900, 0.4); this.hiss(0.35, 1800, 700, 0.25, 0.08); },
    chime() { [659, 988].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.25, delay: i * 0.12 })); },
    tada()  { [523, 659, 784].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.25, delay: i * 0.12 })); },
    win() {
      const notes = [523, 659, 784, 1047, 784, 1047, 1319];
      const times = [0, 0.14, 0.28, 0.42, 0.62, 0.76, 0.9];
      notes.forEach((f, i) => this.tone(f, i === notes.length - 1 ? 0.8 : 0.22,
        { type: 'triangle', vol: 0.28, delay: times[i] }));
    },
  };

  // ---------- friendly voice (uses the tablet's built-in text-to-speech) ----------
  const Voice = {
    ok: 'speechSynthesis' in window,
    voice: null,
    pickVoice() {
      if (!this.ok) return;
      const vs = speechSynthesis.getVoices();
      this.voice =
        vs.find(v => /^en[-_]US/i.test(v.lang) && /samantha|google us english|female|aria|jenny/i.test(v.name)) ||
        vs.find(v => /^en[-_]US/i.test(v.lang)) ||
        vs.find(v => /^en/i.test(v.lang)) || null;
    },
    prime() {
      // iOS only allows speech after it has been triggered inside a tap.
      if (!this.ok) return;
      this.pickVoice();
      try { speechSynthesis.speak(new SpeechSynthesisUtterance(' ')); } catch (e) { /* ignore */ }
    },
    say(text, interrupt = true) {
      if (!this.ok || Sound.muted) return;
      try {
        if (interrupt) speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        if (this.voice) u.voice = this.voice;
        u.rate = 0.95;
        u.pitch = 1.5;
        speechSynthesis.speak(u);
      } catch (e) { /* ignore */ }
    },
    stop() {
      if (this.ok) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    },
  };
  if (Voice.ok) speechSynthesis.onvoiceschanged = () => Voice.pickVoice();

  // ---------- leaf pictures (drawn once, stamped many times) ----------
  const SPRITE = 64;
  const leafSprites = {}; // `${shape}-${color}` -> canvas

  function buildLeafSprites() {
    for (const shape of LEAF_SHAPES) {
      for (const color of LEAF_COLORS) {
        const cv = document.createElement('canvas');
        cv.width = cv.height = SPRITE;
        const c = cv.getContext('2d');
        c.translate(SPRITE / 2, SPRITE / 2);
        c.lineJoin = 'round';
        c.lineCap = 'round';
        // stem
        c.strokeStyle = '#6b3e1f';
        c.lineWidth = 3;
        c.beginPath(); c.moveTo(0, 8); c.lineTo(0, 28); c.stroke();
        c.fillStyle = color;
        c.strokeStyle = color;
        if (shape === 'maple') {
          starPath(c, 0, -2, 24, 0.5);
          c.lineWidth = 6;
          c.stroke();
          c.fill();
        } else if (shape === 'oak') {
          c.beginPath();
          for (let i = 0; i <= 16; i++) {
            const a = (i / 16) * Math.PI * 2;
            const wob = i % 2 ? 0.78 : 1;
            c.lineTo(Math.cos(a) * 14 * wob, Math.sin(a) * 25 * wob - 2);
          }
          c.closePath();
          c.lineWidth = 5;
          c.stroke();
          c.fill();
        } else {
          c.beginPath();
          c.moveTo(0, -26);
          c.bezierCurveTo(22, -18, 20, 8, 0, 16);
          c.bezierCurveTo(-20, 8, -22, -18, 0, -26);
          c.fill();
        }
        // vein and a little shine
        c.strokeStyle = 'rgba(80,30,10,0.35)';
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(0, 14); c.lineTo(0, -20); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.22)';
        c.beginPath(); c.ellipse(-6, -8, 4, 8, 0.3, 0, Math.PI * 2); c.fill();
        leafSprites[`${shape}-${color}`] = cv;
      }
    }
  }
  buildLeafSprites();
  const randomSprite = () => leafSprites[`${pick(LEAF_SHAPES)}-${pick(LEAF_COLORS)}`];

  function drawLeaf(c, sprite, x, y, rot, size, flip = 1) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.scale(flip, 1);
    c.drawImage(sprite, -size / 2, -size / 2, size, size);
    c.restore();
  }

  // ---------- world / view ----------
  let W = 1600, H = 1000;
  const view = { w: 0, h: 0, dpr: 1, scale: 1, ox: 0, oy: 0 };
  const bgCanvas = document.createElement('canvas');

  const lawn = { x: 0, y: 0, w: 0, h: 0 };
  const pile = { x: 0, y: 0, r: PILE_MIN_R, leaves: [], wobble: 0 };

  // state: title -> blow -> gather (the last leaves land on the pile) -> win
  const game = {
    state: 'title',
    level: 1,
    time: 0,
    seed: 1,
    colors: BLOWER_COLORS[0],
    trees: [],
    leaves: [],     // each: ground -> fly -> piled
    particles: [],
    leafTotal: 0,
    blown: 0,       // leaves whooshed up so far
    piled: 0,       // leaves that have landed on the pile
    fracShown: 0,
    milestone: 0,   // how many MILESTONES have been reached
    starPop: 0,
    idleT: 0,
    phaseT: 0,
    winT: 0,
    bumpCooldown: 0,
    rustleCooldown: 0,
    plopCooldown: 0,
  };

  const blower = {
    x: 0, y: 0, vx: 0, vy: 0, heading: -Math.PI / 2,
    tx: null, ty: null, speed: 0, stuckT: 0,
    blink: 0, blinkT: 2, squish: 0,
  };

  function resize() {
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    canvas.style.width = view.w + 'px';
    canvas.style.height = view.h + 'px';
    view.scale = Math.min(view.w / W, view.h / H);
    view.ox = (view.w - W * view.scale) / 2;
    view.oy = (view.h - H * view.scale) / 2;
  }

  function toWorld(px, py) {
    return { x: (px - view.ox) / view.scale, y: (py - view.oy) / view.scale };
  }

  // ---------- yard generation ----------
  function placePile() {
    const m = PILE_MAX_R + 20;
    const corners = [
      { x: lawn.x + m, y: lawn.y + lawn.h - m },
      { x: lawn.x + lawn.w - m, y: lawn.y + lawn.h - m },
      { x: lawn.x + m, y: lawn.y + m },
      { x: lawn.x + lawn.w - m, y: lawn.y + m },
    ];
    const c = game.level === 1 ? corners[1] : pick(corners);
    Object.assign(pile, { x: c.x, y: c.y, r: PILE_MIN_R, leaves: [], wobble: 0 });
  }

  function placeTrees(count) {
    const trees = [];
    for (let tries = 0; tries < 200 && trees.length < count; tries++) {
      const r = rand(78, 100);
      // Leave room for the blower to drive all the way around every tree.
      const m = r + BLOWER_R * 2 + 40;
      if (lawn.w < m * 2 || lawn.h < m * 2) break;
      const x = rand(lawn.x + m, lawn.x + lawn.w - m);
      const y = rand(lawn.y + m, lawn.y + lawn.h - m);
      if (trees.some(t => dist(x, y, t.x, t.y) < r + t.r + BLOWER_R * 4 + 40)) continue;
      if (dist(x, y, pile.x, pile.y) < r + PILE_MAX_R + BLOWER_R * 3) continue;
      const bumps = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rand(-0.2, 0.2);
        bumps.push({ a, d: r * rand(0.55, 0.7), s: r * rand(0.38, 0.5), color: pick(['#e8702a', '#d94f2b', '#f2a93b']) });
      }
      trees.push({ x, y, r, bumps });
    }
    return trees;
  }

  function leafSpotOk(x, y) {
    if (x < lawn.x + 22 || x > lawn.x + lawn.w - 22 || y < lawn.y + 22 || y > lawn.y + lawn.h - 22) return false;
    if (dist(x, y, pile.x, pile.y) < PILE_MAX_R + 40) return false;
    // Nothing in front of the blower at the start, so the first whoosh is the child's own.
    if (dist(x, y, blower.x, blower.y) < GRAB_R + 60 || inWind({ x, y }, 60)) return false;
    return game.trees.every(t => dist(x, y, t.x, t.y) > t.r + 12);
  }

  function makeLeaf(x, y) {
    return {
      x, y, z: 0, rot: rand(0, Math.PI * 2), size: LEAF_SIZE * rand(0.85, 1.15), sprite: randomSprite(),
      state: 'ground', t: 0, dur: 1,
      x0: 0, y0: 0, x1: 0, y1: 0, x2: 0, y2: 0, lift: 0, spin: 0,
    };
  }

  function scatterLeaves() {
    const want = Math.min(100 + game.level * 15, 170);
    const leaves = [];
    const tryAdd = (x, y) => { if (leafSpotOk(x, y)) leaves.push(makeLeaf(x, y)); };
    // Big drifts under the trees, where the leaves fell...
    for (const t of game.trees) {
      for (let tries = 0; tries < 400 && leaves.length < want * 0.3 * (game.trees.indexOf(t) + 1); tries++) {
        const a = rand(0, Math.PI * 2), d = t.r + 14 + Math.abs(rand(-1, 1) * rand(0, 1)) * 140;
        tryAdd(t.x + Math.cos(a) * d, t.y + Math.sin(a) * d);
      }
    }
    // ...a few little piles the wind made...
    for (let k = 0; k < 4; k++) {
      const cx = rand(lawn.x + 80, lawn.x + lawn.w - 80), cy = rand(lawn.y + 80, lawn.y + lawn.h - 80);
      for (let i = 0; i < 14 && leaves.length < want * 0.75; i++) tryAdd(cx + rand(-70, 70), cy + rand(-50, 50));
    }
    // ...and the rest sprinkled everywhere.
    for (let tries = 0; tries < 2000 && leaves.length < want; tries++) {
      tryAdd(rand(lawn.x, lawn.x + lawn.w), rand(lawn.y, lawn.y + lawn.h));
    }
    return leaves;
  }

  function newYard() {
    const portrait = window.innerHeight > window.innerWidth * 1.1;
    W = portrait ? 1000 : 1600;
    H = portrait ? 1500 : 1000;
    lawn.x = EDGE; lawn.y = FENCE;
    lawn.w = W - EDGE * 2; lawn.h = H - FENCE - EDGE;

    game.seed = (Math.random() * 1e9) | 0;
    game.colors = BLOWER_COLORS[(game.level - 1) % BLOWER_COLORS.length];
    placePile();
    game.trees = placeTrees(game.level === 1 ? 1 : pick([1, 2, 2]));
    game.particles = [];
    game.blown = 0;
    game.piled = 0;
    game.fracShown = 0;
    game.milestone = 0;
    game.starPop = 0;
    game.idleT = 0;
    game.phaseT = 0;
    game.winT = 0;

    Object.assign(blower, {
      x: lawn.x + lawn.w / 2, y: lawn.y + lawn.h / 2, vx: 0, vy: 0, heading: -Math.PI / 2,
      tx: null, ty: null, speed: 0, stuckT: 0, squish: 0,
    });
    // Don't start on top of a tree.
    collide(blower);

    game.leaves = scatterLeaves();
    game.leafTotal = game.leaves.length;

    buildBackground();
    resize();
  }

  // ---------- pre-rendered background ----------
  function buildBackground() {
    const r = mulberry32(game.seed);
    bgCanvas.width = W; bgCanvas.height = H;
    const b = bgCanvas.getContext('2d');

    // Garden beds
    b.fillStyle = '#8a5a3b';
    b.fillRect(0, 0, W, H);
    b.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < W * H / 900; i++) b.fillRect(r() * W, r() * H, 6 + r() * 6, 3);
    b.fillStyle = 'rgba(255,255,255,0.07)';
    for (let i = 0; i < W * H / 1400; i++) b.fillRect(r() * W, r() * H, 5, 3);

    // Hedge, turning autumn colors
    b.fillStyle = '#5b6b2a';
    b.fillRect(0, 0, W, FENCE - 16);
    for (let x = -20; x < W + 40; x += 46) {
      b.fillStyle = r() < 0.5 ? '#8a7a2a' : '#6e7d2c';
      circle(b, x + r() * 10, FENCE - 50 + r() * 10, 34 + r() * 8); b.fill();
    }
    for (let x = 0; x < W + 40; x += 58) {
      b.fillStyle = ['#c9822a', '#b5a33a', '#d06a2a'][Math.floor(r() * 3)];
      circle(b, x + r() * 14, FENCE - 72 + r() * 10, 22 + r() * 6); b.fill();
    }

    // Wooden fence
    const railY1 = FENCE - 78, railY2 = FENCE - 38;
    b.fillStyle = 'rgba(0,0,0,0.15)';
    b.fillRect(0, railY1 + 6, W, 14);
    b.fillRect(0, railY2 + 6, W, 14);
    b.fillStyle = '#c89a6a';
    b.fillRect(0, railY1, W, 14);
    b.fillRect(0, railY2, W, 14);
    for (let x = 10; x < W; x += 44) {
      b.fillStyle = 'rgba(0,0,0,0.15)';
      b.fillRect(x + 5, FENCE - 96, 26, 84);
      b.fillStyle = '#e0b688';
      roundRect(b, x, FENCE - 104, 26, 92, 10);
      b.fill();
      b.strokeStyle = '#a97c50';
      b.lineWidth = 2;
      b.stroke();
    }

    // Mums and little pumpkins in the side and bottom beds
    const mum = (x, y) => {
      b.fillStyle = '#3f7a34';
      circle(b, x, y + 4, 16); b.fill();
      const col = FLOWER_COLORS[Math.floor(r() * FLOWER_COLORS.length)];
      b.fillStyle = col;
      for (let k = 0; k < 9; k++) {
        const a = r() * Math.PI * 2, d = r() * 10;
        circle(b, x + Math.cos(a) * d, y + Math.sin(a) * d, 6); b.fill();
      }
    };
    const pumpkin = (x, y) => {
      const s = 14 + r() * 6;
      b.fillStyle = '#e8702a';
      for (const dx of [-0.5, 0.5, 0]) {
        b.beginPath(); b.ellipse(x + dx * s, y, s * 0.6, s * 0.8, 0, 0, Math.PI * 2); b.fill();
      }
      b.strokeStyle = '#c2551b';
      b.lineWidth = 2;
      b.beginPath(); b.moveTo(x, y - s * 0.7); b.lineTo(x, y + s * 0.7); b.stroke();
      b.fillStyle = '#5a7d2a';
      b.fillRect(x - 3, y - s * 0.95, 6, 8);
    };
    const plant = (x, y) => (r() < 0.3 ? pumpkin(x, y) : mum(x, y));
    for (let y = FENCE + 30; y < H - 20; y += 60 + r() * 30) {
      for (const x of [EDGE / 2, W - EDGE / 2]) plant(x + (r() - 0.5) * 12, y + (r() - 0.5) * 16);
    }
    for (let x = 40; x < W - 20; x += 60 + r() * 30) plant(x + (r() - 0.5) * 16, H - EDGE / 2 + (r() - 0.5) * 12);

    // Lawn with soft stripes
    b.fillStyle = '#8cc152';
    b.fillRect(lawn.x, lawn.y, lawn.w, lawn.h);
    b.fillStyle = '#82b84a';
    const band = 90;
    const vertical = W > H;
    for (let i = 1; i * band < (vertical ? lawn.w : lawn.h); i += 2) {
      if (vertical) b.fillRect(lawn.x + i * band, lawn.y, band, lawn.h);
      else b.fillRect(lawn.x, lawn.y + i * band, lawn.w, band);
    }
    b.fillStyle = 'rgba(40,110,30,0.18)';
    for (let i = 0; i < lawn.w * lawn.h / 350; i++) {
      b.fillRect(lawn.x + r() * lawn.w, lawn.y + r() * lawn.h, 2, 5);
    }
    b.strokeStyle = 'rgba(0,0,0,0.18)';
    b.lineWidth = 6;
    b.strokeRect(lawn.x + 3, lawn.y + 3, lawn.w - 6, lawn.h - 6);
  }

  // ---------- input ----------
  let pointerDown = false;
  let activePointer = null;

  function setTarget(e) {
    if (game.state !== 'blow') return;
    const p = toWorld(e.clientX, e.clientY);
    blower.tx = clamp(p.x, lawn.x + BLOWER_R, lawn.x + lawn.w - BLOWER_R);
    blower.ty = clamp(p.y, lawn.y + BLOWER_R, lawn.y + lawn.h - BLOWER_R);
    blower.stuckT = 0;
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    Sound.init();
    requestWakeLock();
    if (game.state === 'title') {
      Voice.prime();
      startBlowing();
      return;
    }
    if (game.state === 'win') {
      if (game.winT > 2.2) {
        game.level++;
        newYard();
        startBlowing();
      }
      return;
    }
    pointerDown = true;
    activePointer = e.pointerId;
    setTarget(e);
  });
  canvas.addEventListener('pointermove', e => {
    if (pointerDown && e.pointerId === activePointer) setTarget(e);
  });
  const release = e => { if (e.pointerId === activePointer) pointerDown = false; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('gesturestart', e => e.preventDefault());

  function startBlowing() {
    game.state = 'blow';
    game.idleT = 0;
    Voice.say("Let's blow the leaves!");
  }

  let wakeLock = null;
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (e) { /* not allowed on plain http — that's fine */ }
  }

  // HTML buttons
  const btnSound = document.getElementById('btn-sound');
  const btnFull = document.getElementById('btn-full');
  btnSound.addEventListener('click', () => {
    Sound.init();
    Sound.setMuted(!Sound.muted);
    btnSound.querySelector('.wave').style.display = Sound.muted ? 'none' : '';
    btnSound.querySelector('.cross').style.display = Sound.muted ? '' : 'none';
  });
  const fsEl = document.documentElement;
  const canFullscreen = !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
  if (!canFullscreen) btnFull.hidden = true;
  btnFull.addEventListener('click', () => {
    const inFs = document.fullscreenElement || document.webkitFullscreenElement;
    try {
      if (inFs) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl);
    } catch (e) { /* ignore */ }
  });

  document.addEventListener('visibilitychange', () => {
    if (!Sound.ctx) return;
    if (document.hidden) Sound.ctx.suspend();
    else {
      Sound.ctx.resume();
      if (game.state !== 'title') requestWakeLock();
    }
  });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));

  // ---------- simulation: driving ----------
  // Keeps the blower on the lawn and out of the trees and the pile.
  // Returns true when it bumped into a tree.
  function collide(v) {
    const r = BLOWER_R;
    v.x = clamp(v.x, lawn.x + r, lawn.x + lawn.w - r);
    v.y = clamp(v.y, lawn.y + r, lawn.y + lawn.h - r);
    const pushOut = (ox, oy, or) => {
      const dx = v.x - ox, dy = v.y - oy;
      const d = Math.hypot(dx, dy) || 0.01;
      if (d >= or + r) return false;
      v.x = ox + (dx / d) * (or + r);
      v.y = oy + (dy / d) * (or + r);
      return true;
    };
    pushOut(pile.x, pile.y, pile.r * 0.7);
    let hitTree = false;
    for (const t of game.trees) if (pushOut(t.x, t.y, t.r)) hitTree = true;
    return hitTree;
  }

  function drive(v, maxSpeed, dt) {
    let dvx = 0, dvy = 0;
    if (v.tx !== null) {
      const dx = v.tx - v.x, dy = v.ty - v.y;
      const d = Math.hypot(dx, dy);
      if (d < 8) {
        v.tx = v.ty = null;
      } else {
        const sp = maxSpeed * Math.min(1, d / 90 + 0.2);
        dvx = (dx / d) * sp;
        dvy = (dy / d) * sp;
      }
    }
    const k = 1 - Math.exp(-8 * dt);
    v.vx += (dvx - v.vx) * k;
    v.vy += (dvy - v.vy) * k;

    const px = v.x, py = v.y;
    v.x += v.vx * dt;
    v.y += v.vy * dt;
    const fx = v.x, fy = v.y;
    const hitTree = collide(v);
    const wanted = Math.hypot(v.vx, v.vy);
    v.speed = dist(px, py, v.x, v.y) / dt;
    // Only boop for trees, not for gently running along the lawn's edge or the pile.
    if (hitTree && game.bumpCooldown <= 0 && wanted > 140 && v.speed < wanted * 0.55) {
      Sound.bump();
      v.squish = 1;
      game.bumpCooldown = 0.7;
    }
    if (v.x !== fx || v.y !== fy) {
      v.vx = (v.x - px) / dt;
      v.vy = (v.y - py) / dt;
    }

    // Give up on a target we can't reach (e.g. tapped on the tree).
    if (v.tx !== null && v.speed < 25) {
      v.stuckT += dt;
      if (v.stuckT > 0.6) v.tx = v.ty = null;
    } else {
      v.stuckT = 0;
    }

    if (v.speed > 30) {
      const target = Math.atan2(v.vy, v.vx);
      v.heading += angleDiff(v.heading, target) * Math.min(1, 10 * dt);
    }
  }

  // ---------- simulation: leaves ----------
  function inWind(l, extra = 0) {
    if (dist(l.x, l.y, blower.x, blower.y) < GRAB_R + extra) return true;
    const dx = Math.cos(blower.heading), dy = Math.sin(blower.heading);
    const tip = nozzleTip();
    const rx = l.x - tip.x, ry = l.y - tip.y;
    const along = rx * dx + ry * dy;
    if (along < -20 || along > WIND_LEN + extra) return false;
    return Math.abs(rx * -dy + ry * dx) < WIND_W + extra + Math.max(0, along) * 0.45;
  }

  // Send a leaf swirling up into the air and over onto the pile.
  function launch(l, dirX, dirY, push) {
    l.state = 'fly';
    l.t = 0;
    l.x0 = l.x; l.y0 = l.y;
    const side = rand(-1, 1) * push * 0.5;
    l.x1 = clamp(l.x + dirX * push - dirY * side, 0, W);
    l.y1 = clamp(l.y + dirY * push + dirX * side, 0, H);
    // Land inside the mound, which will have grown a little by the time it gets there.
    const grown = PILE_MIN_R + (PILE_MAX_R - PILE_MIN_R) * Math.sqrt((game.blown + 1) / Math.max(1, game.leafTotal));
    const a = rand(0, Math.PI * 2), d = Math.sqrt(Math.random()) * grown * 0.75;
    l.x2 = pile.x + Math.cos(a) * d;
    l.y2 = pile.y + Math.sin(a) * d * 0.8;
    l.dur = clamp((dist(l.x0, l.y0, l.x1, l.y1) + dist(l.x1, l.y1, l.x2, l.y2)) / 700, 0.9, 2.2);
    l.lift = rand(90, 170);
    l.spin = rand(-9, 9);
    game.blown++;
  }

  function updateBlowing(dt) {
    drive(blower, BLOWER_SPEED, dt);
    const dx = Math.cos(blower.heading), dy = Math.sin(blower.heading);
    let lifted = 0;
    for (const l of game.leaves) {
      if (l.state !== 'ground' || !inWind(l)) continue;
      // Mostly along the air stream, a little away from the blower's middle.
      const ax = l.x - blower.x, ay = l.y - blower.y, ad = Math.hypot(ax, ay) || 1;
      const bx = dx * 0.75 + (ax / ad) * 0.5, by = dy * 0.75 + (ay / ad) * 0.5, bd = Math.hypot(bx, by) || 1;
      launch(l, bx / bd, by / bd, rand(150, 300));
      lifted++;
    }
    if (lifted) {
      game.idleT = 0;
      if (game.rustleCooldown <= 0) { Sound.rustle(); game.rustleCooldown = 0.15; }
    }

    // Puffs of air from the nozzle, so you can see it blowing.
    if (Math.random() < 0.8) {
      const s = rand(420, 600), spread = rand(-0.35, 0.35);
      const a = blower.heading + spread;
      const tip = nozzleTip();
      game.particles.push({
        kind: 'air', x: tip.x, y: tip.y,
        vx: Math.cos(a) * s + blower.vx, vy: Math.sin(a) * s + blower.vy, drag: 3,
        life: 0.35, max: 0.35, size: rand(18, 30), rot: a,
      });
    }

    const frac = game.blown / game.leafTotal;
    while (game.milestone < MILESTONES.length - 1 && frac >= MILESTONES[game.milestone]) {
      Voice.say(CHEERS[MILESTONES[game.milestone]]);
      game.milestone++;
      game.starPop = 1;
      Sound.chime();
    }
    if (frac >= AUTO_FINISH) finishBlowing();
  }

  // Whisk up whatever leaves are left with a sparkle, and wait for them to land.
  function finishBlowing() {
    let n = 0;
    for (const l of game.leaves) {
      if (l.state !== 'ground') continue;
      const a = Math.atan2(pile.y - l.y, pile.x - l.x);
      launch(l, Math.cos(a), Math.sin(a), rand(60, 140));
      if (n++ % 3 === 0) sparkle(l.x, l.y);
    }
    game.milestone = MILESTONES.length;
    game.starPop = 1;
    game.state = 'gather';
    game.phaseT = 0;
    game.idleT = 0;
    pointerDown = false;
    Sound.tada();
    Voice.say('All clean!');
  }

  function updateLeaves(dt) {
    for (const l of game.leaves) {
      if (l.state !== 'fly') continue;
      l.t += dt;
      const u = clamp(l.t / l.dur, 0, 1);
      // A curve: out along the blower's air, then round and down onto the pile.
      const e = 1 - (1 - u) * (1 - u) * 0.6 - 0.4 * (1 - u); // quick start, soft landing
      const m = 1 - e;
      l.x = m * m * l.x0 + 2 * m * e * l.x1 + e * e * l.x2;
      l.y = m * m * l.y0 + 2 * m * e * l.y1 + e * e * l.y2;
      l.z = Math.sin(u * Math.PI) * l.lift;
      l.rot += l.spin * dt * (1 - u * 0.7);
      if (u >= 1) {
        l.state = 'piled';
        l.z = 0;
        game.piled++;
        pile.leaves.push({ dx: l.x - pile.x, dy: l.y - pile.y, rot: l.rot, size: l.size, sprite: l.sprite });
        pile.wobble = Math.max(pile.wobble, 0.35);
        if (game.plopCooldown <= 0) { Sound.plop(); game.plopCooldown = 0.07; }
      }
    }
    const target = PILE_MIN_R + (PILE_MAX_R - PILE_MIN_R) * Math.sqrt(game.piled / Math.max(1, game.leafTotal));
    pile.r += (target - pile.r) * (1 - Math.exp(-6 * dt));
    pile.wobble = Math.max(0, pile.wobble - dt * 2);
  }

  // ---------- simulation: finishing up ----------
  function updateGather(dt) {
    game.phaseT += dt;
    drive(blower, BLOWER_SPEED, dt);
    if (game.phaseT > 0.8 && game.leaves.every(l => l.state === 'piled')) win();
  }

  // Leaves burst up out of the pile and float back down.
  function splash() {
    pile.wobble = 1;
    Sound.crunch();
    for (let i = 0; i < 70; i++) {
      const a = rand(0, Math.PI * 2), s = rand(60, 420);
      game.particles.push({
        kind: 'leaf', x: pile.x + rand(-30, 30), y: pile.y + rand(-20, 20), z: 10,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: rand(350, 900), drag: 1.2,
        life: rand(2.2, 3), max: 3, size: LEAF_SIZE * rand(0.8, 1.1), sprite: randomSprite(),
        rot: rand(0, 6), vr: rand(-8, 8),
      });
    }
  }

  function win() {
    game.state = 'win';
    game.winT = 0;
    Sound.win();
    splash();
    Voice.say('Hooray! What a big leaf pile!');
    for (let i = 0; i < 160; i++) {
      game.particles.push({
        kind: 'confetti', x: rand(0, W), y: rand(-H * 0.2, H * 0.3),
        vx: rand(-80, 80), vy: rand(-250, 50), g: 420,
        life: rand(2.5, 4.5), max: 4.5, size: rand(10, 18), color: pick(CONFETTI),
        rot: rand(0, 6), vr: rand(-8, 8),
      });
    }
  }

  function burst(x, y, n, colors) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand(-0.2, 0.2);
      const s = rand(150, 280);
      game.particles.push({
        kind: 'star', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.6, max: 0.6, size: rand(8, 13), color: pick(colors), rot: rand(0, 6), vr: rand(-6, 6), drag: 3,
      });
    }
  }

  function sparkle(x, y) {
    burst(x, y, 5, ['#ffffff', '#ffd23f', '#fff3b0']);
  }

  function updateParticles(dt) {
    for (const p of game.particles) {
      p.life -= dt;
      if (p.g) p.vy += p.g * dt;
      if (p.drag) { p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt); }
      if (p.kind === 'confetti') p.vx += Math.sin(game.time * 3 + p.rot) * 30 * dt;
      if (p.kind === 'leaf') {
        // Tossed leaves float back down, rocking side to side like real ones.
        p.vz -= 900 * dt;
        if (p.vz < -120) p.vz = -120;
        p.z += p.vz * dt;
        if (p.z <= 0) { p.z = 0; p.vx *= 0.9; p.vy *= 0.9; p.vr *= 0.9; } else p.vx += Math.sin(game.time * 4 + p.rot) * 60 * dt;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.vr) p.rot += p.vr * dt;
    }
    if (game.particles.length > 600) game.particles.splice(0, game.particles.length - 600);
    game.particles = game.particles.filter(p => p.life > 0);
  }

  function update(dt) {
    game.time += dt;
    game.bumpCooldown -= dt;
    game.rustleCooldown -= dt;
    game.plopCooldown -= dt;
    game.starPop = Math.max(0, game.starPop - dt * 3);
    if (game.state === 'blow') game.idleT += dt;

    if (game.state === 'blow') updateBlowing(dt);
    else if (game.state === 'gather') updateGather(dt);
    else if (game.state === 'win') game.winT += dt;
    updateLeaves(dt);
    updateParticles(dt);

    const frac = game.leafTotal ? game.blown / game.leafTotal : 0;
    game.fracShown += (frac - game.fracShown) * (1 - Math.exp(-8 * dt));

    blower.squish = Math.max(0, blower.squish - dt * 4);
    blower.blinkT -= dt;
    if (blower.blinkT < 0) { blower.blink = 0.14; blower.blinkT = rand(2, 5); }
    blower.blink = Math.max(0, blower.blink - dt);

    if (game.state === 'blow') Sound.blower(true, clamp(blower.speed / BLOWER_SPEED, 0, 1));
    else Sound.blower(false, 0);
  }

  // ---------- hints ----------
  function hintTarget() {
    if (game.state === 'blow' && game.idleT >= HINT_AFTER) return nearestLeaf(blower.x, blower.y);
    return null;
  }

  function nearestLeaf(x, y) {
    let best = null, bd = Infinity;
    for (const l of game.leaves) {
      if (l.state !== 'ground') continue;
      const d = dist(x, y, l.x, l.y);
      if (d < bd) { bd = d; best = { x: l.x, y: l.y }; }
    }
    return best;
  }

  // ---------- drawing: yard ----------
  function drawTree(t) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    circle(ctx, t.x + 16, t.y + 22, t.r); ctx.fill();
    ctx.fillStyle = '#c2551b';
    circle(ctx, t.x, t.y, t.r); ctx.fill();
    for (const b of t.bumps) {
      ctx.fillStyle = b.color;
      circle(ctx, t.x + Math.cos(b.a) * b.d, t.y + Math.sin(b.a) * b.d, b.s); ctx.fill();
    }
    ctx.fillStyle = '#ffb63b';
    circle(ctx, t.x - t.r * 0.2, t.y - t.r * 0.22, t.r * 0.5); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    circle(ctx, t.x - t.r * 0.32, t.y - t.r * 0.35, t.r * 0.22); ctx.fill();
  }

  function drawPile() {
    const s = 1 + Math.sin(game.time * 22) * 0.06 * pile.wobble;
    ctx.save();
    ctx.translate(pile.x, pile.y);
    ctx.scale(s, 1 / s);
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(10, 14, pile.r * 1.05, pile.r * 0.85, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b5561f';
    ctx.beginPath(); ctx.ellipse(0, 0, pile.r * 0.9, pile.r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d9772a';
    ctx.beginPath(); ctx.ellipse(-pile.r * 0.15, -pile.r * 0.15, pile.r * 0.55, pile.r * 0.42, 0, 0, Math.PI * 2); ctx.fill();
    for (const l of pile.leaves) drawLeaf(ctx, l.sprite, l.dx, l.dy, l.rot, l.size);
    ctx.restore();
  }

  function drawGroundLeaves() {
    for (const l of game.leaves) {
      if (l.state === 'ground') drawLeaf(ctx, l.sprite, l.x, l.y, l.rot, l.size);
    }
  }

  function drawFlyingLeaves() {
    for (const l of game.leaves) {
      if (l.state !== 'fly') continue;
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.beginPath(); ctx.ellipse(l.x, l.y, l.size * 0.35, l.size * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      const flip = Math.cos(l.t * 9 + l.spin);
      drawLeaf(ctx, l.sprite, l.x, l.y - l.z, l.rot, l.size * (1 + l.z / 400), flip);
    }
  }

  // ---------- drawing: leaf blower ----------
  // The blower is drawn from the side (tube in front, handle on top), and
  // flipped when it heads left so it never ends up upside down.
  const blowerFlip = () => (Math.cos(blower.heading) < 0 ? -1 : 1);
  const NOZZLE = { x: 116, y: 14 }; // where the air comes out, in the blower's own drawing

  function nozzleTip() {
    const ch = Math.cos(blower.heading), sh = Math.sin(blower.heading);
    const lx = NOZZLE.x, ly = NOZZLE.y * blowerFlip();
    return { x: blower.x + lx * ch - ly * sh, y: blower.y + lx * sh + ly * ch };
  }

  function drawBlower() {
    const v = blower;
    const c = game.colors;
    const running = game.state === 'blow';
    const jig = running ? Math.sin(game.time * 60) * 1 : 0;
    const bob = game.state === 'win' ? -Math.abs(Math.sin(game.winT * 6)) * 18 : 0;
    ctx.save();
    ctx.translate(v.x + jig, v.y + bob);
    ctx.rotate(v.heading);
    const sq = 1 + v.squish * 0.08;
    ctx.scale(1 / sq, sq * blowerFlip());

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(28, 34, 88, 16, 0, 0, Math.PI * 2); ctx.fill();

    // long blower tube, a little narrower at the end
    ctx.beginPath();
    ctx.moveTo(8, -2); ctx.lineTo(NOZZLE.x - 6, 6);
    ctx.lineTo(NOZZLE.x - 6, 22); ctx.lineTo(8, 30);
    ctx.closePath();
    ctx.fillStyle = '#e4e8ee';
    ctx.fill();
    ctx.strokeStyle = '#8d99ae';
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fillStyle = c.main;
    ctx.fillRect(52, 1.5, 12, 25);
    // bright tip
    ctx.fillStyle = '#ff9f1c';
    roundRect(ctx, NOZZLE.x - 14, 2, 16, 24, 6); ctx.fill();
    ctx.fillStyle = '#2b2d42';
    ctx.beginPath(); ctx.ellipse(NOZZLE.x + 1, NOZZLE.y, 3.5, 8, 0, 0, Math.PI * 2); ctx.fill();

    // handle on top, with an orange trigger
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 11;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-40, -20); ctx.lineTo(-34, -50); ctx.lineTo(0, -50); ctx.lineTo(6, -20);
    ctx.stroke();
    ctx.fillStyle = '#ff9f1c';
    roundRect(ctx, -12, -46, 10, 16, 4); ctx.fill();

    // motor body
    roundRect(ctx, -62, -26, 86, 60, 26);
    ctx.fillStyle = c.main;
    ctx.fill();
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = c.light;
    ctx.beginPath(); ctx.ellipse(-30, -14, 22, 6, 0, 0, Math.PI * 2); ctx.fill();

    // big round air intake on the side, fan spinning inside
    ctx.fillStyle = '#5c677d';
    circle(ctx, -38, 6, 18); ctx.fill();
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.save();
    ctx.translate(-38, 6);
    ctx.rotate(game.time * (running ? 30 : 2));
    ctx.fillStyle = '#c0c8d4';
    for (let k = 0; k < 4; k++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath(); ctx.ellipse(8, 0, 8, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // face on the front of the motor
    const open = v.blink > 0 ? 0.15 : 1;
    for (const ex of [-8, 10]) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(ex, -4, 8, 9.5 * open, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      if (open > 0.5) {
        ctx.fillStyle = '#2b2d42';
        circle(ctx, ex + 2.5, -3, 4.5); ctx.fill();
        ctx.fillStyle = '#ffffff';
        circle(ctx, ex + 3.5, -5, 1.6); ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(255,120,150,0.5)';
    circle(ctx, -14, 12, 5); ctx.fill();
    circle(ctx, 17, 12, 5); ctx.fill();
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(2, 10, 7, 0.3, Math.PI - 0.3); ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of game.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.kind === 'leaf') {
        ctx.globalAlpha = Math.min(1, p.life * 1.5);
        drawLeaf(ctx, p.sprite, p.x, p.y - p.z, p.rot, p.size * (1 + p.z / 500), Math.cos(game.time * 8 + p.rot));
        continue;
      }
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      if (p.kind === 'star') {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        starPath(ctx, 0, 0, p.size * (0.6 + a * 0.4)); ctx.fill();
      } else if (p.kind === 'air') {
        ctx.globalAlpha = a * 0.6;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-p.size / 2, 0); ctx.quadraticCurveTo(0, -6, p.size / 2, 0); ctx.stroke();
      } else if (p.kind === 'confetti') {
        ctx.globalAlpha = Math.min(1, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawHintArrow() {
    const t = hintTarget();
    if (!t) return;
    const bounce = Math.abs(Math.sin(game.time * 5)) * 22;
    const x = t.x, y = t.y - 30 - bounce;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#ffd60a';
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-14, -60); ctx.lineTo(14, -60); ctx.lineTo(14, -24); ctx.lineTo(32, -24);
    ctx.lineTo(0, 10); ctx.lineTo(-32, -24); ctx.lineTo(-14, -24);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  // ---------- drawing: HUD & overlays (screen space) ----------
  function hudScale() {
    return clamp(Math.min(view.w, view.h) / 600, 0.75, 1.4);
  }

  // An orange bar that fills as the leaves whoosh away, with a star at each quarter.
  function drawLeafBar(hs) {
    const bw = Math.min(view.w * 0.5, 420 * hs), bh = 26 * hs;
    const x0 = (view.w - bw) / 2, y = 30 * hs;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(ctx, x0 - 26 * hs, y - 14 * hs, bw + 52 * hs, bh + 28 * hs, (bh + 28 * hs) / 2); ctx.fill();
    ctx.save();
    roundRect(ctx, x0, y, bw, bh, bh / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = '#ff8c42';
    ctx.fillRect(x0, y, bw * clamp(game.fracShown, 0, 1), bh);
    ctx.restore();
    MILESTONES.forEach((m, i) => {
      const done = i < game.milestone;
      const pop = done && i === game.milestone - 1 ? 1 + game.starPop * 0.6 : 1;
      starPath(ctx, x0 + bw * m - (i === MILESTONES.length - 1 ? 4 * hs : 0), y + bh / 2, 20 * hs * pop);
      ctx.fillStyle = done ? '#ffd23f' : 'rgba(255,255,255,0.95)';
      ctx.fill();
      ctx.strokeStyle = done ? '#e0a800' : '#9aa5b1';
      ctx.lineWidth = 2.5 * hs;
      ctx.stroke();
    });
  }

  function bigText(text, x, y, size, fill = '#ffffff') {
    ctx.font = `bold ${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.16;
    ctx.strokeStyle = '#2b2d42';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  }

  function drawPlayButton(x, y, r, icon) {
    const p = 1 + Math.sin(game.time * 4) * 0.05;
    r *= p;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    circle(ctx, x + 5, y + 8, r); ctx.fill();
    ctx.fillStyle = '#ff8c42';
    circle(ctx, x, y, r); ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = r * 0.1;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    if (icon === 'play') {
      ctx.beginPath();
      ctx.moveTo(x - r * 0.28, y - r * 0.4);
      ctx.lineTo(x + r * 0.45, y);
      ctx.lineTo(x - r * 0.28, y + r * 0.4);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = r * 0.16;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(x, y, r * 0.42, -Math.PI * 0.35, Math.PI * 1.3);
      ctx.stroke();
      const a = -Math.PI * 0.35;
      const ax = x + Math.cos(a) * r * 0.42, ay = y + Math.sin(a) * r * 0.42;
      ctx.beginPath();
      ctx.moveTo(ax + r * 0.2, ay - r * 0.12);
      ctx.lineTo(ax - r * 0.02, ay + r * 0.22);
      ctx.lineTo(ax - r * 0.22, ay - r * 0.12);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawTitle(hs) {
    ctx.fillStyle = 'rgba(30, 34, 56, 0.4)';
    ctx.fillRect(0, 0, view.w, view.h);
    const cx = view.w / 2;
    const bounce = Math.sin(game.time * 2.5) * 6 * hs;
    bigText('Whoosh Whoosh', cx, view.h * 0.27 + bounce, 72 * hs, '#ffb400');
    bigText('Leaves!', cx, view.h * 0.27 + 78 * hs + bounce, 72 * hs, '#ffffff');
    drawPlayButton(cx, view.h * 0.62, 80 * hs, 'play');
  }

  function drawWin(hs) {
    const t = game.winT;
    const fade = clamp(t / 0.6, 0, 1);
    ctx.fillStyle = `rgba(30, 34, 56, ${0.3 * fade})`;
    ctx.fillRect(0, 0, view.w, view.h);
    const cx = view.w / 2;
    const s = clamp(t / 0.4, 0, 1);
    const wobble = 1 + Math.sin(t * 5) * 0.04;
    ctx.save();
    ctx.translate(cx, view.h * 0.3);
    ctx.scale(s * wobble, s * wobble);
    bigText('Hooray!', 0, 0, 96 * hs, '#ffd60a');
    ctx.restore();

    for (let i = 0; i < 3; i++) {
      const appear = clamp((t - 0.4 - i * 0.25) / 0.3, 0, 1);
      if (!appear) continue;
      const sx = cx + (i - 1) * 110 * hs;
      const sy = view.h * 0.48 - (i === 1 ? 20 * hs : 0);
      const r = 44 * hs * appear * (1 + Math.sin(t * 4 + i) * 0.06);
      starPath(ctx, sx, sy, r);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 5 * hs;
      ctx.stroke();
    }
    if (t > 2.2) drawPlayButton(cx, view.h * 0.72, 70 * hs, 'again');
  }

  function draw() {
    const { dpr, scale, ox, oy } = view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#2b2d42';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * ox, dpr * oy);
    ctx.drawImage(bgCanvas, 0, 0, W, H);
    drawGroundLeaves();
    drawPile();
    for (const t of game.trees) drawTree(t);
    drawBlower();
    drawFlyingLeaves();
    drawParticles();
    drawHintArrow();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hs = hudScale();
    if (game.state !== 'title') drawLeafBar(hs);
    if (game.state === 'title') drawTitle(hs);
    if (game.state === 'win') drawWin(hs);
  }

  // ---------- main loop ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }

  newYard();
  requestAnimationFrame(frame);

  // Hooks for the automated tests (tests/games/whoosh-whoosh-leaves.spec.js) and
  // for poking around from the browser console.
  window.__leaves = {
    game,
    blower,
    pile,
    lawn,
    toScreen: (x, y) => ({ x: view.ox + x * view.scale, y: view.oy + y * view.scale }),
    // Closest leaf still on the ground to (x, y), or null when they're all blown.
    nearestLeaf,
  };
})();
