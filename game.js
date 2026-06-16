// Ajolote Run — Platanus Hack 26: CDMX
// Top-down endless swim up a Xochimilco canal.
// Dodge trajineras, nets, carp and herons. Eat, survive, go far.
// And because you're an axolotl — when you get hit, you regenerate.

const W = 800;
const H = 600;

// ---------------------------------------------------------------------------
// Arcade cabinet button -> keyboard key mapping.
// The physical cabinet sends these exact key codes. DO NOT modify the existing
// keys — they match the real wiring. (Local-test keys are appended, not replaced.)
const CABINET_KEYS = {
  P1_U: ['w'], P1_D: ['s'], P1_L: ['a'], P1_R: ['d'],
  P1_1: ['u', ' '], P1_2: ['i'], P1_3: ['o'],
  P1_4: ['j'], P1_5: ['k'], P1_6: ['l'],
  P2_U: ['ArrowUp'], P2_D: ['ArrowDown'], P2_L: ['ArrowLeft'], P2_R: ['ArrowRight'],
  P2_1: ['r'], P2_2: ['t'], P2_3: ['y'],
  P2_4: ['f'], P2_5: ['g'], P2_6: ['h'],
  START1: ['Enter'], START2: ['2'],
};

const KEY_TO_ARCADE = {};
for (const [code, keys] of Object.entries(CABINET_KEYS)) {
  for (const key of keys) {
    KEY_TO_ARCADE[key.length === 1 ? key.toLowerCase() : key] = code;
  }
}

const held = Object.create(null);
const prev = Object.create(null);

window.addEventListener('keydown', (e) => {
  const code = KEY_TO_ARCADE[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (code) { held[code] = true; if (e.key === ' ') e.preventDefault(); }
});
window.addEventListener('keyup', (e) => {
  const code = KEY_TO_ARCADE[e.key.length === 1 ? e.key.toLowerCase() : e.key];
  if (code) held[code] = false;
});

// True only on the frame a button transitions from up -> down.
const justPressed = (code) => !!held[code] && !prev[code];
const syncInput = () => { for (const k in held) prev[k] = held[k]; };

// ---------------------------------------------------------------------------
// Storage (arcade bridge, falls back to localStorage for local dev)
function getStorage() {
  if (window.platanusArcadeStorage) return window.platanusArcadeStorage;
  return {
    async get(key) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? { found: false, value: null } : { found: true, value: JSON.parse(raw) };
      } catch { return { found: false, value: null }; }
    },
    async set(key, value) { try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {} },
  };
}
async function loadData(key) { try { return await getStorage().get(key); } catch { return { found: false, value: null }; } }
async function saveData(key, value) { try { return await getStorage().set(key, value); } catch {} }

const SCORE_KEY = 'ajolote-run-scores';
const MAX_SCORES = 5;

// ---------------------------------------------------------------------------
// Palette
const C = {
  deep: 0x06222e, mid: 0x0c3a4a, shallow: 0x12586a,
  bank: 0x3a2f18, bankEdge: 0x55471f, reed: 0x6f8f2a, reedDark: 0x4c6b1c,
  axo: 0xff9ec7, axoDark: 0xf06ba0, axoBelly: 0xffd0e4, gill: 0xff4f86, eye: 0x241018,
  worm: 0xff7a45, larva: 0xeadfa0, egg: 0xfff2c8,
  carp: 0x9fb0c4, koi: 0xff8a3d, heron: 0xeef0ea, beak: 0xffc23a,
  net: 0xd8e0bf, trash: 0x8d9596, bottle: 0x5f9e6a, tire: 0x232826, boatHull: 0x8a4a2a,
  ink: 0x07181f, cream: 0xfff4dc, accent: 0xffd64d, hot: 0xff5d7a, good: 0x8be36b,
};

const FACTS = [
  'Los ajolotes regeneran patas, cola y hasta partes del corazon.',
  'Quedan menos de 1,000 ajolotes silvestres en Xochimilco.',
  'El ajolote nunca se transforma: vive toda su vida como larva.',
  'Xochimilco es el ultimo hogar natural del ajolote.',
  'Las carpas y tilapias invasoras se comen a las crias de ajolote.',
  'El ajolote es un simbolo de la Ciudad de Mexico.',
];

// Channel geometry
const BANK = 74;
const CH_L = BANK;
const CH_R = W - BANK;
const AXO_R = 19;
const X_MIN = CH_L + AXO_R + 4;
const X_MAX = CH_R - AXO_R - 4;
const Y_MIN = H * 0.40;
const Y_MAX = H * 0.88;
const HOME_Y = H * 0.74;
const DASH_CD = 1.5;

// ---------------------------------------------------------------------------
// Audio: tiny Web Audio tone synth (procedural — no asset files)
function makeBuffer(ctx, opts) {
  const { freq = 440, dur = 0.15, type = 'sine', vol = 0.25, freqTo = null, decay = 3 } = opts;
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(sr * dur));
  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    const t = i / sr, p = i / len;
    const f = freqTo == null ? freq : freq + (freqTo - freq) * p;
    let s;
    if (type === 'square') s = Math.sin(2 * Math.PI * f * t) >= 0 ? 1 : -1;
    else if (type === 'saw') s = 2 * ((f * t) % 1) - 1;
    else if (type === 'noise') s = Math.random() * 2 - 1;
    else s = Math.sin(2 * Math.PI * f * t);
    d[i] = s * vol * Math.exp(-p * decay);
  }
  return buf;
}

let muted = false;
function play(scene, buf, rate = 1, vol = 1) {
  if (!buf || muted) return;
  const ctx = scene.sound.context;
  if (ctx.state === 'suspended') ctx.resume();
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate * (0.97 + Math.random() * 0.06);
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(g); g.connect(ctx.destination);
  src.start();
}

const A = "#$%&')*+,-.0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~";
const Uz = (s) => { const o = []; let t = 0; for (let i = 0; i < s.length; i += 3) { t += A.indexOf(s[i+1]) * 30; o.push(A.indexOf(s[i]) + 33, t, A.indexOf(s[i+2]) * 30 - 20); } return o; };
const MEL = Uz("X#)X.)U.4W9)S.)X.)X.)U.4W9)S.)X.)X.)U.4W9)S4)Q)HQW)W.)W.)W.4U9)S.)Q.>NC)P.)Q.)S.)S.)X.4W9)U.)P.)L.>XW)X.)U.4W9)S.)X.)X.)U.4W9)S.)X.)X.)U.4W9)S4)Q)HQW)W.)W.)W.4U9)S.)Q.>NC)P.)Q.)S.)S.)X.4W9)U.)P.)L.>]W>ZC9Q9)X))U)WZbHXW)].)X.HSM)U.)U.)S..U.)U.)S.)^.)^.)Z..W9)S.)U.4S9CQC.P.CLC)S9)].>ZC9Q9)X))U)WZbHXW)].)X.HSM)U.)U.)S..U.)U.)S.)^.)^.)Z..W9)S.)U.4S9CQC.P.CLC)S9)L.)");
const BAS = Uz("4#)8.)8.)..);.);.)4.)8.)8.)..);.);.)4.)8.)8.)4.)8.)8.)..);.);.)6.);.);.)..);.);.)6.);.);.)..);.);.)6.);.);.)..);.);.)6.);.);.)4.)8.)8.)..)@.)8.)4.)8.)8.)..);.);.)4.)8.)8.)..);.);.)4.)8.)8.)4.)8.)8.)..);.);.)6.);.);.)..);.);.)6.);.);.)..);.);.)6.);.);.)..);.);.)6.);.);.)4.)8.)8.)..)@.)8.)4.)8.)8.)..)8.)8.),.)9.)9.)6.)9.)9.)..);.);.)6.);.);.)4.)8.)8.)..)8.)8.)4.)8.)8.)..)8.)8.)..);.);.)6.);.);.)..);.);.)6.);.);.)4.)8.)8.)..)8.)8.)4.)8.)8.)..)8.)8.),.)9.)9.)6.)9.)9.)..);.);.)6.);.);.)4.)8.)8.)..)8.)8.)4.)8.)8.)..)8.)8.)..);.);.)6.);.);.)..);.);.)6.);.);.)4.)8.)8.)..)8.)8.)4.)");
const SONG_MS = 58330;
const STAR_THEMES = [{m:Uz("N#,R1,I1,L1,P1'P,'G''G,'K''K,'N''N,'L''L,'P''P,'S,,K1,N1,R1,I1,L1'L,'P''P,'G''G,'K''K,'N''N,'L''"),b:Uz("%#)).))4)-.)#4)..)%.))4)&.)+4)..).4)%.))4)).)-4)#.).4)%.))4)&.)")},{m:Uz("S#'R,'S''U,,W1'S''R,'S''U,,W1'S,'R''S,'U''U,'W''U1'W,'U''W,'R''N,'R,'U''S,'R''S,'U1'W''U,'W''R,'N,'R''U,'S''R,'"),b:Uz("%)))4)..)%4)).)..)%4)).).4)%.))4)#9))4).4)%.))4)#4))9)")},{m:Uz("L#'L,,L5'M,'N,,N1'N1'R''S,,S1'S1'M,'N''N,,N5'K,'L''L,,L9'M''N,,N1'N1'R''S,,S1,S1'"),b:Uz("))))9).9).4)&9)&9).9).4))9))9).4).9)&4)+.).4)")},{m:Uz("P''L''I,'F''H''G''S1'W,'S''W,'U''R,'U''S,'P''S,'R,'L1'P''L,'P''N,'K''N,'L''I,'L''K,'S1'W,'S''W,'U''R,'U''S,'P''S,'R,'"),b:Uz(")4).4)%.)).)#4)'.)+4)).)&4)&.))4)+.)-4)..)%4)).)#4)'.)+.))4)")}];
const STAR_MS = 7600;
const midiHz = (p) => 440 * Math.pow(2, (p - 69) / 12);

