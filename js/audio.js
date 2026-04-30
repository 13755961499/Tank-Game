/**
 * 音效管理类
 * 使用 Web Audio API 生成合成音效，无需外部音频文件
 */
const AudioManager = {
    ctx: null,

    init() {
        try {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    },

    /**
     * 播放射击音效
     */
    playShoot() {
        if (!this.ctx) return;
        this._playSound(440, 'triangle', 0.1, 0.2);
    },

    /**
     * 播放爆炸音效
     */
    playExplosion() {
        if (!this.ctx) return;
        this._playNoise(0.3);
    },

    /**
     * 播放撞墙音效
     */
    playHit() {
        if (!this.ctx) return;
        this._playSound(100, 'square', 0.05, 0.1);
    },

    _playSound(freq, type, duration, volume) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(10, this.ctx.currentTime + duration);
        
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },

    _playNoise(duration) {
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
        
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        
        noise.start();
    }
};
