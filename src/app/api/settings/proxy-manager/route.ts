import { NextRequest, NextResponse } from "next/server";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";

/**
 * GET /api/settings/proxy-manager/stats
 * 获取 ProxyManager 的实时统计（内存中的缓存状态）
 */
export async function GET(request: NextRequest) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { globalProxyManager } = await import("@omniroute/open-sse/executors/proxyManager");
    const stats = globalProxyManager.getStats();
    
    return NextResponse.json({
      success: true,
      stats: {
        proxyPool: stats.proxyPool,
        freeProxies: stats.freeProxies,
        currentlyUsing: stats.currentlyUsing,
        successfulProxies: stats.successfulProxies,
      },
    });
  } catch (error) {
    console.error("[proxy-manager/stats] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to get proxy manager stats",
        stats: {
          proxyPool: 0,
          freeProxies: 0,
          currentlyUsing: 0,
          successfulProxies: 0,
        },
      },
      { status: 500 }
    );
  }
}