// Star-power theme — an energetic hook lifted from the supplied original MIDI
// (bright square lead + triangle bass). Plays only while the star is active.

// Music: "Cielito Lindo" (public domain) is the main loop; grabbing a star ducks
// it and blasts the star theme, then crossfades back. All baked-in note data —
// no asset files / no network.
function startMusic(scene) {
  const ctx = scene.sound.context;
  if (ctx.state === 'suspended') ctx.resume();
  if (scene._music) return;
  scene._music = true;

  const out = ctx.createGain();
  out.gain.value = 0.6;
  out.connect(ctx.destination);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass'; filt.frequency.value = 2600; filt.Q.value = 0.6;
  filt.connect(out);

  const dly = ctx.createDelay(0.6);
  const fb = ctx.createGain();
  dly.delayTime.value = 0.30; fb.gain.value = 0.22;
  dly.connect(fb); fb.connect(dly); fb.connect(filt);

  // two buses: mellow Cielito (through the lowpass) and bright star (direct)
  const cielito = ctx.createGain(); cielito.gain.value = 1; cielito.connect(filt);
  const star = ctx.createGain(); star.gain.value = 0; star.connect(out);

  const voice = (freq, t, dur, type, peak, echo, dest) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    o.connect(g); g.connect(dest); if (echo) g.connect(dly);
    const end = t + dur;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.02);
    g.gain.setValueAtTime(peak, Math.max(t + 0.04, end - 0.06));
    g.gain.exponentialRampToValueAtTime(0.0001, end + 0.02);
    o.start(t); o.stop(end + 0.05);
  };

  const playSeq = (t0) => {
    for (let i = 0; i < MEL.length; i += 3)
      voice(midiHz(MEL[i]), t0 + MEL[i + 1] / 1000, MEL[i + 2] / 1000, 'triangle', 0.16, true, cielito);
    for (let i = 0; i < BAS.length; i += 3)
      voice(midiHz(BAS[i]), t0 + BAS[i + 1] / 1000, Math.min(BAS[i + 2], 260) / 1000, 'sine', 0.17, false, cielito);
    scene.time.delayedCall(SONG_MS, () => playSeq(t0 + SONG_MS / 1000));
  };
  playSeq(ctx.currentTime + 0.25);

  const playStar = (t0) => {
    if (scene.G.ax.star <= 0) { scene._starSeq = false; return; }
    const seg = scene._starSeg || STAR_THEMES[0];
    for (let i = 0; i < seg.m.length; i += 3)
      voice(midiHz(seg.m[i]), t0 + seg.m[i + 1] / 1000, seg.m[i + 2] / 1000, 'square', 0.13, false, star);
    for (let i = 0; i < seg.b.length; i += 3)
      voice(midiHz(seg.b[i]), t0 + seg.b[i + 1] / 1000, seg.b[i + 2] / 1000, 'triangle', 0.18, false, star);
    scene.time.delayedCall(STAR_MS, () => playStar(t0 + STAR_MS / 1000));
  };

  const ramp = (node, v, dt) => {
    const now = ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(node.gain.value, now);
    node.gain.linearRampToValueAtTime(v, now + dt);
  };
  scene._starIdx = 0;
  scene._setStar = (on) => {
    if (on) {
      ramp(cielito, 0, 0.12); ramp(star, 0.95, 0.05);
      if (!scene._starSeq) {
        // rotate to the next section each fresh star, so the theme varies
        scene._starSeg = STAR_THEMES[scene._starIdx % STAR_THEMES.length];
        scene._starIdx++;
        scene._starSeq = true;
        playStar(ctx.currentTime + 0.03);
      }
    } else {
      ramp(cielito, 1, 0.35); ramp(star, 0, 0.25);
    }
  };
}

// ---------------------------------------------------------------------------
const config = {
  type: Phaser.AUTO,
  width: W,
  height: H,
  parent: 'game-root',
  backgroundColor: '#06222e',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true },
  scene: { create, update },
};

new Phaser.Game(config);

// ===========================================================================
// CREATE
// ===========================================================================
function create() {
  this.cameras.main.setBackgroundColor('#06222e');

  buildTextures(this);
  buildSounds(this);

  this.layerBg = this.add.container(0, 0).setDepth(0);
  this.layerDecor = this.add.container(0, 0).setDepth(2);
  this.layerHazard = this.add.container(0, 0).setDepth(6);
  this.layerAxo = this.add.container(0, 0).setDepth(10);
  this.layerFx = this.add.container(0, 0).setDepth(13);
  this.layerHud = this.add.container(0, 0).setDepth(20);
  this.layerOverlay = this.add.container(0, 0).setDepth(30);

  buildBackground(this);
  buildBanks(this);
  buildParticles(this);

  // Axolotl is one Graphics, redrawn each frame for full animation control.
  this.axoG = this.add.graphics();
  this.layerAxo.add(this.axoG);
  this._sl = this.add.graphics();
  this.layerFx.add(this._sl);

  buildHud(this);
  buildTitle(this);
  buildOverlay(this);

  this.G = freshState();

  this.scores = [];
  loadData(SCORE_KEY).then((r) => {
    if (r.found && Array.isArray(r.value)) this.scores = sanitizeScores(r.value);
    refreshTitleBest(this);
  });

  setPhase(this, 'title');
}

function freshState() {
  return {
    phase: 'title', t: 0, meters: 0, scrollSpeed: 190, spawnTimer: 0.8,
    hazards: [], foods: [], decor: [],
    ax: { x: W / 2, y: HOME_Y, vx: 0, vy: 0, tilt: 0, inv: 0, dash: 0, dashCd: 0,
          limbs: 3, regen: 0, squash: 0, blink: 0, eatPulse: 0, star: 0 },
    combo: 0, comboTimer: 0, bestMeters: 0, foodBoost: 0, lastStar: 0,
    shake: 0, hitStop: 0, flash: 0, speedlines: 0,
    overTimer: 0, finalM: 0,
    initials: [0, 0, 0], slot: 0, repeat: 0, qualifies: false, saved: false,
  };
}

