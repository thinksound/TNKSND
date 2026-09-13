const App = {
  settings: null,
  engine: null,
  pointer: null,
  webcam: null,
  tiles: [],
  fields: {},
  pendingTile: null,
  alertTimer: null,
  screen: 'start',

  init() {
    this.settings = Settings.load();
    this.normalizeSettings();
    I18n.lang = this.settings.uiLang === 'en' ? 'en' : 'ja';
    Actions.lang = this.settings.speechLang;
    this.engine = new SelectionEngine(this.settings);
    this.engine.onCancel = () => Actions.stopSpeech();

    this.buildBoard();
    this.buildSettings();
    this.bindChrome();

    this.renderStatic();
    document.getElementById('btn-start').addEventListener('click', () => this.start());

    this.pointer = new PointerInput(this.engine);
    this.pointer.start();
    this.showScreen('start');

    setInterval(() => this.updateDebug(), 150);
  },

  async start() {
    Actions.unlock();
    this.showScreen('board');
    if (this.settings.input === 'webcam') await this.startWebcam();
  },

  normalizeSettings() {
    // Wink/blink triggers were removed; migrate any saved value to a working one.
    if (this.settings.trigger === 'blink' || this.settings.trigger === 'wink') {
      this.settings.trigger = this.settings.input === 'webcam' ? 'dwell' : 'click';
    }
  },

  // ---- language ----

  tileLabel(tile) {
    return I18n.lang === 'en' && tile.labelEn ? tile.labelEn : tile.label;
  },

  tileText(tile) {
    return I18n.lang === 'en' && tile.textEn ? tile.textEn : tile.text;
  },

  tileConfirmText(tile) {
    if (I18n.lang === 'en' && tile.confirmTextEn) return tile.confirmTextEn;
    return tile.confirmText || I18n.t('confirmAsk', this.tileLabel(tile));
  },

  setUiLang(lang) {
    this.settings.uiLang = lang;
    I18n.lang = lang;
    // Match the spoken language to the display language; the Settings dropdown
    // can still override it afterwards.
    this.settings.speechLang = lang === 'en' ? 'en-US' : 'ja-JP';
    Actions.lang = this.settings.speechLang;
    Settings.save(this.settings);
    this.renderStatic();
    this.buildBoard();
    this.buildSettings();
  },

  renderStatic() {
    document.title = I18n.t('appName');
    document.documentElement.lang = I18n.lang;
    document.getElementById('btn-settings').textContent = I18n.t('settings');
    document.getElementById('btn-lang').textContent = I18n.lang === 'en' ? '日本語' : 'EN';
    document.querySelector('#screen-start h1').textContent = I18n.t('appName');
    document.getElementById('start-note').textContent = I18n.t('startNote');
    document.getElementById('btn-start').textContent = I18n.t('start');

    const yes = document.querySelector('.confirm-yes');
    yes.querySelector('.label').textContent = I18n.t('yes');
    yes.dataset.speak = I18n.t('yes');
    const no = document.querySelector('.confirm-no');
    no.querySelector('.label').textContent = I18n.t('no');
    no.dataset.speak = I18n.t('no');

    const stop = document.querySelector('#screen-message .zone');
    stop.querySelector('.label').textContent = I18n.t('stop');
    stop.dataset.speak = I18n.t('stop');

    document.querySelector('#screen-settings h2').textContent = I18n.t('settingsTitle');
    document.getElementById('btn-calibrate').textContent = I18n.t('calibrate');
    document.getElementById('btn-clear-cal').textContent = I18n.t('clearCal');
    document.getElementById('btn-close-settings').textContent = I18n.t('close');
    document.getElementById('btn-reset').textContent = I18n.t('resetDefaults');
    document.querySelector('#screen-settings .hint').innerHTML = I18n.t('settingsHint');
  },

  async startWebcam() {
    if (this.webcam) { this.webcam.stop(); this.webcam = null; }
    try {
      const webcam = new WebcamInput(this.engine, this.settings);
      await webcam.start();
      this.webcam = webcam;
      if (this.settings.trigger === 'click') {
        this.settings.trigger = 'dwell';
        Settings.save(this.settings);
        this.syncSettings();
      }
    } catch (e) {
      this.webcam = null;
      this.settings.input = 'pointer';
      this.normalizeSettings();
      Settings.save(this.settings);
      this.syncSettings();
      window.alert(I18n.t('cameraFailed', (e && e.message ? e.message : String(e))));
    }
  },

  async restartInput() {
    if (this.webcam) { this.webcam.stop(); this.webcam = null; }
    if (this.settings.input === 'webcam') await this.startWebcam();
  },

  // ---- board ----

  buildBoard() {
    const board = document.getElementById('board');
    const count = Math.max(3, Math.min(TILES.length, this.settings.tileCount || 5));
    const cols = count; // single row: left/right is by far the most reliable axis
    const rows = 1;

    board.style.setProperty('--cols', cols);
    board.style.setProperty('--rows', rows);
    board.textContent = '';

    this.rowTiles = TILES.slice(0, count);
    this.tiles = this.rowTiles; // every zone is a tile; the bottom bar is gone

    this.rowTiles.forEach((tile, i) => {
      const label = this.tileLabel(tile);
      const cls = 'zone tile' + (tile.type === 'alert' ? ' alert-tile' : '');
      board.appendChild(
        this.makeZone(cls, tile.icon, label, label, { tileIndex: String(i) })
      );
    });

    Calibration.setGrid(cols, rows, this.tiles.length);
    Calibration.load();
    if (this.screen === 'board') this.showScreen('board');
  },

  makeZone(className, icon, label, speak, data) {
    const el = document.createElement('div');
    el.className = className;
    el.dataset.speak = speak;
    Object.assign(el.dataset, data);
    const iconEl = document.createElement('span');
    iconEl.className = 'icon';
    iconEl.textContent = icon;
    const labelEl = document.createElement('span');
    labelEl.className = 'label';
    labelEl.textContent = label;
    el.append(iconEl, labelEl);
    return el;
  },

  showScreen(name) {
    this.stopAlert();
    Actions.stopSpeech();
    this.screen = name;

    document.querySelectorAll('.screen').forEach((s) => {
      s.classList.toggle('active', s.id === 'screen-' + name);
    });

    if (name === 'board') {
      const cancelIndex = this.tiles.findIndex((t) => t.type === 'cancel');
      this.engine.setZones(document.querySelectorAll('#board .zone'), (el) => this.onBoard(el),
        cancelIndex === -1 ? null : cancelIndex);
    } else if (name === 'confirm') {
      this.engine.setZones(document.querySelectorAll('#screen-confirm .zone'), (el) => this.onConfirm(el), 1);
    } else if (name === 'message') {
      this.engine.setZones(document.querySelectorAll('#screen-message .zone'), () => this.showScreen('board'), 0);
    } else {
      this.engine.setZones([], null, null);
    }
  },

  onBoard(el) {
    const tile = this.tiles[Number(el.dataset.tileIndex)];
    if (!tile) return;

    if (tile.confirm) {
      this.pendingTile = tile;
      document.getElementById('confirm-text').textContent = this.tileConfirmText(tile);
      this.showScreen('confirm');
      return;
    }
    this.runTile(tile);
  },

  onConfirm(el) {
    const tile = this.pendingTile;
    this.pendingTile = null;
    this.showScreen('board');
    if (el.dataset.action === 'yes' && tile) this.runTile(tile);
  },

  runTile(tile) {
    switch (tile.type) {
      case 'speak':
        Actions.speak(this.tileText(tile), this.settings.speechRate);
        break;
      case 'url':
        Actions.openUrl(tile.url);
        break;
      case 'call':
        Actions.call(tile.url);
        break;
      case 'alert':
        this.showAlert(tile);
        break;
      case 'cancel':
        Actions.stopSpeech();
        break;
    }
  },

  showAlert(tile) {
    const text = this.tileText(tile);
    document.getElementById('message-text').textContent = text;
    this.showScreen('message');
    Actions.speak(text, this.settings.speechRate);
    this.alertTimer = setInterval(
      () => Actions.speak(text, this.settings.speechRate),
      this.settings.alertRepeatMs
    );
  },

  stopAlert() {
    if (this.alertTimer) {
      clearInterval(this.alertTimer);
      this.alertTimer = null;
    }
  },

  // ---- settings ----

  buildSettings() {
    const host = document.getElementById('settings-fields');
    host.textContent = '';
    this.fields = {};

    for (const spec of SETTINGS_SPEC) {
      const row = document.createElement('div');
      row.className = 'field';

      const label = document.createElement('label');
      label.textContent = I18n.settingLabel(spec.key, spec.label);
      label.htmlFor = 'set-' + spec.key;

      const value = document.createElement('span');
      value.className = 'value';

      let input;
      if (spec.type === 'select') {
        input = document.createElement('select');
        for (const [optValue, optLabel] of spec.options) {
          const option = document.createElement('option');
          option.value = String(optValue);
          option.textContent = I18n.settingOption(spec.key, optValue, optLabel);
          input.appendChild(option);
        }
      } else if (spec.type === 'checkbox') {
        input = document.createElement('input');
        input.type = 'checkbox';
      } else {
        input = document.createElement('input');
        input.type = 'range';
        input.min = spec.min;
        input.max = spec.max;
        input.step = spec.step;
      }
      input.id = 'set-' + spec.key;
      input.addEventListener('input', () => this.onSettingChange(spec, input));

      row.append(label, input, value);
      host.appendChild(row);
      this.fields[spec.key] = { spec, input, value };
    }
    this.syncSettings();
  },

  syncSettings() {
    for (const key of Object.keys(this.fields)) {
      const { spec, input, value } = this.fields[key];
      const current = this.settings[key];
      if (spec.type === 'checkbox') {
        input.checked = !!current;
        value.textContent = current ? 'on' : 'off';
      } else {
        input.value = String(current);
        value.textContent = spec.type === 'select' ? '' : String(current);
      }
    }
  },

  onSettingChange(spec, input) {
    let value;
    if (spec.type === 'checkbox') value = input.checked;
    else if (spec.type === 'select') value = spec.number ? Number(input.value) : input.value;
    else value = Number(input.value);

    this.settings[spec.key] = value;
    this.normalizeSettings();
    if (spec.key === 'uiLang') {
      this.setUiLang(value === 'en' ? 'en' : 'ja');
      return;
    }
    Actions.lang = this.settings.speechLang;
    Settings.save(this.settings);
    // Let the user hear immediately that audio feedback works.
    if (spec.key === 'audioFeedback' && value) Actions.activateBeep();
    this.syncSettings();

    if (spec.rebuild) this.buildBoard();
    if (spec.restart) this.restartInput();
  },

  // ---- calibration ----

  async runCalibration() {
    Actions.unlock();
    if (this.settings.input !== 'webcam') {
      window.alert(I18n.t('needCameraForCal'));
      return;
    }
    // The webcam only starts when the Start button is tapped; calibration from
    // Settings must bring it up itself instead of demanding a restart.
    if (!this.webcam) await this.startWebcam();
    if (!this.webcam) return; // startWebcam already reported the camera error
    const banner = document.getElementById('cal-banner');
    const zones = Array.from(document.querySelectorAll('#board .zone'));
    const clearTargets = () => zones.forEach((z) => {
      z.classList.remove('cal-target');
      z.style.setProperty('--progress', 0);
    });

    this.showScreen('board');
    this.engine.setZones([], null);
    this.webcam.paused = true;
    banner.hidden = false;

    const ui = {
      prompt: (i) => {
        clearTargets();
        zones[i].classList.add('cal-target');
        banner.textContent = I18n.t('calStep', i + 1, zones.length, zones[i].dataset.speak);
      },
      progress: (p) => {
        const target = document.querySelector('#board .cal-target');
        if (target) target.style.setProperty('--progress', p);
      },
      done: () => {
        const issues = Calibration.quality(this.rowTiles.map((t) => this.tileLabel(t)));
        banner.textContent = issues.length
          ? I18n.t('calSavedWithIssues') + issues.join('  ·  ')
          : I18n.t('calSaved');
      },
      failed: (msg) => { banner.textContent = msg; },
    };

    try {
      await Calibration.run(this.webcam, ui);
    } finally {
      await wait(3200);
      clearTargets();
      banner.hidden = true;
      this.webcam.resetDrift();
      this.webcam.paused = false;
      this.showScreen('board');
    }
  },

  // ---- chrome, debug, escape hatches ----

  bindChrome() {
    document.getElementById('btn-settings').addEventListener('click', () => this.showScreen('settings'));
    document.getElementById('btn-close-settings').addEventListener('click', () => this.showScreen('board'));
    document.getElementById('btn-debug').addEventListener('click', () => this.toggleDebug());
    document.getElementById('btn-lang').addEventListener('click', () =>
      this.setUiLang(I18n.lang === 'en' ? 'ja' : 'en'));
    document.getElementById('btn-calibrate').addEventListener('click', () => this.runCalibration());

    document.getElementById('btn-clear-cal').addEventListener('click', () => {
      Calibration.clear();
      window.alert(I18n.t('calCleared'));
    });

    document.getElementById('btn-reset').addEventListener('click', () => {
      Object.assign(this.settings, DEFAULT_SETTINGS);
      Settings.save(this.settings);
      this.syncSettings();
      this.buildBoard();
      this.restartInput();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.showScreen('board');
      else if (e.key === 'd' && e.target === document.body) this.toggleDebug();
    });
  },

  toggleDebug() {
    const el = document.getElementById('debug');
    el.hidden = !el.hidden;
    document.body.classList.toggle('debug', !el.hidden);
  },

  updateDebug() {
    const el = document.getElementById('debug');
    if (el.hidden) return;
    const s = this.webcam ? this.webcam.state : null;
    const fmt = (v) => v.toFixed(2).padStart(5, ' ');

    const lines = [
      'input     ' + this.settings.input + '   signal ' + this.settings.signal
        + '   trigger ' + this.settings.trigger,
      'calib     ' + (Calibration.isCalibrated ? 'yes' : 'no (grid fallback)')
        + (Calibration.isCalibrated
          ? '   noise x ' + Calibration.noiseX.toFixed(2) + ' y ' + Calibration.noiseY.toFixed(2)
          : ''),
      'focus     ' + (this.engine.focus == null ? '-' : this.engine.focus)
        + '   votes ' + this.engine.samples.length
        + '   activations ' + this.engine.triggerCount,
    ];
    if (s) {
      lines.push(
        'face      ' + (s.ok ? 'yes' : 'NO ') + '   fps ' + s.fps,
        'point     x ' + fmt(s.gx) + '  y ' + fmt(s.gy),
        'drift     x ' + fmt(s.driftX) + '  y ' + fmt(s.driftY) + '   (raw x ' + fmt(s.rawX) + ')',
        'lid raw   L ' + fmt(s.blinkL) + '  R ' + fmt(s.blinkR),
        'lid base  L ' + fmt(s.baseL) + '  R ' + fmt(s.baseR),
        'lid delta L ' + fmt(s.dL) + '  R ' + fmt(s.dR) + '   closed above ' + this.settings.blinkDelta,
        'eyes      ' + (s.bothClosed ? 'BOTH CLOSED ' + Math.round(s.holdMs) + 'ms'
          : s.eyesClosed ? 'one closed' : 'open')
          + (s.frozen ? '   HIGHLIGHT HELD' : ''),
        'zone      ' + (s.zone == null ? '-' : s.zone) + '   activations ' + this.engine.triggerCount
      );
    }
    el.textContent = lines.join('\n');
    const issues = Calibration.isCalibrated
      ? Calibration.quality(this.rowTiles.map((t) => t.label))
      : [];
    if (issues.length) el.textContent += '\n! ' + issues.join('\n! ');
  },
};

App.init();
