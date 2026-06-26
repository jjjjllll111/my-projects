import type { FreeProxyItem, FreeProxySyncResult, FreeProxyProvider } from "./types";
import { isPrivateHost } from "@/shared/network/outboundUrlGuard";

const DEFAULT_API_URL = "https://1proxy-api.aitradepulse.com/api/v1/proxies/advanced";
const DEFAULT_MAX = 500;
const DEFAULT_MIN_QUALITY = 50;
const DEFAULT_PAGE_SIZE = 100;
const MAX_CONSECUTIVE_FAILURES = 5;

type OneProxyApiProxy = {
  ip: string;
  port: number;
  protocol: string;
  country_code: string;
  latency_ms: number;
  anonymity: string;
  quality_score: number;
  last_validated: string;
};

type OneProxyApiResponse = {
  total: number;
  count: number;
  offset: number;
  proxies: OneProxyApiProxy[];
};

export class OneproxyProvider implements FreeProxyProvider {
  readonly id = "1proxy" as const;
  readonly name = "1proxy";

  private consecutiveFailures = 0;
  private lastFailureTime = 0;
  private static readonly FAILURE_RESET_MS = 10 * 60 * 1000; // 10分钟后重置断路器

  isEnabled(): boolean {
    return process.env.FREE_PROXY_1PROXY_ENABLED !== "false";
  }

  private getConfig() {
    return {
      apiUrl: process.env.FREE_PROXY_1PROXY_API_URL || DEFAULT_API_URL,
      maxProxies: parseInt(process.env.FREE_PROXY_1PROXY_MAX || "", 10) || DEFAULT_MAX,
      minQuality:
        parseInt(process.env.FREE_PROXY_1PROXY_MIN_QUALITY || "", 10) || DEFAULT_MIN_QUALITY,
    };
  }

  async sync(): Promise<FreeProxySyncResult> {
    if (!this.isEnabled()) {
      return { fetched: 0, added: 0, updated: 0, errors: ["1proxy provider disabled"] };
    }
    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      if (Date.now() - this.lastFailureTime > OneproxyProvider.FAILURE_RESET_MS) {
        this.consecutiveFailures = 0;
        console.log("[OneproxyProvider] Circuit breaker reset after timeout");
      } else {
        return {
          fetched: 0,
          added: 0,
          updated: 0,
          errors: [`Circuit breaker open: ${this.consecutiveFailures} consecutive failures (auto-reset in ${Math.ceil((OneproxyProvider.FAILURE_RESET_MS - (Date.now() - this.lastFailureTime)) / 1000)}s)`],
        };
      }
    }

    const { upsertFreeProxy } = await import("../db/freeProxies");
    const { apiUrl, maxProxies, minQuality } = this.getConfig();
    const errors: string[] = [];
    let added = 0;
    let updated = 0;
    let fetched = 0;
    let offset = 0;

    try {
      while (fetched < maxProxies) {
        const limit = Math.min(DEFAULT_PAGE_SIZE, maxProxies - fetched);
        const url = `${apiUrl}?offset=${offset}&limit=${limit}&min_quality_score=${minQuality}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          errors.push(`HTTP ${res.status}: ${text.slice(0, 100)}`);
          this.consecutiveFailures++;
          this.lastFailureTime = Date.now();
          break;
        }

        const json = (await res.json()) as OneProxyApiResponse;
        if (!Array.isArray(json.proxies) || json.proxies.length === 0) break;

        for (const p of json.proxies) {
          if (!p.ip || isPrivateHost(p.ip)) {
            errors.push(`1proxy: skipped private/loopback host ${p.ip}`);
            continue;
          }
          const item: FreeProxyItem = {
            source: "1proxy",
            host: p.ip,
            port: p.port,
            type: (p.protocol?.toLowerCase() as FreeProxyItem["type"]) || "http",
            countryCode: p.country_code || null,
            qualityScore: p.quality_score ?? null,
            latencyMs: p.latency_ms ?? null,
            anonymity: p.anonymity || null,
            lastValidated: p.last_validated || new Date().toISOString(),
          };
          const result = await upsertFreeProxy(item);
          if (result.action === "created") added++;
          else updated++;
        }

        fetched += json.proxies.length;
        offset += json.proxies.length;
        if (json.proxies.length < limit) break;
      }
      this.consecutiveFailures = 0;
    } catch (err) {
      this.consecutiveFailures++;
      this.lastFailureTime = Date.now();
      errors.push(err instanceof Error ? err.message : String(err));
    }

    return { fetched, added, updated, errors };
  }

  /**
   * 实时从1proxy API获取代理（不经过数据库）
   */
  async fetchLive(filters: {
    protocol?: string;
    country?: string;
    minQuality?: number;
    limit?: number;
  }): Promise<FreeProxyItem[]> {
    if (!this.isEnabled()) {
      return [];
    }

    const { apiUrl, minQuality: defaultMinQuality } = this.getConfig();
    const limit = filters.limit || 20;
    const minQuality = filters.minQuality ?? defaultMinQuality;
    
    try {
      // 使用 URLSearchParams 安全构建查询参数
      const url = new URL(apiUrl);
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("min_quality_score", String(minQuality));
      
      if (filters.protocol) {
        url.searchParams.set("protocol", filters.protocol);
      }
      if (filters.country) {
        url.searchParams.set("country_code", filters.country.toUpperCase());
      }
      
      const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15000) });
      
      if (!res.ok) {
        console.error(`[OneproxyProvider] fetchLive failed: HTTP ${res.status}`);
        return [];
      }

      const json = (await res.json()) as OneProxyApiResponse;
      
      if (!Array.isArray(json.proxies) || json.proxies.length === 0) {
        return [];
      }

      const items: FreeProxyItem[] = [];
      for (const p of json.proxies) {
        if (!p.ip || isPrivateHost(p.ip)) {
          continue;
        }
        items.push({
          source: "1proxy",
          host: p.ip,
          port: p.port,
          type: (p.protocol?.toLowerCase() as FreeProxyItem["type"]) || "http",
          countryCode: p.country_code || null,
          qualityScore: p.quality_score ?? null,
          latencyMs: p.latency_ms ?? null,
          anonymity: p.anonymity || null,
          lastValidated: p.last_validated || new Date().toISOString(),
        });
      }
      
      console.log(`[OneproxyProvider] fetchLive returned ${items.length} proxies`);
      return items;
    } catch (error) {
      console.error("[OneproxyProvider] fetchLive error:", error);
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
    return listFreeProxiesBySource("1proxy", filters);
  }
}