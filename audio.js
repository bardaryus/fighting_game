// audio.js - Audio Manager

class AudioManager {
    constructor() {
        this.ctx = (window.AudioContext || window.webkitAudioContext) ? new (window.AudioContext || window.webkitAudioContext)() : null;
    }

    playTone(freq, type, duration, vol) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.1, this.ctx.currentTime + duration);

        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playHit() {
        this.playTone(300, 'square', 0.2, 0.5);
    }

    playSwing() {
        this.playTone(150, 'sine', 0.15, 0.3);
    }

    playBlock() {
        this.playTone(400, 'triangle', 0.1, 0.4);
    }

    playKO() {
        this.playTone(100, 'sawtooth', 1.5, 0.6);
    }
}

const audio = new AudioManager();
