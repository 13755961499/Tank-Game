/**
 * 音效管理类
 * 使用 Web Audio API 生成合成音效，无需外部音频文件
 */
const AudioManager = {
    ctx: null,
    bgmGain: null,
    bgmIntervalId: null,
    bgmNextNoteTime: 0,
    bgmStep: 0,
    bgmVolume: 0.12,
    bgmUrl: '',
    bgmAudio: null,

    init() {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
            return;
        }
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

    setBGMFile(url) {
        const nextUrl = typeof url === 'string' ? url.trim() : '';
        this.bgmUrl = nextUrl;
        if (!nextUrl) {
            this.bgmAudio = null;
            return;
        }
        if (!this.bgmAudio) this.bgmAudio = new Audio();
        this.bgmAudio.preload = 'auto';
        this.bgmAudio.loop = true;
        this.bgmAudio.src = encodeURI(nextUrl);
        this.bgmAudio.volume = this.bgmVolume;
    },

    startBGM() {
        if (this.bgmAudio && this.bgmUrl) {
            const p = this.bgmAudio.play();
            if (p && typeof p.catch === 'function') {
                p.catch(() => {
                    if (this.ctx) this._startSynthBGM();
                });
            }
            return;
        }
        if (!this.ctx) return;
        this._startSynthBGM();
    },

    _startSynthBGM() {
        if (this.bgmIntervalId) return;
        if (!this.bgmGain) {
            this.bgmGain = this.ctx.createGain();
            this.bgmGain.connect(this.ctx.destination);
        }
        this.bgmGain.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);
        this.bgmStep = 0;
        this.bgmNextNoteTime = this.ctx.currentTime + 0.05;
        this.bgmIntervalId = setInterval(() => this._bgmScheduler(), 50);
    },

    stopBGM() {
        if (this.bgmAudio) {
            this.bgmAudio.pause();
            return;
        }
        if (this.bgmIntervalId) {
            clearInterval(this.bgmIntervalId);
            this.bgmIntervalId = null;
        }
        if (this.ctx && this.bgmGain) {
            const t = this.ctx.currentTime;
            const v = this.bgmGain.gain.value;
            this.bgmGain.gain.cancelScheduledValues(t);
            this.bgmGain.gain.setValueAtTime(v, t);
            this.bgmGain.gain.linearRampToValueAtTime(0, t + 0.2);
        }
    },

    setBGMVolume(volume) {
        const v = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : this.bgmVolume;
        this.bgmVolume = v;
        if (this.bgmAudio) this.bgmAudio.volume = v;
        if (this.ctx && this.bgmGain) {
            this.bgmGain.gain.setValueAtTime(v, this.ctx.currentTime);
        }
    },

    _bgmScheduler() {
        if (!this.ctx || !this.bgmGain) return;
        if (this.ctx.state !== 'running') return;
        const lookAhead = 0.25;
        const stepDur = 0.25;
        const now = this.ctx.currentTime;
        while (this.bgmNextNoteTime < now + lookAhead) {
            this._scheduleBGMStep(this.bgmStep, this.bgmNextNoteTime, stepDur);
            this.bgmNextNoteTime += stepDur;
            this.bgmStep++;
        }
    },

    _scheduleBGMStep(step, time, dur) {
        const s = step % 32;
        const root = 48;
        const bassPattern = [0, 0, 0, 0, 5, 5, 5, 5, 3, 3, 3, 3, 7, 7, 7, 7];
        const leadPattern = [0, 3, 7, 10, 7, 3, 0, 3, 7, 10, 12, 10, 7, 3, 0, 3];
        const bassMidi = root + bassPattern[s % bassPattern.length];
        const leadMidi = root + 12 + leadPattern[s % leadPattern.length];

        if ((s % 2) === 0) this._bgmNote(bassMidi, time, dur * 0.95, 0.6, 'sine');
        const accent = (s % 8) === 0 ? 1 : 0.85;
        this._bgmNote(leadMidi, time, dur * 0.6, 0.35 * accent, 'triangle');
    },

    _bgmNote(midi, time, duration, level, type) {
        const freq = 440 * Math.pow(2, (midi - 69) / 12);
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, time);
        osc.frequency.setValueAtTime(freq, time + 0.001);

        const a = Math.min(0.01, duration * 0.2);
        const d = Math.min(0.06, duration * 0.6);
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(level, time + a);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + a + d);

        osc.connect(gain);
        gain.connect(this.bgmGain);

        osc.start(time);
        osc.stop(time + duration);
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
