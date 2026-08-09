import { describe, expect, it, vi } from "vitest";
import { ScreenWakeLock } from "../../web/js/wake-lock.js";

describe("screen wake lock", () => {
  it("reports unsupported environments without retaining an active request", async () => {
    const lock = new ScreenWakeLock(undefined);
    expect(await lock.enable()).toBe(false);
    expect(lock.requested).toBe(false);
  });

  it("requests, releases, and reacquires the screen lock", async () => {
    const first = { released: false, release: vi.fn(async () => { first.released = true; }), addEventListener: vi.fn() };
    const second = { released: false, release: vi.fn(), addEventListener: vi.fn() };
    const request = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second).mockResolvedValueOnce(second);
    const lock = new ScreenWakeLock({ request });

    expect(await lock.enable()).toBe(true);
    expect(request).toHaveBeenCalledWith("screen");
    await lock.disable();
    expect(first.release).toHaveBeenCalled();

    await lock.enable();
    second.released = true;
    await lock.reacquire();
    expect(request).toHaveBeenCalledTimes(3);
  });
});
