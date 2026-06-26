/**
 * ProxyManager - 动态代理池管理（使用 free_proxies 数据库 + 3小时同步）
 * 
 * 流程：
 * 1. 优先从 proxy_registry（已验证可用）获取代理
 * 2. proxy_registry 不够时，从 free_proxies 表随机获取
 * 3. 连接成功的代理自动加入 proxy_registry
 * 4. 连接失败的代理从对应池中移除
 * 5. free_proxies 由调度器每3小时从上游API同步
 */


import { listFreeProxies, type FreeProxyRecord as DbFreeProxyRecord } from "@/lib/db/freeProxies";
import { createProxy, deleteProxyById, listProxies } from "@/lib/db/proxies";

export type ProxySource = 'pool' | 'free-db';

interface ProxyInfo {
  id: string;
  host: string;
  port: number;
  protocol: string;
}

interface ProxyStats {
  url: string;
  ip: string;
  id: string;
  successCount: number;
  lastSuccess: number;
}

interface FreeProxyRecord {
  id: string;
  source: string;
  host: string;
  port: number;
  type: string;
}

export class ProxyManager {
  private successHistory: Map<string, ProxyStats> = new Map();
  private currentlyUsing: Set<string> = new Set();
  private proxyPoolCache: Map<string, ProxyInfo> = new Map();
  private proxyPoolExpiry = 0;
  
  // free_proxies 缓存（60秒TTL，避免频繁查DB）
  private freeProxyCache: FreeProxyRecord[] = [];
  private freeCacheExpiry = 0;
  private readonly FREE_CACHE_TTL = 60000;
  
  private readonly POOL_CACHE_TTL = 60000;
  private readonly MAX_HISTORY = 100;

  async getProxy(excludeIPs?: Set<string>, options?: { skipPool?: boolean }): Promise<{ url: string; id: string; source: ProxySource } | null> {
    const allExcluded = new Set([...this.currentlyUsing, ...(excludeIPs || [])]);

    // 1. 默认优先从 proxy_registry 获取（已验证可用）；pool 失败重试时可跳过。
    if (!options?.skipPool) {
    await this.refreshProxyPoolIfNeeded();
    
    const poolCandidates = Array.from(this.proxyPoolCache.values())
      .filter(p => !allExcluded.has(p.host));

    if (poolCandidates.length > 0) {
      const proxy = poolCandidates[Math.floor(Math.random() * poolCandidates.length)];
      const url = this.buildProxyUrl(proxy);
      console.log(`[ProxyManager] Selected random proxy-pool proxy: ${url}`);
      return { url, id: proxy.id, source: 'pool' };
    }
    }

    // 2. proxy_registry 不可用/被跳过，从 free_proxies DB 随机获取
    await this.refreshFreeProxyCacheIfNeeded();
    
    const availableFromDb = this.freeProxyCache.filter(p => !allExcluded.has(p.host));
    
    if (availableFromDb.length > 0) {
      const selected = availableFromDb[Math.floor(Math.random() * availableFromDb.length)];
      const proxyUrl = `${selected.type}://${selected.host}:${selected.port}`;
      console.log(`[ProxyManager] Selected random free-proxy DB proxy: ${proxyUrl} (source: ${selected.source})`);
      return { url: proxyUrl, id: selected.id, source: 'free-db' };
    }

    console.log('[ProxyManager] No proxies available (pools exhausted)');
    return null;
  }

  /**
   * 从 free_proxies DB 刷新缓存
   */
  private async refreshFreeProxyCacheIfNeeded(): Promise<void> {
    const now = Date.now();
    if (now < this.freeCacheExpiry && this.freeProxyCache.length > 0) {
      return;
    }

    try {
      const records = await listFreeProxies({ limit: 500 });
      const items = records.map((p: DbFreeProxyRecord) => ({
        id: p.id,
        source: p.source,
        host: p.host,
        port: p.port,
        type: p.type || "http",
      })) as FreeProxyRecord[];

      this.freeProxyCache = items;
      this.freeCacheExpiry = now + this.FREE_CACHE_TTL;
      console.log(`[ProxyManager] Free-proxies cache refreshed from DB: ${items.length} proxies`);
    } catch (error) {
      console.error('[ProxyManager] Failed to refresh free-proxies cache from DB:', error);
    }
  }

  markUsing(proxyUrl: string): void {
    const ip = this.extractIP(proxyUrl);
    this.currentlyUsing.add(ip);
  }

