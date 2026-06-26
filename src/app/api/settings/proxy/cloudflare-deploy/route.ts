import { randomBytes } from "crypto";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { createErrorResponse, createErrorResponseFromUnknown } from "@/lib/api/errorResponse";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { cloudflareDeploySchema } from "@/shared/validation/freeProxySchemas";
import { createProxy } from "@/lib/localDb";
import { encrypt } from "@/lib/db/encryption";

const CLOUDFLARE_API_BASE = process.env.CLOUDFLARE_API_BASE || "https://api.cloudflare.com/client/v4";

function buildRelayWorkerScript(relayAuth: string): string {
  // Inline SSRF guard + relay logic (Cloudflare Workers runtime, no Node imports)
  return `
function isPrivateHostname(h) {
  if (!h) return true;
  const host = h.trim().toLowerCase().replace(/^\\[|\\]\$/g, "");
  if (
    host === "localhost" || host === "0.0.0.0" || host === "127.0.0.1" || host === "::1" ||
    host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal") ||
    host.startsWith("::ffff:")
  ) return true;
  const v4 = host.match(/^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\$/);
  if (v4) {
    const a = +v4[1], b = +v4[2];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (host.includes(":")) {
    return host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
  }
  return false;
}

export default {
  async fetch(request) {
    const auth = request.headers.get("x-relay-auth");
    if (auth !== "${relayAuth}") return new Response("Unauthorized", { status: 401 });

    const target = request.headers.get("x-relay-target");
    if (!target) return new Response("missing x-relay-target", { status: 400 });
    let targetUrl;
    try { targetUrl = new URL(target); } catch { return new Response("invalid x-relay-target", { status: 400 }); }
    if (targetUrl.protocol !== "http:" && targetUrl.protocol !== "https:") {
      return new Response("forbidden x-relay-target protocol", { status: 403 });
    }
    if (targetUrl.username || targetUrl.password) {
      return new Response("forbidden x-relay-target (embedded credentials)", { status: 403 });
    }
    if (isPrivateHostname(targetUrl.hostname)) {
      return new Response("forbidden x-relay-target (private/loopback host)", { status: 403 });
    }

    const relayPath = request.headers.get("x-relay-path") || "/";
    const headers = new Headers(request.headers);
    ["x-relay-target", "x-relay-path", "x-relay-auth", "host", "cf-connecting-ip", "cf-ray", "cf-visitor", "x-forwarded-for", "x-forwarded-proto", "x-real-ip"].forEach(h => headers.delete(h));

    const upstream = await fetch(target.replace(/\\/\$/, "") + relayPath, {
      method: request.method,
      headers,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
    });
    return new Response(upstream.body, { status: upstream.status, headers: upstream.headers });
  }
};`;
}

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  let rawBody: unknown;
  try { rawBody = await request.json(); } catch {
    return createErrorResponse({ status: 400, message: "Invalid JSON body", type: "invalid_request" });
  }

  const validation = validateBody(cloudflareDeploySchema, rawBody);
  if (isValidationFailure(validation)) {
    return createErrorResponse({ status: 400, message: validation.error.message, type: "invalid_request" });
  }

  const { apiToken, accountId, workerName } = validation.data;
  const relayAuth = randomBytes(24).toString("hex");
  const workerScript = buildRelayWorkerScript(relayAuth);

  try {
    // 1. Upload worker script
    const uploadRes = await fetch(
      `${CLOUDFLARE_API_BASE}/accounts/${accountId}/workers/scripts/${workerName}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/javascript",
        },
        body: workerScript,
      }
    );

    if (!uploadRes.ok) {
      let upstreamMessage = "Cloudflare API rejected the worker upload";
      try {
        const parsed = (await uploadRes.json().catch(() => null)) as {
          errors?: Array<{ message?: string }>;
        };
        if (parsed?.errors?.[0]?.message) upstreamMessage = parsed.errors[0].message;
      } catch {}
      return createErrorResponse({
        status: uploadRes.status >= 500 ? 502 : 400,
        message: upstreamMessage,
        type: "upstream_error",
      });
    }

    // 2. Enable worker subdomain (workers.dev URL)
    const subdomainRes = await fetch(
      `${CLOUDFLARE_API_BASE}/accounts/${accountId}/workers/scripts/${workerName}/subdomain`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ enabled: true }),
      }
    );

    let workerHost = `${workerName}.${accountId}.workers.dev`;
    try {
      if (subdomainRes.ok) {
        const subData = (await subdomainRes.json()) as { result?: { subdomain?: string } };
        if (subData.result?.subdomain) workerHost = subData.result.subdomain;
      }
    } catch {}

    // 3. Store proxy with encrypted relayAuth
    const encryptedRelayAuth = encrypt(relayAuth);
    const notesPayload =
      encryptedRelayAuth && encryptedRelayAuth !== relayAuth
        ? { relayAuthEnc: encryptedRelayAuth }
        : { relayAuth };

    const poolProxy = await createProxy({
      name: `Cloudflare Relay (${workerName})`,
      type: "cloudflare",
      host: workerHost,
      port: 443,
      notes: JSON.stringify(notesPayload),
      source: "cloudflare-relay",
    });

    return Response.json({
      success: true,
      relayUrl: `https://${workerHost}`,
      poolProxyId: poolProxy?.id,
    });
  } catch (error) {
    return createErrorResponseFromUnknown(error, "Cloudflare deploy failed");
  }
}