// ===========================================================================
// TEXTURES (procedurally generated once)
// ===========================================================================
function buildTextures(scene) {
  const g = scene.make.graphics({ add: false });

  g.clear(); g.fillStyle(0xffffff, 1); g.fillCircle(8, 8, 7); g.generateTexture('dot', 16, 16);

  // carp / fish
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(30, 20, 46, 24);
  g.fillTriangle(6, 20, 0, 8, 0, 32);
  g.fillTriangle(34, 8, 44, 2, 40, 16);
  g.fillStyle(0x000000, 0.65); g.fillCircle(44, 17, 2.4);
  g.fillStyle(0xffffff, 0.5); g.fillEllipse(28, 16, 30, 6);
  g.generateTexture('carp', 52, 40);

  // heron (top-down diving bird)
  g.clear();
  g.fillStyle(0xffffff, 1);
  g.fillEllipse(24, 32, 22, 44);
  g.fillTriangle(8, 28, 40, 28, 24, 6);
  g.fillRect(22, 4, 4, 24);
  g.fillStyle(C.beak, 1); g.fillTriangle(20, 6, 28, 6, 24, -8);
  g.fillStyle(0x000000, 0.5); g.fillCircle(24, 10, 2);
  g.generateTexture('heron', 48, 56);

  // net segment (mesh) — stretched horizontally when placed
  g.clear();
  g.fillStyle(C.ink, 0.18); g.fillRect(0, 0, 64, 30);
  g.lineStyle(2, C.net, 0.95);
  for (let x = 0; x <= 64; x += 10) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 30); g.strokePath(); }
  for (let y = 0; y <= 30; y += 10) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.strokePath(); }
  g.lineStyle(4, C.net, 1); g.strokeRect(0, 0, 64, 30);
  g.generateTexture('net', 64, 30);

  // trash: bottle / tire / bag
  g.clear();
  g.fillStyle(C.bottle, 0.92); g.fillRoundedRect(8, 6, 16, 30, 5); g.fillRect(13, 0, 6, 8);
  g.fillStyle(0xffffff, 0.25); g.fillRect(11, 10, 3, 18);
  g.generateTexture('bottle', 32, 40);

  g.clear();
  g.fillStyle(C.tire, 1); g.fillCircle(18, 18, 17);
  g.fillStyle(0x3a423f, 1); g.fillCircle(18, 18, 9);
  g.fillStyle(C.deep, 1); g.fillCircle(18, 18, 5);
  g.generateTexture('tire', 36, 36);

  g.clear();
  g.fillStyle(C.trash, 0.85); g.fillRoundedRect(4, 8, 28, 24, 8); g.fillTriangle(8, 10, 16, 0, 24, 10);
  g.fillStyle(0xffffff, 0.18); g.fillRoundedRect(9, 13, 8, 10, 3);
  g.generateTexture('bag', 36, 34);

  // food
  g.clear();
  g.fillStyle(C.worm, 1);
  for (let i = 0; i < 5; i++) g.fillCircle(5 + i * 4, 10 + Math.sin(i) * 3, 4);
  g.fillStyle(0xffffff, 0.4); g.fillCircle(6, 8, 1.5);
  g.generateTexture('worm', 30, 22);

  g.clear();
  g.fillStyle(C.larva, 1); g.fillEllipse(11, 11, 16, 10);
  g.fillStyle(C.ink, 0.6); g.fillCircle(15, 11, 2);
  g.generateTexture('larva', 22, 22);

  g.clear();
  g.fillStyle(C.egg, 0.5); g.fillCircle(16, 16, 15);
  g.fillStyle(C.egg, 1); g.fillCircle(16, 16, 9);
  g.fillStyle(C.axoDark, 1); g.fillCircle(16, 16, 4);
  g.generateTexture('egg', 32, 32);

  // lily pad decor
  g.clear();
  g.fillStyle(0x2f6f3a, 1); g.fillCircle(24, 24, 22);
  g.fillStyle(0x3f8a4a, 0.6); g.fillCircle(24, 24, 13);
  g.fillStyle(C.deep, 1); g.fillTriangle(24, 24, 40, 14, 42, 30);
  g.generateTexture('lily', 48, 48);

  // star power-up (gold, with a little face)
  g.clear();
  const sp = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 9 : 22, a = -Math.PI / 2 + i * Math.PI / 5;
    sp.push({ x: 24 + Math.cos(a) * r, y: 24 + Math.sin(a) * r });
  }
  g.fillStyle(0xffe066, 1); g.fillPoints(sp, true);
  g.fillStyle(0xfff6c0, 1); g.fillCircle(24, 22, 6);
  g.fillStyle(0x241018, 1); g.fillCircle(21, 21, 1.7); g.fillCircle(27, 21, 1.7);
  g.generateTexture('star', 48, 48);

  g.destroy();
}

// ===========================================================================
function buildSounds(scene) {
  const ctx = scene.sound.context;
  scene.sfx = {
    chomp: makeBuffer(ctx, { freq: 520, freqTo: 720, dur: 0.10, type: 'square', vol: 0.18, decay: 5 }),
    crunch: makeBuffer(ctx, { freq: 200, dur: 0.14, type: 'noise', vol: 0.28, decay: 6 }),
    hit: makeBuffer(ctx, { freq: 150, freqTo: 60, dur: 0.30, type: 'square', vol: 0.32, decay: 4 }),
    regen: makeBuffer(ctx, { freq: 600, freqTo: 1100, dur: 0.30, type: 'sine', vol: 0.2, decay: 3 }),
    dash: makeBuffer(ctx, { freq: 320, freqTo: 720, dur: 0.18, type: 'saw', vol: 0.16, decay: 5 }),
    warn: makeBuffer(ctx, { freq: 880, dur: 0.12, type: 'square', vol: 0.16, decay: 2 }),
    start: makeBuffer(ctx, { freq: 440, freqTo: 880, dur: 0.25, type: 'square', vol: 0.2, decay: 2 }),
    over: makeBuffer(ctx, { freq: 320, freqTo: 90, dur: 0.6, type: 'saw', vol: 0.22, decay: 3 }),
    blip: makeBuffer(ctx, { freq: 660, dur: 0.05, type: 'square', vol: 0.12, decay: 4 }),
    high: makeBuffer(ctx, { freq: 700, freqTo: 1400, dur: 0.5, type: 'square', vol: 0.2, decay: 2 }),
    power: makeBuffer(ctx, { freq: 523, freqTo: 1318, dur: 0.5, type: 'square', vol: 0.2, decay: 1.4 }),
  };
}

// ===========================================================================
// BACKGROUND / BANKS / PARTICLES
// ===========================================================================
function buildBackground(scene) {
  const g = scene.add.graphics();
  g.fillGradientStyle(C.deep, C.deep, C.shallow, C.mid, 1);
  g.fillRect(0, 0, W, H);
  g.fillStyle(C.ink, 0.35); g.fillRect(0, 0, W, 60);
  g.fillStyle(C.ink, 0.25); g.fillRect(0, H - 70, W, 70);
  scene.layerBg.add(g);

  for (let i = 0; i < 4; i++) {
    const bx = 120 + i * 180;
    const beam = scene.add.graphics();
    beam.fillStyle(0x9fe8ff, 0.06);
    beam.fillTriangle(bx, 0, bx + 70, 0, bx - 40, H);
    scene.layerBg.add(beam);
    scene.tweens.add({ targets: beam, alpha: { from: 0.5, to: 1 }, duration: 2200 + i * 400, yoyo: true, repeat: -1 });
  }

  const cg = scene.make.graphics({ add: false });
  cg.lineStyle(3, 0x8fe8ff, 0.10);
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * 200, y = Math.random() * 200, r = 18 + Math.random() * 40;
    cg.beginPath(); cg.arc(x, y, r, 0, Math.PI * 1.3); cg.strokePath();
  }
  cg.generateTexture('caustic', 200, 200);
  cg.destroy();
  scene.caustic = scene.add.tileSprite(W / 2, H / 2, CH_R - CH_L, H, 'caustic').setAlpha(0.5);
  scene.layerBg.add(scene.caustic);
}

