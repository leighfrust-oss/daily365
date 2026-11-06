// Progress bar sound, generated with the Web Audio API (no audio files to ship or license).
// The pitch follows the same easing curve as the bar, so the sound rises as the bar fills.
// Everything is routed through one master gain that feeds both the speakers and the
// recorder, so what you hear in preview is what ends up in the video.
import { easeOutCubic } from './render.js';

export const SOUND_STYLES = [
  { id: 'ticks', label: 'Ticks' },
  { id: 'sweep', label: 'Rising tone' },
  { id: 'off', label: 'Off' },
];

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.recordDest = null;
    this.volume = 0.8;
  }

  // Must be called from a user action (a click) the first time, or the browser keeps audio muted.
  ensure() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.recordDest = this.ctx.createMediaStreamDestination();
      this.master.connect(this.ctx.destination);
      this.master.connect(this.recordDest);
    }
    this.master.gain.value = this.volume;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  now() {
    return this.ctx.currentTime;
  }

  // Audio track to add to the recorded video.
  get recordStream() {
    return this.recordDest.stream;
  }

  // startAt: audio-clock time (seconds) where video time 0 happens.
  // fillDelay / fillDuration: when the bar starts filling and how long it takes (seconds).
  // Returns { stop() } to cut the sound early.
  play(style, { day, startAt, fillDelay, fillDuration }) {
    const ctx = this.ensure();
    const session = ctx.createGain();
    session.connect(this.master);
    const handle = {
      stop() {
        try {
          session.gain.cancelScheduledValues(0);
          session.gain.value = 0;
          session.disconnect();
        } catch {
          /* already stopped */
        }
      },
    };
    if (style === 'off') return handle;

    const t0 = startAt + fillDelay;
    if (style === 'sweep') scheduleSweep(ctx, session, t0, fillDuration);
    else scheduleTicks(ctx, session, t0, fillDuration, day);
    scheduleChime(ctx, session, t0 + fillDuration);
    return handle;
  }
}

// One short tick per step, up to 40 ticks. Few days means few ticks.
function scheduleTicks(ctx, out, t0, duration, day) {
  const count = Math.max(1, Math.min(40, day));
  for (let i = 0; i < count; i++) {
    const frac = count === 1 ? 0 : i / (count - 1);
    const when = t0 + frac * duration * 0.96;
    const freq = 520 + 880 * easeOutCubic(frac);
    tone(ctx, out, { when, freq, type: 'triangle', peak: 0.5, attack: 0.004, length: 0.07 });
  }
}

// One smooth tone that glides up while the bar fills.
function scheduleSweep(ctx, out, t0, duration) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';

  const points = 64;
  const curve = new Float32Array(points);
  for (let i = 0; i < points; i++) curve[i] = 180 + 700 * easeOutCubic(i / (points - 1));
  osc.frequency.setValueCurveAtTime(curve, t0, duration);

  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.38, t0 + 0.05);
  gain.gain.setValueAtTime(0.38, t0 + duration - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + 0.08);

  osc.connect(gain).connect(out);
  osc.start(t0);
  osc.stop(t0 + duration + 0.12);
}

// Two-note chime when the bar reaches today.
function scheduleChime(ctx, out, when) {
  tone(ctx, out, { when, freq: 880, type: 'sine', peak: 0.42, attack: 0.005, length: 0.8 });
  tone(ctx, out, { when: when + 0.09, freq: 1318.5, type: 'sine', peak: 0.36, attack: 0.005, length: 0.9 });
}

function tone(ctx, out, { when, freq, type, peak, attack, length }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + length);
  osc.connect(gain).connect(out);
  osc.start(when);
  osc.stop(when + length + 0.03);
}
