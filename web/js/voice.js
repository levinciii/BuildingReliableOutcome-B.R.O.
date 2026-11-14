// Ears and mouth, using the browser's built-in speech features (no extra downloads).
// Listening works in Chrome and Edge. Note: Chrome sends the audio to Google's speech service to transcribe it.

const SpeechRecognitionCtor = () => window.SpeechRecognition || window.webkitSpeechRecognition;

export function cleanForSpeech(text, maxChars = 700) {
  let t = String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' The code is on your screen. ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/[#*_>|]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (maxChars && t.length > maxChars) {
    let cut = t.slice(0, maxChars);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    cut = end > maxChars / 2 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' '));
    t = `${cut} The rest is on your screen.`;
  }
  return t;
}

/** Long text is spoken in sentence-sized pieces (Chrome stops reading very long utterances). */
export function splitForSpeech(text, size = 180) {
  const pieces = [];
  let current = '';
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if ((current + ' ' + sentence).trim().length > size && current) {
      pieces.push(current.trim());
      current = sentence;
    } else {
      current = `${current} ${sentence}`;
    }
  }
  if (current.trim()) pieces.push(current.trim());
  return pieces;
}

export class Voice {
  /** callbacks: onFinal(text), onInterim(text), onState('listening'|'idle'), onError(message) */
  constructor(callbacks = {}) {
    this.cb = callbacks;
    this.rec = null;
    this.want = false;
    this.paused = false;
    this.restarts = [];
    this.cancelled = false;
    this.speaking = false;
    this.audioCtx = null;
  }

  static get canListen() {
    return Boolean(SpeechRecognitionCtor());
  }

  static get canSpeak() {
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  // ----- continuous listening (wake word / always modes)
  start() {
    if (!Voice.canListen) return false;
    this.want = true;
    this.restarts = [];
    this.spawn();
    return true;
  }

  stop() {
    this.want = false;
    this.kill();
    this.cb.onState?.('idle');
  }

  pause() {
    this.paused = true;
    this.kill();
  }

  resume() {
    this.paused = false;
    if (this.want) this.spawn();
  }

  kill() {
    const rec = this.rec;
    this.rec = null;
    if (!rec) return;
    rec.onend = null;
    rec.onresult = null;
    rec.onerror = null;
    try {
      rec.abort();
    } catch {
      /* already stopped */
    }
  }

  spawn() {
    if (this.rec || this.paused || !this.want) return;
    const Ctor = SpeechRecognitionCtor();
    const rec = new Ctor();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onstart = () => this.cb.onState?.('listening');
    rec.onresult = (event) => {
      this.restarts = [];
      let interim = '';
      let gotFinal = false;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) { this.cb.onFinal?.(result[0].transcript.trim()); gotFinal = true; }
        else interim += result[0].transcript;
      }
      if (!gotFinal || interim) this.cb.onInterim?.(interim.trim());
    };
    rec.onerror = (event) => this.handleError(event.error);
    rec.onend = () => {
      if (this.rec === rec) this.rec = null;
      if (!this.want || this.paused) return;
      // Browsers end the session after a while; start it again. Give up if it keeps failing.
      const now = Date.now();
      this.restarts = this.restarts.filter((t) => now - t < 10_000);
      this.restarts.push(now);
      if (this.restarts.length > 8) {
        this.want = false;
        this.cb.onState?.('idle');
        this.cb.onError?.('Listening keeps stopping. Check your microphone, then click the mic to try again.');
        return;
      }
      setTimeout(() => this.spawn(), 300);
    };
    this.rec = rec;
    try {
      rec.start();
    } catch {
      this.rec = null;
    }
  }

  handleError(error) {
    if (error === 'not-allowed' || error === 'service-not-allowed') {
      this.want = false;
      this.kill();
      this.cb.onState?.('idle');
      this.cb.onError?.('Microphone access is blocked. Allow the microphone for this site in your browser, then try again.');
    } else if (error === 'audio-capture') {
      this.want = false;
      this.kill();
      this.cb.onState?.('idle');
      this.cb.onError?.('No microphone was found. Plug one in or pick another input in your system settings.');
    } else if (error === 'network') {
      this.cb.onError?.("The browser's speech service couldn't be reached. Check your internet connection.");
    }
    // 'no-speech' and 'aborted' are normal and handled by the restart in onend.
  }

  // ----- one sentence (push-to-talk mode)
  listenOnce() {
    return new Promise((resolve) => {
      const Ctor = SpeechRecognitionCtor();
      if (!Ctor) return resolve('');
      const rec = new Ctor();
      rec.lang = 'en-US';
      rec.continuous = false;
      rec.interimResults = true;
      let heard = '';
      rec.onstart = () => this.cb.onState?.('listening');
      rec.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) heard += result[0].transcript;
          else interim += result[0].transcript;
        }
        this.cb.onInterim?.(interim.trim());
      };
      rec.onerror = (event) => this.handleError(event.error);
      rec.onend = () => {
        this.cb.onState?.('idle');
        resolve(heard.trim());
      };
      this.onceRec = rec;
      try {
        rec.start();
      } catch {
        resolve('');
      }
    });
  }

  cancelOnce() {
    try {
      this.onceRec?.abort();
    } catch {
      /* nothing to cancel */
    }
  }

  // ----- speaking
  voices() {
    return Voice.canSpeak ? window.speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)) : [];
  }

  async speak(text, { rate = 1, voiceURI = '' } = {}) {
    if (!Voice.canSpeak || !text) return;
    this.cancelSpeech();
    this.cancelled = false;
    this.speaking = true;
    const voice = window.speechSynthesis.getVoices().find((v) => v.voiceURI === voiceURI);
    for (const piece of splitForSpeech(text)) {
      if (this.cancelled) break;
      await this.utter(piece, voice, rate);
    }
    this.speaking = false;
  }

  utter(text, voice, rate) {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      if (voice) utterance.voice = voice;
      utterance.rate = rate;
      let done = false;
      // A safety timer: some browsers never fire "end" when no voice is installed.
      const timer = setTimeout(() => finish(), Math.max(4000, text.length * 130));
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve();
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      window.speechSynthesis.speak(utterance);
    });
  }

  cancelSpeech() {
    this.cancelled = true;
    if (Voice.canSpeak) window.speechSynthesis.cancel();
    this.speaking = false;
  }

  /** A short beep so you know B.R.O. heard its name. */
  beep(frequency = 880, ms = 110) {
    try {
      this.audioCtx = this.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.frequency.value = frequency;
      gain.gain.value = 0.06;
      osc.connect(gain).connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + ms / 1000);
    } catch {
      /* no audio output: skip the beep */
    }
  }
}
