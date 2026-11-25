// Canvas game engine for "Downtown Street: Trading Floor Fever".
// Pure JS (no React) so the game loop never waits on React renders.

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');

const GOLD = '#F5B921';
const CONFETTI = ['#F5B921', '#FFE08A', '#FFFFFF', '#E8A400', '#FFF6D6', '#C9C9C9'];
const SUITS = ['#1c2333', '#2a2a2e', '#3b3f4a', '#5a4632', '#20283a', '#6b5b45', '#7a2f2a', '#2f3d2f'];
const SKINS = ['#f1c9a5', '#e0ac85', '#c68b62', '#8d5a3b', '#f6d7bd'];

export const ROUND_TIME = 60;

const TYPES = {
  cash: { value: 8000, hype: 5, r: 17, good: true },
  bag: { value: 22000, hype: 7, r: 18, good: true },
  gold: { value: 55000, hype: 10, r: 17, good: true },
  phone: { value: 38000, hype: 9, r: 17, good: true },
  bull: { value: 15000, hype: 34, r: 18, good: true },
  crash: { r: 17, good: false },
  audit: { r: 18, good: false },
};

const MARKETS = {
  bull: { label: 'BULL ×2', color: '#4CD07D', mult: 2, hazard: 0.14, speed: 1 },
  flat: { label: 'FLAT ×1', color: GOLD, mult: 1, hazard: 0.22, speed: 1 },
  bear: { label: 'BEAR 警戒', color: '#FF4D4D', mult: 1, hazard: 0.36, speed: 1.18 },
};

