/**
 * 免费代理自动同步调度器
 * 每3小时从所有启用的provider同步代理到 free_proxies 表
 */

import { getEnabledProviders } from "../freeProxyProviders";

let intervalId: NodeJS.Timeout | null = null;
let isRunning = false;
let lastSyncTime: string | null = null;
let lastSyncStatus: "success" | "failed" | "idle" = "idle";
let lastSyncError: string | null = null;

const SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3小时

async function performSync(): Promise<void> {
  if (isRunning) {
    console.log("[FreeProxyScheduler] Sync already running, skipping");
    return;
  }

  isRunning = true;
  console.log("[FreeProxyScheduler] Starting automatic sync (3h cycle)...");

  try {
    const providers = getEnabledProviders();
    let totalAdded = 0;
    let totalUpdated = 0;
    const errors: string[] = [];

    for (const provider of providers) {
      try {
        const result = await provider.sync();
        totalAdded += result.added;
        totalUpdated += result.updated;
        if (result.errors.length > 0) {
          errors.push(`${provider.id}: ${result.errors.join("; ")}`);
        }
        console.log(`[FreeProxyScheduler] ${provider.id}: +${result.added} added, +${result.updated} updated`);
      } catch (err) {
        errors.push(`${provider.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    lastSyncStatus = "success";
    lastSyncError = errors.length > 0 ? errors.join(" | ") : null;
    lastSyncTime = new Date().toISOString();
    console.log(`[FreeProxyScheduler] ✓ Sync done: ${totalAdded} added, ${totalUpdated} updated, ${errors.length} errors`);
  } catch (error) {
    lastSyncStatus = "failed";
    lastSyncError = error instanceof Error ? error.message : String(error);
    lastSyncTime = new Date().toISOString();
    console.error("[FreeProxyScheduler] ✗ Sync error:", error);
  } finally {
    isRunning = false;
  }
}

export function startFreeProxyScheduler(): void {
  if (intervalId) {
    console.log("[FreeProxyScheduler] Already running");
    return;
  }

  const enabled = process.env.FREE_PROXY_AUTO_SYNC !== "false";
  if (!enabled) {
    console.log("[FreeProxyScheduler] Auto-sync disabled (FREE_PROXY_AUTO_SYNC=false)");
    return;
  }

  console.log(`[FreeProxyScheduler] Starting scheduler (interval: 3h)`);

  // 启动后60秒执行一次（避免和启动流程冲突）
  setTimeout(() => performSync().catch(console.error), 60000);

  intervalId = setInterval(() => {
    performSync().catch(console.error);
  }, SYNC_INTERVAL_MS);

  console.log("[FreeProxyScheduler] ✓ Scheduler started (3h interval)");
}

export function stopFreeProxyScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[FreeProxyScheduler] ✓ Scheduler stopped");
  }
}

export function getFreeProxySchedulerStatus(): {
  enabled: boolean;
  running: boolean;
  lastSyncTime: string | null;
  lastSyncStatus: "success" | "failed" | "idle";
  lastSyncError: string | null;
  nextSyncIn: number | null;
} {
  return {
    enabled: intervalId !== null,
    running: isRunning,
    lastSyncTime,
    lastSyncStatus,
    lastSyncError,
    nextSyncIn: intervalId ? SYNC_INTERVAL_MS : null,
  };
}

export async function triggerManualSync(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    await performSync();
    return { success: lastSyncStatus === "success", error: lastSyncError || undefined };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}