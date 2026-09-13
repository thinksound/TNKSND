// Maps the raw gaze signal (gx, gy in roughly -1..1, +x = right, +y = up) to a
// zone index. Classification uses one axis only — the axis the buttons are laid
// out along — because the other axis is too noisy to separate zones. In landscape
// the buttons sit side by side and the horizontal axis is used; in portrait
// (e.g. an iPhone held upright) the buttons stack vertically (see the CSS media
// query) and the vertical axis is used instead. Without calibration it falls back
// to an even split; with calibration it uses the nearest per-zone centroid.

const Calibration = {
  KEY: 'reach.calibration',
  cols: 5,
  rows: 1,
  zoneCount: 5,
  points: null,
  noiseX: 0,
  noiseY: 0,
  // Centre of the calibrated range, used as the resting point for drift compensation.
  originX: 0,
  originY: 0,

  // True when the buttons are stacked vertically (portrait screen).
  isPortrait() {
    return window.matchMedia('(orientation: portrait)').matches;
  },

  setGrid(cols, rows, zoneCount) {
    this.cols = cols;
    this.rows = rows;
    this.zoneCount = zoneCount;
    if (this.points && this.points.length !== zoneCount) this.points = null;
  },

  load() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.KEY) || 'null');
      if (raw && Array.isArray(raw.points)) {
        this.points = raw.points;
        if (raw.zoneCount && raw.zoneCount !== this.zoneCount) this.points = null;
      }
    } catch (e) {
      this.points = null;
    }
    this._derive();
    return this.points;
  },

  save() {
    this._derive();
    try {
      localStorage.setItem(this.KEY, JSON.stringify({
        zoneCount: this.zoneCount,
        points: this.points,
        savedAt: Date.now(),
      }));
    } catch (e) { /* private mode */ }
  },

  clear() {
    this.points = null;
    try { localStorage.removeItem(this.KEY); } catch (e) { /* private mode */ }
  },

  get isCalibrated() {
    return !!(this.points && this.points.length === this.zoneCount && this.points.every(Boolean));
  },

  // Derives per-axis noise estimates and the neutral origin from calibration.
  _derive() {
    this.noiseX = 0;
    this.noiseY = 0;
    this.originX = 0;
    this.originY = 0;
    if (!this.isCalibrated) return;

    const points = this.points;
    this.noiseX = median(points.map((p) => p.sx || 0));
    this.noiseY = median(points.map((p) => p.sy || 0));
    this.originX = median(points.map((p) => p.gx));
    this.originY = median(points.map((p) => p.gy));
  },

  // Single-axis classification along the button layout: nearest calibrated
  // centroid on that axis. The off axis is deliberately ignored.
  classify(gx, gy) {
    if (!this.isCalibrated) return this.gridClassify(gx, gy);
    const vertical = this.isPortrait();
    const v = vertical ? gy : gx;
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.zoneCount; i++) {
      const c = vertical ? this.points[i].gy : this.points[i].gx;
      const d = Math.abs(c - v);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  },

  // Confirm screen: two zones (はい then いいえ), side by side in landscape and
  // stacked in portrait. The board's classify() maps beyond index 1, which is out
  // of range for a 2-zone screen and left いいえ unfocusable, so split the
  // calibrated span down the middle instead.
  confirmClassify(gx, gy) {
    const vertical = this.isPortrait();
    if (!this.isCalibrated || this.zoneCount < 2) {
      return vertical ? (gy < 0 ? 1 : 0) : (gx < 0 ? 0 : 1);
    }
    const vals = this.points.map((p) => (vertical ? p.gy : p.gx));
    const mid = (Math.min.apply(null, vals) + Math.max.apply(null, vals)) / 2;
    // Portrait: はい is on top (zone 0), いいえ below (zone 1).
    const v = vertical ? gy : gx;
    return vertical ? (v < mid ? 1 : 0) : (v < mid ? 0 : 1);
  },

  // Flags zones that calibration left hard or impossible to hit, which is what a single
  // unresponsive button looks like from the outside.
  quality(labels) {
    if (!this.isCalibrated) return [I18n.t('notCalibrated')];
    const name = (i) => (labels && labels[i]) || I18n.t('buttonFallback', i + 1);
    const vertical = this.isPortrait();
    const vals = this.points.map((p) => (vertical ? p.gy : p.gx));
    const issues = [];

    const gaps = [];
    for (let i = 1; i < vals.length; i++) gaps.push(vals[i] - vals[i - 1]);
    if (!gaps.length) return issues;

    const rising = gaps.filter((g) => g > 0).length;
    const dir = rising >= gaps.length - rising ? 1 : -1;
    gaps.forEach((g, i) => {
      if (g * dir <= 0) issues.push(I18n.t('orderReversed', name(i), name(i + 1)));
    });

    const widths = gaps.map(Math.abs);
    const meanWidth = widths.reduce((a, b) => a + b, 0) / widths.length;
    for (let i = 0; i < vals.length; i++) {
      const narrowest = Math.min(
        i > 0 ? widths[i - 1] : Infinity,
        i < widths.length ? widths[i] : Infinity
      );
      // Margin from this tile's centre to its nearest decision boundary.
      const margin = narrowest / 2;
      const needed = this.noiseX > 0 ? 2 * this.noiseX : meanWidth * 0.22;
      if (margin < needed) issues.push(I18n.t('rangeNarrow', name(i)));
    }

    return issues;
  },

  // Uncalibrated fallback: split the layout axis evenly.
  gridClassify(gx, gy) {
    if (this.isPortrait()) {
      // Zone 0 is at the top; +y = up.
      const yNorm = (Math.max(-1, Math.min(1, gy)) + 1) / 2; // 0 = bottom, 1 = top
      return Math.min(this.cols - 1, Math.floor((1 - yNorm) * this.cols));
    }
    const xNorm = (Math.max(-1, Math.min(1, gx)) + 1) / 2; // 0 = left
    return Math.min(this.cols - 1, Math.floor(xNorm * this.cols));
  },

  // ui: { prompt(zoneIndex), progress(0..1), done(ok), failed(msg) }
  async run(webcam, ui, opts) {
    const settleMs = (opts && opts.settleMs) || 1200;
    const sampleMs = (opts && opts.sampleMs) || 1400;
    const points = [];

    for (let zone = 0; zone < this.zoneCount; zone++) {
      ui.prompt(zone);
      await wait(settleMs);

      const samples = [];
      const start = performance.now();
      while (performance.now() - start < sampleMs) {
        const s = webcam.state;
        if (s.ok && !s.eyesClosed) samples.push({ gx: s.gx, gy: s.gy });
        ui.progress((performance.now() - start) / sampleMs);
        await wait(30);
      }
      ui.progress(0);

      if (samples.length < 5) {
        ui.failed(I18n.t('calNoFace'));
        return false;
      }
      const gxs = samples.map((s) => s.gx);
      const gys = samples.map((s) => s.gy);
      // Per-zone spread is kept, not just the centre: it is the only measure of how noisy
      // this signal actually is, and every later decision about separability depends on it.
      points.push({
        gx: median(gxs),
        gy: median(gys),
        sx: stdev(gxs),
        sy: stdev(gys),
      });
    }

    this.points = points;
    this.save();
    ui.done(true);
    return true;
  },
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function median(values) {
  const v = values.slice().sort((a, b) => a - b);
  const mid = v.length >> 1;
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function stdev(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}
