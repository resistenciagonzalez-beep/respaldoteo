/**
 * Audio Synthesizer (Web Audio API) & Speech Engine (Web Speech API)
 * All sound effects are generated procedurally with zero external file dependencies.
 */

import { getSpanishNickname } from './bingoNicknames';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Procedural sound effects
export const sfx = {
  // Mechanical ball rattle / bounce inside the drum
  playBallRattle(volume = 0.5) {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'triangle';
    // Randomize pitch for realistic multiple-ball clatter
    const baseFreq = 700 + Math.random() * 800;
    osc.frequency.setValueAtTime(baseFreq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.4, ctx.currentTime + 0.05);

    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, ctx.currentTime);
    filter.Q.setValueAtTime(4, ctx.currentTime);

    gain.gain.setValueAtTime(volume * 0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.07);
  },

  // Suction / Ejection sound when a ball exits the cage
  playBallEject(volume = 0.6) {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Whoosh component
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(650, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume * 0.4, ctx.currentTime + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.25);

    // Pop clack
    setTimeout(() => {
      const popCtx = getAudioContext();
      if (!popCtx) return;
      const popOsc = popCtx.createOscillator();
      const popGain = popCtx.createGain();
      popOsc.type = 'triangle';
      popOsc.frequency.setValueAtTime(950, popCtx.currentTime);
      popOsc.frequency.exponentialRampToValueAtTime(320, popCtx.currentTime + 0.08);

      popGain.gain.setValueAtTime(volume * 0.5, popCtx.currentTime);
      popGain.gain.exponentialRampToValueAtTime(0.001, popCtx.currentTime + 0.09);

      popOsc.connect(popGain);
      popGain.connect(popCtx.destination);
      popOsc.start();
      popOsc.stop(popCtx.currentTime + 0.1);
    }, 120);
  },

  // Pleasant bell / chime when the ball is revealed on the big screen
  playRevealChime(volume = 0.5) {
    const ctx = getAudioContext();
    if (!ctx) return;

    const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5 major triad
    freqs.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + index * 0.04);

      const startTime = ctx.currentTime + index * 0.04;
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(volume * 0.35, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.6);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.65);
    });
  },

  // Victory fanfare / Bingo celebration
  playBingoFanfare(volume = 0.7) {
    const ctx = getAudioContext();
    if (!ctx) return;

    const notes = [
      { f: 523.25, d: 0.15, t: 0 },    // C5
      { f: 659.25, d: 0.15, t: 0.16 }, // E5
      { f: 783.99, d: 0.15, t: 0.32 }, // G5
      { f: 1046.50, d: 0.45, t: 0.48 },// C6
    ];

    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(note.f, ctx.currentTime + note.t);

      const startTime = ctx.currentTime + note.t;
      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(volume * 0.5, startTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + note.d);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + note.d + 0.05);
    });
  },

  // Soft UI click
  playClick() {
    const ctx = getAudioContext();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.04);
  }
};

// Web Speech API wrapper for Spanish Bingo announcer with natural masculine cheerful voice
export class BingoVoiceAnnouncer {
  private static synth: SpeechSynthesis | null =
    typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  private static availableVoices: SpeechSynthesisVoice[] = [];

  // Keywords to detect masculine voices in various operating systems / speech engines
  private static maleVoiceKeywords = [
    'alvaro',
    'jorge',
    'gonzalo',
    'diego',
    'carlos',
    'pablo',
    'manuel',
    'enrique',
    'raul',
    'mateo',
    'arnau',
    'david',
    'javier',
    'tomas',
    'miguel',
    'juan',
    'eddy',
    'pedro',
    'hombre',
    'male',
    'masculin',
  ];

  // Keywords for ultra-realistic neural / natural voices that eliminate robotic sound
  private static naturalKeywords = [
    'natural',
    'neural',
    'online',
    'google',
    'premium',
    'enhanced',
  ];

  // Known female voices to de-prioritize when masculine is requested
  private static femaleKeywords = [
    'monica',
    'paulina',
    'helena',
    'laura',
    'sabina',
    'elvira',
    'victoria',
    'dalia',
    'paloma',
    'lucia',
    'carmen',
    'marta',
    'soledad',
    'francisca',
    'female',
    'mujer',
    'femenin',
    'zira',
    'hazel',
  ];

