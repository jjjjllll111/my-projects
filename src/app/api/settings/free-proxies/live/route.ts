import { createErrorResponse, createErrorResponseFromUnknown } from "@/lib/api/errorResponse";
import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { freeProxyListSchema } from "@/shared/validation/freeProxySchemas";
import { getEnabledProviders, getProvider } from "@/lib/freeProxyProviders";
import type { FreeProxySourceId } from "@/lib/freeProxyProviders/types";

/**
 * 实时获取免费代理API（不经过数据库）
 * GET /api/settings/free-proxies/live
 * 
 * 直接从上游provider实时获取代理列表
 */
export async function GET(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(request.url);
    const raw = {
      sources: searchParams.get("sources") || undefined,
      protocol: searchParams.get("protocol") || undefined,
      country: searchParams.get("country") || undefined,
      minQuality: searchParams.get("minQuality") || undefined,
      limit: searchParams.get("limit") || undefined,
    };

    const validation = validateBody(freeProxyListSchema, raw);
    if (isValidationFailure(validation)) {
      return createErrorResponse({
        status: 400,
        message: validation.error.message,
        type: "invalid_request",
      });
    }

    // 确定要调用哪些provider
    const providers =
      validation.data.sources && validation.data.sources.length > 0
        ? validation.data.sources
            .map((id) => getProvider(id as FreeProxySourceId))
            .filter((p): p is NonNullable<typeof p> => p != null && p.isEnabled())
        : getEnabledProviders();

    if (providers.length === 0) {
      return Response.json({ items: [], total: 0, message: "No enabled providers" });
    }

    // 并行调用所有provider的fetchLive()方法
    const results = await Promise.allSettled(
      providers.map((provider) =>
        provider.fetchLive({
          protocol: validation.data.protocol,
          country: validation.data.country,
          minQuality: validation.data.minQuality,
          limit: validation.data.limit || 50,
        })
      )
    );

    // 合并所有成功的结果
    const allItems = results
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof providers[0]["fetchLive"]>>> => r.status === "fulfilled")
      .flatMap((r) => r.value);

    // 去重：按 host:port 去重（避免重复消耗limit配额）
    const deduplicatedMap = new Map<string, typeof allItems[0]>();
    for (const item of allItems) {
      const key = `${item.host}:${item.port}`;
      // 如果已存在，保留质量分更高的
      const existing = deduplicatedMap.get(key);
      if (!existing || (item.qualityScore ?? 0) > (existing.qualityScore ?? 0)) {
        deduplicatedMap.set(key, item);
      }
    }
    const deduplicatedItems = Array.from(deduplicatedMap.values());

    // 按质量分排序
    const sortedItems = deduplicatedItems.sort((a, b) => {
      const qualityA = a.qualityScore ?? 0;
      const qualityB = b.qualityScore ?? 0;
      return qualityB - qualityA;
    });

    // 应用limit
    const limit = validation.data.limit || 50;
    const items = sortedItems.slice(0, limit);

    console.log(`[free-proxies/live] Fetched ${items.length} proxies from ${providers.length} providers`);

    return Response.json({
      items,
      total: items.length,
      providers: providers.map((p) => p.id),
      realtime: true,
    });
  } catch (error) {
    return createErrorResponseFromUnknown(error, "Failed to fetch live proxies");
  }
}
