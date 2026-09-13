// このファイルだけを編集すれば設定できます。
//
// ボタンは横一列に並びます（縦画面では自動で縦一列になります）。
//
// type の種類:
//   speak  — text を読み上げる
//   url    — url を新しいタブで開く
//   call   — url に移動する (facetime://, facetime-audio://, tel:, sms:)
//   alert  — text を画面いっぱいに表示し、止めるまで繰り返し読み上げる
//   cancel — 読み上げを止める
//
// 取り消せない操作には confirm: true を付けてください。2回の選択が必要になります。
// 設定の「ボタンの数」で決めた数だけ、先頭から表示されます。順番が大切です。

// 3つのアドレスとラベルを実際の相手に書き換えてください。「電話1」では誰か分かりません。
// 名前を入れるか、icon を顔写真の絵文字に変えることをおすすめします。
const TILES = [
  { id: 'call1', icon: '👨', label: '電話 1', labelEn: 'Call 1', type: 'call',
    url: 'facetime://person1@example.com', confirm: true, confirmText: '電話 1 にかけますか？', confirmTextEn: 'Call 1?' },
  { id: 'call2', icon: '👩', label: '電話 2', labelEn: 'Call 2', type: 'call',
    url: 'facetime://person2@example.com', confirm: true, confirmText: '電話 2 にかけますか？', confirmTextEn: 'Call 2?' },
  // 「たすけて」は右側のボタン。初期設定の3ボタンでは [電話 1, 電話 2, たすけて] になります。
  // notify: true で、設定に送信先URLが入っているときだけLINEに一斉通知します。
  { id: 'help', icon: '🔔', label: 'たすけて', labelEn: 'Help', type: 'alert',
    text: '助けてください。来てください。', textEn: 'Please help me. Come here.',
    confirm: true, confirmText: 'たすけてを呼びますか？', confirmTextEn: 'Call for help?',
    notify: true },
  { id: 'call3', icon: '🧑', label: '電話 3', labelEn: 'Call 3', type: 'call',
    url: 'facetime://person3@example.com', confirm: true, confirmText: '電話 3 にかけますか？', confirmTextEn: 'Call 3?' },
  { id: 'news1', icon: '📰', label: 'ニュース 1', labelEn: 'News 1', type: 'url', url: 'https://news.google.co.jp' },
  { id: 'news2', icon: '📺', label: 'ニュース 2', labelEn: 'News 2', type: 'url', url: 'https://www3.nhk.or.jp/news/' },
];

const DEFAULT_SETTINGS = {
  tileCount: 3,
  uiLang: 'ja', // 'ja' | 'en' — display language (switching it also switches speech language)
  input: 'webcam',        // 'pointer' | 'webcam'
  trigger: 'dwell',       // 'click' | 'dwell'

  // FaceTime call targets (email address or phone number). Empty = not set.
  call1Target: '',
  call2Target: '',

  // Help (たすけて) LINE notify. Both empty = disabled; the button then works
  // exactly as before (on-screen message + repeated speech only).
  notifyUrl: '',
  notifyKey: '',

  // selection
  zoneHysteresisMs: 250,
  dwellMs: 4000,
  refractoryMs: 1000,

  // Closed-eye detection (used to hold the highlight still while blinking, and to
  // reject closed-eye samples during calibration). blinkDelta is measured above
  // the resting eyelid level, not absolute, so a droopy or narrowed resting lid
  // cannot read as permanently closed.
  blinkDelta: 0.4,
  // Hard ceiling on how long a suspected blink may hold the highlight still.
  maxFreezeMs: 1200,
  // Both eyes closed this long returns to the start screen (a deliberate "stop").
  // Must stay well above maxFreezeMs so an ordinary blink can never trigger it.
  closedEyesReturnMs: 3000,

  // pointing signal
  signal: 'head',          // 'head' | 'gaze' | 'both'
  eyeGain: 1.8,
  headGain: 2.6,
  smoothing: 0.25,
  invertX: false,
  invertY: false,
  // Drift compensation: slowly follows the resting pose so that slumping in a chair or bed
  // does not invalidate calibration. Only accumulates while the head is within
  // neutralRadius of its calibrated centre, so a deliberate sustained hold is never
  // absorbed into the neutral.
  recenterRate: 0.001,
  neutralRadius: 0.25,

  // feedback
  audioFeedback: true,
  speakOnFocus: true,
  speechRate: 0.95,
  speechLang: 'ja-JP',

  // alert screen
  alertRepeatMs: 6000,
};

