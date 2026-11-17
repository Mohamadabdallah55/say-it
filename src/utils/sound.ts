class SoundManager {
  private ctx: AudioContext | null = null;
  public enabled = true;

  private getCtx(): AudioContext | null {
    if (!this.enabled || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(freq: number, duration: number, type: OscillatorType = 'sine', gainVal = 0.12, delay = 0) {
    const ctx = this.getCtx();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(gainVal, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  playClick() {
    this.playTone(540, 0.07, 'triangle', 0.08);
  }

  playSurprise() {
    this.playTone(440, 0.1, 'triangle', 0.1, 0);
    this.playTone(554, 0.1, 'triangle', 0.1, 0.08);
    this.playTone(659, 0.14, 'triangle', 0.12, 0.16);
    this.playTone(880, 0.22, 'sine', 0.14, 0.24);
  }

  playStartRound() {
    this.playTone(523.25, 0.1, 'triangle', 0.12, 0);
    this.playTone(659.25, 0.18, 'triangle', 0.12, 0.1);
  }

  playTick(urgent = false) {
    this.playTone(urgent ? 920 : 620, 0.05, 'square', urgent ? 0.08 : 0.04);
  }

  playTimeUp() {
    this.playTone(300, 0.18, 'sawtooth', 0.1, 0);
    this.playTone(220, 0.3, 'sawtooth', 0.1, 0.16);
  }

  playReveal() {
    this.playTone(392, 0.13, 'triangle', 0.10);
    this.playTone(587, 0.23, 'sine', 0.12, 0.09);
  }

  playFoul() {
    this.playTone(190, 0.18, 'sawtooth', 0.14, 0);
    this.playTone(150, 0.28, 'sawtooth', 0.14, 0.14);
  }

  playCorrect() {
    this.playTone(523.25, 0.12, 'triangle', 0.14, 0);
    this.playTone(659.25, 0.12, 'triangle', 0.14, 0.09);
    this.playTone(783.99, 0.14, 'triangle', 0.14, 0.18);
    this.playTone(1046.5, 0.28, 'sine', 0.16, 0.27);
  }

  playVictory() {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((n, idx) => {
      this.playTone(n, idx === notes.length - 1 ? 0.45 : 0.14, 'triangle', 0.14, idx * 0.1);
    });
  }
}

export const soundFX = new SoundManager();
