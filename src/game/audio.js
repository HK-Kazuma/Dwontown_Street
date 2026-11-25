// WebAudio synth: sound effects + disco loop. No audio files needed.
let ctx = null;
let master = null;
let musicBus = null;
let noiseBuf = null;
let muted = false;
let musicTimer = null;
let step = 0;
let nextTime = 0;
let feverOn = false;

try {
  muted = localStorage.getItem('dts_muted') === '1';
} catch {
  /* storage unavailable */
}

export function initAudio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.55;
    musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
}

export const isMuted = () => muted;

export function setMuted(m) {
  muted = m;
  try {
    localStorage.setItem('dts_muted', m ? '1' : '0');
  } catch {
    /* ignore */
  }
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.02);
}

function toneAt(t, freq, dur, type = 'square', vol = 0.2, slide = 0, bus = master) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(bus);
  o.start(t);
  o.stop(t + dur + 0.03);
}

function noiseAt(t, dur, vol, hp = 6000, bus = master) {
  if (!ctx) return;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f);
  f.connect(g);
  g.connect(bus);
  s.start(t);
  s.stop(t + dur + 0.02);
}

const now = () => (ctx ? ctx.currentTime : 0);

export const sfx = {
  click() {
    toneAt(now(), 900, 0.05, 'square', 0.08);
  },
  catch(combo) {
    const f = 520 * Math.pow(2, Math.min(combo, 24) / 24);
    toneAt(now(), f, 0.09, 'square', 0.1);
    toneAt(now() + 0.04, f * 1.5, 0.08, 'square', 0.07);
  },
  kaching() {
    const t = now();
    noiseAt(t, 0.12, 0.18, 3000);
    toneAt(t + 0.02, 1318, 0.1, 'triangle', 0.22);
    toneAt(t + 0.08, 1760, 0.35, 'triangle', 0.2);
    toneAt(t + 0.08, 2637, 0.3, 'sine', 0.08);
  },
  phone() {
    const t = now();
    [0, 0.07, 0.14].forEach((d, i) => toneAt(t + d, [784, 988, 1175][i], 0.12, 'square', 0.1));
  },
  bull() {
    const t = now();
    [392, 523, 659, 784, 1047].forEach((f, i) => toneAt(t + i * 0.05, f, 0.18, 'sawtooth', 0.09));
  },
  hurt() {
    const t = now();
    toneAt(t, 220, 0.4, 'sawtooth', 0.22, 0.35);
    noiseAt(t, 0.25, 0.2, 400);
  },
  miss() {
    toneAt(now(), 300, 0.15, 'triangle', 0.08, 0.6);
  },
  market(state) {
    const t = now();
    if (state === 'bull') {
      toneAt(t, 523, 0.12, 'square', 0.1);
      toneAt(t + 0.1, 784, 0.2, 'square', 0.1);
    } else if (state === 'bear') {
      toneAt(t, 392, 0.14, 'sawtooth', 0.1);
      toneAt(t + 0.12, 262, 0.3, 'sawtooth', 0.1);
    } else {
      toneAt(t, 660, 0.1, 'triangle', 0.1);
    }
  },
  fanfare() {
    const t = now();
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((f, i) => {
      toneAt(t + i * 0.08, f, 0.22, 'sawtooth', 0.12);
      toneAt(t + i * 0.08, f / 2, 0.22, 'square', 0.06);
    });
    noiseAt(t + 0.55, 0.6, 0.25, 2500);
  },
  end() {
    const t = now();
    [784, 659, 523, 784, 1047].forEach((f, i) => toneAt(t + i * 0.12, f, 0.3, 'triangle', 0.15));
  },
};

// ---- Disco loop (124 BPM, 8th-note sequencer) ----
const A2 = 110, C3 = 130.81, G2 = 98, E2 = 82.41, D3 = 146.83;
const BASS = [A2, A2, A2 * 2, A2, C3, C3, C3 * 2, C3, G2, G2, G2 * 2, G2, E2, E2, D3, E2 * 2];
const STAB = [[440, 523, 659], [523, 659, 784], [392, 494, 587], [330, 415, 494]];
const EIGHTH = 60 / 124 / 2;

function scheduleStep(s, t) {
  const i = s % 16;
  if (i % 2 === 0) toneAt(t, 150, 0.18, 'sine', 0.5, 0.3, musicBus); // kick
  if (i % 4 === 2) noiseAt(t, 0.12, 0.12, 1500, musicBus); // clap-ish
  noiseAt(t + EIGHTH / 2, 0.04, 0.06, 8000, musicBus); // offbeat hat
  toneAt(t, BASS[i], EIGHTH * 0.9, 'sawtooth', 0.09, 0, musicBus);
  if (feverOn && i % 2 === 1) {
    STAB[Math.floor(i / 4)].forEach((f) => toneAt(t, f, 0.12, 'square', 0.035, 0, musicBus));
  }
}

export function startMusic() {
  if (!ctx || musicTimer) return;
  step = 0;
  nextTime = ctx.currentTime + 0.05;
  musicTimer = setInterval(() => {
    while (nextTime < ctx.currentTime + 0.12) {
      scheduleStep(step, nextTime);
      nextTime += EIGHTH;
      step++;
    }
  }, 25);
}

export function stopMusic() {
  if (musicTimer) clearInterval(musicTimer);
  musicTimer = null;
  feverOn = false;
}

export function setFeverMusic(on) {
  feverOn = on;
}
