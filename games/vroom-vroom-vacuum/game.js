'use strict';

// Vroom Vroom Vacuum — a tiny robot-vacuum game for little kids.
// Tap (or drag) anywhere and the vacuum drives there. Suck up all the messes,
// go back to the dock to empty the bin when it's full, and park on the dock
// when the house is clean to win.

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  // ---------- helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeIn = t => t * t;
  const angleDiff = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const shuffle = arr => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };

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
  const WALL = 36;
  const VAC_R = 58;
  const VAC_SPEED = 430;
  const BIN_CAPACITY = 5;
  const SUCK_TIME = 0.32;
  const DOCK_TRIGGER = 75;
  const DOCK_REARM = 170;
  const CELL = 30;
  const FONT = '"Arial Rounded MT Bold", "Nunito", "Trebuchet MS", "Segoe UI", sans-serif';

  const FLOORS = [
    { base: '#d9a86c', vary: ['#d2a064', '#dcae74', '#cf9c5e', '#e0b37a', '#d6a66a'], seam: 'rgba(110,65,25,0.35)' },
    { base: '#c98b5a', vary: ['#c28353', '#cf9262', '#bd7d4d', '#d39a6a', '#c88a58'], seam: 'rgba(90,45,15,0.35)' },
    { base: '#cfc3b1', vary: ['#c9bca9', '#d4c9b8', '#c4b6a2', '#d8cebf', '#cdc0ad'], seam: 'rgba(80,70,55,0.3)' },
  ];
  const RUGS = [
    { c: '#8fbfe0', b: '#5f93bd', d: '#d4e8f5' },
    { c: '#f4a6a6', b: '#d57878', d: '#fde0e0' },
    { c: '#b8e0a8', b: '#80b46e', d: '#e5f5de' },
    { c: '#f7d794', b: '#d6ae58', d: '#fff1cc' },
    { c: '#c9b4e0', b: '#9a80bd', d: '#ece2f7' },
  ];
  const WALL_COLORS = ['#f3e9dc', '#e3eff3', '#f6e5ec', '#ebf2de'];
  const SOFA_COLORS = [
    { main: '#6c8ebf', dark: '#4f6f9f', light: '#8aa9d6' },
    { main: '#e07a5f', dark: '#b85c43', light: '#ee9a82' },
    { main: '#6fae92', dark: '#4f8c71', light: '#8fc7ad' },
    { main: '#9d8ac7', dark: '#7a67a6', light: '#b8a8dc' },
  ];
  const TOY_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff', '#ff9f43'];

  const FURNITURE = {
    couch:     { w: 360, h: 150, wall: 1 },
    table:     { w: 230, h: 150, wall: 0 },
    plant:     { r: 46, wall: 0.5 },
    toybox:    { w: 170, h: 120, wall: 0.7 },
    chair:     { w: 115, h: 115, wall: 0 },
    bookshelf: { w: 320, h: 78, wall: 1 },
  };

  const NUMBERS = ['', 'One!', 'Two!', 'Three!', 'Four!', 'Five!', 'Six!'];

  // ---------- sound (all synthesized, no files) ----------
  const Sound = {
    ctx: null, master: null, noise: null, humGain: null, humOsc: null,
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

      // Motor hum: filtered noise (the "whirr") plus a low buzz.
      this.humGain = ac.createGain();
      this.humGain.gain.value = 0;
      this.humGain.connect(this.master);

      const n = ac.createBufferSource();
      n.buffer = this.noise;
      n.loop = true;
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1100;
      bp.Q.value = 0.8;
      const ng = ac.createGain();
      ng.gain.value = 0.55;
      n.connect(bp); bp.connect(ng); ng.connect(this.humGain);

      this.humOsc = ac.createOscillator();
      this.humOsc.type = 'sawtooth';
      this.humOsc.frequency.value = 90;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 450;
      const og = ac.createGain();
      og.gain.value = 0.3;
      this.humOsc.connect(lp); lp.connect(og); og.connect(this.humGain);

      n.start();
      this.humOsc.start();
    },

    setMuted(m) {
      this.muted = m;
      if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
      if (m) Voice.stop();
    },

    hum(on, level) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.humGain.gain.setTargetAtTime(on ? 0.05 + level * 0.12 : 0, t, 0.1);
      this.humOsc.frequency.setTargetAtTime(88 + level * 35, t, 0.15);
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

    whoosh(dur = 1.1, delay = 0) {
      if (!this.ctx) return;
      const ac = this.ctx;
      const t = ac.currentTime + delay;
      const src = ac.createBufferSource();
      src.buffer = this.noise;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.2;
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(2600, t + dur);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t);
      src.stop(t + dur + 0.05);
    },

    pop()   { this.tone(rand(520, 700), 0.14, { to: rand(1300, 1700), vol: 0.35 }); },
    bump()  { this.tone(170, 0.16, { type: 'triangle', to: 80, vol: 0.45 }); },
    full()  {
      this.tone(784, 0.16, { type: 'square', vol: 0.1 });
      this.tone(523, 0.3, { type: 'square', vol: 0.1, delay: 0.17 });
    },
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

  // ---------- world / view ----------
  let W = 1600, H = 1000;
  const view = { w: 0, h: 0, dpr: 1, scale: 1, ox: 0, oy: 0 };
  const floorCanvas = document.createElement('canvas');
  const trailCanvas = document.createElement('canvas');
  const trailCtx = trailCanvas.getContext('2d');
  const TRAIL_RES = 0.5;

  const game = {
    state: 'title',
    level: 1,
    time: 0,
    seed: 1,
    floor: FLOORS[0],
    wallColor: WALL_COLORS[0],
    rug: null,
    furniture: [],
    messes: [],
    particles: [],
    dock: null,
    total: 0,
    cleaned: 0,
    bin: 0,
    binShown: 0,
    binShake: 0,
    starPop: 0,
    needDock: false,
    allClean: false,
    leftDock: false,
    dockT: 0,
    dockFrom: null,
    dockBinStart: 0,
    dustTimer: 0,
    winT: 0,
    bumpCooldown: 0,
    fullCooldown: 0,
  };

  const vac = {
    x: 0, y: 0, vx: 0, vy: 0,
    heading: -Math.PI / 2,
    tx: null, ty: null,
    brush: 0,
    blink: 0, blinkT: 2,
    squish: 0,
    lookX: 0, lookY: 0,
    stampX: -999, stampY: -999,
    stuckT: 0,
    speed: 0,
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
    buildFloor();
  }

  function toWorld(px, py) {
    return { x: (px - view.ox) / view.scale, y: (py - view.oy) / view.scale };
  }

  // ---------- room generation ----------
  function rectsOverlap(a, b, gap) {
    return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap &&
           a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
  }

  function circleHitsFurniture(x, y, r) {
    for (const f of game.furniture) {
      if (f.shape === 'circle') {
        if (dist(x, y, f.cx, f.cy) < f.r + r) return true;
      } else {
        const cx = clamp(x, f.x, f.x + f.w);
        const cy = clamp(y, f.y, f.y + f.h);
        if (dist(x, y, cx, cy) < r) return true;
      }
    }
    return false;
  }

  function makeFurniture(kind, colors) {
    const spec = FURNITURE[kind];
    const fx0 = WALL, fy0 = WALL, fx1 = W - WALL, fy1 = H - WALL;
    const f = { kind, color: colors, toys: [] };

    if (spec.r) {
      f.shape = 'circle';
      f.r = spec.r;
      f.lw = f.lh = f.w = f.h = spec.r * 2;
      f.rot = rand(0, Math.PI * 2);
    } else {
      f.shape = 'rect';
      f.lw = spec.w;
      f.lh = spec.h;
    }

    const againstWall = Math.random() < spec.wall;
    if (againstWall) {
      // 0 = top, 1 = right, 2 = bottom, 3 = left. Local "top" faces the wall.
      const side = pick([0, 0, 1, 2, 3]);
      if (f.shape === 'rect') f.rot = side * Math.PI / 2;
      const sideways = f.shape === 'rect' && side % 2 === 1;
      f.w = sideways ? f.lh : f.lw;
      f.h = sideways ? f.lw : f.lh;
      if (side === 0) { f.x = rand(fx0, fx1 - f.w); f.y = fy0; }
      if (side === 2) { f.x = rand(fx0, fx1 - f.w); f.y = fy1 - f.h; }
      if (side === 1) { f.x = fx1 - f.w; f.y = rand(fy0, fy1 - f.h); }
      if (side === 3) { f.x = fx0; f.y = rand(fy0, fy1 - f.h); }
    } else {
      if (f.shape === 'rect') {
        f.rot = kind === 'chair' ? pick([0, 1, 2, 3]) * Math.PI / 2 : pick([0, Math.PI / 2]);
        const sideways = Math.abs(Math.sin(f.rot)) > 0.5;
        f.w = sideways ? f.lh : f.lw;
        f.h = sideways ? f.lw : f.lh;
      }
      const m = 170;
      f.x = rand(fx0 + m, fx1 - m - f.w);
      f.y = rand(fy0 + m, fy1 - m - f.h);
    }
    f.cx = f.x + f.w / 2;
    f.cy = f.y + f.h / 2;

    if (kind === 'toybox') {
      for (let i = 0; i < 5; i++) {
        f.toys.push({ dx: rand(-0.32, 0.32), dy: rand(-0.25, 0.25), s: rand(16, 26), c: pick(TOY_COLORS), round: Math.random() < 0.4, rot: rand(0, 1.5) });
      }
    }
    if (kind === 'bookshelf') {
      let x = 0;
      while (x < f.lw - 28) {
        const bw = rand(16, 30);
        f.toys.push({ x, w: bw, c: pick(TOY_COLORS), h: rand(0.5, 0.8) });
        x += bw + rand(2, 6);
      }
    }
    return f;
  }

  function layoutRoom() {
    const fx0 = WALL, fy0 = WALL, fx1 = W - WALL, fy1 = H - WALL;

    // Dock sits against the bottom wall.
    const dockX = Math.random() < 0.5 ? WALL + 170 : W - WALL - 170;
    const unitH = 30;
    const dock = { x: dockX, y: fy1 - unitH - VAC_R - 2, unitY: fy1 - unitH, unitH };
    game.dock = dock;
    game.furniture = [];

    // The dock's back unit is solid so the vacuum parks neatly against it.
    const dockUnit = { kind: 'dock', shape: 'rect', x: dockX - 70, y: fy1 - unitH, w: 140, h: unitH, hidden: true };
    const keepOut = { x: dockX - 170, y: dock.y - 190, w: 340, h: fy1 - (dock.y - 190) };

    const sofa = pick(SOFA_COLORS);
    const extras = shuffle(['plant', 'toybox', 'chair', 'bookshelf', 'plant', 'chair']);
    const kinds = ['couch', 'table', ...extras.slice(0, W > H ? 3 : 2)];
    const gap = VAC_R * 2 + 28;
    const placed = [];

    for (const kind of kinds) {
      for (let tries = 0; tries < 60; tries++) {
        const f = makeFurniture(kind, sofa);
        if (rectsOverlap(f, keepOut, 0)) continue;
        if (placed.some(p => rectsOverlap(f, p, gap))) continue;
        placed.push(f);
        break;
      }
    }
    game.furniture = [...placed, dockUnit];

    // Rug (you can drive over it).
    const rw = W * rand(0.35, 0.5), rh = H * rand(0.3, 0.45);
    game.rug = {
      x: rand(fx0 + 120, fx1 - 120 - rw), y: rand(fy0 + 80, fy1 - 200 - rh),
      w: rw, h: rh, oval: Math.random() < 0.4, colors: pick(RUGS),
    };

    // Flood fill from the dock to find every spot the vacuum can actually reach,
    // so messes never land somewhere impossible to get to.
    const cols = Math.floor(W / CELL), rows = Math.floor(H / CELL);
    const seen = new Uint8Array(cols * rows);
    const isFree = (c, r) => {
      const x = c * CELL + CELL / 2, y = r * CELL + CELL / 2;
      if (x < fx0 + VAC_R || x > fx1 - VAC_R || y < fy0 + VAC_R || y > fy1 - VAC_R) return false;
      return !circleHitsFurniture(x, y, VAC_R + 2);
    };
    const start = [Math.floor(dock.x / CELL), Math.floor(dock.y / CELL)];
    if (!isFree(start[0], start[1] - 1)) return false;
    const queue = [[start[0], start[1] - 1]];
    seen[(start[1] - 1) * cols + start[0]] = 1;
    const reachable = [];
    while (queue.length) {
      const [c, r] = queue.pop();
      reachable.push({ x: c * CELL + CELL / 2, y: r * CELL + CELL / 2 });
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
        const k = nr * cols + nc;
        if (seen[k] || !isFree(nc, nr)) continue;
        seen[k] = 1;
        queue.push([nc, nr]);
      }
    }
    const spots = reachable.filter(p => dist(p.x, p.y, dock.x, dock.y) > 240);
    if (spots.length < 120) return false;

    // Messes.
    const want = Math.min(8 + (game.level - 1) * 2, 18);
    game.messes = [];
    for (let tries = 0; tries < 800 && game.messes.length < want; tries++) {
      const p = pick(spots);
      const x = p.x + rand(-10, 10), y = p.y + rand(-10, 10);
      if (game.messes.some(m => dist(m.x, m.y, x, y) < 125)) continue;
      game.messes.push(makeMess(x, y));
    }
    return game.messes.length >= Math.min(want, 6);
  }

  function makeMess(x, y) {
    const type = pick(['crumbs', 'bunny', 'cereal', 'leaf', 'paper', 'dirt', 'bunny', 'crumbs']);
    const m = { x, y, type, r: 30, rot: rand(0, Math.PI * 2), wob: rand(0, 10), state: 'idle', t: 0, parts: [] };
    if (type === 'crumbs') {
      for (let i = 0; i < 7; i++) m.parts.push({ dx: rand(-20, 20), dy: rand(-20, 20), r: rand(4, 8), c: pick(['#b07a3c', '#c98f4e', '#8a5a2b', '#e0b070']) });
    } else if (type === 'cereal') {
      for (let i = 0; i < 5; i++) m.parts.push({ dx: rand(-20, 20), dy: rand(-20, 20), c: pick(TOY_COLORS) });
    } else if (type === 'dirt') {
      for (let i = 0; i < 12; i++) m.parts.push(rand(18, 28));
      m.specks = [];
      for (let i = 0; i < 5; i++) m.specks.push({ dx: rand(-14, 14), dy: rand(-14, 14), r: rand(2.5, 5) });
    } else if (type === 'paper') {
      for (let i = 0; i < 9; i++) m.parts.push(rand(17, 26));
    } else if (type === 'leaf') {
      m.color = pick(['#5cb85c', '#f0a030', '#e2572f', '#e8c33a']);
    } else if (type === 'bunny') {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        m.parts.push({ dx: Math.cos(a) * 18, dy: Math.sin(a) * 16, r: rand(10, 14) });
      }
    }
    return m;
  }

  function newRoom() {
    const portrait = window.innerHeight > window.innerWidth * 1.1;
    W = portrait ? 1000 : 1600;
    H = portrait ? 1500 : 1000;
    game.seed = (Math.random() * 1e9) | 0;
    game.floor = pick(FLOORS);
    game.wallColor = pick(WALL_COLORS);

    let ok = false;
    for (let attempt = 0; attempt < 40 && !ok; attempt++) ok = layoutRoom();

    game.total = game.messes.length;
    game.cleaned = 0;
    game.bin = 0;
    game.binShown = 0;
    game.binShake = 0;
    game.needDock = false;
    game.allClean = false;
    game.leftDock = false;
    game.particles = [];
    game.winT = 0;

    vac.x = game.dock.x;
    vac.y = game.dock.y;
    vac.vx = vac.vy = 0;
    vac.heading = -Math.PI / 2;
    vac.tx = vac.ty = null;
    vac.stampX = vac.stampY = -999;

    trailCanvas.width = Math.ceil(W * TRAIL_RES);
    trailCanvas.height = Math.ceil(H * TRAIL_RES);

    resize();
  }

  // ---------- floor (pre-rendered once per room / resize) ----------
  function buildFloor() {
    if (!game.dock) return;
    const r = mulberry32(game.seed);
    const res = clamp(view.scale * view.dpr, 0.75, 2);
    floorCanvas.width = Math.ceil(W * res);
    floorCanvas.height = Math.ceil(H * res);
    const c = floorCanvas.getContext('2d');
    c.setTransform(res, 0, 0, res, 0, 0);
    const f = game.floor;

    c.fillStyle = f.base;
    c.fillRect(0, 0, W, H);

    const ph = 56;
    for (let y = WALL; y < H - WALL; y += ph) {
      let x = WALL - r() * 300;
      while (x < W - WALL) {
        const len = 180 + r() * 260;
        c.fillStyle = f.vary[Math.floor(r() * f.vary.length)];
        c.fillRect(x, y, len, ph);
        c.strokeStyle = 'rgba(0,0,0,0.045)';
        c.lineWidth = 2;
        for (let k = 0; k < 2; k++) {
          const gy = y + 10 + r() * (ph - 20);
          c.beginPath();
          c.moveTo(x + 12, gy);
          c.bezierCurveTo(x + len * 0.3, gy - 4, x + len * 0.6, gy + 4, x + len - 12, gy);
          c.stroke();
        }
        c.fillStyle = f.seam;
        c.fillRect(x, y, 2, ph);
        x += len;
      }
      c.fillStyle = f.seam;
      c.fillRect(WALL, y, W - 2 * WALL, 2);
    }

    // Rug
    const rug = game.rug;
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.08)';
    if (rug.oval) {
      c.beginPath(); c.ellipse(rug.x + rug.w / 2 + 4, rug.y + rug.h / 2 + 5, rug.w / 2, rug.h / 2, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = rug.colors.b;
      c.beginPath(); c.ellipse(rug.x + rug.w / 2, rug.y + rug.h / 2, rug.w / 2, rug.h / 2, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = rug.colors.c;
      c.beginPath(); c.ellipse(rug.x + rug.w / 2, rug.y + rug.h / 2, rug.w / 2 - 16, rug.h / 2 - 16, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = rug.colors.d; c.lineWidth = 5;
      c.beginPath(); c.ellipse(rug.x + rug.w / 2, rug.y + rug.h / 2, rug.w / 2 - 40, rug.h / 2 - 40, 0, 0, Math.PI * 2); c.stroke();
    } else {
      roundRect(c, rug.x + 4, rug.y + 5, rug.w, rug.h, 18); c.fill();
      c.fillStyle = rug.colors.b;
      roundRect(c, rug.x, rug.y, rug.w, rug.h, 18); c.fill();
      c.fillStyle = rug.colors.c;
      roundRect(c, rug.x + 16, rug.y + 16, rug.w - 32, rug.h - 32, 12); c.fill();
      c.strokeStyle = rug.colors.d; c.lineWidth = 5;
      roundRect(c, rug.x + 40, rug.y + 40, rug.w - 80, rug.h - 80, 8); c.stroke();
      // tassels
      c.strokeStyle = rug.colors.b; c.lineWidth = 3;
      for (let x = rug.x + 12; x < rug.x + rug.w - 8; x += 14) {
        c.beginPath(); c.moveTo(x, rug.y); c.lineTo(x, rug.y - 10); c.stroke();
        c.beginPath(); c.moveTo(x, rug.y + rug.h); c.lineTo(x, rug.y + rug.h + 10); c.stroke();
      }
    }
    c.fillStyle = rug.colors.d;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const px = rug.x + rug.w / 2 + Math.cos(a) * (rug.w / 2 - 70) * 0.8;
      const py = rug.y + rug.h / 2 + Math.sin(a) * (rug.h / 2 - 70) * 0.8;
      starPath(c, px, py, 9); c.fill();
    }
    c.restore();

    // Walls
    c.fillStyle = game.wallColor;
    c.fillRect(0, 0, W, WALL);
    c.fillRect(0, H - WALL, W, WALL);
    c.fillRect(0, 0, WALL, H);
    c.fillRect(W - WALL, 0, WALL, H);
    c.strokeStyle = '#ffffff';
    c.lineWidth = 6;
    c.strokeRect(WALL - 3, WALL - 3, W - 2 * WALL + 6, H - 2 * WALL + 6);
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    c.lineWidth = 3;
    c.strokeRect(WALL + 1.5, WALL + 1.5, W - 2 * WALL - 3, H - 2 * WALL - 3);
    c.strokeStyle = 'rgba(0,0,0,0.15)';
    c.lineWidth = 4;
    c.strokeRect(2, 2, W - 4, H - 4);

    // A window on the top wall.
    const wx = W * (0.35 + r() * 0.3);
    c.fillStyle = '#ffffff';
    c.fillRect(wx - 110, 2, 220, WALL - 4);
    c.fillStyle = '#9fd8f5';
    c.fillRect(wx - 102, 8, 97, WALL - 16);
    c.fillRect(wx + 5, 8, 97, WALL - 16);
  }

  // ---------- input ----------
  let pointerDown = false;
  let activePointer = null;

  function setTarget(e) {
    const p = toWorld(e.clientX, e.clientY);
    vac.tx = clamp(p.x, WALL + VAC_R, W - WALL - VAC_R);
    vac.ty = clamp(p.y, WALL + VAC_R, H - WALL - VAC_R);
    vac.stuckT = 0;
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    Sound.init();
    if (game.state === 'title') {
      Voice.prime();
      startPlaying();
      Voice.say("Let's clean!");
      return;
    }
    if (game.state === 'win') {
      if (game.winT > 2.2) {
        game.level++;
        newRoom();
        startPlaying();
        Voice.say("Let's clean!");
      }
      return;
    }
    if (game.state !== 'play') return;
    pointerDown = true;
    activePointer = e.pointerId;
    setTarget(e);
  });
  canvas.addEventListener('pointermove', e => {
    if (pointerDown && e.pointerId === activePointer && game.state === 'play') setTarget(e);
  });
  const release = e => { if (e.pointerId === activePointer) pointerDown = false; };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('gesturestart', e => e.preventDefault());

  function startPlaying() {
    game.state = 'play';
    requestWakeLock();
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

  // ---------- simulation ----------
  function collide(v) {
    let hit = false;
    const minX = WALL + VAC_R, maxX = W - WALL - VAC_R;
    const minY = WALL + VAC_R, maxY = H - WALL - VAC_R;
    if (v.x < minX) { v.x = minX; hit = true; }
    if (v.x > maxX) { v.x = maxX; hit = true; }
    if (v.y < minY) { v.y = minY; hit = true; }
    if (v.y > maxY) { v.y = maxY; hit = true; }

    for (let pass = 0; pass < 2; pass++) {
      for (const f of game.furniture) {
        if (f.shape === 'circle') {
          const d = dist(v.x, v.y, f.cx, f.cy);
          const m = f.r + VAC_R;
          if (d < m) {
            const nx = d ? (v.x - f.cx) / d : 0, ny = d ? (v.y - f.cy) / d : -1;
            v.x = f.cx + nx * m;
            v.y = f.cy + ny * m;
            hit = true;
          }
        } else {
          const cx = clamp(v.x, f.x, f.x + f.w);
          const cy = clamp(v.y, f.y, f.y + f.h);
          const dx = v.x - cx, dy = v.y - cy;
          const d = Math.hypot(dx, dy);
          if (d < VAC_R) {
            if (d === 0) {
              const l = v.x - f.x, r = f.x + f.w - v.x, t = v.y - f.y, b = f.y + f.h - v.y;
              const m = Math.min(l, r, t, b);
              if (m === l) v.x = f.x - VAC_R;
              else if (m === r) v.x = f.x + f.w + VAC_R;
              else if (m === t) v.y = f.y - VAC_R;
              else v.y = f.y + f.h + VAC_R;
            } else {
              v.x = cx + (dx / d) * VAC_R;
              v.y = cy + (dy / d) * VAC_R;
            }
            hit = true;
          }
        }
      }
    }
    return hit;
  }

  function updateVacuum(dt) {
    const hasTarget = vac.tx !== null;
    let dvx = 0, dvy = 0;
    if (hasTarget) {
      const dx = vac.tx - vac.x, dy = vac.ty - vac.y;
      const d = Math.hypot(dx, dy);
      if (d < 8) {
        vac.tx = vac.ty = null;
      } else {
        const sp = VAC_SPEED * Math.min(1, d / 90 + 0.2);
        dvx = (dx / d) * sp;
        dvy = (dy / d) * sp;
      }
    }
    const k = 1 - Math.exp(-8 * dt);
    vac.vx += (dvx - vac.vx) * k;
    vac.vy += (dvy - vac.vy) * k;

    const px = vac.x, py = vac.y;
    vac.x += vac.vx * dt;
    vac.y += vac.vy * dt;
    const hit = collide(vac);
    const moved = dist(px, py, vac.x, vac.y);
    const wanted = Math.hypot(vac.vx, vac.vy);
    vac.speed = moved / dt;

    if (hit) {
      if (game.bumpCooldown <= 0 && wanted > 140 && vac.speed < wanted * 0.55) {
        Sound.bump();
        vac.squish = 1;
        game.bumpCooldown = 0.7;
      }
      vac.vx = (vac.x - px) / dt;
      vac.vy = (vac.y - py) / dt;
    }

    // Give up on a target we can't reach (e.g. tapped on the couch).
    if (vac.tx !== null && vac.speed < 25) {
      vac.stuckT += dt;
      if (vac.stuckT > 0.6) vac.tx = vac.ty = null;
    } else {
      vac.stuckT = 0;
    }

    if (vac.speed > 30) {
      const target = Math.atan2(vac.vy, vac.vx);
      vac.heading += angleDiff(vac.heading, target) * Math.min(1, 10 * dt);
      stampTrail();
    }
  }

  function stampTrail() {
    if (dist(vac.x, vac.y, vac.stampX, vac.stampY) < 6) return;
    vac.stampX = vac.x;
    vac.stampY = vac.y;
    trailCtx.setTransform(TRAIL_RES, 0, 0, TRAIL_RES, 0, 0);
    trailCtx.fillStyle = 'rgba(255,255,255,0.05)';
    circle(trailCtx, vac.x, vac.y, VAC_R * 0.85);
    trailCtx.fill();
  }

  function checkPickups() {
    for (const m of game.messes) {
      if (m.state !== 'idle') continue;
      if (dist(vac.x, vac.y, m.x, m.y) > VAC_R + 12) continue;
      if (game.bin >= BIN_CAPACITY) {
        if (game.fullCooldown <= 0) {
          Sound.full();
          game.binShake = 1;
          game.fullCooldown = 2.5;
          Voice.say("I'm full! Take me home!");
        }
        continue;
      }
      m.state = 'suck';
      m.t = 0;
      m.sx = m.x;
      m.sy = m.y;
      game.bin++;
      Sound.pop();
      if (navigator.vibrate) try { navigator.vibrate(25); } catch (e) { /* ignore */ }
      Voice.say(NUMBERS[game.bin] || '');
      const remaining = game.messes.filter(o => o.state === 'idle').length;
      if (game.bin >= BIN_CAPACITY && remaining > 0) {
        game.needDock = true;
        game.binShake = 1;
        game.fullCooldown = 2.5;
        setTimeout(() => { Sound.full(); Voice.say("I'm full! Let's go home!", false); }, 350);
      }
    }
  }

  function updateMesses(dt) {
    for (const m of game.messes) {
      if (m.state !== 'suck') continue;
      m.t += dt;
      if (m.t >= SUCK_TIME) {
        m.state = 'gone';
        game.cleaned++;
        game.starPop = 1;
        burst(vac.x, vac.y, 8, ['#fff6a8', '#ffffff', '#ffd23f']);
      }
    }
    game.messes = game.messes.filter(m => m.state !== 'gone');

    if (!game.allClean && game.messes.length === 0 && game.state === 'play') {
      game.allClean = true;
      game.needDock = true;
      Sound.tada();
      setTimeout(() => Voice.say("All clean! Let's go home!", false), 300);
    }
  }

  function updateDockTrigger() {
    const d = dist(vac.x, vac.y, game.dock.x, game.dock.y);
    if (!game.leftDock) {
      if (d > DOCK_REARM) game.leftDock = true;
      return;
    }
    const busy = game.messes.some(m => m.state === 'suck');
    if (d < DOCK_TRIGGER && !busy && (game.bin > 0 || game.allClean)) startDocking();
  }

  function startDocking() {
    game.state = 'docking';
    game.dockT = 0;
    game.dockFrom = { x: vac.x, y: vac.y, h: vac.heading };
    game.dockBinStart = game.bin;
    game.dustTimer = 0;
    vac.tx = vac.ty = null;
    vac.vx = vac.vy = 0;
    pointerDown = false;
    Sound.chime();
    if (game.bin > 0) Sound.whoosh(1.2, 0.5);
  }

  function updateDocking(dt) {
    game.dockT += dt;
    const t = game.dockT;
    const f = game.dockFrom;
    const slide = Math.min(1, t / 0.5);
    const e = 1 - Math.pow(1 - slide, 3);
    vac.x = lerp(f.x, game.dock.x, e);
    vac.y = lerp(f.y, game.dock.y, e);
    vac.heading = f.h + angleDiff(f.h, -Math.PI / 2) * e;

    const emptying = game.dockBinStart > 0;
    if (emptying && t > 0.5 && t < 1.8) {
      const p = (t - 0.5) / 1.2;
      game.bin = Math.max(0, Math.ceil(game.dockBinStart * (1 - p)));
      game.dustTimer -= dt;
      if (game.dustTimer <= 0) {
        game.dustTimer = 0.04;
        const tx = game.dock.x + rand(-30, 30), ty = game.dock.unitY + 12;
        const sx = vac.x + rand(-20, 20), sy = vac.y + rand(-20, 20);
        const life = 0.35;
        game.particles.push({
          kind: 'dust', x: sx, y: sy, vx: (tx - sx) / life, vy: (ty - sy) / life,
          life, max: life, size: rand(4, 8), color: pick(['#8a5a2b', '#a0703f', '#b8b8c0']),
        });
      }
    }

    const end = emptying ? 2.0 : 0.8;
    if (t >= end) {
      game.bin = 0;
      if (game.allClean) {
        win();
      } else {
        game.needDock = false;
        game.state = 'play';
        game.leftDock = false;
        Sound.tada();
        Voice.say(pick(['All empty!', 'All empty! Let\'s clean more!', 'Ready to clean!']));
      }
    }
  }

  function win() {
    game.state = 'win';
    game.winT = 0;
    game.needDock = false;
    Sound.win();
    Voice.say('Hooray! You cleaned the whole house!');
    for (let i = 0; i < 160; i++) {
      game.particles.push({
        kind: 'confetti', x: rand(0, W), y: rand(-H * 0.2, H * 0.3),
        vx: rand(-80, 80), vy: rand(-250, 50), g: 420,
        life: rand(2.5, 4.5), max: 4.5, size: rand(10, 18), color: pick(TOY_COLORS),
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

  function updateParticles(dt) {
    for (const p of game.particles) {
      p.life -= dt;
      if (p.g) p.vy += p.g * dt;
      if (p.drag) { p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt); }
      if (p.kind === 'confetti') p.vx += Math.sin(game.time * 3 + p.rot) * 30 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.vr) p.rot += p.vr * dt;
    }
    game.particles = game.particles.filter(p => p.life > 0);
  }

  function update(dt) {
    game.time += dt;
    game.bumpCooldown -= dt;
    game.fullCooldown -= dt;
    game.binShake = Math.max(0, game.binShake - dt * 1.2);
    game.starPop = Math.max(0, game.starPop - dt * 3);
    vac.squish = Math.max(0, vac.squish - dt * 4);

    if (game.state === 'play') {
      updateVacuum(dt);
      checkPickups();
      updateDockTrigger();
    } else if (game.state === 'docking') {
      updateDocking(dt);
    } else if (game.state === 'win') {
      game.winT += dt;
      vac.heading += dt * 4;
    }
    updateMesses(dt);
    updateParticles(dt);

    game.binShown += (game.bin - game.binShown) * (1 - Math.exp(-10 * dt));

    // Eyes follow the direction of travel; blink now and then.
    const sp = Math.hypot(vac.vx, vac.vy);
    const lx = sp > 20 ? vac.vx / sp : 0, ly = sp > 20 ? vac.vy / sp : 0;
    vac.lookX += (lx - vac.lookX) * Math.min(1, 8 * dt);
    vac.lookY += (ly - vac.lookY) * Math.min(1, 8 * dt);
    vac.blinkT -= dt;
    if (vac.blinkT < 0) { vac.blink = 0.14; vac.blinkT = rand(2, 5); }
    vac.blink = Math.max(0, vac.blink - dt);

    const active = game.state === 'play' || game.state === 'docking';
    vac.brush += dt * (active ? 10 + vac.speed * 0.03 : game.state === 'win' ? 20 : 0);
    Sound.hum(active, game.state === 'play' ? clamp(vac.speed / VAC_SPEED, 0, 1) : 0.2);
  }

  // ---------- drawing: furniture ----------
  const DRAW = {
    couch(w, h, f) {
      const c = f.color;
      ctx.fillStyle = c.main;
      roundRect(ctx, -w / 2, -h / 2, w, h, 26); ctx.fill();
      ctx.fillStyle = c.dark;
      roundRect(ctx, -w / 2, -h / 2, w, h * 0.36, 22); ctx.fill();
      roundRect(ctx, -w / 2, -h / 2, w * 0.12, h, 20); ctx.fill();
      roundRect(ctx, w / 2 - w * 0.12, -h / 2, w * 0.12, h, 20); ctx.fill();
      const n = 3;
      const x0 = -w / 2 + w * 0.12 + 5, x1 = w / 2 - w * 0.12 - 5;
      const cw = (x1 - x0) / n;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = c.light;
        roundRect(ctx, x0 + i * cw + 3, -h / 2 + h * 0.36 + 4, cw - 6, h * 0.64 - 12, 14); ctx.fill();
      }
      // throw pillow
      ctx.save();
      ctx.translate(x0 + 30, -h / 2 + h * 0.36 + 10);
      ctx.rotate(-0.3);
      ctx.fillStyle = '#ffd93d';
      roundRect(ctx, -22, -18, 44, 36, 10); ctx.fill();
      ctx.restore();
    },
    table(w, h) {
      ctx.fillStyle = '#9c6236';
      roundRect(ctx, -w / 2, -h / 2, w, h, 18); ctx.fill();
      ctx.fillStyle = '#bd7d4a';
      roundRect(ctx, -w / 2 + 8, -h / 2 + 8, w - 16, h - 16, 12); ctx.fill();
      // fruit bowl
      ctx.fillStyle = '#ffffff';
      circle(ctx, 0, 0, 30); ctx.fill();
      ctx.fillStyle = '#e8e8e8';
      circle(ctx, 0, 0, 22); ctx.fill();
      [['#e63946', -9, -5], ['#ff9f1c', 9, -4], ['#8ac926', 0, 9]].forEach(([col, x, y]) => {
        ctx.fillStyle = col; circle(ctx, x, y, 10); ctx.fill();
      });
      // a book
      ctx.fillStyle = '#4d96ff';
      roundRect(ctx, w / 2 - 70, -h / 2 + 20, 45, 34, 4); ctx.fill();
    },
    plant(w, h, f) {
      const r = f.r;
      ctx.fillStyle = '#c8693c';
      circle(ctx, 0, 0, r); ctx.fill();
      ctx.fillStyle = '#5b3a24';
      circle(ctx, 0, 0, r * 0.78); ctx.fill();
      for (let i = 0; i < 8; i++) {
        ctx.save();
        ctx.rotate((i / 8) * Math.PI * 2);
        ctx.fillStyle = i % 2 ? '#3fa34d' : '#5cc46c';
        ctx.beginPath();
        ctx.ellipse(r * 0.55, 0, r * 0.62, r * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = '#6fd67e';
      circle(ctx, 0, 0, r * 0.22); ctx.fill();
    },
    toybox(w, h, f) {
      ctx.fillStyle = '#4d96ff';
      roundRect(ctx, -w / 2, -h / 2, w, h, 14); ctx.fill();
      ctx.fillStyle = '#2f6fd1';
      roundRect(ctx, -w / 2 + 10, -h / 2 + 10, w - 20, h - 20, 8); ctx.fill();
      for (const t of f.toys) {
        ctx.save();
        ctx.translate(t.dx * w, t.dy * h);
        ctx.rotate(t.rot);
        ctx.fillStyle = t.c;
        if (t.round) { circle(ctx, 0, 0, t.s * 0.6); ctx.fill(); }
        else { roundRect(ctx, -t.s / 2, -t.s / 2, t.s, t.s, 4); ctx.fill(); }
        ctx.restore();
      }
    },
    chair(w, h, f) {
      const c = f.color;
      ctx.fillStyle = c.dark;
      roundRect(ctx, -w / 2, -h / 2, w, h, 18); ctx.fill();
      ctx.fillStyle = c.light;
      roundRect(ctx, -w / 2 + 10, -h / 2 + 28, w - 20, h - 38, 14); ctx.fill();
    },
    bookshelf(w, h, f) {
      ctx.fillStyle = '#7a4a2c';
      roundRect(ctx, -w / 2, -h / 2, w, h, 8); ctx.fill();
      ctx.fillStyle = '#5e3820';
      ctx.fillRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 16);
      for (const b of f.toys) {
        ctx.fillStyle = b.c;
        ctx.fillRect(-w / 2 + 12 + b.x, -h / 2 + 10, b.w, (h - 20) * b.h);
      }
    },
  };

  function drawFurniture(f) {
    if (f.hidden) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    if (f.shape === 'circle') { circle(ctx, f.cx + 7, f.cy + 9, f.r); ctx.fill(); }
    else { roundRect(ctx, f.x + 7, f.y + 9, f.w, f.h, 20); ctx.fill(); }
    ctx.translate(f.cx, f.cy);
    ctx.rotate(f.rot);
    DRAW[f.kind](f.lw, f.lh, f);
    ctx.restore();
  }

  // ---------- drawing: messes ----------
  const MESS_DRAW = {
    crumbs(m) {
      for (const p of m.parts) { ctx.fillStyle = p.c; circle(ctx, p.dx, p.dy, p.r); ctx.fill(); }
    },
    cereal(m) {
      ctx.lineWidth = 5.5;
      for (const p of m.parts) { ctx.strokeStyle = p.c; circle(ctx, p.dx, p.dy, 7); ctx.stroke(); }
    },
    dirt(m) {
      ctx.fillStyle = '#7a5230';
      ctx.beginPath();
      m.parts.forEach((r, i) => {
        const a = (i / m.parts.length) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      });
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#5c3b1e';
      for (const s of m.specks) { circle(ctx, s.dx, s.dy, s.r); ctx.fill(); }
    },
    paper(m) {
      ctx.fillStyle = '#fdfdfd';
      ctx.strokeStyle = '#bdbdbd';
      ctx.lineWidth = 2;
      ctx.beginPath();
      m.parts.forEach((r, i) => {
        const a = (i / m.parts.length) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-10, -6); ctx.lineTo(4, 2); ctx.lineTo(12, -8);
      ctx.moveTo(-6, 10); ctx.lineTo(6, 6);
      ctx.stroke();
    },
    leaf(m) {
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, 28, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(-34, 0); ctx.lineTo(24, 0);
      ctx.moveTo(-8, 0); ctx.lineTo(0, -9);
      ctx.moveTo(6, 0); ctx.lineTo(14, -8);
      ctx.moveTo(-2, 0); ctx.lineTo(6, 9);
      ctx.stroke();
    },
    bunny(m) {
      const s = 1 + Math.sin(game.time * 4 + m.wob) * 0.07;
      ctx.rotate(-m.rot); // keep the face upright
      ctx.scale(s, 1 / s);
      ctx.fillStyle = '#a9a9b3';
      for (const p of m.parts) { circle(ctx, p.dx, p.dy, p.r); ctx.fill(); }
      ctx.fillStyle = '#c4c4cc';
      circle(ctx, 0, 0, 20); ctx.fill();
      // cute face
      ctx.fillStyle = '#2b2d42';
      circle(ctx, -7, -3, 3.8); ctx.fill();
      circle(ctx, 7, -3, 3.8); ctx.fill();
      ctx.fillStyle = '#ffffff';
      circle(ctx, -6, -4.5, 1.3); ctx.fill();
      circle(ctx, 8, -4.5, 1.3); ctx.fill();
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 3, 4, 0.2, Math.PI - 0.2); ctx.stroke();
    },
  };

  function drawMess(m) {
    let x = m.x, y = m.y, s = 1, rot = m.rot;
    if (m.state === 'suck') {
      const t = easeIn(Math.min(1, m.t / SUCK_TIME));
      x = lerp(m.sx, vac.x, t);
      y = lerp(m.sy, vac.y, t);
      s = 1 - t * 0.9;
      rot += t * 8;
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(s, s);
    // a soft shadow so messes pop off the floor
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    circle(ctx, 3, 4, 26); ctx.fill();
    MESS_DRAW[m.type](m);
    ctx.restore();
  }

  // ---------- drawing: dock, vacuum, effects ----------
  function drawDock() {
    const d = game.dock;
    const want = game.needDock && game.state === 'play';
    const pulse = 0.5 + 0.5 * Math.sin(game.time * 5);

    if (want) {
      ctx.strokeStyle = `rgba(255, 214, 10, ${0.4 + pulse * 0.5})`;
      ctx.lineWidth = 10;
      circle(ctx, d.x, d.y, VAC_R + 30 + pulse * 12);
      ctx.stroke();
    }

    // charging pad
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    roundRect(ctx, d.x - 92 + 5, d.y - 70 + 6, 184, H - WALL - (d.y - 70), 26); ctx.fill();
    ctx.fillStyle = '#d6dde4';
    roundRect(ctx, d.x - 92, d.y - 70, 184, H - WALL - (d.y - 70), 26); ctx.fill();
    ctx.fillStyle = '#c3ccd5';
    roundRect(ctx, d.x - 70, d.y - 50, 140, H - WALL - (d.y - 50) - 8, 18); ctx.fill();
    ctx.fillStyle = '#e9c46a';
    ctx.fillRect(d.x - 38, d.y + 10, 12, 30);
    ctx.fillRect(d.x + 26, d.y + 10, 12, 30);

    // back unit
    ctx.fillStyle = '#3a4a5c';
    roundRect(ctx, d.x - 80, d.unitY - 6, 160, d.unitH + 16, 12); ctx.fill();
    ctx.fillStyle = '#4b5d72';
    roundRect(ctx, d.x - 70, d.unitY, 140, d.unitH, 8); ctx.fill();

    // light + lightning bolt
    const lightOn = want ? pulse > 0.5 : true;
    ctx.fillStyle = want ? (lightOn ? '#ffd60a' : '#8a7a2a') : '#3ddc84';
    circle(ctx, d.x - 45, d.unitY + d.unitH / 2, 7); ctx.fill();
    circle(ctx, d.x + 45, d.unitY + d.unitH / 2, 7); ctx.fill();
    ctx.fillStyle = '#ffd60a';
    ctx.beginPath();
    const bx = d.x, by = d.unitY + d.unitH / 2 + 2;
    ctx.moveTo(bx + 3, by - 14);
    ctx.lineTo(bx - 8, by + 2);
    ctx.lineTo(bx - 1, by + 2);
    ctx.lineTo(bx - 4, by + 14);
    ctx.lineTo(bx + 8, by - 3);
    ctx.lineTo(bx + 1, by - 3);
    ctx.closePath();
    ctx.fill();
  }

  function drawDockArrow() {
    if (!game.needDock || game.state !== 'play') return;
    const d = game.dock;
    const bob = Math.abs(Math.sin(game.time * 4)) * 26;
    const x = d.x, y = d.y - VAC_R - 60 - bob;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#ffd60a';
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-22, -60);
    ctx.lineTo(22, -60);
    ctx.lineTo(22, -22);
    ctx.lineTo(44, -22);
    ctx.lineTo(0, 22);
    ctx.lineTo(-44, -22);
    ctx.lineTo(-22, -22);
    ctx.closePath();
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }

  function drawTargetMarker() {
    if (vac.tx === null || game.state !== 'play') return;
    const p = 0.5 + 0.5 * Math.sin(game.time * 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 5;
    circle(ctx, vac.tx, vac.ty, 18 + p * 6);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    circle(ctx, vac.tx, vac.ty, 6);
    ctx.fill();
  }

  function drawVacuum() {
    const R = VAC_R;
    const bob = game.state === 'win' ? -Math.abs(Math.sin(game.winT * 6)) * 24 : 0;
    const full = game.bin >= BIN_CAPACITY;

    ctx.save();
    ctx.translate(vac.x, vac.y);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    circle(ctx, 6, 10 - bob * 0.2, R * (1 + bob / 300)); ctx.fill();

    ctx.translate(0, bob);

    // spinning side brushes, poking out at the front
    ctx.save();
    ctx.rotate(vac.heading);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(R * 0.6, side * R * 0.62);
      ctx.rotate(vac.brush * side);
      ctx.strokeStyle = '#555c66';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * R * 0.48, Math.sin(a) * R * 0.48);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();

    const sq = vac.squish;
    ctx.scale(1 + 0.1 * sq, 1 - 0.1 * sq);

    // body
    const g = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#c4ced8');
    ctx.fillStyle = g;
    circle(ctx, 0, 0, R); ctx.fill();
    ctx.strokeStyle = '#7d8a98';
    ctx.lineWidth = 3;
    ctx.stroke();

    // front bumper (turns with the vacuum)
    ctx.save();
    ctx.rotate(vac.heading);
    ctx.strokeStyle = '#34495e';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, R - 5, -1.15, 1.15);
    ctx.stroke();
    ctx.restore();

    // accent ring
    ctx.strokeStyle = '#19b3a6';
    ctx.lineWidth = 5;
    circle(ctx, 0, 0, R * 0.74); ctx.stroke();

    // face (always upright so it's easy to read)
    const lx = vac.lookX * 4, ly = vac.lookY * 4;
    const blinking = vac.blink > 0;
    for (const sx of [-1, 1]) {
      const ex = sx * R * 0.26, ey = -R * 0.1;
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(ex, ey, 11, blinking ? 1.5 : 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (!blinking) {
        ctx.fillStyle = '#2b2d42';
        circle(ctx, ex + lx, ey + ly + 1, 6.5); ctx.fill();
        ctx.fillStyle = '#ffffff';
        circle(ctx, ex + lx + 2, ey + ly - 2, 2.2); ctx.fill();
      }
    }
    // cheeks
    ctx.fillStyle = 'rgba(255, 120, 150, 0.45)';
    circle(ctx, -R * 0.47, R * 0.14, 7); ctx.fill();
    circle(ctx, R * 0.47, R * 0.14, 7); ctx.fill();
    // mouth
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    if (game.state === 'win') {
      ctx.fillStyle = '#e63946';
      ctx.beginPath();
      ctx.arc(0, R * 0.14, 12, 0, Math.PI);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (full && game.state === 'play') {
      circle(ctx, 0, R * 0.24, 6); ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, R * 0.14, 11, 0.2, Math.PI - 0.2);
      ctx.stroke();
    }
    // status light
    const blinkOn = Math.sin(game.time * 10) > 0;
    ctx.fillStyle = full ? (blinkOn ? '#ff9f1c' : '#b36b12') : '#3ddc84';
    circle(ctx, 0, -R * 0.56, 5.5); ctx.fill();

    ctx.restore();
  }

  function drawParticles() {
    for (const p of game.particles) {
      const a = clamp(p.life / (p.max * 0.4), 0, 1);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 'star') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        starPath(ctx, 0, 0, p.size);
        ctx.fill();
        ctx.restore();
      } else if (p.kind === 'confetti') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else {
        circle(ctx, p.x, p.y, p.size);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------- drawing: HUD & overlays (screen space) ----------
  function hudScale() {
    return clamp(Math.min(view.w, view.h) / 600, 0.75, 1.4);
  }

  function drawBinGauge(hs) {
    const w = 60 * hs, h = 78 * hs;
    let x = 18 * hs, y = 18 * hs;
    if (game.binShake > 0) x += Math.sin(game.time * 50) * 7 * game.binShake;
    const full = game.bin >= BIN_CAPACITY;

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(ctx, x - 8 * hs, y - 8 * hs, w + 16 * hs, h + 16 * hs, 18 * hs); ctx.fill();

    ctx.save();
    roundRect(ctx, x, y, w, h, 12 * hs);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.clip();
    const frac = clamp(game.binShown / BIN_CAPACITY, 0, 1);
    ctx.fillStyle = full ? '#e8833a' : '#a0703f';
    ctx.fillRect(x, y + h * (1 - frac), w, h * frac + 1);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 6; i++) {
      const py = y + h * (1 - frac) + ((i * 13) % (h * frac + 1));
      circle(ctx, x + ((i * 23) % w), py + 6 * hs, 3 * hs); ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 2 * hs;
    for (let i = 1; i < BIN_CAPACITY; i++) {
      const ly = y + h * (i / BIN_CAPACITY);
      ctx.beginPath(); ctx.moveTo(x + w - 14 * hs, ly); ctx.lineTo(x + w - 4 * hs, ly); ctx.stroke();
    }
    const blink = Math.sin(game.time * 10) > 0;
    ctx.strokeStyle = full ? (blink ? '#ffd60a' : '#ff9f1c') : '#ffffff';
    ctx.lineWidth = 5 * hs;
    roundRect(ctx, x, y, w, h, 12 * hs); ctx.stroke();
  }

  function drawProgress(hs) {
    const n = game.total;
    if (!n) return;
    const size = Math.min(34 * hs, (view.w * 0.55) / n);
    const gap = size * 0.18;
    const totalW = n * size + (n - 1) * gap;
    const x0 = (view.w - totalW) / 2;
    const y = 18 * hs + size / 2 + 4 * hs;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(ctx, x0 - 14 * hs, y - size / 2 - 10 * hs, totalW + 28 * hs, size + 20 * hs, (size + 20 * hs) / 2); ctx.fill();
    for (let i = 0; i < n; i++) {
      const cx = x0 + i * (size + gap) + size / 2;
      const done = i < game.cleaned;
      const pop = done && i === game.cleaned - 1 ? 1 + game.starPop * 0.6 : 1;
      starPath(ctx, cx, y, (size / 2) * pop);
      if (done) {
        ctx.fillStyle = '#ffd23f';
        ctx.fill();
        ctx.strokeStyle = '#e0a800';
        ctx.lineWidth = 2 * hs;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 2.5 * hs;
        ctx.stroke();
      }
    }
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
    ctx.fillStyle = '#3ddc84';
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
    ctx.fillStyle = 'rgba(30, 34, 56, 0.45)';
    ctx.fillRect(0, 0, view.w, view.h);
    const cx = view.w / 2;
    const bounce = Math.sin(game.time * 2.5) * 6 * hs;
    bigText('Vroom Vroom', cx, view.h * 0.27 + bounce, 78 * hs, '#ffd60a');
    bigText('Vacuum!', cx, view.h * 0.27 + 80 * hs + bounce, 78 * hs, '#ffffff');
    drawPlayButton(cx, view.h * 0.66, 80 * hs, 'play');
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
    ctx.drawImage(floorCanvas, 0, 0, W, H);
    ctx.drawImage(trailCanvas, 0, 0, W, H);
    drawDock();
    for (const m of game.messes) if (m.state === 'idle') drawMess(m);
    for (const f of game.furniture) drawFurniture(f);
    drawTargetMarker();
    for (const m of game.messes) if (m.state === 'suck') drawMess(m);
    drawVacuum();
    drawParticles();
    drawDockArrow();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hs = hudScale();
    if (game.state !== 'title') {
      drawBinGauge(hs);
      drawProgress(hs);
    }
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

  newRoom();
  requestAnimationFrame(frame);

  // Hooks for the automated tests (tests/games/vroom-vroom-vacuum.spec.js) and
  // for poking around from the browser console.
  window.__vacuum = {
    game,
    vac,
    toScreen: (x, y) => ({ x: view.ox + x * view.scale, y: view.oy + y * view.scale }),
    world: () => ({ W, H, WALL, VAC_R, CELL }),
    // Could the vacuum's center sit here without touching a wall or furniture?
    canFit: (x, y) =>
      x >= WALL + VAC_R && x <= W - WALL - VAC_R && y >= WALL + VAC_R && y <= H - WALL - VAC_R &&
      !circleHitsFurniture(x, y, VAC_R + 2),
  };
})();
