// Japanese / English UI strings for リーチ (Reach).
//
// I18n.lang is 'ja' (default) or 'en'. App sets it from settings.uiLang at startup
// and whenever the display language changes. Every user-facing string goes through
// this table; the behavior code in config.js, main.js and calibrate.js is untouched.

const I18n = {
  lang: 'ja',

  STR: {
    ja: {
      appName: 'リーチ',
      settings: '設定',
      start: 'はじめる',
      startNote: 'ボタンを見て（または頭を向けて）選び、決定します。'
        + 'マウスとタッチはいつでも使えます。'
        + 'カメラを使うには http://localhost で開いてください。'
        + 'Esc キーでいつでもこの画面にもどれます。',
      yes: 'はい',
      no: 'いいえ',
      stop: 'とめる',
      settingsTitle: '設定',
      calibrate: 'キャリブレーション',
      clearCal: 'キャリブレーションを消す',
      resetDefaults: '初期設定にもどす',
      close: '閉じる',
      settingsHint: 'カメラを使うには <code>http://localhost</code> で開く必要があります'
        + '（<code>file://</code> ではブラウザがカメラをブロックします)。'
        + 'このフォルダで <code>python3 -m http.server</code> を実行してください。'
        + '<kbd>Esc</kbd> でいつでもボードにもどれます。',
      needCameraForCal: 'キャリブレーションにはカメラが必要です。設定の「入力」を「カメラ」にしてください。',
      calCleared: 'キャリブレーションを消しました。決まった位置での判定にもどります。',
      calStep: (i, n, name) => `キャリブレーション ${i} / ${n} — 見てください: ${name}`,
      calSaved: 'キャリブレーションを保存しました。すべてのボタンがよく分かれています。',
      calSavedWithIssues: '保存しました。ただし: ',
      calNoFace: '顔を検出できませんでした。キャリブレーションを中止します。',
      cameraFailed: (msg) => 'カメラを開始できませんでした:\n\n' + msg
        + '\n\nマウス／タッチに切りかえます。ファイルを直接開いている場合は、'
        + 'このフォルダで python3 -m http.server を実行し、http://localhost から開いてください。'
        + '（file:// ではブラウザがカメラをブロックします）',
      confirmAsk: (label) => `「${label}」を実行しますか？`,
      notCalibrated: '未キャリブレーション',
      buttonFallback: (i) => 'ボタン ' + (i + 1),
      orderReversed: (a, b) => `${a} と ${b} の順番が逆です`,
      rangeNarrow: (a) => `${a} の範囲が狭いです`,
      barUnreachable: '下のバーには頭の動きで届きません',
    },
    en: {
      appName: 'Reach',
      settings: 'Settings',
      start: 'Start',
      startNote: 'Look at a button (or turn your head toward it) to highlight it, then confirm. '
        + 'Mouse and touch work anytime. '
        + 'To use the camera, open this page from http://localhost. '
        + 'Press Esc to return to this screen anytime.',
      yes: 'Yes',
      no: 'No',
      stop: 'Stop',
      settingsTitle: 'Settings',
      calibrate: 'Calibrate',
      clearCal: 'Clear calibration',
      resetDefaults: 'Reset to defaults',
      close: 'Close',
      settingsHint: 'To use the camera, open this page from <code>http://localhost</code> '
        + '(browsers block the camera on <code>file://</code>). '
        + 'Run <code>python3 -m http.server</code> in this folder. '
        + 'Press <kbd>Esc</kbd> to return to the board anytime.',
      needCameraForCal: 'Calibration needs the camera. In Settings, set “Input” to “Camera” first.',
      calCleared: 'Calibration cleared. Falling back to fixed positions.',
      calStep: (i, n, name) => `Calibration ${i} / ${n} — look at: ${name}`,
      calSaved: 'Calibration saved. All buttons are well separated.',
      calSavedWithIssues: 'Saved, but note: ',
      calNoFace: 'Could not detect a face. Calibration aborted.',
      cameraFailed: (msg) => 'Could not start the camera:\n\n' + msg
        + '\n\nSwitching to mouse / touch. If you opened the file directly, '
        + 'run python3 -m http.server in this folder and open it from http://localhost. '
        + '(Browsers block the camera on file://.)',
      confirmAsk: (label) => `Do “${label}”?`,
      notCalibrated: 'Not calibrated',
      buttonFallback: (i) => 'Button ' + (i + 1),
      orderReversed: (a, b) => `${a} and ${b} are in reverse order`,
      rangeNarrow: (a) => `${a} has a narrow range`,
      barUnreachable: 'The bottom bar cannot be reached by head motion',
    },
  },

  // Settings-screen labels, keyed by setting key.
  SETTING_LABEL: {
    uiLang:           { ja: '表示の言語', en: 'Display language' },
    signal:           { ja: '操作のしかた', en: 'How to point' },
    input:            { ja: '入力', en: 'Input' },
    trigger:          { ja: '決定のしかた', en: 'How to select' },
    tileCount:        { ja: '横に並べるボタンの数', en: 'Number of buttons' },
    maxFreezeMs:      { ja: '選択が止まる上限 (ms)', en: 'Max highlight freeze (ms)' },
    dwellMs:          { ja: '見つめる時間 (ms)', en: 'Dwell time (ms)' },
    refractoryMs:     { ja: '連続入力を防ぐ時間 (ms)', en: 'Input cooldown (ms)' },
    zoneHysteresisMs: { ja: '切りかえの安定時間 (ms)', en: 'Switch settle time (ms)' },
    eyeGain:          { ja: '視線の感度', en: 'Gaze sensitivity' },
    headGain:         { ja: '頭の動きの感度', en: 'Head motion sensitivity' },
    smoothing:        { ja: 'なめらかさ', en: 'Smoothing' },
    recenterRate:     { ja: '姿勢のずれの補正', en: 'Drift compensation' },
    barBias:          { ja: '下のバーの境目（小さいほど届きやすい）', en: 'Bottom bar boundary (lower = easier to reach)' },
    invertX:          { ja: '左右を反転', en: 'Flip left-right' },
    invertY:          { ja: '上下を反転', en: 'Flip up-down' },
    audioFeedback:    { ja: '音で知らせる', en: 'Audio feedback' },
    speakOnFocus:     { ja: '選んだボタンの名前を読み上げる', en: 'Speak highlighted button name' },
    speechRate:       { ja: '読み上げの速さ', en: 'Speech rate' },
    speechLang:       { ja: '読み上げの言語', en: 'Speech language' },
  },

  // Settings-screen option labels, keyed by setting key then option value.
  SETTING_OPTION: {
    uiLang: {
      ja: { ja: '日本語', en: 'Japanese' },
      en: { ja: '英語', en: 'English' },
    },
    signal: {
      head: { ja: '頭の動き（おすすめ）', en: 'Head motion (recommended)' },
      gaze: { ja: '視線', en: 'Eye gaze' },
      both: { ja: '頭＋視線', en: 'Head + eye' },
    },
    input: {
      pointer: { ja: 'マウス・タッチ・OSの視線入力', en: 'Mouse, touch, or OS eye tracking' },
      webcam:  { ja: 'カメラ', en: 'Camera' },
    },
    trigger: {
      click: { ja: 'クリック／タップ', en: 'Click / tap' },
      dwell: { ja: '見つめて決定', en: 'Dwell to select' },
    },
    speechLang: {
      'ja-JP': { ja: '日本語', en: 'Japanese' },
      'en-US': { ja: 'English', en: 'English' },
    },
  },

  t(key, ...args) {
    const table = this.STR[this.lang] || this.STR.ja;
    const v = table[key] !== undefined ? table[key] : this.STR.ja[key];
    return typeof v === 'function' ? v(...args) : v;
  },

  settingLabel(key, fallback) {
    const entry = this.SETTING_LABEL[key];
    if (!entry) return fallback;
    return this.lang === 'en' ? (entry.en || entry.ja) : (entry.ja || fallback);
  },

  settingOption(key, value, fallback) {
    const perKey = this.SETTING_OPTION[key];
    const entry = perKey && perKey[String(value)];
    if (!entry) return fallback;
    return this.lang === 'en' ? (entry.en || entry.ja) : (entry.ja || fallback);
  },
};
