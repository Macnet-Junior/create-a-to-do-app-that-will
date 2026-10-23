// audio-engine.js - Handles SpeechSynthesis (TTS) and Web Audio API ambient pads & chimes

class AudioEngine {
  constructor() {
    this.synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    this.currentUtterance = null;
    this.isPlayingTTS = false;
    this.isPausedTTS = false;
    this.voices = [];
    this.selectedVoice = null;
    this.rate = 0.95; // slightly relaxed natural pace
    this.pitch = 1.0;
    this.volume = 1.0;
    this.keepAliveTimer = null;

    // Web Audio Context for Chimes & Ambient pads
    this.audioCtx = null;
    this.ambientGain = null;
    this.ambientOscillators = [];
    this.isAmbientPlaying = false;
    this.ambientVolume = 0.25;

    // Listeners
    this.statusListeners = new Set();
    this.boundaryListeners = new Set();

    this.initVoices();
    this.setupKeepAlive();
  }

  setupKeepAlive() {
    // Chrome SpeechSynthesis bug workaround: keeps speech synthesis active during longer passages
    if (typeof window !== 'undefined') {
      setInterval(() => {
        if (this.synth && this.isPlayingTTS && !this.isPausedTTS) {
          try {
            this.synth.pause();
            this.synth.resume();
          } catch (_) {}
        }
      }, 10000);
    }
  }

