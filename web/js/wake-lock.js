export class ScreenWakeLock {
  constructor(wakeLock = globalThis.navigator?.wakeLock) {
    this.wakeLock = wakeLock;
    this.sentinel = null;
    this.requested = false;
  }

  get supported() {
    return Boolean(this.wakeLock?.request);
  }

  get active() {
    return Boolean(this.sentinel && !this.sentinel.released);
  }

  async enable() {
    if (!this.supported) {
      this.requested = false;
      return false;
    }
    this.requested = true;
    this.sentinel = await this.wakeLock.request("screen");
    this.sentinel?.addEventListener?.("release", () => { this.sentinel = null; }, { once: true });
    return true;
  }

  async reacquire() {
    if (!this.requested || this.active) return this.active;
    return this.enable();
  }

  async disable() {
    this.requested = false;
    const sentinel = this.sentinel;
    this.sentinel = null;
    try { await sentinel?.release(); }
    catch { /* The browser may already have released the lock. */ }
  }
}
