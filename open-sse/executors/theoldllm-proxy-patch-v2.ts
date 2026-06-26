/**
 * fetchWithProxy - 使用动态代理池的fetch封装
 * 支持：
 * - 每次请求只使用一个代理，无并发
 * - 默认优先随机使用 proxy-pool
 * - proxy-pool 报错/限流后，同一次请求改用 free-pool 随机代理
 * - free-pool 成功不自动写入 proxy-pool
 */

import { globalProxyManager, type ProxySource } from "./proxyManager";

async function createDispatcher(proxyUrl: string): Promise<any> {
  try {
    const mod = await import("@omniroute/open-sse/utils/proxyDispatcher.ts");
    return mod.createProxyDispatcher(proxyUrl);
  } catch {
    const { ProxyAgent } = await import("undici");
    return new ProxyAgent(proxyUrl);
  }
}

interface ProxyConfig {
  enabled: boolean;
  concurrency?: number; // legacy, ignored: TheOldLLM now uses one proxy per request
}

interface ProxyInfo {
  url: string;
  id: string;
  source: ProxySource;
}

/**
 * 使用指定代理执行请求（内部helper）
 */
async function executeWithProxy(
  url: string,
  options: RequestInit,
  proxyInfo: ProxyInfo
): Promise<Response> {
  try {
    const dispatcher = await createDispatcher(proxyInfo.url);
    
    const response = await fetch(url, {
      ...options,
      // @ts-ignore - dispatcher is supported by Node.js fetch
      dispatcher,
    });

    const success = response.ok;
    await globalProxyManager.markDone(proxyInfo.url, proxyInfo.id, success, proxyInfo.source);
    
    if (!success) {
      console.warn(`[executeWithProxy] Proxy ${proxyInfo.url} got ${response.status}`);
    }

    return response;
  } catch (error) {
    await globalProxyManager.markDone(proxyInfo.url, proxyInfo.id, false, proxyInfo.source);
    console.warn(`[executeWithProxy] Proxy ${proxyInfo.url} failed:`, error);
    throw error;
  }
}

/**
 * 使用代理池发起HTTP请求
 * @param url 目标URL
 * @param options fetch选项
 * @param proxyConfig 代理配置
 * @param excludeIPs 已使用的IP集合（用于并发去重）
 */
export async function fetchWithProxy(
  url: string,
  options: RequestInit,
  proxyConfig?: ProxyConfig,
  excludeIPs?: Set<string>,
): Promise<Response> {
  if (!proxyConfig?.enabled) {
    return fetch(url, options);
  }

  const proxyInfo = await globalProxyManager.getProxy(excludeIPs);
  
  if (!proxyInfo) {
    console.warn("[fetchWithProxy] No proxy available, using direct connection");
    return fetch(url, options);
  }

  const usedHosts = new Set(excludeIPs || []);
  try {
    usedHosts.add(new URL(proxyInfo.url).hostname);
  } catch {
    usedHosts.add(proxyInfo.url);
  }

  globalProxyManager.markUsing(proxyInfo.url);

  try {
    const response = await executeWithProxy(url, options, proxyInfo);
    if (response.ok || proxyInfo.source !== "pool") return response;
    console.warn(`[fetchWithProxy] Pool proxy returned ${response.status}, retrying once with free-pool`);
  } catch (error) {
    if (proxyInfo.source !== "pool") throw error;
    console.warn("[fetchWithProxy] Pool proxy failed, retrying once with free-pool:", error);
  }

  const freeProxy = await globalProxyManager.getProxy(usedHosts, { skipPool: true });
  if (!freeProxy) {
    console.warn("[fetchWithProxy] No free-pool proxy available after pool failure; using direct connection");
    return fetch(url, options);
  }
  globalProxyManager.markUsing(freeProxy.url);
  return executeWithProxy(url, options, freeProxy);
}
