// Apple II 1-bit speaker via Web Audio. The original game toggles $C030 and
// CALLs into SOUND GEN / LASER routines for sfx; we approximate with shaped
// oscillator bursts.

export class Audio {
  private ctx: AudioContext | null = null;
  private destination: GainNode | null = null;

  private ensure(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      const compressor = ctx.createDynamicsCompressor();
      master.gain.value = 0.38;
      compressor.threshold.value = -18;
      compressor.knee.value = 24;
      compressor.ratio.value = 4;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.15;
      master.connect(compressor).connect(ctx.destination);
      this.ctx = ctx;
      this.destination = master;
    }
    return this.ctx;
  }

  async resume(): Promise<void> {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') {
      // ctx.resume() may hang without user gesture — use a timeout fallback
      const resolved = Promise.race([
        ctx.resume(),
        new Promise<void>(r => setTimeout(r, 500)),
      ]);
      await resolved.catch(() => {});
    }
  }

  private route(osc: OscillatorNode, durMs: number, amp = 0.05): void {
    const ctx = this.ensure();
    const out: AudioNode = this.destination ?? ctx.destination;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const end = now + durMs / 1000;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(amp, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, end);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(end);
  }

  private withTone(type: OscillatorType, freq: number, durMs: number, amp = 0.05, sweepTo?: number): void {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    if (typeof sweepTo === 'number') {
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + durMs / 1000);
    }
    this.route(osc, durMs, amp);
  }

  // PEEK(-16336): single speaker click
  click(): void {
    this.withTone('triangle', 900, 30, 0.025);
  }

  // CALL 38402 — laser sfx (descending tone)
  laser(): void {
    this.withTone('square', 1500, 180, 0.05, 180);
  }

  // CALL SG (37494) — generic short beep used for hits/explosions
  beep(freq = 220, durMs = 80): void {
    this.withTone('square', freq, durMs, 0.05);
  }

  playAlarm(): void {
    this.beep(880, 80);
  }
}

export const audio = new Audio();