function buildBanks(scene) {
  const g = scene.make.graphics({ add: false });
  const bw = BANK, bh = 120;
  g.fillStyle(C.bank, 1); g.fillRect(0, 0, bw, bh);
  g.fillStyle(C.bankEdge, 1); g.fillRect(bw - 10, 0, 10, bh);
  for (let i = 0; i < 9; i++) {
    const rx = 8 + Math.random() * (bw - 24);
    const rh = 26 + Math.random() * 40;
    const ry = Math.random() * bh;
    g.fillStyle(Math.random() < 0.5 ? C.reed : C.reedDark, 1);
    g.fillRect(rx, ry, 4, rh);
    g.fillCircle(rx + 2, ry, 4);
  }
  g.generateTexture('bankTex', bw, bh);
  g.destroy();

  scene.bankL = scene.add.tileSprite(BANK / 2, H / 2, BANK, H, 'bankTex');
  scene.bankR = scene.add.tileSprite(W - BANK / 2, H / 2, BANK, H, 'bankTex').setFlipX(true);
  scene.layerDecor.add(scene.bankL);
  scene.layerDecor.add(scene.bankR);

  const e = scene.add.graphics();
  e.fillStyle(0x9fe8ff, 0.10); e.fillRect(CH_L, 0, 6, H); e.fillRect(CH_R - 6, 0, 6, H);
  scene.layerDecor.add(e);
}

function buildParticles(scene) {
  scene.sediment = scene.add.particles(0, 0, 'dot', {
    x: { min: CH_L, max: CH_R }, y: -8,
    lifespan: 6000, speedY: { min: 30, max: 70 }, speedX: { min: -8, max: 8 },
    scale: { min: 0.05, max: 0.18 }, alpha: { start: 0.25, end: 0 },
    tint: 0xbfeaff, frequency: 180, quantity: 1,
  });
  scene.layerBg.add(scene.sediment);

  scene.bubbles = scene.add.particles(0, 0, 'dot', {
    lifespan: 900, speedY: { min: 20, max: 60 }, speedX: { min: -20, max: 20 },
    scale: { start: 0.22, end: 0 }, alpha: { start: 0.5, end: 0 },
    tint: 0xcdf3ff, frequency: 60, quantity: 1, emitting: false,
  });
  scene.layerFx.add(scene.bubbles);

  scene.burst = scene.add.particles(0, 0, 'dot', {
    lifespan: 600, speed: { min: 60, max: 220 }, scale: { start: 0.5, end: 0 },
    alpha: { start: 1, end: 0 }, emitting: false,
  });
  scene.layerFx.add(scene.burst);
}

function popBurst(scene, x, y, tint, n) {
  scene.burst.setParticleTint(tint);
  scene.burst.emitParticleAt(x, y, n);
}

// floating "+N" / label that drifts up and fades — instant reward feedback
function popText(scene, x, y, str, color, size) {
  const tx = scene.add.text(x, y, str, {
    fontFamily: 'Arial, sans-serif', fontStyle: 'bold', fontSize: (size || 18) + 'px',
    color: color || '#fff4dc', stroke: '#07181f', strokeThickness: 4,
  }).setOrigin(0.5).setDepth(14);
  scene.tweens.add({ targets: tx, y: y - 38, alpha: 0, duration: 720, ease: 'Quad.easeOut',
    onComplete: () => tx.destroy() });
}

// ===========================================================================
// HUD / TITLE / OVERLAY
// ===========================================================================
function txt(scene, x, y, s, size, color) {
  return scene.add.text(x, y, s, {
    fontFamily: 'Arial, sans-serif', fontStyle: 'bold',
    fontSize: size + 'px', color: color || '#fff4dc',
    align: 'center', stroke: '#07181f', strokeThickness: Math.max(2, size / 6),
  }).setOrigin(0.5);
}

function buildHud(scene) {
  const h = {};
  h.dist = txt(scene, W - 16, 14, '0 m', 30, '#fff4dc').setOrigin(1, 0);
  h.best = txt(scene, W - 16, 48, 'BEST 0 m', 14, '#ffd64d').setOrigin(1, 0);
  h.combo = txt(scene, W / 2, 96, '', 30, '#ffd64d');
  h.gills = scene.add.graphics();
  h.dashbar = scene.add.graphics();
  scene.layerHud.add([h.dist, h.best, h.combo, h.gills, h.dashbar]);
  scene.hud = h;
}