  async markDone(proxyUrl: string, proxyId: string, success: boolean, source: ProxySource): Promise<void> {
    const ip = this.extractIP(proxyUrl);
    this.currentlyUsing.delete(ip);

    if (success) {
      this.updateSuccessHistory(ip, proxyUrl, proxyId);

      // free-db 成功后自动加入 proxy_registry，建立已验证可用代理池
      if (source === 'free-db') {
        await this.addToProxyPool(proxyUrl);
        console.log(`[ProxyManager] ✓ Free-proxy succeeded, promoted to proxy-pool: ${ip}`);
      }
    } else {
      // 失败：proxy_registry 中的删除
      if (source === 'pool') {
        await this.removeFromProxyPool(proxyId);
        this.successHistory.delete(ip);
        this.proxyPoolCache.delete(proxyId);
        console.log(`[ProxyManager] ✗ Pool proxy failed, removed: ${ip}`);
      } else {
        console.log(`[ProxyManager] ✗ Free-proxy failed, discarded: ${ip}`);
      }
    }

    if (this.successHistory.size > this.MAX_HISTORY) {
      this.pruneHistory();
    }
  }

  private async addToProxyPool(proxyUrl: string): Promise<void> {
    try {
      const url = new URL(proxyUrl);
      const protocol = url.protocol.replace(':', '');
      const host = url.hostname;
      const port = parseInt(url.port, 10);

      const newProxy = await createProxy({
        host,
        port,
        type: protocol,
        name: `TheOldLLM-Auto-${host}`,
        source: "manual",
      });

      if (newProxy) {
        this.proxyPoolCache.set(newProxy.id, { ...newProxy, protocol: newProxy.type || protocol });
        this.proxyPoolExpiry = 0;
      }
    } catch (error) {
      console.error("[ProxyManager] Failed to add proxy to pool:", error);
    }
  }

  private async refreshProxyPoolIfNeeded(): Promise<void> {
    const now = Date.now();
    if (now < this.proxyPoolExpiry && this.proxyPoolCache.size > 0) {
      return;
    }

    try {
      const proxies = (await listProxies({ includeSecrets: true }))
        .filter((p: any) => !p.status || String(p.status).toLowerCase() === "active");

      this.proxyPoolCache.clear();
      proxies.forEach((p: any) => {
        // proxy_registry uses "type", ProxyInfo uses "protocol"
        this.proxyPoolCache.set(p.id, { ...p, protocol: p.type || p.protocol || "http" });
      });

      this.proxyPoolExpiry = now + this.POOL_CACHE_TTL;
      console.log(`[ProxyManager] Refreshed proxy-pool from DB: ${proxies.length} proxies`);
    } catch (error) {
      console.error('[ProxyManager] Failed to refresh proxy-pool from DB:', error);
    }
  }

  private async removeFromProxyPool(proxyId: string): Promise<void> {
    try {
      await deleteProxyById(proxyId, { force: true });
    } catch (error) {
      console.error(`[ProxyManager] Failed to delete proxy ${proxyId}:`, error);
    }
  }

  private updateSuccessHistory(ip: string, url: string, id: string): void {
    let stats = this.successHistory.get(ip);
    if (!stats) {
      stats = { url, ip, id, successCount: 0, lastSuccess: 0 };
      this.successHistory.set(ip, stats);
    }
    stats.successCount++;
    stats.lastSuccess = Date.now();
  }

  private pruneHistory(): void {
    const entries = Array.from(this.successHistory.entries());
    const sorted = entries.sort((a, b) => b[1].successCount - a[1].successCount);
    this.successHistory.clear();
    sorted.slice(0, this.MAX_HISTORY).forEach(([ip, stats]) => {
      this.successHistory.set(ip, stats);
    });
  }

  private buildProxyUrl(proxy: ProxyInfo): string {
    return `${proxy.protocol}://${proxy.host}:${proxy.port}`;
  }

  private extractIP(proxyUrl: string): string {
    try {
      const url = new URL(proxyUrl);
      return url.hostname;
    } catch {
      const match = proxyUrl.match(/\/\/([\d.]+):/);
      return match ? match[1] : proxyUrl;
    }
  }

  getStats() {
    return {
      proxyPool: this.proxyPoolCache.size,
      freeProxies: this.freeProxyCache.length,
      currentlyUsing: this.currentlyUsing.size,
      successfulProxies: this.successHistory.size,
    };
  }
}

export const globalProxyManager = new ProxyManager();