  initVoices() {
    if (!this.synth) return;
    const updateVoices = () => {
      try {
        const allVoices = this.synth.getVoices();
        this.voices = allVoices.filter(v => v.lang.startsWith("en"));
        if (this.voices.length === 0) {
          this.voices = allVoices; // fallback to whatever voices are available
        }
        if (!this.selectedVoice && this.voices.length > 0) {
          // Prefer natural / premium English voices
          const preferred = this.voices.find(v => 
            /natural|neural|google|samantha|daniel|karen|moira|serena|oliver|arthur|guy|aria/i.test(v.name)
          );
          this.selectedVoice = preferred || this.voices[0];
        }
        this.notifyStatus();
      } catch (e) {
        console.warn("Could not retrieve voices:", e);
      }
    };

    updateVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = updateVoices;
    }
  }

  ensureAudioContext() {
    if (typeof window === 'undefined') return null;
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.audioCtx = new AudioCtx();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  // --- Web Audio Chime Sound (Gentle Temple / Crystal Bell Chime) ---
  playChime(type = 'verse') {
    try {
      const ctx = this.ensureAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;
      // Frequencies for an uplifting peaceful triad (D-F#-A-C#)
      const freqs = type === 'complete' 
        ? [523.25, 659.25, 783.99, 1046.5] // C Major chord for completed task
        : [293.66, 369.99, 440.00, 554.37, 880.00]; // Dmaj7 chord for divine verse notification

      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.0001, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.12 / freqs.length, now + idx * 0.08 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.00001, now + idx * 0.08 + 2.5);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 2.6);
      });
    } catch (err) {
      console.warn("Chime audio playback error:", err);
    }
  }

  // --- Peaceful Meditative Ambient Pad (Web Audio API synthesis) ---
  toggleAmbient(forceState) {
    const shouldPlay = forceState !== undefined ? forceState : !this.isAmbientPlaying;
    if (shouldPlay) {
      this.startAmbient();
    } else {
      this.stopAmbient();
    }
    return this.isAmbientPlaying;
  }

  startAmbient() {
    if (this.isAmbientPlaying) return;
    try {
      const ctx = this.ensureAudioContext();
      if (!ctx) return;

      this.ambientGain = ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0.001, ctx.currentTime);
      this.ambientGain.gain.linearRampToValueAtTime(this.ambientVolume, ctx.currentTime + 2.5);
      this.ambientGain.connect(ctx.destination);

      // Low pass filter for soft warm celestial tone
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(360, ctx.currentTime);
      filter.Q.setValueAtTime(1.8, ctx.currentTime);
      filter.connect(this.ambientGain);

      // Harmonic tones: D3, A3, F#4, C#5
      const chord = [146.83, 220.0, 369.99, 554.37];
      this.ambientOscillators = chord.map((f, i) => {
        const osc = ctx.createOscillator();
        osc.type = i % 2 === 0 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(f, ctx.currentTime);

        // subtle detune for warm chorus movement
        osc.detune.setValueAtTime((i - 1.5) * 4, ctx.currentTime);

        const oscGain = ctx.createGain();
        oscGain.gain.value = 0.22;
        osc.connect(oscGain);
        oscGain.connect(filter);
        osc.start();
        return osc;
      });

      this.isAmbientPlaying = true;
      this.notifyStatus();
    } catch (e) {
      console.warn("Ambient audio error:", e);
    }
  }

  stopAmbient() {
    if (!this.isAmbientPlaying) return;
    try {
      if (this.ambientGain && this.audioCtx) {
        this.ambientGain.gain.linearRampToValueAtTime(0.0001, this.audioCtx.currentTime + 1.2);
      }
      setTimeout(() => {
        this.ambientOscillators.forEach(osc => {
          try { osc.stop(); osc.disconnect(); } catch (_) {}
        });
        this.ambientOscillators = [];
        this.isAmbientPlaying = false;
        this.notifyStatus();
      }, 1300);
    } catch (e) {
      this.isAmbientPlaying = false;
      this.notifyStatus();
    }
  }

  setAmbientVolume(vol) {
    this.ambientVolume = Math.max(0, Math.min(1, vol));
    if (this.ambientGain && this.audioCtx && this.isAmbientPlaying) {
      this.ambientGain.gain.setValueAtTime(this.ambientVolume, this.audioCtx.currentTime);
    }
  }

  // --- Speech Synthesis (TTS) for Bible Verses & Full Chapters ---
  speak(text, options = {}) {
    if (!this.synth) {
      console.warn("SpeechSynthesis not supported on this browser.");
      if (options.onError) options.onError(new Error("Speech synthesis not supported"));
      return;
    }

    this.stopTTS();

    // Clean text of extra markdown/newlines
    const cleanText = text.replace(/[\n\r]+/g, " ").replace(/\s{2,}/g, " ").trim();
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    this.currentUtterance = utterance;

    if (this.selectedVoice) {
      utterance.voice = this.selectedVoice;
    }
    utterance.rate = options.rate || this.rate;
    utterance.pitch = options.pitch || this.pitch;
    utterance.volume = options.volume || this.volume;

    utterance.onstart = () => {
      this.isPlayingTTS = true;
      this.isPausedTTS = false;
      if (options.onStart) options.onStart();
      this.notifyStatus();
    };

    utterance.onend = () => {
      this.isPlayingTTS = false;
      this.isPausedTTS = false;
      this.currentUtterance = null;
      if (options.onEnd) options.onEnd();
      this.notifyStatus();
    };

    utterance.onerror = (err) => {
      console.warn("TTS Error/Canceled:", err);
      this.isPlayingTTS = false;
      this.isPausedTTS = false;
      this.currentUtterance = null;
      if (options.onError) options.onError(err);
      this.notifyStatus();
    };

    utterance.onboundary = (e) => {
      this.boundaryListeners.forEach(cb => cb(e));
      if (options.onBoundary) options.onBoundary(e);
    };

    this.ensureAudioContext();

    this.synth.speak(utterance);
    this.isPlayingTTS = true;
    this.isPausedTTS = false;
    this.notifyStatus();
  }

  pauseTTS() {
    if (this.synth && this.isPlayingTTS && !this.isPausedTTS) {
      this.synth.pause();
      this.isPausedTTS = true;
      this.notifyStatus();
    }
  }

  resumeTTS() {
    if (this.synth && this.isPausedTTS) {
      this.synth.resume();
      this.isPausedTTS = false;
      this.notifyStatus();
    }
  }

  stopTTS() {
    if (this.synth) {
      this.synth.cancel();
      this.isPlayingTTS = false;
      this.isPausedTTS = false;
      this.currentUtterance = null;
      this.notifyStatus();
    }
  }

  toggleTTS(text, options = {}) {
    if (this.isPlayingTTS) {
      if (this.isPausedTTS) {
        this.resumeTTS();
      } else {
        this.pauseTTS();
      }
    } else {
      this.speak(text, options);
    }
  }

  setRate(rate) {
    this.rate = parseFloat(rate);
  }

  setVoice(voiceName) {
    const v = this.voices.find(item => item.name === voiceName);
    if (v) {
      this.selectedVoice = v;
      this.notifyStatus();
    }
  }

  onStatusChange(cb) {
    this.statusListeners.add(cb);
    return () => this.statusListeners.delete(cb);
  }

  onBoundary(cb) {
    this.boundaryListeners.add(cb);
    return () => this.boundaryListeners.delete(cb);
  }

  notifyStatus() {
    const state = {
      isPlayingTTS: this.isPlayingTTS,
      isPausedTTS: this.isPausedTTS,
      isAmbientPlaying: this.isAmbientPlaying,
      voices: this.voices,
      selectedVoice: this.selectedVoice,
      rate: this.rate
    };
    this.statusListeners.forEach(cb => {
      try { cb(state); } catch (_) {}
    });
  }
}

export const audioEngine = new AudioEngine();
