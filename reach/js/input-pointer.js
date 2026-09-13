// Mouse / touch / OS-cursor source. Also covers iPadOS Eye Tracking with Dwell Control,
// which drives a real cursor and synthesises taps.

class PointerInput {
  constructor(engine) {
    this.engine = engine;
    this.name = 'pointer';
    this._move = this._move.bind(this);
    this._click = this._click.bind(this);
  }

  async start() {
    document.addEventListener('pointermove', this._move, { passive: true });
    document.addEventListener('click', this._click);
  }

  stop() {
    document.removeEventListener('pointermove', this._move);
    document.removeEventListener('click', this._click);
  }

  _index(target) {
    const el = target && target.closest ? target.closest('.zone') : null;
    if (!el) return null;
    const i = this.engine.zones.indexOf(el);
    return i === -1 ? null : i;
  }

  _move(e) {
    const i = this._index(e.target);
    if (i != null) this.engine.setFocus(i, true);
  }

  _click(e) {
    const i = this._index(e.target);
    if (i == null) return;
    this.engine.setFocus(i, true);
    this.engine.fireTrigger();
  }
}
