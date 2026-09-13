// Maps the raw gaze signal (gx, gy in roughly -1..1, +x = right, +y = up) to a zone index.
// Without calibration it falls back to a fixed grid split; with calibration it uses the
// nearest per-zone centroid captured from the user.

const Calibration = {
  KEY: 'reach.calibration',
  cols: 5,
  rows: 1,
  zoneCount: 6,
  // Fraction of screen height above the bottom bar. Deliberately generous: vertical gaze
  // is much noisier than horizontal, so looking down must be unambiguous to hit the bar.
  cancelSplit: 0.75,
  // How far down from the tile row to put the bar boundary, as a fraction of the measured
  // separation. Biased towards the bar rather than the midpoint because vertical noise is
  // large and landing on cancel by accident costs a selection.
  barBias: 0.75,
  points: null,
  barSplit: null,
  noiseX: 0,
  noiseY: 0,
  // Diagnostics for why the bar is or is not reachable.
  barSeparation: 0,
  barRequired: 0,
  // Centre of the calibrated range, used as the resting point for drift compensation.
  originX: 0,
  originY: 0,

  get tileCount() {
    return this.zoneCount - 1;
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
    this.barSplit = null;
    try { localStorage.removeItem(this.KEY); } catch (e) { /* private mode */ }
  },

  get isCalibrated() {
    return !!(this.points && this.points.length === this.zoneCount && this.points.every(Boolean));
  },

  // The vertical threshold between the tile row and the bottom bar, derived from calibration.
  // Null means the vertical signal could not separate them reliably, in which case the bar is
  // reached by cancel wink or click instead.
  _derive() {
    this.barSplit = null;
    this.noiseX = 0;
    this.noiseY = 0;
    this.originX = 0;
    this.originY = 0;
    this.barSeparation = 0;
    this.barRequired = 0;
    if (!this.isCalibrated) return;

    const tiles = this.points.slice(0, this.tileCount);
    const bar = this.points[this.tileCount];
    this.noiseX = median(tiles.map((p) => p.sx || 0));
    this.noiseY = median(tiles.map((p) => p.sy || 0));
    this.originX = median(tiles.map((p) => p.gx));
    this.originY = median(tiles.map((p) => p.gy));

    const ys = tiles.map((p) => p.gy);
    const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
    const separation = meanY - bar.gy;

    // Looking down must move the signal further than the signal's own vertical noise,
    // otherwise no threshold exists that noise will not cross, and every tile would
    // intermittently drop onto the bar. When that is the case the vertical axis is ignored
    // entirely and the bar is reached by cancel wink or click instead.
    this.barSeparation = separation;
    this.barRequired = Math.max(0.08, 3 * this.noiseY);
    if (separation < this.barRequired) return;
    this.barSplit = meanY - separation * this.barBias;
  },

  // Classified one axis at a time, never as a 2D nearest centroid. In 2D the bar's centroid
  // is horizontally centred and, because the vertical signal is weak, only slightly below the
  // tile row -- so it steals the decision region of whichever middle tile it sits nearest.
  classify(gx, gy) {
    if (!this.isCalibrated) return this.gridClassify(gx, gy);
    if (this.barSplit != null && gy < this.barSplit) return this.tileCount;

    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.tileCount; i++) {
      const d = Math.abs(this.points[i].gx - gx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  },

  // Flags zones that calibration left hard or impossible to hit, which is what a single
  // unresponsive button looks like from the outside.
  quality(labels) {
    if (!this.isCalibrated) return [I18n.t('notCalibrated')];
    const name = (i) => (labels && labels[i]) || I18n.t('buttonFallback', i + 1);
    const xs = this.points.slice(0, this.tileCount).map((p) => p.gx);
    const issues = [];

    const gaps = [];
    for (let i = 1; i < xs.length; i++) gaps.push(xs[i] - xs[i - 1]);
    if (!gaps.length) return issues;

    const rising = gaps.filter((g) => g > 0).length;
    const dir = rising >= gaps.length - rising ? 1 : -1;
    gaps.forEach((g, i) => {
      if (g * dir <= 0) issues.push(I18n.t('orderReversed', name(i), name(i + 1)));
    });

    const widths = gaps.map(Math.abs);
    const meanWidth = widths.reduce((a, b) => a + b, 0) / widths.length;
    for (let i = 0; i < xs.length; i++) {
      const narrowest = Math.min(
        i > 0 ? widths[i - 1] : Infinity,
        i < widths.length ? widths[i] : Infinity
      );
      // Margin from this tile's centre to its nearest decision boundary.
      const margin = narrowest / 2;
      const needed = this.noiseX > 0 ? 2 * this.noiseX : meanWidth * 0.22;
      if (margin < needed) issues.push(I18n.t('rangeNarrow', name(i)));
    }

    if (this.barSplit == null) issues.push(I18n.t('barUnreachable'));
    return issues;
  },

  // The last zone is the full-width bar along the bottom, so the vertical decision is a
  // single coarse "am I looking down" test rather than an even split into bands.
  gridClassify(gx, gy) {
    const yNorm = 1 - (Math.max(-1, Math.min(1, gy)) + 1) / 2; // 0 = top
    const xNorm = (Math.max(-1, Math.min(1, gx)) + 1) / 2;     // 0 = left
    if (yNorm >= this.cancelSplit) return this.zoneCount - 1;
    const row = Math.min(this.rows - 1, Math.floor(yNorm / (this.cancelSplit / this.rows)));
    const col = Math.min(this.cols - 1, Math.floor(xNorm * this.cols));
    return Math.min(this.zoneCount - 2, row * this.cols + col);
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
