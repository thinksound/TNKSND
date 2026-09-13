// MediaPipe gaze-zone source.
//
// All video processing happens on-device: frames never leave the machine. The only network
// traffic is the one-time download of the WASM runtime and the face landmarker model.
//
// Requires a secure context, so serve over http://localhost (or https) — browsers block
// camera access on file:// URLs.

class WebcamInput {
  constructor(engine, settings) {
    this.engine = engine;
    this.settings = settings;
    this.name = 'webcam';
    this.paused = false;
    this.onFrame = null;
    this.onLongClose = null; // called when both eyes stay closed past closedEyesReturnMs

    this.state = {
      ok: false,
      gx: 0,
      gy: 0,
      rawX: 0,
      rawY: 0,
      driftX: 0,
      driftY: 0,
      blinkL: 0,
      blinkR: 0,
      baseL: 0,
      baseR: 0,
      dL: 0,
      dR: 0,
      eyesClosed: false,
      bothClosed: false,
      frozen: false,
      holdMs: 0,
      zone: null,
      triggers: 0,
      fps: 0,
    };

    this._gx = 0;
    this._gy = 0;
    this._driftX = 0;
    this._driftY = 0;
    this._baseL = null;
    this._baseR = null;
    this._closedSince = 0;
    this._anyClosedSince = 0;
    this._lastVideoTime = -1;
    this._lastFrameAt = 0;
    this._loop = this._loop.bind(this);
  }

