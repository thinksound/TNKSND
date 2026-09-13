const Actions = {
  ctx: null,
  lang: 'ja-JP',

  // Must be called from a user gesture: unlocks WebAudio and speech on iOS/Safari.
  unlock() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC && !this.ctx) this.ctx = new AC();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { /* no audio */ }
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    }
  },

  tone(freq, ms, gain) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.frequency.value = freq;
    osc.type = 'sine';
    amp.gain.value = gain;
    osc.connect(amp).connect(this.ctx.destination);
    const t = this.ctx.currentTime;
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    osc.start(t);
    osc.stop(t + ms / 1000 + 0.02);
  },

  focusBeep() { this.tone(620, 55, 0.04); },
  activateBeep() { this.tone(940, 130, 0.09); },

  speak(text, rate) {
    if (!('speechSynthesis' in window) || !text) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate || 1;
    // Without an explicit language the browser reads Japanese with an English voice.
    u.lang = this.lang;
    speechSynthesis.speak(u);
  },

  stopSpeech() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  },

  openUrl(url) {
    window.open(url, '_blank', 'noopener');
  },

  call(url) {
    window.location.href = url;
  },
};