  static init() {
    if (!this.synth) return;
    const updateVoices = () => {
      this.availableVoices = this.synth?.getVoices() || [];
    };
    updateVoices();
    if (this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = updateVoices;
    }
    // Re-check asynchronously in case voices load deferred
    if (typeof window !== 'undefined') {
      setTimeout(updateVoices, 250);
      setTimeout(updateVoices, 1200);
    }
  }

  static getSpanishVoices(): SpeechSynthesisVoice[] {
    if (!this.availableVoices.length && this.synth) {
      this.availableVoices = this.synth.getVoices();
    }
    return this.availableVoices.filter((v) => v.lang.toLowerCase().startsWith('es'));
  }

  static isMaleVoice(voice: SpeechSynthesisVoice): boolean {
    const name = voice.name.toLowerCase();
    const isFemale = this.femaleKeywords.some((f) => name.includes(f));
    if (isFemale) return false;
    return this.maleVoiceKeywords.some((m) => name.includes(m));
  }

  static isNaturalVoice(voice: SpeechSynthesisVoice): boolean {
    const name = voice.name.toLowerCase();
    return this.naturalKeywords.some((n) => name.includes(n));
  }

  // Returns the highest quality, most natural and cheerful masculine Spanish voice available
  static getBestCheerfulMaleVoice(): SpeechSynthesisVoice | null {
    const spanish = this.getSpanishVoices();
    if (spanish.length === 0) return null;

    const scored = spanish.map((v) => {
      const lowerName = v.name.toLowerCase();
      let score = 0;

      // Ultra-natural/Neural voice (eliminates robotic sound)
      if (this.naturalKeywords.some((k) => lowerName.includes(k))) {
        score += 650;
      }

      // Masculine voice
      if (this.maleVoiceKeywords.some((m) => lowerName.includes(m))) {
        score += 850;
      }

      // Demote female voices
      if (this.femaleKeywords.some((f) => lowerName.includes(f))) {
        score -= 500;
      }

      // Regional preferences with great bingo callers
      if (v.lang === 'es-ES' || v.lang === 'es-MX' || v.lang === 'es-US') {
        score += 80;
      }

      return { voice: v, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.voice || spanish[0];
  }

  // Returns Spanish voices sorted so natural cheerful masculine voices appear first
  static getSortedSpanishVoices(): {
    voice: SpeechSynthesisVoice;
    label: string;
    isMale: boolean;
    isNatural: boolean;
  }[] {
    const spanish = this.getSpanishVoices();
    const items = spanish.map((v) => {
      const isMale = this.isMaleVoice(v);
      const isNatural = this.isNaturalVoice(v);
      let label = v.name;
      if (isNatural && isMale) {
        label = `🌟 ${v.name} (Masculina Natural - Alegre)`;
      } else if (isMale) {
        label = `🎙️ ${v.name} (Voz Masculina)`;
      } else if (isNatural) {
        label = `✨ ${v.name} (Voz Natural)`;
      }

      const score =
        (isMale ? 850 : 0) +
        (isNatural ? 650 : 0) +
        (v.lang === 'es-ES' || v.lang === 'es-MX' ? 60 : 0);

      return {
        voice: v,
        label,
        isMale,
        isNatural,
        score,
      };
    });

    items.sort((a, b) => b.score - a.score);
    return items;
  }

  // Announces drawn number with cheerful, lively game show caller style
  static announceNumber(params: {
    number: number;
    letter?: string;
    mode: string;
    sayNicknames: boolean;
    volume: number;
    selectedVoiceName?: string;
  }) {
    if (!this.synth) return;

    if (this.synth.paused) {
      this.synth.resume();
    }
    this.synth.cancel();

    let textToSpeak = '';
    const nickname = params.sayNicknames ? getSpanishNickname(params.number) : null;

    // Cheerful game-show phrasing with natural exclamations for human-like inflection
    if (params.mode === '75' && params.letter) {
      if (nickname) {
        textToSpeak = `¡Letra ${params.letter}, el ${params.number}! ¡${nickname}!`;
      } else {
        textToSpeak = `¡Letra ${params.letter}! ¡El ${params.number}!`;
      }
    } else if (params.mode === '90') {
      // En modo 90 canta estrictamente el número, sin apodos ni nombres adicionales
      textToSpeak = `Número ${params.number}`;
    } else {
      textToSpeak = `Número ${params.number}`;
    }

    setTimeout(() => {
      if (!this.synth) return;
      if (this.synth.paused) {
        this.synth.resume();
      }

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'es-ES';
      utterance.volume = Math.max(0.2, Math.min(1, params.volume));

      // Resolve selected voice or optimal cheerful masculine voice
      let chosenVoice: SpeechSynthesisVoice | null = null;
      if (params.selectedVoiceName) {
        chosenVoice =
          this.availableVoices.find((v) => v.name === params.selectedVoiceName) || null;
      }
      if (!chosenVoice) {
        chosenVoice = this.getBestCheerfulMaleVoice();
      }

      if (chosenVoice) {
        utterance.voice = chosenVoice;
        utterance.lang = chosenVoice.lang || 'es-ES';
      }

      // Configure cheerful, masculine pitch & rate
      const isIdentifiedMale = chosenVoice ? this.isMaleVoice(chosenVoice) : false;
      const isNatural = chosenVoice ? this.isNaturalVoice(chosenVoice) : false;

      // Rate: brisk and cheerful (1.03 to 1.06)
      utterance.rate = isNatural ? 1.05 : 1.03;

      // Pitch:
      // If native male or natural: 0.98 - 1.0 for warm energetic resonance
      // If voice might be generic or robotic: lower to 0.88 - 0.92 to remove high metallic treble and give rich masculine depth
      utterance.pitch = isIdentifiedMale ? 0.98 : 0.90;

      this.synth.speak(utterance);
    }, 45);
  }

  // Sings and shouts BINGO with maximum enthusiasm, masculine energy, and celebration
  static singBingo(params: {
    rowLeader: number;
    drawnBall?: number;
    letter?: string;
    mode: string;
    volume?: number;
    selectedVoiceName?: string;
    playerName?: string;
  }) {
    if (!this.synth) return;

    if (this.synth.paused) {
      this.synth.resume();
    }
    this.synth.cancel();

    let prefix = '';
    if (params.drawnBall) {
      if (params.mode === '75' && params.letter) {
        prefix = `¡${params.letter}, ${params.drawnBall}! `;
      } else {
        prefix = `¡Número ${params.drawnBall}! `;
      }
    }

    const playerText = params.playerName ? ` de ${params.playerName}` : '';
    const textToSpeak = `${prefix}¡¡BINGO!! ¡¡TABLA COMPLETA!! ¡Atención señores, tenemos fila completada! ¡Fila del número ${params.rowLeader}${playerText} completada! ¡Muchísimas felicidades a todos!`;

    setTimeout(() => {
      if (!this.synth) return;
      if (this.synth.paused) {
        this.synth.resume();
      }

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = 'es-ES';
      utterance.volume = Math.max(0.3, Math.min(1, (params.volume ?? 0.95) * 1.15));

      let chosenVoice: SpeechSynthesisVoice | null = null;
      if (params.selectedVoiceName) {
        chosenVoice =
          this.availableVoices.find((v) => v.name === params.selectedVoiceName) || null;
      }
      if (!chosenVoice) {
        chosenVoice = this.getBestCheerfulMaleVoice();
      }

      if (chosenVoice) {
        utterance.voice = chosenVoice;
        utterance.lang = chosenVoice.lang || 'es-ES';
      }

      const isIdentifiedMale = chosenVoice ? this.isMaleVoice(chosenVoice) : false;
      const isNatural = chosenVoice ? this.isNaturalVoice(chosenVoice) : false;

      utterance.rate = isNatural ? 1.07 : 1.04;
      utterance.pitch = isIdentifiedMale ? 1.02 : 0.94;

      this.synth.speak(utterance);
    }, 60);
  }

  // Test speaking helper
  static speakText(text: string, volume = 0.95, voiceName?: string) {
    if (!this.synth) return;
    if (this.synth.paused) {
      this.synth.resume();
    }
    this.synth.cancel();

    setTimeout(() => {
      if (!this.synth) return;
      if (this.synth.paused) {
        this.synth.resume();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'es-ES';
      utterance.volume = volume;

      let chosenVoice: SpeechSynthesisVoice | null = null;
      if (voiceName) {
        chosenVoice = this.availableVoices.find((v) => v.name === voiceName) || null;
      }
      if (!chosenVoice) {
        chosenVoice = this.getBestCheerfulMaleVoice();
      }

      if (chosenVoice) {
        utterance.voice = chosenVoice;
        utterance.lang = chosenVoice.lang || 'es-ES';
      }

      const isIdentifiedMale = chosenVoice ? this.isMaleVoice(chosenVoice) : false;
      utterance.rate = 1.04;
      utterance.pitch = isIdentifiedMale ? 0.98 : 0.90;

      this.synth.speak(utterance);
    }, 45);
  }
}

BingoVoiceAnnouncer.init();
