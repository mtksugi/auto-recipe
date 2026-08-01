import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "./types";

const jwksByTeamDomain = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

export interface AuthenticatedUser {
  id: string;
}

function requiredSetting(value: string | undefined, name: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name}が設定されていません`);
  return normalized.replace(/\/$/, "");
}

function jwksFor(teamDomain: string) {
  let jwks = jwksByTeamDomain.get(teamDomain);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksByTeamDomain.set(teamDomain, jwks);
  }
  return jwks;
}

export async function requireAuthenticatedUser(request: Request, env: Env): Promise<AuthenticatedUser> {
  const developmentUser = env.DEV_USER_ID?.trim();
  if (developmentUser) return { id: `dev:${developmentUser}` };

  const teamDomain = requiredSetting(env.TEAM_DOMAIN, "TEAM_DOMAIN");
  const audience = requiredSetting(env.POLICY_AUD, "POLICY_AUD");
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) throw new Error("Cloudflare Accessの認証情報がありません");

  const { payload } = await jwtVerify(token, jwksFor(teamDomain), {
    issuer: teamDomain,
    audience,
  });
  if (typeof payload.sub !== "string" || !payload.sub.trim()) {
    throw new Error("Cloudflare AccessのユーザーIDがありません");
  }
  return { id: payload.sub };
}