export class Engine {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.demo = !!opts.demo;
    this.onHud = opts.onHud || (() => {});
    this.onEnd = opts.onEnd || (() => {});
    this.onEvent = opts.onEvent || (() => {});
    this.sfx = opts.sfx || null;
    this.topInsetPx = opts.topInsetPx ?? 0;
    this.keys = {};
    this.raf = 0;
    this.last = 0;
    this.running = false;
    this.resize();
    this.reset();
    this._bind();
  }

  // ---------- setup ----------
  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const cw = Math.max(1, rect.width);
    const ch = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    let scale = cw / 360;
    let H = ch / scale;
    let W = 360;
    if (H < 600) {
      scale = ch / 600;
      H = 600;
      W = cw / scale;
    }
    this.scale = scale;
    this.W = W;
    this.H = H;
    this.canvas.width = Math.round(cw * this.dpr);
    this.canvas.height = Math.round(ch * this.dpr);
    this.canvas.style.width = cw + 'px';
    this.canvas.style.height = ch + 'px';
    this.top = this.topInsetPx / scale;
    this.groundY = H - 40;
    this.hy = this.top + Math.max(70, (H - this.top) * 0.27); // ceiling/wall line
    this._buildScene();
    if (this.player) {
      this.player.x = clamp(this.player.x, 30, W - 30);
      this.player.target = clamp(this.player.target, 30, W - 30);
    }
  }

  _buildScene() {
    const { W, H } = this;
    this.crowd = [];
    for (let row = 0; row < 2; row++) {
      const n = Math.ceil(W / (row ? 30 : 38)) + 1;
      for (let i = 0; i < n; i++) {
        this.crowd.push({
          row,
          x: i * (row ? 30 : 38) + rand(-8, 8) + (row ? 0 : 15),
          s: row ? rand(0.95, 1.1) : rand(0.72, 0.85),
          suit: pick(SUITS),
          skin: pick(SKINS),
          ph: rand(0, Math.PI * 2),
          sp: rand(4.5, 7.5),
          arms: Math.random() < 0.45,
          hold: pick([null, null, 'paper', 'phone', 'cash']),
          hat: Math.random() < 0.12,
        });
      }
    }
    this.floorBits = [];
    for (let i = 0; i < 70; i++) {
      this.floorBits.push({
        x: rand(0, W),
        y: rand(this.hy + 130, H - 30),
        c: pick(CONFETTI),
        r: rand(0, Math.PI),
        w: rand(3, 6),
      });
    }
  }

  reset() {
    this.t = 0;
    this.timeLeft = ROUND_TIME;
    this.score = 0;
    this.lives = 3;
    this.combo = 0;
    this.maxCombo = 0;
    this.hype = this.demo ? 60 : 0;
    this.fever = 0;
    this.feverCount = 0;
    this.items = [];
    this.parts = [];
    this.texts = [];
    this.spawnT = 0.8;
    this.hudT = 0;
    this.shake = 0;
    this.flash = 0;
    this.over = false;
    this.paused = false;
    this.player = { x: this.W / 2, prevX: this.W / 2, vx: 0, target: this.W / 2, catchAnim: 0, hurt: 0, walk: 0 };
    this.market = { state: 'flat', t: 7, price: 100, hist: Array(48).fill(100), tick: 0, banner: 0 };
    this.feverBanner = 0;
    this.stats = { gold: 0, phones: 0, bulls: 0, bearEarn: 0, hits: 0, catches: 0 };
    this.hypeReadyNotified = false;
  }

  _bind() {
    this._kd = (e) => {
      if (this.demo) return;
      const k = e.key;
      if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D', ' '].includes(k)) e.preventDefault();
      this.keys[k.toLowerCase()] = true;
      if (k === ' ' || k === 'Enter') this.triggerFever();
      if (k === 'p' || k === 'P' || k === 'Escape') this.onEvent('togglePause');
    };
    this._ku = (e) => {
      this.keys[e.key.toLowerCase()] = false;
    };
    // pointer: mouse = follow cursor, touch = relative drag (finger never hides the player)
    this._drag = null;
    this._pd = (e) => {
      if (this.demo) return;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* capture is optional */
      }
      const x = this._toLocal(e);
      if (e.pointerType === 'mouse') this.player.target = clamp(x, 26, this.W - 26);
      else this._drag = { id: e.pointerId, sx: x, px: this.player.target };
    };
    this._pm = (e) => {
      if (this.demo) return;
      const x = this._toLocal(e);
      if (e.pointerType === 'mouse') {
        this.player.target = clamp(x, 26, this.W - 26);
      } else if (this._drag && this._drag.id === e.pointerId) {
        this.player.target = clamp(this._drag.px + (x - this._drag.sx) * 1.35, 26, this.W - 26);
      }
    };
    this._pu = (e) => {
      if (this._drag && this._drag.id === e.pointerId) this._drag = null;
    };
    window.addEventListener('keydown', this._kd);
    window.addEventListener('keyup', this._ku);
    this.canvas.addEventListener('pointerdown', this._pd);
    this.canvas.addEventListener('pointermove', this._pm);
    window.addEventListener('pointerup', this._pu);
    window.addEventListener('pointercancel', this._pu);
  }

  _toLocal(e) {
    const r = this.canvas.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * this.W;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this._kd);
    window.removeEventListener('keyup', this._ku);
    this.canvas.removeEventListener('pointerdown', this._pd);
    this.canvas.removeEventListener('pointermove', this._pm);
    window.removeEventListener('pointerup', this._pu);
    window.removeEventListener('pointercancel', this._pu);
  }

  setPaused(p) {
    this.paused = p;
    this.keys = {};
  }

  // ---------- gameplay ----------
  triggerFever() {
    if (this.over || this.paused || this.fever > 0 || this.hype < 100) return false;
    this.fever = 7;
    this.hype = 0;
    this.feverCount++;
    this.feverBanner = 2;
    this.shake = 0.5;
    this.flash = 0.6;
    this.hypeReadyNotified = false;
    for (const it of this.items) {
      if (!TYPES[it.type].good) {
        this._burst(it.x, it.y, 14, 'conf');
        it.type = pick(['cash', 'bag', 'gold']);
      }
    }
    for (let i = 0; i < 160; i++) {
      this._part(rand(0, this.W), rand(-60, this.H * 0.4), rand(-120, 120), rand(-260, 60), 'conf');
    }
    this.sfx?.fanfare();
    this.onEvent('fever', true);
    return true;
  }

  _spawn() {
    const m = MARKETS[this.market.state];
    const d = this.demo ? 0.35 : clamp(this.t / ROUND_TIME, 0, 1);
    let type;
    const hazardChance = this.fever > 0 ? 0 : m.hazard + d * 0.08;
    if (Math.random() < hazardChance) {
      type = Math.random() < 0.6 ? 'crash' : 'audit';
    } else {
      const r = Math.random();
      if (r < 0.045 && this.fever <= 0) type = 'bull';
      else if (r < 0.15) type = 'gold';
      else if (r < 0.27) type = 'phone';
      else if (r < 0.5) type = 'bag';
      else type = 'cash';
    }
    const baseSpeed = (150 + d * 130) * m.speed * (this.fever > 0 ? 1.1 : 1);
    this.items.push({
      type,
      x: rand(28, this.W - 28),
      y: this.top - 20,
      vy: baseSpeed * rand(0.85, 1.2) * (type === 'crash' ? 1.15 : 1),
      rot: rand(-0.4, 0.4),
      vr: rand(-2.5, 2.5),
      wa: type === 'cash' ? rand(20, 50) : rand(0, 18),
      wf: rand(2, 4),
      ph: rand(0, 6.28),
      age: 0,
    });
  }

  _part(x, y, vx, vy, kind, color) {
    if (this.parts.length > 520) return;
    this.parts.push({
      x, y, vx, vy, kind,
      c: color || (kind === 'bill' ? '#7FB07A' : pick(CONFETTI)),
      life: kind === 'spark' ? rand(0.3, 0.6) : rand(1.4, 2.6),
      r: rand(0, 6.28),
      vr: rand(-10, 10),
      w: kind === 'bill' ? rand(10, 14) : rand(3, 7),
      ph: rand(0, 6.28),
    });
  }

  _burst(x, y, n, kind, color) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(60, 260);
      this._part(x, y, Math.cos(a) * s, Math.sin(a) * s - 120, kind, color);
    }
  }

  _text(x, y, text, color = GOLD, size = 18) {
    this.texts.push({ x: clamp(x, 56, this.W - 56), y, text, color, size, life: 1.1, max: 1.1 });
  }

  _catch(it) {
    const def = TYPES[it.type];
    const p = this.player;
    if (def.good) {
      this.combo++;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
      this.stats.catches++;
      const m = MARKETS[this.market.state];
      const comboMult = 1 + Math.min(2, Math.floor(this.combo / 10) * 0.5);
      const mult = m.mult * (this.fever > 0 ? 3 : 1) * comboMult;
      const value = Math.round((def.value * mult * rand(0.9, 1.1)) / 100) * 100;
      this.score += value;
      if (this.market.state === 'bear') this.stats.bearEarn += value;
      if (this.fever <= 0) this.hype = Math.min(100, this.hype + def.hype);
      p.catchAnim = 0.22;
      if (it.type === 'gold') {
        this.stats.gold++;
        this.sfx?.kaching();
        this._burst(it.x, it.y, 10, 'spark', '#FFE08A');
      } else if (it.type === 'phone') {
        this.stats.phones++;
        this.sfx?.phone();
        this._text(it.x, it.y - 26, 'SOLD!', '#fff', 16);
      } else if (it.type === 'bull') {
        this.stats.bulls++;
        this.sfx?.bull();
        this._text(it.x, it.y - 26, 'HYPE UP!', '#4CD07D', 17);
        this._burst(it.x, it.y, 22, 'conf');
      } else {
        this.sfx?.catch(this.combo);
      }
      this._burst(it.x, it.y, it.type === 'cash' ? 6 : 8, 'bill');
      this._burst(it.x, it.y, 5, 'conf');
      this._text(it.x, it.y - 6, '+' + fmt(value), GOLD, 15 + Math.min(8, value / 40000));
      if (this.combo > 0 && this.combo % 10 === 0) {
        this._text(p.x, this.groundY - 120, `${this.combo} COMBO!`, '#fff', 22);
        this._burst(p.x, this.groundY - 100, 30, 'conf');
      }
      if (this.hype >= 100 && !this.hypeReadyNotified) {
        this.hypeReadyNotified = true;
        this.onEvent('hypeReady');
        if (this.demo) setTimeout(() => this.triggerFever(), 600);
      }
    } else {
      if (this.demo) return;
      this.lives--;
      this.stats.hits++;
      this.combo = 0;
      this.shake = 0.45;
      this.flash = -0.5;
      p.hurt = 0.9;
      this.sfx?.hurt();
      this._burst(it.x, it.y, 16, 'spark', '#FF4D4D');
      this._text(p.x, this.groundY - 110, it.type === 'audit' ? '監査が入った！' : '暴落！', '#FF6B6B', 20);
      if (this.lives <= 0) this._finish();
    }
  }

  _finish() {
    if (this.over) return;
    this.over = true;
    this.fever = 0;
    this.onEvent('fever', false);
    this.sfx?.end();
    this._pushHud();
    setTimeout(() => {
      this.onEnd({
        score: this.score,
        maxCombo: this.maxCombo,
        feverCount: this.feverCount,
        timeUp: this.timeLeft <= 0,
        ...this.stats,
      });
    }, 900);
  }

  _pushHud() {
    this.onHud({
      score: this.score,
      lives: this.lives,
      combo: this.combo,
      hype: this.hype,
      fever: this.fever,
      timeLeft: Math.max(0, this.timeLeft),
      market: this.market.state,
    });
  }

  update(dt) {
    if (this.paused) return;
    this.t += dt;
    const { W } = this;
    const p = this.player;
    const gy = this.groundY;

    if (!this.demo && !this.over) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this._text(W / 2, this.H * 0.45, 'CLOSING BELL!', GOLD, 28);
        this._finish();
      }
    }

    // market
    const mk = this.market;
    mk.t -= dt;
    if (mk.t <= 0) {
      const next = pick(Object.keys(MARKETS).filter((k) => k !== mk.state));
      mk.state = next;
      mk.t = rand(8, 11);
      mk.banner = 2.2;
      if (!this.demo) this.sfx?.market(next);
    }
    mk.banner = Math.max(0, mk.banner - dt);
    mk.tick -= dt;
    if (mk.tick <= 0) {
      mk.tick = 0.12;
      const drift = mk.state === 'bull' ? 0.9 : mk.state === 'bear' ? -0.9 : 0;
      mk.price = clamp(mk.price + drift + rand(-1.6, 1.6) + (this.fever > 0 ? 1.2 : 0), 40, 220);
      mk.hist.push(mk.price);
      mk.hist.shift();
    }

    // spawning
    if (!this.over) {
      const d = this.demo ? 0.3 : clamp(this.t / ROUND_TIME, 0, 1);
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this._spawn();
        this.spawnT = (0.6 - d * 0.26) * (this.fever > 0 ? 0.42 : 1) * rand(0.8, 1.2);
      }
    }

    // player control
    if (this.demo) {
      let best = null;
      for (const it of this.items) {
        if (!TYPES[it.type].good || it.y > gy - 50) continue;
        if (!best || it.y > best.y) best = it;
      }
      p.target = best ? best.x : W / 2 + Math.sin(this.t) * 80;
    } else {
      const k = this.keys;
      const spd = 430;
      if (k.arrowleft || k.a) p.target = clamp(Math.min(p.target, p.x) - spd * dt, 26, W - 26);
      if (k.arrowright || k.d) p.target = clamp(Math.max(p.target, p.x) + spd * dt, 26, W - 26);
    }
    p.prevX = p.x;
    p.x += (p.target - p.x) * Math.min(1, dt * (this.demo ? 6 : 16));
    p.x = clamp(p.x, 24, W - 24);
    p.vx = (p.x - p.prevX) / Math.max(dt, 0.001);
    if (Math.abs(p.vx) > 25) p.walk += dt * 16;
    p.catchAnim = Math.max(0, p.catchAnim - dt);
    p.hurt = Math.max(0, p.hurt - dt);

    // items
    for (const it of this.items) {
      it.age += dt;
      it.y += it.vy * dt;
      it.x += Math.cos(it.age * it.wf + it.ph) * it.wa * dt;
      it.rot += it.vr * dt;
      if (this.fever > 0 && TYPES[it.type].good && it.y > this.H * 0.3) {
        it.x += (p.x - it.x) * dt * 3.2;
      }
      it.x = clamp(it.x, 14, W - 14);
      const r = TYPES[it.type].r;
      if (!it.dead && !this.over && it.y + r > gy - 98 && it.y - r < gy - 42 && Math.abs(it.x - p.x) < 26 + r * 0.6) {
        it.dead = true;
        this._catch(it);
      }
      if (!it.dead && it.y - r > gy + 6) {
        it.dead = true;
        if (TYPES[it.type].good) {
          this._burst(it.x, gy, 4, 'bill');
          if (!this.demo && !this.over && this.combo >= 3) {
            this._text(it.x, gy - 30, 'COMBO LOST', '#bbb', 13);
            this.sfx?.miss();
          }
          if (!this.demo) this.combo = 0;
        } else {
          this._burst(it.x, gy, 6, 'spark', '#888');
        }
      }
    }
    this.items = this.items.filter((it) => !it.dead);

    // fever
    if (this.fever > 0) {
      this.fever -= dt;
      for (let i = 0; i < 3; i++) this._part(rand(0, W), this.top - 10, rand(-40, 40), rand(40, 140), Math.random() < 0.3 ? 'bill' : 'conf');
      if (this.fever <= 0) {
        this.fever = 0;
        this.onEvent('fever', false);
      }
    }
    this.feverBanner = Math.max(0, this.feverBanner - dt);
    if (this.demo && Math.random() < dt * 6) this._part(rand(0, W), this.top - 10, rand(-30, 30), rand(30, 90), 'conf');

    // particles
    for (const q of this.parts) {
      q.life -= dt;
      if (q.kind === 'spark') {
        q.vy += 500 * dt;
        q.vx *= 0.96;
      } else {
        q.vy = Math.min(q.vy + 420 * dt, q.kind === 'bill' ? 70 : 95);
        q.vx *= 0.97;
        q.x += Math.sin(this.t * 5 + q.ph) * 25 * dt;
      }
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.r += q.vr * dt;
      if (q.y > gy + 30 && q.kind !== 'spark') q.life = Math.min(q.life, 0.2);
    }
    this.parts = this.parts.filter((q) => q.life > 0);
    for (const tx of this.texts) {
      tx.life -= dt;
      tx.y -= 45 * dt;
    }
    this.texts = this.texts.filter((tx) => tx.life > 0);

    this.shake = Math.max(0, this.shake - dt);
    this.flash = this.flash > 0 ? Math.max(0, this.flash - dt) : Math.min(0, this.flash + dt);

    if (!this.demo) {
      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 0.08;
        this._pushHud();
      }
    }
  }

  // ---------- rendering ----------
  render() {
    const c = this.ctx;
    const s = this.scale * this.dpr;
    c.setTransform(s, 0, 0, s, 0, 0);
    if (this.shake > 0) c.translate(rand(-1, 1) * this.shake * 14, rand(-1, 1) * this.shake * 10);
    this._drawRoom(c);
    this._drawCrowd(c);
    this._drawDesks(c);
    this._drawFloor(c);
    if (this.fever > 0) this._drawBeams(c);
    for (const it of this.items) this._drawItem(c, it);
    this._drawPlayer(c);
    this._drawParticles(c);
    this._drawTexts(c);
    if (!this.demo) this._drawMarket(c);
    this._drawTicker(c);
    this._drawBanners(c);
    // screen flash
    if (this.flash !== 0) {
      c.setTransform(s, 0, 0, s, 0, 0);
      c.fillStyle = this.flash > 0 ? `rgba(255,230,150,${this.flash * 0.6})` : `rgba(255,40,40,${-this.flash * 0.45})`;
      c.fillRect(0, 0, this.W, this.H);
    }
    if (this.fever > 0) {
      c.setTransform(s, 0, 0, s, 0, 0);
      const g = c.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.25, this.W / 2, this.H / 2, this.H * 0.75);
      g.addColorStop(0, 'rgba(245,185,33,0)');
      g.addColorStop(1, `rgba(245,185,33,${0.22 + Math.sin(this.t * 12) * 0.08})`);
      c.fillStyle = g;
      c.fillRect(0, 0, this.W, this.H);
    }
  }

  _drawRoom(c) {
    const { W, H, hy, t } = this;
    // ceiling
    const cg = c.createLinearGradient(0, 0, 0, hy);
    cg.addColorStop(0, '#2b2a26');
    cg.addColorStop(1, '#14120f');
    c.fillStyle = cg;
    c.fillRect(-20, -20, W + 40, hy + 20);
    // fluorescent panels in perspective
    const vx = W / 2;
    const vy = hy + 60;
    c.save();
    c.beginPath();
    c.rect(-20, -20, W + 40, hy + 20);
    c.clip();
    const fever = this.fever > 0;
    for (let r = 0; r < 7; r++) {
      const z = 1 + r * 0.55;
      const y = vy - (vy + 30) / z;
      const h = ((vy + 30) / z) * 0.08;
      for (let col = -4; col <= 4; col++) {
        const w = 70 / z;
        const x = vx + (col * 120) / z - w / 2;
        let a = 0.8 - r * 0.09;
        let color = `rgba(255,250,232,${a})`;
        if (fever) {
          const on = Math.sin(t * 14 + col * 1.3 + r) > 0;
          color = on ? `rgba(255,214,90,${a})` : `rgba(255,255,255,${a * 0.6})`;
        }
        c.fillStyle = color;
        c.fillRect(x, y, w, h);
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.fillRect(x + w / 2 - 0.5, y, 1, h);
      }
    }
    c.restore();
    // back wall
    const wg = c.createLinearGradient(0, hy, 0, hy + 140);
    wg.addColorStop(0, '#3d3121');
    wg.addColorStop(1, '#221a10');
    c.fillStyle = wg;
    c.fillRect(-20, hy, W + 40, 140);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (let x = 0; x < W; x += 46) c.fillRect(x, hy, 2, 140);
    // big wall board
    c.fillStyle = '#0d0b08';
    c.fillRect(W * 0.18, hy + 8, W * 0.64, 26);
    c.fillStyle = fever ? GOLD : '#E0A821';
    c.font = 'bold 13px Impact, "Arial Narrow", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(fever ? '★ PARTY TIME ★' : 'DOWNTOWN SECURITIES', W / 2, hy + 21);
  }

  _drawPerson(c, x, y, sc, pr, bounce, armsUp) {
    c.save();
    c.translate(x, y - bounce);
    c.scale(sc, sc);
    // body
    c.fillStyle = pr.suit;
    c.beginPath();
    c.moveTo(-11, 0);
    c.lineTo(-12, -30);
    c.quadraticCurveTo(0, -38, 12, -30);
    c.lineTo(11, 0);
    c.fill();
    c.fillStyle = '#eee';
    c.beginPath();
    c.moveTo(-4, -33);
    c.lineTo(0, -24);
    c.lineTo(4, -33);
    c.fill();
    // arms
    c.strokeStyle = pr.suit;
    c.lineWidth = 5;
    c.lineCap = 'round';
    c.beginPath();
    if (armsUp) {
      const wave = Math.sin(this.t * 10 + pr.ph) * 4;
      c.moveTo(-10, -30);
      c.lineTo(-17 + wave, -52);
      c.moveTo(10, -30);
      c.lineTo(17 - wave, -52);
    } else {
      c.moveTo(-10, -30);
      c.lineTo(-14, -12);
      c.moveTo(10, -30);
      c.lineTo(15, -14);
    }
    c.stroke();
    if (armsUp && pr.hold) {
      if (pr.hold === 'paper') {
        c.fillStyle = '#f3f0e6';
        c.fillRect(13, -64, 10, 13);
      } else if (pr.hold === 'phone') {
        c.fillStyle = '#111';
        c.fillRect(-21, -62, 6, 13);
      } else {
        c.fillStyle = '#7FB07A';
        c.fillRect(12, -60, 13, 7);
      }
    }
    // head
    c.fillStyle = pr.skin;
    c.beginPath();
    c.arc(0, -43, 8, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#2a1d12';
    c.beginPath();
    c.arc(0, -46, 8, Math.PI, 0);
    c.fill();
    if (pr.hat) {
      c.fillStyle = GOLD;
      c.beginPath();
      c.moveTo(-6, -50);
      c.lineTo(0, -66);
      c.lineTo(6, -50);
      c.fill();
    }
    c.restore();
  }

  _drawCrowd(c) {
    const { hy, t } = this;
    const fever = this.fever > 0;
    for (const pr of this.crowd) {
      const baseY = hy + (pr.row ? 128 : 112);
      const amp = fever ? 12 : this.demo ? 5 : 3.5;
      const sp = fever ? pr.sp * 1.6 : pr.sp;
      const bounce = Math.abs(Math.sin(t * sp + pr.ph)) * amp;
      const armsUp = fever || (pr.arms && Math.sin(t * 0.7 + pr.ph) > -0.2);
      this._drawPerson(c, pr.x, baseY, pr.s, pr, bounce, armsUp);
      if (pr.row === 0) {
        // back row darkening
        c.fillStyle = 'rgba(20,14,8,0.35)';
        c.fillRect(pr.x - 14 * pr.s, baseY - 70 * pr.s - bounce, 28 * pr.s, 70 * pr.s);
      }
    }
  }

  _drawDesks(c) {
    const { W, hy, t } = this;
    const y = hy + 122;
    c.fillStyle = '#5a3a1e';
    c.fillRect(-20, y, W + 40, 10);
    c.fillStyle = '#3b2512';
    c.fillRect(-20, y + 10, W + 40, 18);
    for (let x = 12; x < W; x += 58) {
      c.fillStyle = '#1a1a1a';
      c.fillRect(x, y - 22, 30, 22);
      c.fillStyle = '#0a2a14';
      c.fillRect(x + 2, y - 20, 26, 16);
      c.strokeStyle = (Math.floor(t * 2 + x) % 3 === 0) ? '#ff5a5a' : '#4CD07D';
      c.lineWidth = 1.2;
      c.beginPath();
      for (let i = 0; i <= 6; i++) {
        const yy = y - 12 + Math.sin(t * 3 + x + i * 1.7) * 4;
        if (i === 0) c.moveTo(x + 3 + i * 4, yy);
        else c.lineTo(x + 3 + i * 4, yy);
      }
      c.stroke();
      c.fillStyle = '#222';
      c.fillRect(x + 12, y - 2, 6, 3);
    }
  }

  _drawFloor(c) {
    const { W, H, hy } = this;
    const y0 = hy + 150;
    const fg = c.createLinearGradient(0, y0, 0, H);
    fg.addColorStop(0, '#3a2418');
    fg.addColorStop(1, '#1c100a');
    c.fillStyle = fg;
    c.fillRect(-20, y0 - 22, W + 40, H - y0 + 42);
    c.strokeStyle = 'rgba(255,220,160,0.05)';
    c.lineWidth = 1;
    for (let i = -6; i <= 6; i++) {
      c.beginPath();
      c.moveTo(W / 2 + i * 14, y0 - 22);
      c.lineTo(W / 2 + i * 90, H);
      c.stroke();
    }
    for (const b of this.floorBits) {
      c.save();
      c.translate(b.x, b.y);
      c.rotate(b.r);
      c.fillStyle = b.c;
      c.globalAlpha = 0.55;
      c.fillRect(-b.w / 2, -1.2, b.w, 2.4);
      c.restore();
    }
    c.globalAlpha = 1;
  }

  _drawBeams(c) {
    const { W, t, H } = this;
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const ox = W * (0.15 + i * 0.23);
      const ang = Math.sin(t * 1.8 + i * 1.7) * 0.5;
      c.save();
      c.translate(ox, this.top);
      c.rotate(ang);
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(255,220,120,0.32)');
      g.addColorStop(1, 'rgba(255,220,120,0)');
      c.fillStyle = g;
      c.beginPath();
      c.moveTo(-6, 0);
      c.lineTo(6, 0);
      c.lineTo(70, H);
      c.lineTo(-70, H);
      c.fill();
      c.restore();
    }
    c.restore();
  }

  _drawItem(c, it) {
    const r = TYPES[it.type].r;
    c.save();
    c.translate(it.x, it.y);
    // danger glow
    if (!TYPES[it.type].good) {
      c.fillStyle = `rgba(255,50,50,${0.18 + Math.sin(it.age * 12) * 0.08})`;
      c.beginPath();
      c.arc(0, 0, r + 9, 0, Math.PI * 2);
      c.fill();
    } else if (it.type === 'gold' || it.type === 'bull') {
      c.fillStyle = 'rgba(255,220,100,0.18)';
      c.beginPath();
      c.arc(0, 0, r + 8, 0, Math.PI * 2);
      c.fill();
    }
    c.rotate(it.type === 'phone' ? Math.sin(it.age * 30) * 0.18 : it.rot);
    switch (it.type) {
      case 'cash': {
        for (let i = 2; i >= 0; i--) {
          c.fillStyle = i ? '#5d8d5a' : '#86b982';
          c.fillRect(-16 + i * 1.5, -9 - i * 2.5, 32, 18);
          c.strokeStyle = '#3c6a3a';
          c.lineWidth = 1;
          c.strokeRect(-16 + i * 1.5, -9 - i * 2.5, 32, 18);
        }
        c.strokeStyle = '#3c6a3a';
        c.beginPath();
        c.ellipse(0, 0, 6, 6, 0, 0, Math.PI * 2);
        c.stroke();
        c.fillStyle = '#2d522b';
        c.font = 'bold 9px sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('$', 0, 0.5);
        c.fillStyle = '#d8c27a';
        c.fillRect(-3, -9, 6, 18);
        break;
      }
      case 'bag': {
        c.fillStyle = '#b8894a';
        c.beginPath();
        c.ellipse(0, 4, 16, 14, 0, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.moveTo(-7, -8);
        c.lineTo(-10, -17);
        c.lineTo(10, -17);
        c.lineTo(7, -8);
        c.fill();
        c.fillStyle = GOLD;
        c.fillRect(-8, -10, 16, 3);
        c.fillStyle = '#6b4a1e';
        c.font = 'bold 15px Impact, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('$', 0, 5);
        break;
      }
      case 'gold': {
        const g = c.createLinearGradient(-16, -10, 16, 10);
        g.addColorStop(0, '#FFE69A');
        g.addColorStop(0.5, '#F5B921');
        g.addColorStop(1, '#B07B06');
        c.fillStyle = g;
        c.beginPath();
        c.moveTo(-12, -9);
        c.lineTo(12, -9);
        c.lineTo(18, 9);
        c.lineTo(-18, 9);
        c.closePath();
        c.fill();
        c.strokeStyle = '#8a5d00';
        c.lineWidth = 1.2;
        c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.55)';
        c.fillRect(-9, -7, 14, 2.5);
        c.fillStyle = '#8a5d00';
        c.font = 'bold 6px sans-serif';
        c.textAlign = 'center';
        c.fillText('999.9', 0, 4);
        break;
      }
      case 'phone': {
        c.fillStyle = '#151515';
        c.fillRect(-8, -16, 16, 34);
        c.fillRect(3, -26, 3, 11);
        c.fillStyle = '#2f3b2a';
        c.fillRect(-6, -13, 12, 7);
        c.fillStyle = GOLD;
        for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) c.fillRect(-5 + col * 4, -2 + row * 5, 2.5, 3);
        c.strokeStyle = '#fff';
        c.lineWidth = 1.5;
        const k = (it.age * 4) % 1;
        c.globalAlpha = 1 - k;
        c.beginPath();
        c.arc(0, -4, 16 + k * 8, -0.6, 0.6);
        c.stroke();
        c.beginPath();
        c.arc(0, -4, 16 + k * 8, Math.PI - 0.6, Math.PI + 0.6);
        c.stroke();
        c.globalAlpha = 1;
        break;
      }
      case 'bull': {
        const g = c.createRadialGradient(-4, -4, 2, 0, 0, 17);
        g.addColorStop(0, '#FFF1B8');
        g.addColorStop(1, '#D99A06');
        c.fillStyle = g;
        c.beginPath();
        c.arc(0, 0, 16, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#8a5d00';
        c.lineWidth = 1.5;
        c.stroke();
        // stylised horns + up arrow (original emblem)
        c.strokeStyle = '#6b4500';
        c.lineWidth = 2.5;
        c.beginPath();
        c.moveTo(-9, -1);
        c.quadraticCurveTo(-11, -10, -4, -9);
        c.moveTo(9, -1);
        c.quadraticCurveTo(11, -10, 4, -9);
        c.stroke();
        c.fillStyle = '#6b4500';
        c.beginPath();
        c.moveTo(0, -6);
        c.lineTo(6, 2);
        c.lineTo(2, 2);
        c.lineTo(2, 9);
        c.lineTo(-2, 9);
        c.lineTo(-2, 2);
        c.lineTo(-6, 2);
        c.fill();
        break;
      }
      case 'crash': {
        c.fillStyle = '#2a0a0a';
        c.beginPath();
        c.arc(0, 0, 17, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#FF4D4D';
        c.lineWidth = 2;
        c.stroke();
        c.strokeStyle = '#FF4D4D';
        c.lineWidth = 3;
        c.lineJoin = 'round';
        c.beginPath();
        c.moveTo(-11, -9);
        c.lineTo(-4, -3);
        c.lineTo(0, -7);
        c.lineTo(8, 5);
        c.stroke();
        c.fillStyle = '#FF4D4D';
        c.beginPath();
        c.moveTo(11, 9);
        c.lineTo(3, 7);
        c.lineTo(10, 0);
        c.fill();
        break;
      }
      case 'audit': {
        c.fillStyle = '#d9b46a';
        c.fillRect(-16, -12, 32, 24);
        c.fillRect(-16, -16, 12, 5);
        c.fillStyle = '#f4ecd8';
        c.fillRect(-13, -10, 26, 4);
        c.save();
        c.rotate(-0.25);
        c.strokeStyle = '#d62828';
        c.lineWidth = 2;
        c.strokeRect(-14, -3, 28, 11);
        c.fillStyle = '#d62828';
        c.font = 'bold 8px Impact, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('AUDIT', 0, 3);
        c.restore();
        break;
      }
      default:
        break;
    }
    c.restore();
  }

  _drawPlayer(c) {
    const p = this.player;
    const gy = this.groundY;
    const t = this.t;
    const fever = this.fever > 0;
    c.save();
    c.translate(p.x, gy);
    // shadow
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.beginPath();
    c.ellipse(0, 2, 24, 5, 0, 0, Math.PI * 2);
    c.fill();
    if (fever) {
      c.fillStyle = `rgba(255,214,90,${0.25 + Math.sin(t * 10) * 0.1})`;
      c.beginPath();
      c.ellipse(0, -50, 44, 60, 0, 0, Math.PI * 2);
      c.fill();
    }
    const lean = clamp(p.vx / 1400, -0.18, 0.18);
    c.rotate(lean);
    const hop = fever ? Math.abs(Math.sin(t * 9)) * 6 : p.catchAnim > 0 ? 3 : 0;
    c.translate(0, -hop);
    if (p.hurt > 0 && Math.floor(p.hurt * 14) % 2 === 0) c.globalAlpha = 0.45;

    // legs
    const sw = Math.abs(p.vx) > 25 ? Math.sin(p.walk) * 5 : 0;
    c.fillStyle = '#141a26';
    c.fillRect(-9 + sw * 0.4, -28, 8, 26);
    c.fillRect(1 - sw * 0.4, -28, 8, 26);
    c.fillStyle = '#0a0a0a';
    c.beginPath();
    c.ellipse(-6 + sw * 0.4, -2, 7, 3, 0, 0, Math.PI * 2);
    c.ellipse(6 - sw * 0.4, -2, 7, 3, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.fillRect(-9 + sw * 0.4, -4, 3, 1);
    c.fillRect(3 - sw * 0.4, -4, 3, 1);

    // torso (pinstripe suit)
    c.save();
    c.beginPath();
    c.moveTo(-14, -26);
    c.lineTo(-17, -60);
    c.quadraticCurveTo(0, -68, 17, -60);
    c.lineTo(14, -26);
    c.closePath();
    c.fillStyle = '#1c2333';
    c.fill();
    c.clip();
    c.strokeStyle = 'rgba(210,220,240,0.22)';
    c.lineWidth = 0.7;
    for (let x = -18; x <= 18; x += 4) {
      c.beginPath();
      c.moveTo(x, -70);
      c.lineTo(x, -24);
      c.stroke();
    }
    c.restore();
    // shirt + tie
    c.fillStyle = '#f5f5f0';
    c.beginPath();
    c.moveTo(-6, -63);
    c.lineTo(0, -44);
    c.lineTo(6, -63);
    c.fill();
    c.save();
    c.beginPath();
    c.moveTo(-2.5, -60);
    c.lineTo(2.5, -60);
    c.lineTo(3.5, -44);
    c.lineTo(0, -40);
    c.lineTo(-3.5, -44);
    c.closePath();
    c.fillStyle = '#111';
    c.fill();
    c.clip();
    c.strokeStyle = GOLD;
    c.lineWidth = 1.6;
    for (let y = -66; y < -36; y += 4.5) {
      c.beginPath();
      c.moveTo(-6, y);
      c.lineTo(6, y + 5);
      c.stroke();
    }
    c.restore();
    // lapels
    c.strokeStyle = '#0e1320';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(-7, -63);
    c.lineTo(-3, -44);
    c.moveTo(7, -63);
    c.lineTo(3, -44);
    c.stroke();
    // pocket square
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(7, -52);
    c.lineTo(9, -55);
    c.lineTo(11, -52);
    c.fill();

    // arms (raised to catch)
    const lift = p.catchAnim > 0 ? 6 : 0;
    const wave = fever ? Math.sin(t * 12) * 6 : 0;
    const hands = [
      [-15, -58, -25, -84 - lift + wave],
      [15, -58, 25, -84 - lift - wave],
    ];
    c.lineCap = 'round';
    for (const [sx, sy, hx, hyy] of hands) {
      c.strokeStyle = '#1c2333';
      c.lineWidth = 8;
      c.beginPath();
      c.moveTo(sx, sy);
      c.quadraticCurveTo(sx * 1.7, (sy + hyy) / 2, hx, hyy + 6);
      c.stroke();
      c.strokeStyle = '#f5f5f0';
      c.lineWidth = 6;
      c.beginPath();
      c.moveTo(hx * 0.98, hyy + 6);
      c.lineTo(hx, hyy + 3);
      c.stroke();
      c.fillStyle = '#e9bd96';
      c.beginPath();
      c.arc(hx, hyy, 4.5, 0, Math.PI * 2);
      c.fill();
    }
    // gold watch on left wrist
    c.fillStyle = GOLD;
    c.fillRect(-28, -78 - lift + wave, 6, 4);

    // head
    c.fillStyle = '#e9bd96';
    c.fillRect(-3.5, -70, 7, 6);
    c.beginPath();
    c.ellipse(0, -79, 10, 11.5, 0, 0, Math.PI * 2);
    c.fill();
    // hair: slicked back, dark brown
    c.fillStyle = '#3a2614';
    c.beginPath();
    c.moveTo(-10.5, -78);
    c.quadraticCurveTo(-12, -93, 0, -93);
    c.quadraticCurveTo(12, -93, 10.5, -80);
    c.quadraticCurveTo(5, -88, -4, -86);
    c.quadraticCurveTo(-8, -84, -10.5, -78);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.fillRect(-4, -91, 8, 1.4);
    // face
    c.fillStyle = '#1b1b1b';
    if (p.hurt > 0) {
      c.strokeStyle = '#1b1b1b';
      c.lineWidth = 1.3;
      for (const ex of [-4, 4]) {
        c.beginPath();
        c.moveTo(ex - 2, -81);
        c.lineTo(ex + 2, -77);
        c.moveTo(ex + 2, -81);
        c.lineTo(ex - 2, -77);
        c.stroke();
      }
      c.beginPath();
      c.arc(0, -70, 3, Math.PI * 1.15, Math.PI * 1.85);
      c.stroke();
    } else {
      c.beginPath();
      c.arc(-4, -79, 1.3, 0, Math.PI * 2);
      c.arc(4, -79, 1.3, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#1b1b1b';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(-6, -83);
      c.lineTo(-2, -83.5);
      c.moveTo(2, -83.5);
      c.lineTo(6, -83);
      c.stroke();
      c.beginPath();
      const big = fever || p.catchAnim > 0;
      c.arc(0, -74, big ? 4 : 3, 0.15 * Math.PI, 0.85 * Math.PI);
      c.stroke();
      if (big) {
        c.fillStyle = '#fff';
        c.beginPath();
        c.arc(0, -74, 3.2, 0.2 * Math.PI, 0.8 * Math.PI);
        c.fill();
      }
    }
    c.restore();
  }

  _drawParticles(c) {
    for (const q of this.parts) {
      c.save();
      c.globalAlpha = Math.min(1, q.life * 2);
      c.translate(q.x, q.y);
      if (q.kind === 'spark') {
        c.fillStyle = q.c;
        c.beginPath();
        c.arc(0, 0, 2.2, 0, Math.PI * 2);
        c.fill();
      } else {
        c.rotate(q.r);
        c.scale(1, Math.abs(Math.sin(q.r * 1.3)) * 0.8 + 0.2);
        c.fillStyle = q.c;
        if (q.kind === 'bill') {
          c.fillRect(-q.w / 2, -q.w / 4, q.w, q.w / 2);
          c.fillStyle = 'rgba(0,0,0,0.25)';
          c.fillRect(-1.5, -q.w / 4, 3, q.w / 2);
        } else {
          c.fillRect(-q.w / 2, -1.6, q.w, 3.2);
        }
      }
      c.restore();
    }
    c.globalAlpha = 1;
  }

  _drawTexts(c) {
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const tx of this.texts) {
      const a = Math.min(1, tx.life / 0.35);
      const pop = 1 + Math.max(0, tx.life - tx.max + 0.15) * 3;
      c.save();
      c.globalAlpha = a;
      c.translate(tx.x, tx.y);
      c.scale(pop, pop);
      c.font = `900 ${tx.size}px Impact, "Arial Black", sans-serif`;
      c.lineWidth = 4;
      c.strokeStyle = 'rgba(0,0,0,0.85)';
      c.strokeText(tx.text, 0, 0);
      c.fillStyle = tx.color;
      c.fillText(tx.text, 0, 0);
      c.restore();
    }
  }

  _drawMarket(c) {
    const m = MARKETS[this.market.state];
    const w = 112;
    const h = 46;
    const x = this.W - w - 8;
    const y = this.top + 8;
    c.fillStyle = 'rgba(8,8,8,0.72)';
    c.fillRect(x, y, w, h);
    c.strokeStyle = m.color;
    c.lineWidth = 1.5;
    c.strokeRect(x, y, w, h);
    c.fillStyle = m.color;
    c.font = 'bold 11px Impact, sans-serif';
    c.textAlign = 'left';
    c.textBaseline = 'top';
    c.fillText(m.label, x + 6, y + 4);
    const hist = this.market.hist;
    let mn = Infinity;
    let mx = -Infinity;
    for (const v of hist) {
      mn = Math.min(mn, v);
      mx = Math.max(mx, v);
    }
    const span = Math.max(8, mx - mn);
    c.beginPath();
    hist.forEach((v, i) => {
      const px = x + 6 + (i / (hist.length - 1)) * (w - 12);
      const py = y + h - 5 - ((v - mn) / span) * (h - 22);
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    });
    c.strokeStyle = m.color;
    c.lineWidth = 1.5;
    c.stroke();
    c.textAlign = 'right';
    c.fillStyle = '#ddd';
    c.font = '10px monospace';
    c.fillText(this.market.price.toFixed(1), x + w - 6, y + 5);
  }

  _drawTicker(c) {
    const { W, H, t } = this;
    const y = H - 22;
    c.fillStyle = '#050505';
    c.fillRect(-20, y, W + 40, 22);
    c.fillStyle = GOLD;
    c.fillRect(-20, y, W + 40, 1.5);
    const p = this.market.price;
    const up = this.market.state !== 'bear';
    const str = `  DTWN ${up ? '▲' : '▼'} ${p.toFixed(2)}   GLDX ▲ 1,284.50   BULL ▲ 3.21%   CASH ▲ 0.88%   PHNE ▼ 0.42%   CNFT ▲ 12.0%   DWST ${up ? '▲' : '▼'} ${(p / 7).toFixed(2)}   `;
    c.font = 'bold 12px "Courier New", monospace';
    c.textBaseline = 'middle';
    c.textAlign = 'left';
    const tw = c.measureText(str).width;
    const off = -((t * 55) % tw);
    for (let x = off; x < W; x += tw) {
      c.fillStyle = '#FFC93C';
      c.fillText(str, x, y + 12);
    }
  }

  _drawBanners(c) {
    const { W, H } = this;
    const drawBox = (text, sub, color, k, y) => {
      const appear = Math.min(1, k * 4);
      c.save();
      c.translate(W / 2, y);
      c.scale(appear, appear);
      c.font = '900 30px Impact, "Arial Black", sans-serif';
      const tw = c.measureText(text).width + 30;
      c.fillStyle = color;
      c.fillRect(-tw / 2, -24, tw, 48);
      c.fillStyle = '#0a0a0a';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, 0, -2);
      if (sub) {
        c.font = 'bold 12px sans-serif';
        c.fillStyle = '#fff';
        c.lineWidth = 3;
        c.strokeStyle = '#000';
        c.strokeText(sub, 0, 36);
        c.fillText(sub, 0, 36);
      }
      c.restore();
    };
    if (!this.demo && this.market.banner > 0) {
      const st = this.market.state;
      const sub = st === 'bull' ? '獲得額2倍！' : st === 'bear' ? '暴落と監査に注意！' : '相場は横ばい';
      drawBox(st.toUpperCase() + ' MARKET', sub, MARKETS[st].color, this.market.banner, this.feverBanner > 0 ? H * 0.47 : H * 0.36);
    }
    if (this.feverBanner > 0) {
      c.save();
      c.translate(0, Math.sin(this.t * 20) * 2);
      drawBox('PARTY TIME!!', '全部キャッシュ化・獲得額×3', GOLD, this.feverBanner, H * 0.28);
      c.restore();
    }
    if (!this.demo && this.t < 3.5) {
      c.save();
      c.globalAlpha = Math.min(1, (3.5 - this.t) * 1.5) * (0.75 + Math.sin(this.t * 8) * 0.25);
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = 'bold 13px sans-serif';
      c.lineWidth = 4;
      c.strokeStyle = '#000';
      const hint = '◀  ドラッグ / ← → で移動  ▶';
      c.strokeText(hint, this.player.x, this.groundY - 120);
      c.fillStyle = '#fff';
      c.fillText(hint, this.player.x, this.groundY - 120);
      c.restore();
    }
    if (!this.demo && this.combo >= 5 && !this.over) {
      c.save();
      c.textAlign = 'left';
      c.textBaseline = 'top';
      c.font = '900 22px Impact, sans-serif';
      c.lineWidth = 4;
      c.strokeStyle = '#000';
      const txt = `${this.combo} COMBO`;
      c.strokeText(txt, 10, this.top + 10);
      c.fillStyle = this.combo >= 20 ? GOLD : '#fff';
      c.fillText(txt, 10, this.top + 10);
      const cm = 1 + Math.min(2, Math.floor(this.combo / 10) * 0.5);
      c.font = 'bold 11px sans-serif';
      c.fillStyle = '#FFE08A';
      c.fillText(`ボーナス ×${cm.toFixed(1)}`, 11, this.top + 36);
      c.restore();
    }
  }
}
