import type { FreeProxyItem, FreeProxySyncResult, FreeProxyProvider } from "./types";
import { isPrivateHost } from "@/shared/network/outboundUrlGuard";

const BASE_URL = "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master";
const PROTOCOLS = ["http", "socks4", "socks5"] as const;

let lastFetchAt = 0;
const CACHE_TTL_MS = 30 * 60 * 1000;

type ParsedProxy = { ip: string; port: number };

function parseProxyLines(text: string): ParsedProxy[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 5 && line.includes(":"))
    .map((line) => {
      const [ip, port] = line.split(":");
      return { ip: ip.trim(), port: parseInt(port, 10) };
    })
    .filter((p) => p.ip && Number.isFinite(p.port) && p.port > 0);
}

export class IplocateProvider implements FreeProxyProvider {
  readonly id = "iplocate" as const;
  readonly name = "IPLocate";

  isEnabled(): boolean {
    return process.env.FREE_PROXY_IPLOCATE_ENABLED !== "false";
  }

  async sync(): Promise<FreeProxySyncResult> {
    if (!this.isEnabled()) {
      return { fetched: 0, added: 0, updated: 0, errors: ["IPLocate provider disabled"] };
    }

    const now = Date.now();
    if (now - lastFetchAt < CACHE_TTL_MS) {
      return { fetched: 0, added: 0, updated: 0, errors: ["IPLocate: cache fresh, skipping"] };
    }

    const { upsertFreeProxy } = await import("../db/freeProxies");
    const baseUrl = process.env.FREE_PROXY_IPLOCATE_BASE_URL || BASE_URL;
    const errors: string[] = [];
    let added = 0;
    let updated = 0;
    let fetched = 0;

    for (const proto of PROTOCOLS) {
      try {
        const url = `${baseUrl}/${proto}.txt`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) {
          errors.push(`${proto}: HTTP ${res.status}`);
          continue;
        }

        const text = await res.text();
        const proxies = parseProxyLines(text);
        for (const p of proxies) {
          if (!p.ip || isPrivateHost(p.ip)) continue;
          const item: FreeProxyItem = {
            source: "iplocate",
            host: p.ip,
            port: p.port,
            type: proto,
            countryCode: null,
            qualityScore: null,
            latencyMs: null,
            anonymity: null,
            lastValidated: new Date().toISOString(),
          };
          const r = await upsertFreeProxy(item);
          if (r.action === "created") added++;
          else updated++;
          fetched++;
        }
        console.log(`[IplocateProvider] sync ${proto}: ${proxies.length} proxies`);
      } catch (err) {
        errors.push(`${proto}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    lastFetchAt = Date.now();
    return { fetched, added, updated, errors };
  }

  async fetchLive(filters: {
    protocol?: string;
    country?: string;
    minQuality?: number;
    limit?: number;
  }): Promise<FreeProxyItem[]> {
    if (!this.isEnabled()) return [];

    const baseUrl = process.env.FREE_PROXY_IPLOCATE_BASE_URL || BASE_URL;
    const limit = filters.limit || 50;
    const proto = filters.protocol && PROTOCOLS.includes(filters.protocol as any)
      ? filters.protocol
      : "http";

    try {
      const url = `${baseUrl}/${proto}.txt`;
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) return [];

      const text = await res.text();
      const proxies = parseProxyLines(text).slice(0, limit);

      return proxies
        .filter((p) => !isPrivateHost(p.ip))
        .map((p) => ({
          source: "iplocate" as const,
          host: p.ip,
          port: p.port,
          type: proto as FreeProxyItem["type"],
          countryCode: null,
          qualityScore: null,
          latencyMs: null,
          anonymity: null,
          lastValidated: new Date().toISOString(),
        }));
    } catch (error) {
      console.error("[IplocateProvider] fetchLive error:", error);
      return [];
    }
  }

  async list(filters: {
    protocol?: string;
    country?: string;
    minQuality?: number;
    limit?: number;
  }): Promise<FreeProxyItem[]> {
    const { listFreeProxiesBySource } = await import("../db/freeProxies");
    return listFreeProxiesBySource("iplocate", filters);
  }
}