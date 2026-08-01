import { describe, expect, it } from "vitest";
import { requireAuthenticatedUser } from "../../worker/auth";
import type { Env } from "../../worker/types";

describe("Cloudflare Access authentication", () => {
  it("uses an explicit local development identity without a JWT", async () => {
    const user = await requireAuthenticatedUser(new Request("http://localhost"), {
      DEV_USER_ID: "owner",
    } as Env);
    expect(user.id).toBe("dev:owner");
  });

  it("fails closed when production Access settings are missing", async () => {
    await expect(requireAuthenticatedUser(new Request("https://example.com"), {} as Env))
      .rejects.toThrow("TEAM_DOMAIN");
  });

  it("requires the Access assertion in production", async () => {
    await expect(requireAuthenticatedUser(new Request("https://example.com"), {
      TEAM_DOMAIN: "https://team.cloudflareaccess.com",
      POLICY_AUD: "audience",
    } as Env)).rejects.toThrow("認証情報");
  });
});
