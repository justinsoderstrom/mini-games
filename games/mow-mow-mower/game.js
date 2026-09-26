'use strict';

// Mow Mow Mower — a tiny lawn-mowing game for little kids.
// Tap (or drag) anywhere and the mower drives there, cutting the tall grass as
// it goes. When the lawn is done, a few weeds pop up by the fence and the tree;
// drive the little trimmer over them to tidy up, and the yard is finished.

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
  const FENCE = 120;          // hedge and picket fence along the top
  const MOWER_R = 56;         // how close the mower can get to the fence or a tree
  const MOW_R = 74;           // how wide a strip it cuts (wider than the mower, so edges and corners get done)
  const MOWER_SPEED = 420;
  const TRIMMER_R = 40;
  const TRIMMER_SPEED = 470;
  const TRIM_REACH = 34;      // extra distance at which the trimmer snips a weed
  const CELL = 20;            // grass is tracked on a grid of CELL x CELL squares
  const AUTO_FINISH = 0.94;   // past this, the last few blades mow themselves; nobody hunts for pixels
  const MILESTONES = [0.25, 0.5, 0.75, 1];
  const HINT_AFTER = 3.5;     // seconds without progress before an arrow points at what's left
  const FONT = '"Arial Rounded MT Bold", "Nunito", "Trebuchet MS", "Segoe UI", sans-serif';

  const MOWER_COLORS = [
    { main: '#e63946', dark: '#b02a35', light: '#f2727c' },
    { main: '#ff9f1c', dark: '#cc7a0e', light: '#ffbf66' },
    { main: '#4d96ff', dark: '#2f6fcc', light: '#86b8ff' },
    { main: '#9b5de5', dark: '#7440b8', light: '#bb8ff0' },
  ];
  const FLOWER_COLORS = ['#ff6b6b', '#ffd93d', '#ff9ff3', '#c77dff', '#ffffff', '#ff9f43'];
  const CONFETTI = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff', '#ff9f43'];
  const BITS = ['#4aa23f', '#6cbf55', '#8fd46e', '#3b8d33'];
  const WEED_KINDS = ['dandelion', 'puff', 'thistle'];

  const NUMBERS = ['', 'One!', 'Two!', 'Three!', 'Four!', 'Five!', 'Six!', 'Seven!', 'Eight!'];
  const CHEERS = { 0.25: 'Great job!', 0.5: 'Keep going!', 0.75: 'Almost done!' };

  // ---------- sound (all synthesized, no files) ----------
  const Sound = {
    ctx: null, master: null, noise: null,
    engGain: null, engOsc: null, engNoiseF: null, chugLfo: null,
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

      // Engine: rumbly noise plus a low buzz, pulsed by a fast wobble for the
      // "putt-putt" of a little mower. The same engine, pitched up, is the trimmer.
      this.engGain = ac.createGain();
      this.engGain.gain.value = 0;
      this.engGain.connect(this.master);

      const chug = ac.createGain();
      chug.gain.value = 0.7;
      chug.connect(this.engGain);
      this.chugLfo = ac.createOscillator();
      this.chugLfo.frequency.value = 12;
      const lfoDepth = ac.createGain();
      lfoDepth.gain.value = 0.3;
      this.chugLfo.connect(lfoDepth); lfoDepth.connect(chug.gain);

      const n = ac.createBufferSource();
      n.buffer = this.noise;
      n.loop = true;
      this.engNoiseF = ac.createBiquadFilter();
      this.engNoiseF.type = 'lowpass';
      this.engNoiseF.frequency.value = 700;
      const ng = ac.createGain();
      ng.gain.value = 0.6;
      n.connect(this.engNoiseF); this.engNoiseF.connect(ng); ng.connect(chug);

      this.engOsc = ac.createOscillator();
      this.engOsc.type = 'sawtooth';
      this.engOsc.frequency.value = 60;
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 500;
      const og = ac.createGain();
      og.gain.value = 0.3;
      this.engOsc.connect(lp); lp.connect(og); og.connect(chug);

      n.start();
      this.engOsc.start();
      this.chugLfo.start();
    },

    setMuted(m) {
      this.muted = m;
      if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.05);
      if (m) Voice.stop();
    },

    // pitch 1 = mower, higher = trimmer
    engine(on, level, pitch = 1) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.engGain.gain.setTargetAtTime(on ? 0.05 + level * 0.11 : 0, t, 0.1);
      this.engOsc.frequency.setTargetAtTime((58 + level * 30) * pitch, t, 0.15);
      this.engNoiseF.frequency.setTargetAtTime(650 * pitch, t, 0.15);
      this.chugLfo.frequency.setTargetAtTime(pitch > 1.5 ? 35 : 11 + level * 6, t, 0.2);
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

    zip() {
      this.hiss(0.3, 2000, 6000, 0.5);
      this.tone(700, 0.2, { type: 'square', to: 1500, vol: 0.07 });
    },
    boing(delay = 0) { this.tone(rand(260, 320), 0.22, { to: rand(620, 720), vol: 0.3, delay }); },
    bump()  { this.tone(170, 0.16, { type: 'triangle', to: 80, vol: 0.45 }); },
    twinkle() { [1319, 1760].forEach((f, i) => this.tone(f, 0.18, { type: 'triangle', vol: 0.12, delay: i * 0.08 })); },
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
  // Pre-rendered layers, one world unit per pixel. The tall grass layer gets
  // holes cut in it as the mower drives, revealing the striped short grass.
  const bgCanvas = document.createElement('canvas');
  const shortCanvas = document.createElement('canvas');
  const tallCanvas = document.createElement('canvas');
  const tallCtx = tallCanvas.getContext('2d');

  const lawn = { x: 0, y: 0, w: 0, h: 0 };
  let cols = 0, rows = 0;
  let cells = new Uint8Array(0); // 0 = not lawn, 1 = tall grass, 2 = mowed

  // state: title -> mow -> sprout (weeds pop up) -> trim -> win
  const game = {
    state: 'title',
    level: 1,
    time: 0,
    seed: 1,
    colors: MOWER_COLORS[0],
    trees: [],
    weeds: [],
    particles: [],
    grassTotal: 0,
    mowed: 0,
    fracShown: 0,
    milestone: 0,   // how many MILESTONES have been reached
    starPop: 0,
    trimmed: 0,
    idleT: 0,
    phaseT: 0,
    saidWeeds: false,
    winT: 0,
    bumpCooldown: 0,
  };

  function makeVehicle() {
    return {
      x: 0, y: 0, vx: 0, vy: 0, heading: -Math.PI / 2,
      tx: null, ty: null, speed: 0, stuckT: 0,
      blink: 0, blinkT: 2, squish: 0, spin: 0, shown: 0,
      stampX: -999, stampY: -999,
    };
  }
  const mower = makeVehicle();
  const trimmer = makeVehicle();

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
  function placeTrees(count) {
    const trees = [];
    for (let tries = 0; tries < 200 && trees.length < count; tries++) {
      const r = rand(78, 100);
      // Leave room for the mower to drive all the way around every tree.
      const m = r + MOWER_R * 2 + 40;
      if (lawn.w < m * 2 || lawn.h < m * 2) break;
      const x = rand(lawn.x + m, lawn.x + lawn.w - m);
      const y = rand(lawn.y + m, lawn.y + lawn.h - m);
      if (trees.some(t => dist(x, y, t.x, t.y) < r + t.r + MOWER_R * 4 + 40)) continue;
      const bumps = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rand(-0.2, 0.2);
        bumps.push({ a, d: r * rand(0.55, 0.7), s: r * rand(0.38, 0.5) });
      }
      const apples = [];
      for (let i = 0; i < 5; i++) apples.push({ a: rand(0, Math.PI * 2), d: r * rand(0.2, 0.75) });
      trees.push({ x, y, r, bumps, apples, hasApples: Math.random() < 0.6 });
    }
    return trees;
  }

  function buildGrid() {
    cols = Math.ceil(W / CELL);
    rows = Math.ceil(H / CELL);
    cells = new Uint8Array(cols * rows);
    let total = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * CELL + CELL / 2, y = r * CELL + CELL / 2;
        // Only cells the mower can actually reach count, even tucked into a corner.
        const m = CELL / 2;
        if (x < lawn.x + m || x > lawn.x + lawn.w - m || y < lawn.y + m || y > lawn.y + lawn.h - m) continue;
        if (game.trees.some(t => dist(x, y, t.x, t.y) < t.r + 4)) continue;
        cells[r * cols + c] = 1;
        total++;
      }
    }
    game.grassTotal = total;
  }

  function newYard() {
    const portrait = window.innerHeight > window.innerWidth * 1.1;
    W = portrait ? 1000 : 1600;
    H = portrait ? 1500 : 1000;
    lawn.x = EDGE; lawn.y = FENCE;
    lawn.w = W - EDGE * 2; lawn.h = H - FENCE - EDGE;

    game.seed = (Math.random() * 1e9) | 0;
    game.colors = MOWER_COLORS[(game.level - 1) % MOWER_COLORS.length];
    game.trees = placeTrees(game.level === 1 ? 1 : pick([1, 2, 2]));
    game.weeds = [];
    game.particles = [];
    buildGrid();
    game.mowed = 0;
    game.fracShown = 0;
    game.milestone = 0;
    game.starPop = 0;
    game.trimmed = 0;
    game.idleT = 0;
    game.phaseT = 0;
    game.saidWeeds = false;
    game.winT = 0;

    Object.assign(mower, makeVehicle(), {
      x: lawn.x + lawn.w / 2, y: lawn.y + lawn.h - MOWER_R - 20, shown: 1,
    });
    Object.assign(trimmer, makeVehicle());

    buildLayers();
    resize();
  }

  // ---------- pre-rendered layers ----------
  function buildLayers() {
    const r = mulberry32(game.seed);
    for (const cv of [bgCanvas, shortCanvas, tallCanvas]) { cv.width = W; cv.height = H; }

    // Background: flower beds around the edges, a hedge and fence at the top.
    const b = bgCanvas.getContext('2d');
    b.fillStyle = '#8a5a3b';
    b.fillRect(0, 0, W, H);
    b.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < W * H / 900; i++) b.fillRect(r() * W, r() * H, 6 + r() * 6, 3);
    b.fillStyle = 'rgba(255,255,255,0.07)';
    for (let i = 0; i < W * H / 1400; i++) b.fillRect(r() * W, r() * H, 5, 3);

    // Hedge
    b.fillStyle = '#2f6b2a';
    b.fillRect(0, 0, W, FENCE - 16);
    b.fillStyle = '#3a7d33';
    for (let x = -20; x < W + 40; x += 46) { circle(b, x + r() * 10, FENCE - 50 + r() * 10, 34 + r() * 8); b.fill(); }
    b.fillStyle = '#4b9441';
    for (let x = 0; x < W + 40; x += 58) { circle(b, x + r() * 14, FENCE - 72 + r() * 10, 22 + r() * 6); b.fill(); }

    // Picket fence
    const railY1 = FENCE - 78, railY2 = FENCE - 38;
    b.fillStyle = 'rgba(0,0,0,0.15)';
    b.fillRect(0, railY1 + 6, W, 14);
    b.fillRect(0, railY2 + 6, W, 14);
    b.fillStyle = '#f4efe6';
    b.fillRect(0, railY1, W, 14);
    b.fillRect(0, railY2, W, 14);
    for (let x = 10; x < W; x += 44) {
      b.fillStyle = 'rgba(0,0,0,0.15)';
      b.fillRect(x + 5, FENCE - 96, 26, 84);
      b.fillStyle = '#ffffff';
      b.beginPath();
      b.moveTo(x, FENCE - 12);
      b.lineTo(x, FENCE - 94);
      b.lineTo(x + 13, FENCE - 108);
      b.lineTo(x + 26, FENCE - 94);
      b.lineTo(x + 26, FENCE - 12);
      b.closePath();
      b.fill();
      b.strokeStyle = '#d8d0c2';
      b.lineWidth = 2;
      b.stroke();
    }

    // Flowers in the side and bottom beds
    const flower = (x, y) => {
      const s = 9 + r() * 5;
      b.fillStyle = FLOWER_COLORS[Math.floor(r() * FLOWER_COLORS.length)];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        circle(b, x + Math.cos(a) * s * 0.8, y + Math.sin(a) * s * 0.8, s * 0.6); b.fill();
      }
      b.fillStyle = '#ffd23f';
      circle(b, x, y, s * 0.45); b.fill();
    };
    const leaf = (x, y) => {
      b.fillStyle = '#3f8f3a';
      b.beginPath(); b.ellipse(x - 8, y + 10, 10, 5, -0.5, 0, Math.PI * 2); b.fill();
      b.beginPath(); b.ellipse(x + 8, y + 10, 10, 5, 0.5, 0, Math.PI * 2); b.fill();
    };
    for (let y = FENCE + 30; y < H - 20; y += 60 + r() * 30) {
      for (const x of [EDGE / 2, W - EDGE / 2]) {
        const fx = x + (r() - 0.5) * 16, fy = y + (r() - 0.5) * 16;
        leaf(fx, fy); flower(fx, fy);
      }
    }
    for (let x = 40; x < W - 20; x += 60 + r() * 30) {
      const fx = x + (r() - 0.5) * 16, fy = H - EDGE / 2 + (r() - 0.5) * 14;
      leaf(fx, fy); flower(fx, fy);
    }

    // Short (mowed) grass: classic stripes.
    const s = shortCanvas.getContext('2d');
    s.fillStyle = '#8ad665';
    s.fillRect(lawn.x, lawn.y, lawn.w, lawn.h);
    s.fillStyle = '#7cc95a';
    const band = 90;
    const vertical = W > H;
    for (let i = 1; i * band < (vertical ? lawn.w : lawn.h); i += 2) {
      if (vertical) s.fillRect(lawn.x + i * band, lawn.y, band, lawn.h);
      else s.fillRect(lawn.x, lawn.y + i * band, lawn.w, band);
    }
    s.fillStyle = 'rgba(40,110,30,0.18)';
    for (let i = 0; i < lawn.w * lawn.h / 350; i++) {
      s.fillRect(lawn.x + r() * lawn.w, lawn.y + r() * lawn.h, 2, 5);
    }
    // soft edge where the lawn meets the beds
    s.strokeStyle = 'rgba(0,0,0,0.18)';
    s.lineWidth = 6;
    s.strokeRect(lawn.x + 3, lawn.y + 3, lawn.w - 6, lawn.h - 6);

    // Tall grass: lots of little tufts, batched into one path per color.
    const t = tallCtx;
    t.globalCompositeOperation = 'source-over';
    t.fillStyle = '#3a8a32';
    t.fillRect(lawn.x, lawn.y, lawn.w, lawn.h);
    const greens = ['#2d7228', '#44993b', '#54aa47', '#347d2d', '#63b851'];
    const paths = greens.map(() => new Path2D());
    const tufts = lawn.w * lawn.h / 70;
    for (let i = 0; i < tufts; i++) {
      const x = lawn.x + 6 + r() * (lawn.w - 12);
      const y = lawn.y + 20 + r() * (lawn.h - 22);
      const p = paths[Math.floor(r() * paths.length)];
      const n = 2 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const lean = (r() - 0.5) * 16;
        const hgt = 14 + r() * 14;
        p.moveTo(x, y);
        p.quadraticCurveTo(x + lean * 0.3, y - hgt * 0.6, x + lean, y - hgt);
      }
    }
    t.lineCap = 'round';
    t.lineWidth = 3;
    greens.forEach((g, i) => { t.strokeStyle = g; t.stroke(paths[i]); });
    // A few little wildflowers hiding in the tall grass.
    for (let i = 0; i < lawn.w * lawn.h / 16000; i++) {
      t.fillStyle = pick(['#ffffff', '#ffe66d', '#ffb3c6']);
      circle(t, lawn.x + 10 + r() * (lawn.w - 20), lawn.y + 10 + r() * (lawn.h - 20), 4); t.fill();
    }
    // From here on, drawing on this layer erases it (see mowAt).
    t.globalCompositeOperation = 'destination-out';
    t.fillStyle = '#000000';
  }

  // ---------- input ----------
  let pointerDown = false;
  let activePointer = null;

  function activeVehicle() {
    if (game.state === 'mow') return [mower, MOWER_R];
    if (game.state === 'trim') return [trimmer, TRIMMER_R];
    return [null, 0];
  }

  function setTarget(e) {
    const [v, r] = activeVehicle();
    if (!v) return;
    const p = toWorld(e.clientX, e.clientY);
    v.tx = clamp(p.x, lawn.x + r, lawn.x + lawn.w - r);
    v.ty = clamp(p.y, lawn.y + r, lawn.y + lawn.h - r);
    v.stuckT = 0;
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    Sound.init();
    requestWakeLock();
    if (game.state === 'title') {
      Voice.prime();
      startMowing();
      return;
    }
    if (game.state === 'win') {
      if (game.winT > 2.2) {
        game.level++;
        newYard();
        startMowing();
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

  function startMowing() {
    game.state = 'mow';
    game.idleT = 0;
    Voice.say("Let's mow the grass!");
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
  function collide(v, r) {
    let hit = false;
    const minX = lawn.x + r, maxX = lawn.x + lawn.w - r;
    const minY = lawn.y + r, maxY = lawn.y + lawn.h - r;
    if (v.x < minX) { v.x = minX; hit = true; }
    if (v.x > maxX) { v.x = maxX; hit = true; }
    if (v.y < minY) { v.y = minY; hit = true; }
    if (v.y > maxY) { v.y = maxY; hit = true; }
    for (const t of game.trees) {
      const dx = v.x - t.x, dy = v.y - t.y;
      const d = Math.hypot(dx, dy) || 0.01;
      const min = t.r + r;
      if (d < min) {
        v.x = t.x + (dx / d) * min;
        v.y = t.y + (dy / d) * min;
        hit = true;
      }
    }
    return hit;
  }

  function drive(v, r, maxSpeed, dt) {
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
    const hit = collide(v, r);
    const wanted = Math.hypot(v.vx, v.vy);
    v.speed = dist(px, py, v.x, v.y) / dt;

    if (hit) {
      // Only boop for trees, not for gently running along the lawn's edge.
      const onTree = game.trees.some(t => dist(v.x, v.y, t.x, t.y) < t.r + r + 1);
      if (onTree && game.bumpCooldown <= 0 && wanted > 140 && v.speed < wanted * 0.55) {
        Sound.bump();
        v.squish = 1;
        game.bumpCooldown = 0.7;
      }
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

  // Cut the grass in a circle around (x, y). Returns how many cells were cut.
  function mowAt(x, y) {
    let cut = 0;
    const c0 = Math.max(0, Math.floor((x - MOW_R) / CELL)), c1 = Math.min(cols - 1, Math.floor((x + MOW_R) / CELL));
    const r0 = Math.max(0, Math.floor((y - MOW_R) / CELL)), r1 = Math.min(rows - 1, Math.floor((y + MOW_R) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const k = r * cols + c;
        if (cells[k] !== 1) continue;
        if (dist(x, y, c * CELL + CELL / 2, r * CELL + CELL / 2) > MOW_R) continue;
        cells[k] = 2;
        cut++;
      }
    }
    circle(tallCtx, x, y, MOW_R + 4);
    tallCtx.fill();
    return cut;
  }

  function updateMowing(dt) {
    drive(mower, MOWER_R, MOWER_SPEED, dt);
    if (dist(mower.x, mower.y, mower.stampX, mower.stampY) < 5) return;
    mower.stampX = mower.x;
    mower.stampY = mower.y;
    const cut = mowAt(mower.x, mower.y);
    if (!cut) return;

    game.mowed += cut;
    game.idleT = 0;
    // Clippings fly out the side.
    const side = mower.heading + Math.PI / 2;
    for (let i = 0; i < Math.min(cut, 3); i++) {
      const a = side + rand(-0.5, 0.5);
      const s = rand(120, 260);
      game.particles.push({
        kind: 'bit', x: mower.x + Math.cos(side) * 40, y: mower.y + Math.sin(side) * 40,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 4,
        life: 0.7, max: 0.7, size: rand(5, 9), color: pick(BITS), rot: rand(0, 6), vr: rand(-10, 10),
      });
    }
    // Every so often a butterfly flutters up out of the tall grass.
    if (Math.random() < cut * 0.0015) {
      game.particles.push({
        kind: 'butterfly', x: mower.x + rand(-40, 40), y: mower.y + rand(-40, 40),
        vx: rand(-60, 60), vy: rand(-140, -90), life: 4, max: 4, size: rand(16, 22),
        color: pick(['#ffd23f', '#ff9ff3', '#4d96ff', '#ff9f43']), rot: rand(0, 6),
      });
      Sound.twinkle();
    }

    const frac = game.mowed / game.grassTotal;
    while (game.milestone < MILESTONES.length - 1 && frac >= MILESTONES[game.milestone]) {
      Voice.say(CHEERS[MILESTONES[game.milestone]]);
      game.milestone++;
      game.starPop = 1;
      Sound.chime();
    }
    if (frac >= AUTO_FINISH) finishMowing();
  }

  // Mow whatever little bits are left with a sparkle, then bring out the weeds.
  function finishMowing() {
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c;
        if (cells[k] !== 1) continue;
        cells[k] = 2;
        const x = c * CELL + CELL / 2, y = r * CELL + CELL / 2;
        circle(tallCtx, x, y, CELL * 1.2);
        tallCtx.fill();
        if (n++ % 6 === 0) sparkle(x, y);
      }
    }
    game.mowed = game.grassTotal;
    game.milestone = MILESTONES.length;
    game.starPop = 1;
    game.state = 'sprout';
    game.phaseT = 0;
    game.idleT = 0;
    pointerDown = false;
    // Roll over to the corner to make room for the trimmer.
    mower.tx = lawn.x + MOWER_R + 30;
    mower.ty = lawn.y + lawn.h - MOWER_R - 30;
    Sound.tada();
    Voice.say('All mowed! Great job!');
  }

  function placeWeeds() {
    const want = Math.min(4 + game.level, 8);
    const inset = 30;
    const edge = [];
    for (let x = lawn.x + 70; x < lawn.x + lawn.w - 70; x += 40) {
      edge.push({ x, y: lawn.y + inset }, { x, y: lawn.y + lawn.h - inset });
    }
    for (let y = lawn.y + 70; y < lawn.y + lawn.h - 70; y += 40) {
      edge.push({ x: lawn.x + inset, y }, { x: lawn.x + lawn.w - inset, y });
    }
    const weeds = [];
    const ok = p =>
      dist(p.x, p.y, mower.x, mower.y) > 190 &&
      dist(p.x, p.y, trimmer.x, trimmer.y) > 150 &&
      weeds.every(w => dist(p.x, p.y, w.x, w.y) > 170);
    // One weed by each tree trunk, the rest along the fence and flower beds.
    for (const t of game.trees) {
      for (let tries = 0; tries < 20; tries++) {
        const a = rand(0, Math.PI * 2);
        const p = { x: t.x + Math.cos(a) * (t.r + 18), y: t.y + Math.sin(a) * (t.r + 18) };
        if (ok(p)) { weeds.push(p); break; }
      }
    }
    for (let tries = 0; tries < 400 && weeds.length < want; tries++) {
      const p = pick(edge);
      if (ok(p)) weeds.push({ ...p });
    }
    return weeds.map((p, i) => ({
      x: p.x, y: p.y, kind: WEED_KINDS[i % WEED_KINDS.length],
      state: 'grow', t: -i * 0.18, phase: rand(0, 6), boinged: false,
      blades: Array.from({ length: 7 }, (_, k) => ({ a: -Math.PI / 2 + (k - 3) * 0.28 + rand(-0.1, 0.1), h: rand(38, 60) })),
    }));
  }

  function updateSprout(dt) {
    game.phaseT += dt;
    const t = game.phaseT;
    // The mower rolls to the side, the trimmer pops out, then the weeds sprout.
    if (t < 1.3) {
      drive(mower, MOWER_R, MOWER_SPEED * 1.2, dt);
    } else if (!trimmer.shown) {
      mower.tx = mower.ty = null;
      mower.vx = mower.vy = 0;
      const toward = Math.atan2(lawn.y + lawn.h / 2 - mower.y, lawn.x + lawn.w / 2 - mower.x);
      trimmer.x = mower.x + Math.cos(toward) * 140;
      trimmer.y = mower.y + Math.sin(toward) * 140;
      collide(trimmer, TRIMMER_R);
      trimmer.heading = toward;
      trimmer.shown = 0.001;
      Sound.boing();
      sparkle(trimmer.x, trimmer.y);
      game.weeds = placeWeeds();
    }
    if (t > 1.9 && !game.saidWeeds) {
      game.saidWeeds = true;
      Voice.say("Uh oh, weeds! Let's trim them!");
    }
    if (t > 2.6 && game.weeds.every(w => w.state === 'idle')) {
      game.state = 'trim';
      game.idleT = 0;
    }
  }

  function updateTrimming(dt) {
    drive(trimmer, TRIMMER_R, TRIMMER_SPEED, dt);
    for (const w of game.weeds) {
      if (w.state !== 'idle') continue;
      if (dist(trimmer.x, trimmer.y, w.x, w.y) > TRIMMER_R + TRIM_REACH) continue;
      w.state = 'trim';
      w.t = 0;
      game.trimmed++;
      game.starPop = 1;
      game.idleT = 0;
      Sound.zip();
      Voice.say(NUMBERS[game.trimmed] || 'Yay!');
      for (let i = 0; i < 14; i++) {
        const a = rand(0, Math.PI * 2), s = rand(120, 300);
        game.particles.push({
          kind: 'bit', x: w.x, y: w.y - 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s, drag: 4,
          life: 0.8, max: 0.8, size: rand(6, 10), color: pick(BITS), rot: rand(0, 6), vr: rand(-10, 10),
        });
      }
      if (w.kind === 'puff') {
        for (let i = 0; i < 10; i++) {
          game.particles.push({
            kind: 'seed', x: w.x + rand(-12, 12), y: w.y - 55 + rand(-12, 12),
            vx: rand(-50, 50), vy: rand(-90, -40), life: 2.5, max: 2.5, size: rand(5, 8), rot: rand(0, 6),
          });
        }
      } else {
        burst(w.x, w.y - 50, 8, w.kind === 'dandelion' ? ['#ffd23f', '#ffe66d'] : ['#c77dff', '#e0b0ff']);
      }
    }
    if (game.trimmed >= game.weeds.length && game.weeds.every(w => w.state === 'gone')) win();
  }

  function updateWeeds(dt) {
    for (const w of game.weeds) {
      w.t += dt;
      if (w.state === 'grow') {
        if (w.t > 0 && !w.boinged) { w.boinged = true; Sound.boing(); }
        if (w.t > 0.5) { w.state = 'idle'; w.t = 0; }
      } else if (w.state === 'trim' && w.t > 0.35) {
        w.state = 'gone';
      }
    }
  }

  function win() {
    game.state = 'win';
    game.winT = 0;
    Sound.win();
    Voice.say('Hooray! The yard looks great!');
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
      if (p.kind === 'butterfly') p.vx += Math.sin(game.time * 2 + p.rot) * 120 * dt;
      if (p.kind === 'seed') p.vx += Math.sin(game.time * 2 + p.rot) * 40 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.vr) p.rot += p.vr * dt;
    }
    if (game.particles.length > 600) game.particles.splice(0, game.particles.length - 600);
    game.particles = game.particles.filter(p => p.life > 0);
  }

  function animateFace(v, dt) {
    v.squish = Math.max(0, v.squish - dt * 4);
    v.blinkT -= dt;
    if (v.blinkT < 0) { v.blink = 0.14; v.blinkT = rand(2, 5); }
    v.blink = Math.max(0, v.blink - dt);
    if (v.shown > 0) v.shown = Math.min(1, v.shown + dt * 3);
  }

  function update(dt) {
    game.time += dt;
    game.bumpCooldown -= dt;
    game.starPop = Math.max(0, game.starPop - dt * 3);
    if (game.state === 'mow' || game.state === 'trim') game.idleT += dt;

    if (game.state === 'mow') updateMowing(dt);
    else if (game.state === 'sprout') updateSprout(dt);
    else if (game.state === 'trim') updateTrimming(dt);
    else if (game.state === 'win') {
      game.winT += dt;
      trimmer.heading += dt * 5;
    }
    updateWeeds(dt);
    updateParticles(dt);

    const frac = game.grassTotal ? game.mowed / game.grassTotal : 0;
    game.fracShown += (frac - game.fracShown) * (1 - Math.exp(-8 * dt));

    animateFace(mower, dt);
    animateFace(trimmer, dt);
    const trimming = game.state === 'trim';
    trimmer.spin += dt * (trimming || game.state === 'win' ? 40 : 0);

    const mowing = game.state === 'mow' || (game.state === 'sprout' && game.phaseT < 1.3);
    if (mowing) Sound.engine(true, clamp(mower.speed / MOWER_SPEED, 0, 1), 1);
    else if (trimming) Sound.engine(true, clamp(0.3 + trimmer.speed / TRIMMER_SPEED, 0, 1), 3);
    else Sound.engine(false, 0);
  }

  // ---------- hints ----------
  function hintTarget() {
    if (game.idleT < HINT_AFTER) return null;
    if (game.state === 'trim') {
      let best = null, bd = Infinity;
      for (const w of game.weeds) {
        if (w.state !== 'idle') continue;
        const d = dist(w.x, w.y, trimmer.x, trimmer.y);
        if (d < bd) { bd = d; best = { x: w.x, y: w.y - 60 }; }
      }
      return best;
    }
    if (game.state === 'mow') return nearestTall(mower.x, mower.y);
    return null;
  }

  function nearestTall(x, y) {
    let best = null, bd = Infinity;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cells[r * cols + c] !== 1) continue;
        const cx = c * CELL + CELL / 2, cy = r * CELL + CELL / 2;
        const d = dist(x, y, cx, cy);
        if (d < bd) { bd = d; best = { x: cx, y: cy }; }
      }
    }
    return best;
  }

  // ---------- drawing: yard ----------
  function drawTree(t) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    circle(ctx, t.x + 16, t.y + 22, t.r); ctx.fill();
    ctx.fillStyle = '#2f7a2a';
    circle(ctx, t.x, t.y, t.r); ctx.fill();
    for (const b of t.bumps) {
      ctx.fillStyle = '#3e9436';
      circle(ctx, t.x + Math.cos(b.a) * b.d, t.y + Math.sin(b.a) * b.d, b.s); ctx.fill();
    }
    ctx.fillStyle = '#55ab48';
    circle(ctx, t.x - t.r * 0.2, t.y - t.r * 0.22, t.r * 0.55); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    circle(ctx, t.x - t.r * 0.32, t.y - t.r * 0.35, t.r * 0.25); ctx.fill();
    if (t.hasApples) {
      for (const a of t.apples) {
        const ax = t.x + Math.cos(a.a) * a.d, ay = t.y + Math.sin(a.a) * a.d;
        ctx.fillStyle = '#e63946';
        circle(ctx, ax, ay, 9); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        circle(ctx, ax - 3, ay - 3, 3); ctx.fill();
      }
    }
  }

  function drawWeed(w) {
    let sy = 1, sx = 1;
    if (w.state === 'grow') {
      if (w.t < 0) return;
      const p = clamp(w.t / 0.5, 0, 1);
      sy = sx = p < 0.7 ? p / 0.7 * 1.15 : 1.15 - (p - 0.7) / 0.3 * 0.15;
    } else if (w.state === 'trim') {
      sy = Math.max(0, 1 - w.t / 0.35);
      sx = 1 + w.t;
    } else if (w.state === 'gone') {
      // a tidy little stub stays behind
      ctx.fillStyle = '#6cbf55';
      ctx.beginPath(); ctx.ellipse(w.x, w.y, 16, 7, 0, 0, Math.PI * 2); ctx.fill();
      return;
    }
    const sway = w.state === 'idle' ? Math.sin(game.time * 3 + w.phase) * 0.12 : 0;

    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(4, 4, 30 * sx, 10, 0, 0, Math.PI * 2); ctx.fill();
    ctx.scale(sx, sy);
    ctx.lineCap = 'round';
    let top = null;
    w.blades.forEach((b, i) => {
      const a = b.a + sway * (1 + i * 0.1);
      const ex = Math.cos(a) * b.h, ey = Math.sin(a) * b.h;
      ctx.strokeStyle = i % 2 ? '#2d6b24' : '#3f8a2f';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(ex * 0.2, ey * 0.6, ex, ey);
      ctx.stroke();
      if (i === 3) top = { x: ex, y: ey };
    });
    // flower head on the middle stalk
    ctx.strokeStyle = '#3f8a2f';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(top.x, top.y - 14); ctx.stroke();
    const hx = top.x, hy = top.y - 18;
    if (w.kind === 'dandelion') {
      ctx.fillStyle = '#ffd23f';
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        circle(ctx, hx + Math.cos(a) * 11, hy + Math.sin(a) * 11, 6); ctx.fill();
      }
      ctx.fillStyle = '#f4a300';
      circle(ctx, hx, hy, 8); ctx.fill();
    } else if (w.kind === 'puff') {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      circle(ctx, hx, hy, 16); ctx.fill();
      ctx.strokeStyle = 'rgba(180,180,180,0.8)';
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(a) * 15, hy + Math.sin(a) * 15); ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#4f8a3a';
      circle(ctx, hx, hy + 6, 9); ctx.fill();
      ctx.fillStyle = '#b86bd8';
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + (k - 3) * 0.3;
        ctx.beginPath(); ctx.ellipse(hx + Math.cos(a) * 8, hy + Math.sin(a) * 8, 4, 10, a + Math.PI / 2, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // ---------- drawing: mower & trimmer ----------
  function drawEyes(v, ex, spread, r) {
    const open = v.blink > 0 ? 0.15 : 1;
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(ex, s * spread, r, r * 1.15 * open, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 3;
      ctx.stroke();
      if (open > 0.5) {
        ctx.fillStyle = '#2b2d42';
        circle(ctx, ex + r * 0.35, s * spread, r * 0.55); ctx.fill();
        ctx.fillStyle = '#ffffff';
        circle(ctx, ex + r * 0.5, s * spread - r * 0.25, r * 0.2); ctx.fill();
      }
    }
  }

  function drawMower() {
    const v = mower;
    const c = game.colors;
    const running = game.state === 'mow' || (game.state === 'sprout' && game.phaseT < 1.3);
    const jig = running ? Math.sin(game.time * 70) * 1.2 : 0;
    const bob = game.state === 'win' ? -Math.abs(Math.sin(game.winT * 6)) * 18 : 0;
    ctx.save();
    ctx.translate(v.x + jig, v.y + bob);
    ctx.rotate(v.heading);
    const sq = 1 + v.squish * 0.08;
    ctx.scale(1 / sq, sq);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    roundRect(ctx, -52, -44, 116, 100, 26); ctx.fill();

    // handle, trailing behind
    ctx.strokeStyle = '#8d99ae';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-40, -30); ctx.lineTo(-96, -30); ctx.lineTo(-96, 30); ctx.lineTo(-40, 30);
    ctx.stroke();
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 13;
    ctx.beginPath(); ctx.moveTo(-96, -20); ctx.lineTo(-96, 20); ctx.stroke();

    // wheels
    ctx.fillStyle = '#2b2d42';
    for (const wx of [-34, 34]) for (const wy of [-50, 50]) { roundRect(ctx, wx - 15, wy - 9, 30, 18, 6); ctx.fill(); }

    // body
    roundRect(ctx, -56, -46, 112, 92, 28);
    ctx.fillStyle = c.main;
    ctx.fill();
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = c.light;
    roundRect(ctx, -44, -36, 70, 20, 10); ctx.fill();

    // engine cap at the back
    ctx.fillStyle = '#5c677d';
    circle(ctx, -22, 0, 20); ctx.fill();
    ctx.fillStyle = '#8d99ae';
    circle(ctx, -22, 0, 12); ctx.fill();

    drawEyes(v, 24, 18, 12);
    ctx.fillStyle = 'rgba(255,120,150,0.45)';
    circle(ctx, 14, -34, 7); ctx.fill();
    circle(ctx, 14, 34, 7); ctx.fill();
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(34, 0, 10, -Math.PI / 2 + 0.3, Math.PI / 2 - 0.3); ctx.stroke();
    ctx.restore();
  }

  function drawTrimmer() {
    const v = trimmer;
    if (!v.shown) return;
    const pop = v.shown < 1 ? Math.sin(v.shown * Math.PI * 0.85) * 1.2 : 1;
    const bob = game.state === 'win' ? -Math.abs(Math.sin(game.winT * 6 + 1)) * 18 : 0;
    ctx.save();
    ctx.translate(v.x, v.y + bob);
    ctx.scale(pop, pop);

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    circle(ctx, 6, 8, 40); ctx.fill();

    // spinning string (a soft blur disc plus two lines)
    const spinning = game.state === 'trim' || game.state === 'win';
    if (spinning) {
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      circle(ctx, 0, 0, 58); ctx.fill();
    }
    ctx.save();
    ctx.rotate(v.spin);
    ctx.strokeStyle = spinning ? 'rgba(255,255,255,0.8)' : '#ffffff';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-56, 0); ctx.lineTo(56, 0); ctx.stroke();
    if (spinning) { ctx.beginPath(); ctx.moveTo(0, -56); ctx.lineTo(0, 56); ctx.stroke(); }
    ctx.restore();

    ctx.rotate(v.heading);
    const sq = 1 + v.squish * 0.1;
    ctx.scale(1 / sq, sq);
    // little handle behind
    ctx.strokeStyle = '#ff9f1c';
    ctx.lineWidth = 10;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-62, 0); ctx.stroke();
    ctx.fillStyle = '#ffd60a';
    circle(ctx, 0, 0, 36); ctx.fill();
    ctx.strokeStyle = '#e0a800';
    ctx.lineWidth = 5;
    ctx.stroke();
    drawEyes(v, 10, 14, 10);
    ctx.strokeStyle = '#2b2d42';
    ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(20, 0, 8, -Math.PI / 2 + 0.3, Math.PI / 2 - 0.3); ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of game.particles) {
      const a = clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      if (p.kind === 'star') {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        starPath(ctx, 0, 0, p.size * (0.6 + a * 0.4)); ctx.fill();
      } else if (p.kind === 'bit') {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -1.5, p.size, 3);
      } else if (p.kind === 'confetti') {
        ctx.globalAlpha = Math.min(1, p.life);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.kind === 'seed') {
        ctx.globalAlpha = Math.min(1, p.life);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 5; k++) {
          const ang = (k / 5) * Math.PI * 2;
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(ang) * p.size, Math.sin(ang) * p.size); ctx.stroke();
        }
      } else if (p.kind === 'butterfly') {
        ctx.rotate(-(p.rot || 0));
        ctx.globalAlpha = Math.min(1, p.life);
        const flap = Math.abs(Math.sin(game.time * 14 + p.rot));
        ctx.fillStyle = p.color;
        for (const s of [-1, 1]) {
          ctx.beginPath(); ctx.ellipse(s * p.size * 0.5 * flap, -2, p.size * 0.55 * flap + 1, p.size * 0.5, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#2b2d42';
        ctx.fillRect(-2, -p.size * 0.45, 4, p.size * 0.9);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawHintArrow() {
    const t = hintTarget();
    if (!t) return;
    const bounce = Math.abs(Math.sin(game.time * 5)) * 22;
    const x = t.x, y = t.y - 40 - bounce;
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

  // A grass-green bar that fills as you mow, with a star at each quarter.
  function drawMowBar(hs) {
    const bw = Math.min(view.w * 0.5, 420 * hs), bh = 26 * hs;
    const x0 = (view.w - bw) / 2, y = 30 * hs;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(ctx, x0 - 26 * hs, y - 14 * hs, bw + 52 * hs, bh + 28 * hs, (bh + 28 * hs) / 2); ctx.fill();
    ctx.save();
    roundRect(ctx, x0, y, bw, bh, bh / 2);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = '#3ddc84';
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

  function drawWeedStars(hs) {
    const n = game.weeds.length;
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
      const done = i < game.trimmed;
      const pop = done && i === game.trimmed - 1 ? 1 + game.starPop * 0.6 : 1;
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
    ctx.fillStyle = 'rgba(30, 34, 56, 0.4)';
    ctx.fillRect(0, 0, view.w, view.h);
    const cx = view.w / 2;
    const bounce = Math.sin(game.time * 2.5) * 6 * hs;
    bigText('Mow Mow', cx, view.h * 0.27 + bounce, 78 * hs, '#ffd60a');
    bigText('Mower!', cx, view.h * 0.27 + 80 * hs + bounce, 78 * hs, '#ffffff');
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
    ctx.drawImage(shortCanvas, 0, 0, W, H);
    ctx.drawImage(tallCanvas, 0, 0, W, H);
    for (const w of game.weeds) if (w.state === 'gone') drawWeed(w);
    for (const t of game.trees) drawTree(t);
    for (const w of game.weeds) if (w.state !== 'gone') drawWeed(w);
    drawMower();
    drawTrimmer();
    drawParticles();
    drawHintArrow();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const hs = hudScale();
    if (game.state === 'mow' || (game.state === 'sprout' && game.phaseT < 1.3)) drawMowBar(hs);
    else if (game.state !== 'title') drawWeedStars(hs);
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

  // Hooks for the automated tests (tests/games/mow-mow-mower.spec.js) and for
  // poking around from the browser console.
  window.__mower = {
    game,
    mower,
    trimmer,
    lawn,
    toScreen: (x, y) => ({ x: view.ox + x * view.scale, y: view.oy + y * view.scale }),
    // Center of the closest patch of tall grass to (x, y), or null when it's all mowed.
    nearestTall,
  };
})();
