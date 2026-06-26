import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";

const QODER_LOGIN_URL = "https://qoder.com/device/selectAccounts";
const QODER_DEVICE_TOKEN_URL = "https://openapi.qoder.sh/api/v1/deviceToken/poll";
const QODER_USERINFO_URL = "https://openapi.qoder.sh/api/v1/userinfo";
const FETCH_TIMEOUT_MS = 15_000;

function base64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseExpiry(expiresAt: unknown, expiresInSeconds: unknown): number {
  if (typeof expiresAt === "number" && Number.isFinite(expiresAt) && expiresAt > 0) return expiresAt;
  const trimmed = typeof expiresAt === "string" ? expiresAt.trim() : "";
  if (trimmed) {
    if (/^\d+$/.test(trimmed)) {
      const ms = Number.parseInt(trimmed, 10);
      if (Number.isFinite(ms) && ms > 0) return ms;
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) return parsed;
  }
  if (typeof expiresInSeconds === "number" && Number.isFinite(expiresInSeconds) && expiresInSeconds >= 0) {
    return Date.now() + expiresInSeconds * 1000;
  }
  return Date.now() + 30 * 24 * 60 * 60 * 1000;
}

async function fetchUserInfo(accessToken: string) {
  try {
    const response = await fetchWithTimeout(QODER_USERINFO_URL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": "Go-http-client/2.0",
      },
    });
    if (!response.ok) return { name: "", email: "", organizationId: "" };
    const body: any = await response.json();
    return {
      name: String(body.name || body.username || "").trim(),
      email: String(body.email || "").trim(),
      organizationId: String(body.organization_id || "").trim(),
    };
  } catch {
    return { name: "", email: "", organizationId: "" };
  }
}

export const qoder = {
  config: {
    loginUrl: QODER_LOGIN_URL,
    deviceTokenUrl: QODER_DEVICE_TOKEN_URL,
    userInfoUrl: QODER_USERINFO_URL,
  },
  flowType: "device_code",
  requestDeviceCode: async () => {
    const verifier = base64Url(crypto.randomBytes(32));
    const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
    const nonce = uuidv4();
    const machineId = uuidv4();
    const params = new URLSearchParams({
      challenge,
      challenge_method: "S256",
      machine_id: machineId,
      nonce,
    });
    return {
      device_code: nonce,
      user_code: "QODER",
      verification_uri: QODER_LOGIN_URL,
      verification_uri_complete: `${QODER_LOGIN_URL}?${params.toString()}`,
      expires_in: 300,
      interval: 2,
      codeVerifier: verifier,
      extraData: { machineId },
    };
  },
  pollToken: async (_config: unknown, deviceCode: string, codeVerifier: string, extraData?: any) => {
    if (!deviceCode || !codeVerifier) {
      return { ok: false, data: { error: "invalid_request", error_description: "missing nonce or verifier" } };
    }
    const url = `${QODER_DEVICE_TOKEN_URL}?nonce=${encodeURIComponent(deviceCode)}&verifier=${encodeURIComponent(codeVerifier)}&challenge_method=S256`;
    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: { Accept: "application/json", "User-Agent": "Go-http-client/2.0" },
    });
    if (response.status === 202 || response.status === 404) {
      return { ok: true, data: { error: "authorization_pending", error_description: "Waiting for Qoder authorization" } };
    }
    const text = await response.text();
    let body: any = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { error: "invalid_response", error_description: text }; }
    if (!response.ok) return { ok: false, data: body };
    if (!body.token) return { ok: false, data: { error: "no_access_token", error_description: "Qoder returned no token" } };
    return {
      ok: true,
      data: {
        access_token: body.token,
        refresh_token: body.refresh_token || "",
        expires_in: Math.max(0, Math.floor((parseExpiry(body.expires_at, body.expires_in) - Date.now()) / 1000)),
        qoder_user_id: body.user_id || "",
        raw: body,
        extraData: extraData || {},
      },
    };
  },
  postExchange: async (tokens: any) => ({ userInfo: await fetchUserInfo(tokens.access_token) }),
  mapTokens: (tokens: any, extra: any) => ({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || null,
    expiresIn: tokens.expires_in || 30 * 24 * 60 * 60,
    email: extra?.userInfo?.email || null,
    displayName: extra?.userInfo?.name || extra?.userInfo?.email || null,
    providerSpecificData: {
      authMode: "device",
      transport: "qoder-sh",
      userId: tokens.qoder_user_id || "",
      machineId: tokens.extraData?.machineId || "",
      organizationId: extra?.userInfo?.organizationId || "",
    },
  }),
};