  async start() {
    this.video = document.getElementById('video');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      audio: false,
    });
    this.video.srcObject = this.stream;
    await this.video.play();

    const vision = await import(MEDIAPIPE.module);
    const fileset = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE.wasm);
    this.landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MEDIAPIPE.model, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });

    this.running = true;
    requestAnimationFrame(this._loop);
  }

  stop() {
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.video) this.video.srcObject = null;
    if (this.landmarker) this.landmarker.close();
    this.landmarker = null;
  }

  resetDrift() {
    this._driftX = 0;
    this._driftY = 0;
  }

  _loop(t) {
    if (!this.running) return;
    requestAnimationFrame(this._loop);
    if (!this.video || this.video.readyState < 2) return;
    if (this.video.currentTime === this._lastVideoTime) return;
    this._lastVideoTime = this.video.currentTime;

    let result;
    try {
      result = this.landmarker.detectForVideo(this.video, t);
    } catch (e) {
      return;
    }

    const dt = t - this._lastFrameAt;
    this._lastFrameAt = t;
    if (dt > 0) this.state.fps = Math.round(1000 / dt);

    const shapes = result.faceBlendshapes && result.faceBlendshapes[0];
    if (!shapes) {
      this.state.ok = false;
      this.state.zone = null;
      this._closedSince = 0;
      if (!this.paused) this.engine.setFocus(null);
      if (this.onFrame) this.onFrame(this.state);
      return;
    }

    const b = {};
    for (const c of shapes.categories) b[c.categoryName] = c.score;
    const s = this.settings;

    // Eye direction from the ARKit-style look blendshapes. "In" is toward the nose.
    const eyeX = ((b.eyeLookOutLeft - b.eyeLookInLeft) + (b.eyeLookInRight - b.eyeLookOutRight)) / 2;
    // +y = down (matching head pitch): looking up gives a negative eyeY.
    const eyeY = ((b.eyeLookDownLeft + b.eyeLookDownRight) - (b.eyeLookUpLeft + b.eyeLookUpRight)) / 2;

    const matrix = result.facialTransformationMatrixes && result.facialTransformationMatrixes[0];
    const head = headPose(matrix && matrix.data);
    const mix = SIGNAL_MIX[s.signal] || SIGNAL_MIX.head;

    let gx = mix.eye * eyeX * s.eyeGain + mix.head * head.yaw * s.headGain;
    let gy = mix.eye * eyeY * s.eyeGain + mix.head * head.pitch * s.headGain;
    if (s.invertX) gx = -gx;
    if (s.invertY) gy = -gy;
    // Deliberately not clamped: clamping saturates the outer zones onto identical values,
    // which makes the leftmost and rightmost tiles indistinguishable after calibration.

    this._gx += (gx - this._gx) * s.smoothing;
    this._gy += (gy - this._gy) * s.smoothing;

    // Follow slow postural drift, but only near the calibrated resting point so a held
    // position is never absorbed. Frozen while calibrating so it cannot chase the targets.
    if (!this.paused && s.recenterRate > 0) {
      const restX = this._gx - Calibration.originX - this._driftX;
      const restY = this._gy - Calibration.originY - this._driftY;
      if (Math.abs(restX) < s.neutralRadius) this._driftX += restX * s.recenterRate;
      if (Math.abs(restY) < s.neutralRadius) this._driftY += restY * s.recenterRate;
    }
    const gxAdj = this._gx - this._driftX;
    const gyAdj = this._gy - this._driftY;

    const blinkL = b.eyeBlinkLeft || 0;
    const blinkR = b.eyeBlinkRight || 0;

    // Blink is measured against the resting eyelid position, not an absolute threshold: a
    // droopy or narrowed resting lid can sit above any fixed threshold and read as
    // permanently closed. The baseline falls quickly and rises very slowly, so it tracks the
    // open-eye level and a sustained closure cannot drag it upward.
    if (this._baseL == null) {
      this._baseL = blinkL;
      this._baseR = blinkR;
    }
    this._baseL += (blinkL - this._baseL) * (blinkL < this._baseL ? 0.05 : 0.0008);
    this._baseR += (blinkR - this._baseR) * (blinkR < this._baseR ? 0.05 : 0.0008);
    const dL = blinkL - this._baseL;
    const dR = blinkR - this._baseR;
    const closedL = dL > s.blinkDelta;
    const closedR = dR > s.blinkDelta;
    const bothClosed = closedL && closedR;
    const anyClosed = closedL || closedR;

    if (bothClosed) {
      if (!this._closedSince) this._closedSince = t;
    } else {
      this._closedSince = 0;
    }
    const holdMs = this._closedSince ? t - this._closedSince : 0;

    // Gaze from a closed eye is garbage, so the highlight is held while *either* eye is shut,
    // which stops a blink from dragging the selection onto a neighbouring tile. Never held for
    // longer than maxFreezeMs: beyond that it is a resting state or a detection failure, and
    // a permanently frozen board is the worse failure.
    if (anyClosed) {
      if (!this._anyClosedSince) this._anyClosedSince = t;
    } else {
      this._anyClosedSince = 0;
    }
    const frozen = anyClosed && t - this._anyClosedSince <= s.maxFreezeMs;

    this.state.ok = true;
    this.state.gx = gxAdj;
    this.state.gy = gyAdj;
    this.state.rawX = this._gx;
    this.state.rawY = this._gy;
    this.state.driftX = this._driftX;
    this.state.driftY = this._driftY;
    this.state.blinkL = blinkL;
    this.state.blinkR = blinkR;
    this.state.baseL = this._baseL;
    this.state.baseR = this._baseR;
    this.state.dL = dL;
    this.state.dR = dR;
    this.state.eyesClosed = anyClosed;
    this.state.bothClosed = bothClosed;
    this.state.frozen = frozen;
    this.state.holdMs = holdMs;

    // Both eyes closed for a sustained period is a deliberate "stop": return to the
    // start screen. Ignored while paused (e.g. calibration) and when no face is
    // visible (_closedSince is cleared in both cases). _closedSince is reset so it
    // cannot re-fire immediately while the eyes are still shut.
    const returnMs = s.closedEyesReturnMs || 3000;
    if (!this.paused && bothClosed && holdMs >= returnMs && this.onLongClose) {
      this._closedSince = 0;
      this.onLongClose();
    }

    // The confirm screen has exactly 2 zones (はい/いいえ); the board's
    // classify would map beyond index 1, which is out of range for a 2-zone
    // screen, so it gets its own split along the layout axis.
    if (!frozen) {
      this.state.zone = this.engine.zones.length === 2
        ? Calibration.confirmClassify(gxAdj, gyAdj)
        : Calibration.classify(gxAdj, gyAdj);
    }

    if (!this.paused) {
      if (!frozen) this.engine.setFocus(this.state.zone);
    }

    if (this.onFrame) this.onFrame(this.state);
  }
}

// Column-major 4x4: element (row i, col j) is data[j * 4 + i]. Returns radians.
function headPose(data) {
  if (!data || data.length < 16) return { yaw: 0, pitch: 0, roll: 0 };
  const r00 = data[0], r10 = data[1], r20 = data[2];
  const r21 = data[6], r22 = data[10];
  const sy = Math.hypot(r00, r10);
  return {
    pitch: Math.atan2(r21, r22),
    yaw: Math.atan2(-r20, sy),
    roll: Math.atan2(r10, r00),
  };
}