// How much each source contributes. Head pose is estimated from the whole face geometry and
// is far steadier than the eyelid blendshapes gaze relies on, and it gives a usable vertical
// axis. Eye gaze degrades more slowly than head control in ALS, so both are kept available.
const SIGNAL_MIX = {
  head: { eye: 0, head: 1 },
  gaze: { eye: 1, head: 0 },
  both: { eye: 0.7, head: 0.3 },
};

const SETTINGS_SPEC = [
  { key: 'uiLang', label: '表示の言語', type: 'select',
    options: [['ja', '日本語'], ['en', '英語']] },
  { key: 'signal', label: '操作のしかた', type: 'select',
    options: [['head', '頭の動き（おすすめ）'], ['gaze', '視線'], ['both', '頭＋視線']] },
  { key: 'input', label: '入力', type: 'select', restart: true,
    options: [['pointer', 'マウス・タッチ・OSの視線入力'], ['webcam', 'カメラ']] },
  { key: 'trigger', label: '決定のしかた', type: 'select',
    options: [['click', 'クリック／タップ'],
              ['dwell', '見つめて決定']] },
  { key: 'tileCount', label: '横に並べるボタンの数', type: 'select', rebuild: true, number: true,
    options: [[3, '3'], [4, '4'], [5, '5']] },
  { key: 'call1Target', label: '電話 1 の相手', type: 'text' },
  { key: 'call2Target', label: '電話 2 の相手', type: 'text' },
  { key: 'notifyUrl', label: '助けて通知の送信先URL', type: 'text' },
  { key: 'notifyKey', label: '助けて通知のキー', type: 'text' },

  { key: 'maxFreezeMs', label: '選択が止まる上限 (ms)', type: 'range', min: 400, max: 3000, step: 100 },
  { key: 'closedEyesReturnMs', label: '両目を閉じたらスタートにもどる (ms)', type: 'range', min: 2000, max: 10000, step: 500 },
  { key: 'dwellMs', label: '見つめる時間 (ms)', type: 'range', min: 400, max: 4000, step: 100 },
  { key: 'refractoryMs', label: '連続入力を防ぐ時間 (ms)', type: 'range', min: 300, max: 3000, step: 100 },
  { key: 'zoneHysteresisMs', label: '切りかえの安定時間 (ms)', type: 'range', min: 0, max: 1000, step: 50 },

  { key: 'eyeGain', label: '視線の感度', type: 'range', min: 0.5, max: 4, step: 0.1 },
  { key: 'headGain', label: '頭の動きの感度', type: 'range', min: 0.5, max: 6, step: 0.1 },
  { key: 'smoothing', label: 'なめらかさ', type: 'range', min: 0.05, max: 1, step: 0.05 },
  { key: 'recenterRate', label: '姿勢のずれの補正', type: 'range', min: 0, max: 0.01, step: 0.0005 },
  { key: 'invertX', label: '左右を反転（見た向きと逆に動くとき）', type: 'checkbox' },
  { key: 'invertY', label: '上下を反転（見た向きと逆に動くとき）', type: 'checkbox' },

  { key: 'audioFeedback', label: '音で知らせる', type: 'checkbox' },
  { key: 'speakOnFocus', label: '選んだボタンの名前を読み上げる', type: 'checkbox' },
  { key: 'speechRate', label: '読み上げの速さ', type: 'range', min: 0.5, max: 1.5, step: 0.05 },
  { key: 'speechLang', label: '読み上げの言語', type: 'select',
    options: [['ja-JP', '日本語'], ['en-US', 'English']] },
];

// Loaded from CDN during development. For offline use, vendor these into ./vendor
// and point these at the local copies.
const MEDIAPIPE = {
  module: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs',
  wasm: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  model: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
};

const Settings = {
  KEY: 'reach.settings',
  load() {
    try {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(this.KEY) || '{}') };
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  },
  save(settings) {
    try {
      localStorage.setItem(this.KEY, JSON.stringify(settings));
    } catch (e) { /* private mode */ }
  },
  reset() {
    try { localStorage.removeItem(this.KEY); } catch (e) { /* private mode */ }
    return { ...DEFAULT_SETTINGS };
  },
};
