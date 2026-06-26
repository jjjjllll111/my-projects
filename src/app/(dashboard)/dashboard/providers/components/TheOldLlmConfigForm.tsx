"use client";

import { useState, useEffect } from "react";
import { Button, Card, Toggle } from "@/shared/components";

interface TheOldLlmConfigFormProps {
  providerId: string;
  initialConfig?: {
    useProxyPool?: boolean;
    proxyConcurrency?: number;
  };
  onSave?: (config: { useProxyPool: boolean; proxyConcurrency?: number }) => Promise<void>;
}

export function TheOldLlmConfigForm({ providerId, initialConfig, onSave }: TheOldLlmConfigFormProps) {
  const [useProxyPool, setUseProxyPool] = useState(initialConfig?.useProxyPool ?? false);
  const [proxyStats, setProxyStats] = useState({ 
    proxyPool: 0, 
    freeProxies: 0,
    freeProxiesExpiry: 0,
    currentlyUsing: 0 
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // 获取 ProxyManager 统计
  const loadProxyStats = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/proxy-manager");
      const data = await res.json();
      
      if (data.success && data.stats) {
        setProxyStats({
          proxyPool: data.stats.proxyPool || 0,
          freeProxies: data.stats.freeProxies || 0,
          freeProxiesExpiry: data.stats.freeProxiesExpiry || 0,
          currentlyUsing: data.stats.currentlyUsing || 0,
        });
      }
    } catch (error) {
      console.error("[TheOldLlmConfigForm] Failed to load proxy stats:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProxyStats();
    // 每 10 秒刷新一次统计（显示实时状态）
    const interval = setInterval(loadProxyStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (onSave) {
        await onSave({ useProxyPool, proxyConcurrency: 1 });
      }
      // 保存后刷新统计
      await loadProxyStats();
    } finally {
      setSaving(false);
    }
  };

  // 计算DB缓存
  const getCacheTimeRemaining = () => {
    if (proxyStats.freeProxiesExpiry === 0) return "未刷新";
    const remaining = Math.max(0, proxyStats.freeProxiesExpiry - Date.now());
    if (remaining === 0) return "已过期";
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}分${seconds}秒`;
  };

  return (
    <Card 
      title="TheOldLLM 代理池配置"
      subtitle="每次请求随机使用单个代理，降低单一 IP 限流风险"
      className="mt-4"
    >
      <div className="space-y-6">
        {/* 启用代理池开关 */}
        <Toggle
          checked={useProxyPool}
          onChange={setUseProxyPool}
          label="启用代理池"
          description="使用动态代理池发起请求，自动管理可用代理"
        />

        {/* 代理池统计 */}
        {useProxyPool && (
          <div className="rounded-lg border border-border p-4 bg-surface space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium text-text-main">代理池状态</h4>
              {loading ? (
                <span className="text-xs text-text-muted">加载中...</span>
              ) : (
                <Button 
                  size="sm" 
                  variant="ghost" 
                  onClick={loadProxyStats}
                  className="text-xs"
                >
                  刷新
                </Button>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 rounded bg-bg-subtle border border-border">
                <p className="text-text-muted text-xs mb-1">已验证(proxy_registry)</p>
                <p className="text-2xl font-bold text-emerald-500">{proxyStats.proxyPool}</p>
                <p className="text-xs text-text-muted mt-1">proxy_registry</p>
              </div>
              <div className="p-3 rounded bg-bg-subtle border border-border">
                <p className="text-text-muted text-xs mb-1">free-pool代理</p>
                <p className="text-2xl font-bold text-amber-500">{proxyStats.freeProxies}</p>
                <p className="text-xs text-text-muted mt-1">free_proxies DB</p>
              </div>
            </div>

            {/* 额外信息 */}
            <div className="grid grid-cols-2 gap-4 text-xs text-text-muted pt-2 border-t border-border">
              <div>
                <span className="font-medium">DB缓存: </span>
                <span>{getCacheTimeRemaining()}</span>
              </div>
              <div>
                <span className="font-medium">正在使用: </span>
                <span>{proxyStats.currentlyUsing} 个</span>
              </div>
            </div>

            <p className="text-xs text-text-muted pt-2 border-t border-border">
              💡 发起 TheOldLLM 请求时，每次只随机选择一个代理。优先使用 proxy_registry；失败或限流后重试 free-pool。free-pool 由后台每 3 小时同步。
            </p>
          </div>
        )}

        {/* 保存按钮 */}
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "保存中..." : "保存配置"}
        </Button>

        {/* 说明 */}
        <div className="text-xs text-text-muted space-y-1 pt-2 border-t border-border">
          <p className="font-medium">💡 工作原理</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>每次对话请求只使用一个随机代理，不再并发连接</li>
            <li>优先随机使用 proxy_registry 中已有可用代理</li>
            <li>proxy_registry 代理报错或限流时，同一次请求重试 free-pool 随机代理</li>
            <li>free-pool 成功代理不自动加入 proxy_registry，避免长期复用单一免费 IP</li>
            <li>free-pool 仍由后台每 3 小时自动同步免费代理</li>
          </ul>
        </div>
      </div>
    </Card>
  );
}
