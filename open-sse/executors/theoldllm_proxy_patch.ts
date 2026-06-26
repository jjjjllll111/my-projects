

// ── 代理增强的fetch ──────────────────────────────────────────────────────

async function fetchWithProxy(
  url: string,
  options: RequestInit,
  proxyConfig?: { enabled: boolean; concurrency: number },
): Promise<Response> {
  // 如果未启用代理池，使用标准fetch
  if (!proxyConfig?.enabled) {
    return fetch(url, options);
  }

  // 获取可用代理
  const proxyUrl = await globalProxyManager.getProxy();
  
  if (!proxyUrl) {
    console.warn("[theoldllm] No proxy available, using direct connection");
    return fetch(url, options);
  }

  // 标记代理正在使用
  globalProxyManager.markUsing(proxyUrl);

  try {
    // 创建ProxyAgent
    const proxyAgent = new ProxyAgent(proxyUrl);
    
    // 使用代理发起请求
    const response = await fetch(url, {
      ...options,
      // @ts-ignore - dispatcher is supported but not in types
      dispatcher: proxyAgent,
    });

    // 标记成功
    globalProxyManager.markDone(proxyUrl, response.ok);
    
    return response;
  } catch (error) {
    // 标记失败
    globalProxyManager.markDone(proxyUrl, false);
    throw error;
  }
}
