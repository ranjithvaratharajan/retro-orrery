import { Injectable, signal } from '@angular/core';

/** Sound category keys */
export type SoundCategory = 'ui' | 'select' | 'ambient';

/**
 * AudioService — Centralized Web Audio API sound engine.
 *
 * All sounds are synthesized procedurally using oscillators — no audio files
 * required. AudioContext is lazy-initialized on first user gesture.
 *
 * Design philosophy: every sound mimics a precision instrument —
 * brass control knobs, mechanical relay clicks, observatory equipment.
 */
@Injectable({ providedIn: 'root' })
export class AudioService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientOsc: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;

  /** Reactive signals for UI binding */
  readonly isMuted = signal(false);
  readonly ambientEnabled = signal(false);

  private readonly MASTER_VOLUME = 0.25;
  private readonly AMBIENT_VOLUME = 0.04;

  // ─── Initialization ────────────────────────────────────────────────────────

  /**
   * Initialize AudioContext lazily on first user interaction.
   * Must be called from a user event handler.
   */
  private ensureContext(): AudioContext | null {
    if (this.isMuted()) return null;
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.MASTER_VOLUME, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      } catch (e) {
        console.warn('[AudioService] Web Audio API unavailable:', e);
        return null;
      }
    }
    // Resume if suspended (autoplay policy)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  // ─── UI Sounds ─────────────────────────────────────────────────────────────

  /**
   * Precision click — for button presses, toggles.
   * 80Hz sine, 80ms, fast attack/decay — like a relay click.
   */
  playClick(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.06);

    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.6, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  /**
   * Toggle chirp — for checkbox/switch state changes.
   * 300Hz → 500Hz sweep, soft rise — like a precision toggle lever.
   */
  playToggle(isOn: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = 'triangle';
    const freqStart = isOn ? 280 : 420;
    const freqEnd   = isOn ? 480 : 260;
    osc.frequency.setValueAtTime(freqStart, t);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, t + 0.12);

    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.35, t + 0.01);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.14);
  }

  /**
   * Planet selection tone — warm, resonant, like a compass needle locking.
   * Two-tone (fundamental + 5th), 200ms, soft decay.
   */
  playSelect(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    [220, 330].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const env = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.3 - i * 0.1, t + 0.015);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      osc.connect(env);
      env.connect(this.masterGain!);
      osc.start(t);
      osc.stop(t + 0.28);
    });
  }

  /**
   * Panel open sound — slow resonant sweep, like a brass compartment opening.
   */
  playPanelOpen(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.25);

    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.2, t + 0.04);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  /**
   * Time scrub tick — very short transient for scrubbing feedback.
   * Call this throttled (every ~50ms) while dragging.
   */
  playTimeScrubTick(velocity: number): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    const intensity = Math.min(Math.abs(velocity) / 10, 1);
    const freq = 150 + intensity * 200;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.15 * intensity, t + 0.003);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.045);
  }

  /**
   * Reset view — short descending glide, like a dial resetting.
   */
  playReset(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.2);

    env.gain.setValueAtTime(0.25, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

    osc.connect(env);
    env.connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  // ─── Ambient Layer ─────────────────────────────────────────────────────────

  /**
   * Deep observatory ambient — 40Hz sine + 2Hz LFO modulation.
   * Cosmic hum, barely perceptible, adds presence.
   */
  startAmbient(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.ambientOsc) return;

    // LFO
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(0.4, ctx.currentTime);
    lfoGain.gain.setValueAtTime(8, ctx.currentTime);
    lfo.connect(lfoGain);

    // Carrier
    this.ambientOsc = ctx.createOscillator();
    this.ambientGain = ctx.createGain();
    this.ambientOsc.type = 'sine';
    this.ambientOsc.frequency.setValueAtTime(40, ctx.currentTime);
    lfoGain.connect(this.ambientOsc.frequency);

    // Fade in slowly
    this.ambientGain.gain.setValueAtTime(0, ctx.currentTime);
    this.ambientGain.gain.linearRampToValueAtTime(this.AMBIENT_VOLUME, ctx.currentTime + 3);

    this.ambientOsc.connect(this.ambientGain);
    this.ambientGain.connect(this.masterGain);
    this.ambientOsc.start();
    lfo.start();

    this.ambientEnabled.set(true);
  }

  stopAmbient(): void {
    if (!this.ctx || !this.ambientOsc || !this.ambientGain) return;
    const t = this.ctx.currentTime;
    this.ambientGain.gain.linearRampToValueAtTime(0, t + 1.5);
    this.ambientOsc.stop(t + 1.6);
    this.ambientOsc = null;
    this.ambientGain = null;
    this.ambientEnabled.set(false);
  }

  toggleAmbient(): void {
    if (this.ambientEnabled()) {
      this.stopAmbient();
    } else {
      this.startAmbient();
    }
  }

  // ─── Master Controls ───────────────────────────────────────────────────────

  toggleMute(): void {
    const next = !this.isMuted();
    this.isMuted.set(next);
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.linearRampToValueAtTime(
        next ? 0 : this.MASTER_VOLUME,
        this.ctx.currentTime + 0.05
      );
    }
    if (next) this.stopAmbient();
  }

  setVolume(level: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.linearRampToValueAtTime(
        Math.max(0, Math.min(1, level)),
        this.ctx.currentTime + 0.05
      );
    }
  }
}
