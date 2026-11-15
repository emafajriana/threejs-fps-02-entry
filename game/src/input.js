// input.js — keyboard and mouse state, sampled by the frame loop.
// Pointer lock is requested by main.js on the canvas; this module only
// records what is held and accumulates mouse movement between frames.

export class Input {
  constructor(dom) {
    this.keys = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.firing = false;
    this.locked = false;
    this.pressed = new Set(); // keys that went down since the last frame

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.firing = false; });

    dom.addEventListener('click', () => {
      if (!this.locked && !this.disabled) dom.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
      if (!this.locked) this.firing = false;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    addEventListener('mousedown', (e) => { if (this.locked && e.button === 0) this.firing = true; });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.firing = false; });
  }

  // Drain the per-frame accumulators. Call once per frame, after reading.
  consume() {
    const out = { dx: this.mouseDX, dy: this.mouseDY, pressed: new Set(this.pressed) };
    this.mouseDX = 0; this.mouseDY = 0; this.pressed.clear();
    return out;
  }

  down(code) { return this.keys.has(code); }
}
