// Zone highlight + trigger state machine. Knows nothing about where its input comes from.
//
// Input sources call: setFocus(index) / fireTrigger() / setTriggerProgress(0..1).
// The 'dwell' trigger is generated here from zone stability, so switching between
// click and dwell is a settings change and nothing else.

class SelectionEngine {
  constructor(settings) {
    this.settings = settings;
    this.zones = [];
    this.onActivate = null;
    this.onFocusChange = null;
    this.onCancel = null;
    this.enabled = true;
    this.cancelIndex = null;

    this.focus = null;
    this.focusSince = 0;
    this.samples = [];
    this.triggerProgress = 0;
    this.cancelProgress = 0;
    this.lastTriggerAt = -Infinity;
    this.triggerCount = 0;
    this.armed = true;

    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  // cancelIndex marks the zone that a cancel gesture activates. Every screen designates one
  // (none on the board, NO on the confirm screen, STOP on the alert screen), so a cancel
  // does the right thing everywhere without any screen-specific handling.
  setZones(elements, onActivate, cancelIndex) {
    this.clearFocus();
    this.zones = Array.from(elements);
    this.onActivate = onActivate;
    this.cancelIndex =
      cancelIndex == null || cancelIndex < 0 || cancelIndex >= this.zones.length ? null : cancelIndex;
    this.lastTriggerAt = performance.now();
    this.armed = true;
  }

  clearFocus() {
    this.zones.forEach((el, i) => this._render(i, 0, false));
    this.focus = null;
    this.samples.length = 0;
    this.triggerProgress = 0;
    this.cancelProgress = 0;
  }

  setFocus(index, immediate) {
    if (index != null && (index < 0 || index >= this.zones.length)) index = null;
    if (immediate) {
      this.samples.length = 0;
      this._commitFocus(index);
      return;
    }
    this.samples.push({ t: performance.now(), zone: index });
  }

  setTriggerProgress(p) {
    if (this.settings.trigger === 'dwell') return;
    this.triggerProgress = Math.max(0, Math.min(1, p));
  }

  setCancelProgress(p) {
    this.cancelProgress = Math.max(0, Math.min(1, p));
  }

  fireTrigger() {
    this._activate(this.focus);
  }

  // Prefers a designated cancel zone, but falls back to onCancel so a board without a
  // cancel zone still has a working cancel gesture.
  fireCancel() {
    if (this.cancelIndex != null) {
      this._activate(this.cancelIndex);
      return;
    }
    if (this.onCancel && this._gate()) this.onCancel();
  }

  _activate(index) {
    if (index == null || !this.zones[index]) return;
    if (!this._gate()) return;
    if (this.onActivate) this.onActivate(this.zones[index], index);
  }

  _gate() {
    if (!this.enabled) return false;
    const now = performance.now();
    const refractory = this.settings.trigger === 'click' ? 250 : this.settings.refractoryMs;
    if (now - this.lastTriggerAt < refractory) return false;

    this.lastTriggerAt = now;
    this.focusSince = now;
    this.triggerProgress = 0;
    this.cancelProgress = 0;
    this.triggerCount++;
    this.armed = false;
    if (this.settings.audioFeedback) Actions.activateBeep();
    return true;
  }

  _commitFocus(index) {
    if (index === this.focus) return;
    if (this.focus != null) this._render(this.focus, 0, false);
    this.focus = index;
    this.focusSince = performance.now();
    this.triggerProgress = 0;
    this.armed = true;
    if (index != null) {
      this._render(index, 0, true);
      if (this.settings.audioFeedback) Actions.focusBeep();
      if (this.settings.speakOnFocus) {
        const el = this.zones[index];
        Actions.speak(el.dataset.speak || el.textContent.trim(), this.settings.speechRate);
      }
    }
    if (this.onFocusChange) this.onFocusChange(index);
  }

  // Plurality vote over a sliding window, with ties going to the incumbent. A contiguous
  // stability timer would be reset forever by a signal flickering between two zones, which
  // froze focus indefinitely; a vote always resolves as soon as one zone leads.
  _voteFocus(t) {
    const samples = this.samples;
    // Keep at least the newest sample, so a zero-length window means "follow immediately"
    // rather than "never update".
    while (samples.length > 1 && t - samples[0].t > this.settings.zoneHysteresisMs) samples.shift();
    if (!samples.length) return;

    const counts = new Map();
    for (const s of samples) counts.set(s.zone, (counts.get(s.zone) || 0) + 1);

    let winner = this.focus;
    let winnerCount = counts.get(this.focus) || 0;
    for (const [zone, count] of counts) {
      if (count > winnerCount) {
        winnerCount = count;
        winner = zone;
      }
    }
    if (winner !== this.focus) this._commitFocus(winner);
  }

  _loop(t) {
    requestAnimationFrame(this._loop);

    this._voteFocus(t);

    if (this.enabled && this.settings.trigger === 'dwell' && this.focus != null) {
      // Dwell only re-arms once focus moves, so holding a gaze does not fire repeatedly.
      if (this.armed && t - this.lastTriggerAt >= this.settings.refractoryMs) {
        this.triggerProgress = Math.min(1, (t - this.focusSince) / this.settings.dwellMs);
        if (this.triggerProgress >= 1) this.fireTrigger();
      } else {
        this.triggerProgress = 0;
      }
    }

    if (this.focus != null) this._render(this.focus, this.triggerProgress, true);
    if (this.cancelIndex != null && this.cancelIndex !== this.focus) {
      this._render(this.cancelIndex, this.cancelProgress, false);
    }
  }

  _render(index, progress, focused) {
    const el = this.zones[index];
    if (!el) return;
    el.classList.toggle('focused', !!focused);
    el.style.setProperty('--progress', progress);
  }
}