function buildTitle(scene) {
  const c = scene.add.container(0, 0);
  const title = txt(scene, W / 2, 120, 'AJOLOTE RUN', 64, '#ff9ec7');
  title.setStroke('#7a1840', 8);
  const sub = txt(scene, W / 2, 176, 'Sobrevive al canal de Xochimilco', 20, '#cdf3ff');
  const hint = txt(scene, W / 2, 466, 'Pulsa  START  /  ENTER', 26, '#ffd64d');
  const ctrls = txt(scene, W / 2, 516, 'Joystick: esquiva     Boton 1: dash regenerador', 16, '#9fc6cf');
  scene.titleBest = txt(scene, W / 2, 550, '', 15, '#fff4dc');
  c.add([title, sub, hint, ctrls, scene.titleBest]);
  scene.tweens.add({ targets: hint, alpha: 0.25, duration: 600, yoyo: true, repeat: -1 });
  scene.tweens.add({ targets: title, y: 112, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
  scene.layerOverlay.add(c);
  scene.titleUI = c;
}

function refreshTitleBest(scene) {
  if (!scene.titleBest) return;
  scene.titleBest.setText(scene.scores.length
    ? 'RECORD: ' + scene.scores[0].name + '  ' + scene.scores[0].score + ' m'
    : 'Aun sin records — se el primero');
}

function buildOverlay(scene) {
  const c = scene.add.container(0, 0).setVisible(false);
  scene.dimmer = scene.add.rectangle(W / 2, H / 2, W, H, C.ink, 0.55);
  c.add(scene.dimmer);
  scene.overTitle = txt(scene, W / 2, 110, '', 50, '#ff5d7a');
  scene.overScore = txt(scene, W / 2, 180, '', 40, '#fff4dc');
  scene.overBest = txt(scene, W / 2, 224, '', 18, '#ffd64d');
  scene.overFact = txt(scene, W / 2, 286, '', 16, '#cdf3ff');
  scene.overFact.setWordWrapWidth(580);
  scene.lbTitle = txt(scene, W / 2, 352, '', 18, '#ffd64d');
  scene.lbBody = txt(scene, W / 2, 384, '', 18, '#fff4dc');
  scene.lbBody.setLineSpacing(6);
  scene.initG = scene.add.graphics();
  scene.initLabel = txt(scene, W / 2, 300, '', 16, '#cdf3ff');
  scene.overHint = txt(scene, W / 2, 560, '', 20, '#ffd64d');
  c.add([scene.overTitle, scene.overScore, scene.overBest, scene.overFact,
         scene.lbTitle, scene.lbBody, scene.initG, scene.initLabel, scene.overHint]);
  scene.tweens.add({ targets: scene.overHint, alpha: 0.3, duration: 600, yoyo: true, repeat: -1 });
  scene.layerOverlay.add(c);
  scene.overUI = c;
}

// ===========================================================================
// PHASE MANAGEMENT
// ===========================================================================
function setPhase(scene, phase) {
  scene.G.phase = phase;
  scene.titleUI.setVisible(phase === 'title');
  scene.overUI.setVisible(phase === 'dead' || phase === 'initials');
  const playing = phase === 'play';
  scene.hud.dist.setVisible(playing);
  scene.hud.best.setVisible(playing);
  scene.hud.gills.setVisible(playing);
  scene.hud.dashbar.setVisible(playing);
  scene.hud.combo.setVisible(playing);
  if (phase === 'title') refreshTitleBest(scene);
}

function startGame(scene) {
  const scores = scene.scores;
  clearEntities(scene);
  scene.G = freshState();
  scene.scores = scores;
  scene.G.bestMeters = scores.length ? scores[0].score : 0;
  scene.hud.combo.setText('');
  startMusic(scene);
  if (scene._setStar) scene._setStar(false);
  play(scene, scene.sfx.start, 1, 0.8);
  setPhase(scene, 'play');
}

function clearEntities(scene) {
  if (!scene.G) return;
  for (const list of [scene.G.hazards, scene.G.foods, scene.G.decor])
    for (const e of list) if (e.spr) e.spr.destroy();
  scene.G.hazards = []; scene.G.foods = []; scene.G.decor = [];
  if (scene.bubbles) scene.bubbles.emitting = false;
  scene._sl.clear();
}

// ===========================================================================
// UPDATE
// ===========================================================================
function update(time, delta) {
  const scene = this;
  if (!scene.G) { syncInput(); return; }
  const G = scene.G;
  let dt = delta / 1000;
  if (dt > 0.05) dt = 0.05;

  scene.caustic.tilePositionY -= (G.scrollSpeed * 0.4 + 6) * dt;

  if (G.phase === 'title') updateTitle(scene, dt);
  else if (G.phase === 'play') updatePlay(scene, dt);
  else if (G.phase === 'dead') updateDead(scene, dt);
  else if (G.phase === 'initials') updateInitials(scene, dt);

  if (G.shake > 0) {
    G.shake = Math.max(0, G.shake - dt * 60);
    scene.cameras.main.setScroll((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
  } else {
    scene.cameras.main.setScroll(0, 0);
  }

  syncInput();
}

function updateTitle(scene, dt) {
  scene.G.t += dt;
  scene.bankL.tilePositionY -= 30 * dt;
  scene.bankR.tilePositionY -= 30 * dt;
  drawAxolotl(scene, W / 2, 330, scene.G.t, {});
  if (justPressed('START1') || justPressed('START2')) startGame(scene);
}

function updatePlay(scene, dt) {
  const G = scene.G;
  const ax = G.ax;

  if (G.hitStop > 0) { G.hitStop -= dt; dt = Math.min(dt, 0.004); }
  G.t += dt;

  G.scrollSpeed = Math.min(485, 190 + Math.min(G.meters, 2200) * 0.135);
  const spd = G.scrollSpeed;

  G.meters += spd * dt * 0.1;
  scene.hud.dist.setText(Math.floor(G.meters) + ' m');
  scene.hud.best.setText('BEST ' + Math.floor(Math.max(G.bestMeters, G.meters)) + ' m');

  scene.bankL.tilePositionY -= spd * dt;
  scene.bankR.tilePositionY -= spd * dt;

  // movement (watery momentum)
  const maxV = 300 * (0.62 + 0.13 * ax.limbs);
  const dir = (held.P1_R ? 1 : 0) - (held.P1_L ? 1 : 0);
  const vdir = (held.P1_D ? 1 : 0) - (held.P1_U ? 1 : 0);
  ax.vx = Phaser.Math.Linear(ax.vx, dir * maxV, 0.12);
  ax.vy = Phaser.Math.Linear(ax.vy, vdir * maxV * 0.7, 0.12);

  // dash
  ax.dashCd = Math.max(0, ax.dashCd - dt);
  if (ax.dash > 0) ax.dash -= dt;
  if (justPressed('P1_1') && ax.dashCd <= 0 && ax.dash <= 0) {
    ax.dash = 0.42; ax.dashCd = DASH_CD; ax.inv = Math.max(ax.inv, 0.42); ax.squash = 1;
    G.speedlines = 0.42;
    play(scene, scene.sfx.dash, 1, 0.9);
    popBurst(scene, ax.x, ax.y + 14, 0xcdf3ff, 14);
  }
  if (ax.dash > 0) { ax.vy -= 520 * dt; ax.vx *= 1.04; }

  ax.x += ax.vx * dt;
  ax.y += ax.vy * dt;
  if (ax.limbs < 3) ax.x += Math.sin(G.t * 9) * (3 - ax.limbs) * 0.6;
  ax.x = Phaser.Math.Clamp(ax.x, X_MIN, X_MAX);
  ax.y = Phaser.Math.Clamp(ax.y, Y_MIN, Y_MAX);
  ax.tilt = Phaser.Math.Linear(ax.tilt, Phaser.Math.Clamp(ax.vx / 400, -0.5, 0.5), 0.15);

  if (ax.inv > 0) ax.inv -= dt;
  if (ax.star > 0) {
    ax.star -= dt;
    ax.inv = Math.max(ax.inv, 0.1);
    if (Math.random() < 0.5)
      popBurst(scene, ax.x + (Math.random() - 0.5) * 26, ax.y + (Math.random() - 0.5) * 26,
        [0xff5d7a, 0xffd64d, 0x8be36b, 0x6cd6ff][Math.floor(G.t * 10) % 4], 2);
    if (ax.star <= 0) { ax.star = 0; if (scene._setStar) scene._setStar(false); }
  }
  if (ax.squash > 0) ax.squash = Math.max(0, ax.squash - dt * 3);
  if (ax.eatPulse > 0) ax.eatPulse = Math.max(0, ax.eatPulse - dt * 3);
  if (G.speedlines > 0) G.speedlines -= dt;
  if (G.flash > 0) G.flash -= dt;
  ax.blink = (G.t % 3.4) < 0.12 ? 1 : 0;

  // regeneration
  if (G.foodBoost > 0) G.foodBoost = Math.max(0, G.foodBoost - dt);
  if (ax.limbs < 3 && ax.inv <= 0) {
    ax.regen += dt * (0.11 + G.foodBoost * 0.6);
    if (ax.regen >= 1) {
      ax.regen = 0; ax.limbs++;
      play(scene, scene.sfx.regen, 1, 0.9);
      popBurst(scene, ax.x, ax.y, 0x8be36b, 18);
    }
  } else if (ax.inv <= 0) {
    ax.regen = Math.max(0, ax.regen - dt * 0.05);
  }

  if (G.comboTimer > 0) { G.comboTimer -= dt; if (G.comboTimer <= 0) G.combo = 0; }
  scene.hud.combo.setText(G.combo >= 3 ? 'COMBO  x' + comboMult(G.combo) : '');

  scene.bubbles.emitting = true;
  scene.bubbles.setPosition(ax.x, ax.y + 16);

  // spawning
  G.spawnTimer -= dt;
  if (G.spawnTimer <= 0) {
    spawnWave(scene);
    const base = Phaser.Math.Clamp(1.0 - G.meters * 0.00022, 0.42, 1.0);
    const wave = 0.7 + 0.6 * (0.5 + 0.5 * Math.sin(G.meters * 0.012));
    G.spawnTimer = base * wave;
  }

  moveEntities(scene, G.decor, spd, dt);
  moveEntities(scene, G.foods, spd, dt);
  moveEntities(scene, G.hazards, spd, dt);
  collide(scene);

  drawAxolotl(scene, ax.x, ax.y, G.t, { inv: ax.inv > 0 && ax.star <= 0, limbs: ax.limbs, tilt: ax.tilt,
    squash: ax.squash, eat: ax.eatPulse, blink: ax.blink, star: ax.star > 0 });
  drawSpeedlines(scene);
  drawHud(scene);
}

// ===========================================================================
// ENTITIES
// ===========================================================================
function spawnEntity(scene, list, layer, key, x, y, conf) {
  const spr = scene.add.image(x, y, key);
  layer.add(spr);
  const e = Object.assign({ spr, x, y, vy: 0, vx: 0, r: 16, type: 'x', alive: true,
    solid: true, destructible: false, points: 0, wob: Math.random() * 6 }, conf);
  if (conf.tint != null) spr.setTint(conf.tint);
  if (conf.sx) spr.setScale(conf.sx, conf.sy || conf.sx);
  if (conf.alpha != null) spr.setAlpha(conf.alpha);
  list.push(e);
  return e;
}

function moveEntities(scene, list, spd, dt) {
  const G = scene.G;
  for (let i = list.length - 1; i >= 0; i--) {
    const e = list[i];
    e.y += (spd + e.vy) * dt;
    e.x += e.vx * dt;
    if (e.swim) e.x += Math.sin(G.t * 3 + e.wob) * 22 * dt;
    e.spr.setPosition(e.x, e.y);
    if (e.spin) e.spr.rotation += e.spin * dt;
    if (e.y > H + 70 || !e.alive) { e.spr.destroy(); list.splice(i, 1); }
  }
}

function spawnWave(scene) {
  const m = scene.G.meters;
  const opts = [['food', 3], ['trash', 2]];
  if (m > 70) opts.push(['carp', 2 + m * 0.0008]);
  if (m > 150) opts.push(['boat', 1.4]);
  if (m > 260) opts.push(['net', 1.4]);
  if (m > 560) opts.push(['heron', 1.0 + m * 0.0004]);
  let total = 0; for (const o of opts) total += o[1];
  let r = Math.random() * total, pick = 'food';
  for (const o of opts) { r -= o[1]; if (r <= 0) { pick = o[0]; break; } }

  if (pick === 'food') spawnFood(scene);
  else if (pick === 'trash') spawnTrash(scene);
  else if (pick === 'carp') spawnCarp(scene);
  else if (pick === 'net') spawnNet(scene);
  else if (pick === 'boat') spawnBoat(scene);
  else if (pick === 'heron') spawnHeron(scene);

  if (Math.random() < 0.35) spawnFood(scene);
  if (Math.random() < 0.18) spawnDecor(scene);
  if (Math.random() < 0.14) spawnAmbientBoat(scene);
  if (m > 160 && m - scene.G.lastStar > 360 && Math.random() < 0.3) { spawnStar(scene); scene.G.lastStar = m; }
}

function randX(margin) { return Phaser.Math.Between(X_MIN + (margin || 0), X_MAX - (margin || 0)); }

function spawnDecor(scene) {
  spawnEntity(scene, scene.G.decor, scene.layerDecor, 'lily', randX(20), -30,
    { solid: false, alpha: 0.7, sx: 0.7 + Math.random() * 0.7, spin: (Math.random() - 0.5) * 0.3 });
}

function spawnFood(scene) {
  if (Math.random() < 0.08) {
    spawnEntity(scene, scene.G.foods, scene.layerHazard, 'egg', randX(20), -20,
      { r: 16, solid: false, points: 45, food: 'egg', regen: 0.5 });
  } else {
    const worm = Math.random() < 0.5;
    spawnEntity(scene, scene.G.foods, scene.layerHazard, worm ? 'worm' : 'larva', randX(10), -20,
      { r: 13, solid: false, points: 12, food: 'worm', regen: 0.16, swim: true });
  }
}

// Star power-up — temporary invincibility (smash everything you touch).
function spawnStar(scene) {
  spawnEntity(scene, scene.G.foods, scene.layerHazard, 'star', randX(24), -26,
    { r: 20, solid: false, points: 30, food: 'star', regen: 0, spin: 2.2 });
}

function spawnTrash(scene) {
  const t = Phaser.Math.Between(0, 2);
  spawnEntity(scene, scene.G.hazards, scene.layerHazard, t === 0 ? 'bottle' : t === 1 ? 'tire' : 'bag', randX(10), -24,
    { type: 'trash', r: 15, destructible: true, points: 8, spin: (Math.random() - 0.5) * 1.2 });
}

function spawnCarp(scene) {
  const koi = Math.random() < 0.4;
  const n = Phaser.Math.Between(1, 2);
  for (let i = 0; i < n; i++) {
    spawnEntity(scene, scene.G.hazards, scene.layerHazard, 'carp', randX(20), -30 - i * 40,
      { type: 'carp', r: 17, destructible: true, points: 14, vy: 60 + Math.random() * 70,
        swim: true, tint: koi ? C.koi : C.carp, sx: 1.05 });
  }
}

function spawnNet(scene) {
  const gapW = Phaser.Math.Between(120, 170);
  const gapX = randX(gapW / 2 + 10);
  const lw = gapX - gapW / 2 - CH_L;
  if (lw > 16) {
    const e = spawnEntity(scene, scene.G.hazards, scene.layerHazard, 'net', CH_L + lw / 2, -30,
      { type: 'net', destructible: false, box: true, hw: lw / 2, hh: 16 });
    e.spr.setDisplaySize(lw, 32);
  }
  const rw = CH_R - (gapX + gapW / 2);
  if (rw > 16) {
    const e = spawnEntity(scene, scene.G.hazards, scene.layerHazard, 'net', CH_R - rw / 2, -30,
      { type: 'net', destructible: false, box: true, hw: rw / 2, hh: 16 });
    e.spr.setDisplaySize(rw, 32);
  }
}

const BOAT_COLS = [0xff4d4d, 0xffd23f, 0x3fa9f5, 0x8be36b, 0xff6ec7];

// A colourful Xochimilco trajinera (flower arch + striped hull + name banner).
function buildBoat(scene, bw) {
  const cont = scene.add.container(0, 0);
  const hull = scene.add.graphics();
  // flower arch over the boat
  hull.lineStyle(5, 0x2f8f4a, 1);
  hull.beginPath(); hull.arc(0, -4, bw / 2 - 12, Math.PI, 0, false); hull.strokePath();
  for (let i = 0; i <= 6; i++) {
    const a = Math.PI + (i / 6) * Math.PI;
    hull.fillStyle(BOAT_COLS[i % 5], 1);
    hull.fillCircle(Math.cos(a) * (bw / 2 - 12), -4 + Math.sin(a) * (bw / 2 - 12), 5);
  }
  // hull
  hull.fillStyle(C.boatHull, 1); hull.fillRoundedRect(-bw / 2, -22, bw, 44, 12);
  hull.fillStyle(0x6b3618, 1); hull.fillRoundedRect(-bw / 2, 8, bw, 14, 8);
  for (let i = 0; i < 5; i++) {
    hull.fillStyle(BOAT_COLS[i], 1);
    hull.fillRect(-bw / 2 + 8 + i * (bw - 16) / 5, -20, (bw - 16) / 5 - 3, 12);
  }
  hull.fillStyle(C.cream, 1); hull.fillRoundedRect(-bw / 2 + 14, -15, bw - 28, 9, 4);
  cont.add(hull);
  cont.add(scene.add.text(0, -14, 'XOCHIMILCO',
    { fontFamily: 'Arial', fontStyle: 'bold', fontSize: '11px', color: '#7a1840' }).setOrigin(0.5));
  return cont;
}

function spawnBoat(scene) {
  const bw = Phaser.Math.Between(150, 210);
  const x = randX(bw / 2 + 4);
  const cont = buildBoat(scene, bw).setPosition(x, -64);
  scene.layerHazard.add(cont);
  scene.G.hazards.push({ spr: cont, x, y: -64, vy: -20, vx: 0, r: 0, type: 'boat', alive: true,
    solid: true, destructible: false, points: 0, box: true, hw: bw / 2, hh: 22 });
}

// Dim, smaller trajineras moored along the banks — pure background flavour.
function spawnAmbientBoat(scene) {
  const bw = Phaser.Math.Between(90, 130);
  const side = Math.random() < 0.5 ? -1 : 1;
  const x = side < 0 ? CH_L + 28 + Math.random() * 26 : CH_R - 28 - Math.random() * 26;
  const cont = buildBoat(scene, bw).setPosition(x, -70).setScale(0.7).setAlpha(0.5);
  scene.layerDecor.add(cont);
  scene.G.decor.push({ spr: cont, x, y: -70, vy: -45, vx: 0, r: 0, alive: true, solid: false });
}

function spawnHeron(scene) {
  const G = scene.G;
  const tx = Phaser.Math.Clamp(G.ax.x + Phaser.Math.Between(-60, 60), X_MIN, X_MAX);
  const warn = txt(scene, tx, 40, 'AGUAS!', 22, '#ff5d7a');
  const shadow = scene.add.ellipse(tx, 60, 30, 16, C.ink, 0.4);
  scene.layerHazard.add(shadow);
  scene.layerHazard.add(warn);
  play(scene, scene.sfx.warn, 1, 0.7);
  scene.tweens.add({ targets: [warn, shadow], alpha: 0.2, duration: 220, yoyo: true, repeat: 2 });
  scene.time.delayedCall(720, () => {
    warn.destroy(); shadow.destroy();
    if (G.phase !== 'play') return;
    spawnEntity(scene, G.hazards, scene.layerHazard, 'heron', tx, -40,
      { type: 'heron', r: 18, destructible: false, vy: 230 + G.scrollSpeed * 0.3 });
  });
}

// ===========================================================================
// COLLISION
// ===========================================================================
function overlapCircle(ax, ay, ar, e) {
  if (e.box) {
    const cx = Phaser.Math.Clamp(ax, e.x - e.hw, e.x + e.hw);
    const cy = Phaser.Math.Clamp(ay, e.y - e.hh, e.y + e.hh);
    const dx = ax - cx, dy = ay - cy;
    return dx * dx + dy * dy < ar * ar;
  }
  const dx = ax - e.x, dy = ay - e.y, rr = ar + e.r;
  return dx * dx + dy * dy < rr * rr;
}

function collide(scene) {
  const G = scene.G;
  const ax = G.ax;

  for (const e of G.foods) {
    if (e.alive && overlapCircle(ax.x, ax.y, AXO_R, e)) { e.alive = false; eatFood(scene, e); }
  }

  for (const e of G.hazards) {
    if (!e.alive || !overlapCircle(ax.x, ax.y, AXO_R - 2, e)) continue;
    if ((ax.dash > 0 || ax.star > 0) && e.destructible) smash(scene, e);
    else if (ax.inv > 0 || ax.dash > 0) { /* invulnerable — pass through */ }
    else takeHit(scene, e);
  }
}

function eatFood(scene, e) {
  const G = scene.G, ax = G.ax;
  if (e.food === 'star') {
    ax.star = 7;
    G.flash = 0.25; G.shake = Math.max(G.shake, 7);
    if (scene._setStar) scene._setStar(true);
    play(scene, scene.sfx.power, 1, 0.9);
    popBurst(scene, e.x, e.y, 0xffe066, 28);
    popText(scene, e.x, e.y - 14, '¡ESTRELLA!', '#ffd64d', 26);
    return;
  }
  G.combo++; G.comboTimer = 2.4;
  const mult = comboMult(G.combo);
  const gain = Math.round(e.points * mult);
  G.meters += gain;
  G.foodBoost = Math.min(1.2, G.foodBoost + e.regen);
  ax.eatPulse = 1;
  play(scene, scene.sfx.chomp, e.food === 'egg' ? 0.8 : 1, 0.8);
  popBurst(scene, e.x, e.y, e.food === 'egg' ? 0xffd64d : 0xff7a45, e.food === 'egg' ? 16 : 8);
  popText(scene, e.x, e.y - 12, '+' + gain, mult >= 3 ? '#ffd64d' : '#fff4dc', mult >= 3 ? 22 : 18);
  comboPunch(scene);
}

function smash(scene, e) {
  const G = scene.G;
  e.alive = false;
  G.combo++; G.comboTimer = 2.4;
  const mult = comboMult(G.combo);
  const gain = Math.round(e.points * mult);
  G.meters += gain;
  G.shake = Math.max(G.shake, 6);
  play(scene, scene.sfx.crunch, 1, 0.8);
  popBurst(scene, e.x, e.y, 0xcfd8b0, 16);
  popText(scene, e.x, e.y - 12, '+' + gain, mult >= 3 ? '#ffd64d' : '#cfd8b0', mult >= 3 ? 22 : 18);
  comboPunch(scene);
}

function takeHit(scene, e) {
  const G = scene.G, ax = G.ax;
  ax.limbs--; ax.inv = 1.4; ax.regen = 0;
  G.combo = 0; G.shake = 14; G.hitStop = 0.08; G.flash = 0.18;
  play(scene, scene.sfx.hit, 1, 1);
  popBurst(scene, ax.x, ax.y, 0xff5d7a, 20);
  ax.vy = 160; ax.vx = (ax.x < W / 2 ? 1 : -1) * 120;
  if (e.destructible) e.alive = false;
  if (ax.limbs <= 0) die(scene);
}

function comboMult(combo) { return Math.min(8, 1 + Math.floor(combo / 3)); }

function comboPunch(scene) {
  scene.hud.combo.setScale(1.4);
  scene.tweens.killTweensOf(scene.hud.combo);
  scene.tweens.add({ targets: scene.hud.combo, scale: 1, duration: 220 });
}

// ===========================================================================
// AXOLOTL RENDERING (single Graphics, redrawn each frame)
// ===========================================================================
function drawAxolotl(scene, x, y, t, o) {
  const g = scene.axoG;
  g.clear();
  o = o || {};
  if (o.inv && Math.floor(t * 20) % 2 === 0) return; // invuln flicker

  const limbs = o.limbs == null ? 3 : o.limbs;
  const breathe = 1 + Math.sin(t * 2.4) * 0.03 + (o.squash || 0) * 0.18;
  const widthScale = 1 - (o.squash || 0) * 0.12 + (o.eat || 0) * 0.1;
  const bodyCol = o.star ? [0xff5d7a, 0xffd64d, 0x8be36b, 0x6cd6ff, 0xc78bff][Math.floor(t * 12) % 5]
    : (limbs <= 1 ? C.axoDark : C.axo);

  g.save();
  g.translateCanvas(x, y);
  g.rotateCanvas(o.tilt || 0);
  g.scaleCanvas(widthScale, breathe);

  // tail (behind, sways)
  g.save();
  g.translateCanvas(0, 18);
  g.rotateCanvas(Math.sin(t * 6) * 0.32);
  g.fillStyle(bodyCol, 1);
  g.fillTriangle(-6, 0, 6, 0, 0, 30);
  g.fillStyle(C.axoBelly, 0.5);
  g.fillTriangle(-3, 4, 3, 4, 0, 24);
  g.restore();

  // legs (always four; just wiggle for life)
  const legWig = Math.sin(t * 8) * 3;
  g.fillStyle(bodyCol, 1);
  for (const l of [[-16, -2, 0], [16, -2, 0], [-15, 16, 1], [15, 16, 1]]) {
    g.fillEllipse(l[0], l[1] + (l[2] ? legWig : -legWig) * 0.3, 12, 7);
  }

  // gills — up to 3 fronds per side, lost SYMMETRICALLY (both sides) when wounded
  const gillCount = Phaser.Math.Clamp(limbs, 0, 3);
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < gillCount; i++) {
      const a = side * (0.5 + i * 0.45) + Math.sin(t * 7 + i + (side > 0 ? 1.6 : 0)) * 0.18;
      g.fillStyle(C.gill, 1);
      for (let k = 1; k <= 3; k++) {
        g.fillCircle(side * 11 + Math.sin(a) * k * 7, -16 - Math.cos(a) * k * 7, 4.2 - k * 0.5);
      }
    }
  }

  // body + head
  g.fillStyle(bodyCol, 1);
  g.fillEllipse(0, 0, 34, 44);
  g.fillCircle(0, -18, 16);
  g.fillStyle(C.axoBelly, 0.55);
  g.fillEllipse(0, 2, 20, 28);

  // cheeks
  g.fillStyle(C.hot, 0.45);
  g.fillCircle(-9, -16, 4); g.fillCircle(9, -16, 4);

  // eyes
  if (!o.blink) {
    g.fillStyle(C.eye, 1);
    g.fillCircle(-6, -22, 3.1); g.fillCircle(6, -22, 3.1);
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(-5, -23, 1.1); g.fillCircle(7, -23, 1.1);
  } else {
    g.lineStyle(2, C.eye, 1);
    g.beginPath(); g.moveTo(-9, -22); g.lineTo(-3, -22); g.strokePath();
    g.beginPath(); g.moveTo(3, -22); g.lineTo(9, -22); g.strokePath();
  }
  // smile
  g.lineStyle(2, C.axoDark, 0.9);
  g.beginPath(); g.arc(0, -14, 5, 0.15 * Math.PI, 0.85 * Math.PI); g.strokePath();

  g.restore();
}

function drawSpeedlines(scene) {
  const sl = scene._sl;
  sl.clear();
  const G = scene.G;
  if (G.speedlines > 0) {
    const a = G.speedlines / 0.42;
    sl.fillStyle(0xffffff, 0.22 * a);
    for (let i = 0; i < 7; i++) {
      const lx = CH_L + 20 + ((i * 97 + (G.t * 600)) % (CH_R - CH_L - 40));
      sl.fillRect(lx, G.ax.y + 20 + i * 6, 3, 30);
    }
  }
}

function drawHud(scene) {
  const G = scene.G, ax = G.ax;

  // health bar: little gill icon + 3 segments (regrowing segment fills green)
  const gg = scene.hud.gills;
  gg.clear();
  gg.fillStyle(C.gill, 1);
  for (let k = 1; k <= 3; k++) gg.fillCircle(24, 30 - k * 4, 5 - k);
  gg.fillStyle(C.axo, 1); gg.fillCircle(24, 34, 6);
  const bx = 42, by = 18, segW = 46, segH = 18, gap = 5;
  for (let i = 0; i < 3; i++) {
    const x = bx + i * (segW + gap);
    gg.fillStyle(C.ink, 0.55); gg.fillRoundedRect(x, by, segW, segH, 5);
    if (i < ax.limbs) {
      gg.fillStyle(C.gill, 1); gg.fillRoundedRect(x + 2, by + 2, segW - 4, segH - 4, 4);
    } else if (i === ax.limbs && ax.limbs < 3) {
      gg.fillStyle(C.good, 0.95);
      gg.fillRoundedRect(x + 2, by + 2, (segW - 4) * Phaser.Math.Clamp(ax.regen, 0, 1), segH - 4, 4);
    }
    gg.lineStyle(2, 0x0b2a36, 1); gg.strokeRoundedRect(x, by, segW, segH, 5);
  }
  // star (invincibility) timer
  if (ax.star > 0) {
    const sw = 130, sxx = W / 2 - sw / 2, syy = 70;
    gg.fillStyle(C.ink, 0.5); gg.fillRoundedRect(sxx, syy, sw, 10, 5);
    gg.fillStyle(0xffe066, 1); gg.fillRoundedRect(sxx, syy, sw * Phaser.Math.Clamp(ax.star / 7, 0, 1), 10, 5);
  }

  const db = scene.hud.dashbar;
  db.clear();
  const ready = ax.dashCd <= 0;
  const frac = ready ? 1 : 1 - ax.dashCd / DASH_CD;
  db.fillStyle(C.ink, 0.5); db.fillRoundedRect(ax.x - 22, ax.y + 30, 44, 6, 3);
  db.fillStyle(ready ? C.accent : 0x6f8f2a, 1);
  db.fillRoundedRect(ax.x - 22, ax.y + 30, 44 * frac, 6, 3);

  if (G.flash > 0) { db.fillStyle(C.hot, G.flash); db.fillRect(0, 0, W, H); }
}

// ===========================================================================
// DEATH / GAME OVER / INITIALS
// ===========================================================================
function die(scene) {
  const G = scene.G;
  G.ax.limbs = 0; G.overTimer = 0.8; G.flash = 0.3; G.shake = 18;
  scene.bubbles.emitting = false;
  play(scene, scene.sfx.over, 1, 1);
  popBurst(scene, G.ax.x, G.ax.y, 0xff5d7a, 30);

  G.finalM = Math.floor(G.meters);
  const lowest = scene.scores.length ? scene.scores[scene.scores.length - 1].score : 0;
  G.qualifies = G.finalM > 0 && (scene.scores.length < MAX_SCORES || G.finalM > lowest);
  setPhase(scene, 'dead');
  showGameOver(scene);
}

function showGameOver(scene) {
  const G = scene.G;
  const best = scene.scores.length ? scene.scores[0].score : 0;
  scene.overTitle.setText('TE ATRAPARON');
  scene.overScore.setText(G.finalM + ' m');
  scene.overBest.setText('RECORD: ' + Math.max(best, G.finalM) + ' m');
  scene.overFact.setText('Sabias que... ' + FACTS[Math.floor(Math.random() * FACTS.length)]);

  if (G.qualifies) {
    if (best < G.finalM) play(scene, scene.sfx.high, 1, 0.9);
    scene.overTitle.setY(90); scene.overScore.setY(150); scene.overBest.setY(192);
    scene.overFact.setText('');
    scene.lbTitle.setText('NUEVO RECORD! Pon tus iniciales').setY(244);
    scene.lbBody.setText('');
    scene.initLabel.setText('Mueve el joystick para elegir tus iniciales  ·  Boton 1 o START: GUARDAR').setVisible(true);
    scene.initG.setVisible(true);
    scene.overHint.setText('');
    G.slot = 0; G.initials = [0, 0, 0]; G.saved = false; G.repeat = 0.35;
    setPhase(scene, 'initials');
    drawInitials(scene);
  } else {
    scene.overTitle.setY(110); scene.overScore.setY(180); scene.overBest.setY(224);
    scene.overFact.setY(286);
    scene.lbTitle.setText('TABLA DE RECORDS').setY(352);
    scene.lbBody.setText(formatScores(scene.scores)).setY(384);
    scene.initLabel.setVisible(false);
    scene.initG.setVisible(false);
    if (scene.initChars) scene.initChars.forEach((c) => c.setVisible(false));
    scene.overHint.setText('Pulsa  START  para volver');
  }
}

function updateDead(scene, dt) {
  const G = scene.G;
  G.overTimer -= dt;
  if (G.overTimer > 0) return;
  if (justPressed('START1') || justPressed('START2') || justPressed('P1_1')) {
    clearEntities(scene);
    setPhase(scene, 'title');
  }
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ.-';

function updateInitials(scene, dt) {
  const G = scene.G;
  G.repeat = Math.max(0, G.repeat - dt);
  let changed = false;
  const cycle = (d) => { G.initials[G.slot] = (G.initials[G.slot] + d + ALPHABET.length) % ALPHABET.length; changed = true; };

  // one step per fresh press; hold to auto-repeat. DOWN = A→B→C, UP = back.
  if (justPressed('P1_D')) { cycle(1); G.repeat = 0.32; }
  else if (justPressed('P1_U')) { cycle(-1); G.repeat = 0.32; }
  else if ((held.P1_U || held.P1_D) && G.repeat <= 0) { cycle(held.P1_D ? 1 : -1); G.repeat = 0.12; }
  if (justPressed('P1_R')) { G.slot = (G.slot + 1) % 3; changed = true; }
  if (justPressed('P1_L')) { G.slot = (G.slot + 2) % 3; changed = true; }

  if (changed) { play(scene, scene.sfx.blip, 1, 0.7); drawInitials(scene); }

  // joystick picks the letters; one button (or START) saves the whole name.
  if (justPressed('P1_1') || justPressed('START1') || justPressed('START2')) submitScore(scene);
}

function drawInitials(scene) {
  const G = scene.G;
  const g = scene.initG;
  g.clear();
  const cx = W / 2 - 60;
  for (let i = 0; i < 3; i++) {
    const x = cx + i * 60;
    g.fillStyle(i === G.slot ? C.accent : C.ink, i === G.slot ? 0.3 : 0.45);
    g.fillRoundedRect(x - 24, 330, 48, 56, 8);
    g.lineStyle(3, i === G.slot ? C.accent : 0x3a4a52, 1);
    g.strokeRoundedRect(x - 24, 330, 48, 56, 8);
  }
  // ▲▼ hint arrows on the active slot
  const sx = cx + G.slot * 60;
  g.fillStyle(C.accent, 1);
  g.fillTriangle(sx - 7, 322, sx + 7, 322, sx, 314);
  g.fillTriangle(sx - 7, 394, sx + 7, 394, sx, 402);
  if (!scene.initChars) {
    scene.initChars = [];
    for (let i = 0; i < 3; i++) {
      const tc = txt(scene, cx + i * 60, 358, 'A', 34, '#fff4dc');
      scene.overUI.add(tc);
      scene.initChars.push(tc);
    }
  }
  for (let i = 0; i < 3; i++) {
    scene.initChars[i].setText(ALPHABET[G.initials[i]]).setVisible(true);
  }
}

function submitScore(scene) {
  const G = scene.G;
  if (G.saved) return;
  G.saved = true;
  const name = G.initials.map((i) => ALPHABET[i]).join('');
  scene.scores.push({ name, score: G.finalM });
  scene.scores = sanitizeScores(scene.scores);
  saveData(SCORE_KEY, scene.scores);
  play(scene, scene.sfx.start, 1.2, 0.8);
  if (scene.initChars) scene.initChars.forEach((c) => c.setVisible(false));
  scene.initG.setVisible(false);
  scene.initLabel.setVisible(false);
  scene.overTitle.setY(110); scene.overScore.setY(180); scene.overBest.setY(224);
  scene.lbTitle.setText('TABLA DE RECORDS').setY(300);
  scene.lbBody.setText(formatScores(scene.scores)).setY(336);
  scene.overHint.setText('Pulsa  START  para volver');
  setPhase(scene, 'dead');
}

function formatScores(scores) {
  if (!scores.length) return '—';
  return scores.map((s, i) => (i + 1) + '.  ' + s.name + '   ' + s.score + ' m').join('\n');
}

function sanitizeScores(arr) {
  return arr
    .filter((s) => s && typeof s.score === 'number' && typeof s.name === 'string')
    .map((s) => ({ name: s.name.slice(0, 3).toUpperCase(), score: Math.max(0, Math.floor(s.score)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SCORES);
}
