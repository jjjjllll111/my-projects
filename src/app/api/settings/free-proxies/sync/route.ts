import { requireManagementAuth } from "@/lib/api/requireManagementAuth";
import { createErrorResponse, createErrorResponseFromUnknown } from "@/lib/api/errorResponse";
import { isValidationFailure, validateBody } from "@/shared/validation/helpers";
import { freeProxySyncSchema } from "@/shared/validation/freeProxySchemas";
import { getEnabledProviders, getProvider } from "@/lib/freeProxyProviders";
import type { FreeProxySourceId } from "@/lib/freeProxyProviders/types";
import { maintainProxyPool } from "@/lib/services/proxyValidator";

export async function POST(request: Request) {
  const authError = await requireManagementAuth(request);
  if (authError) return authError;

  let rawBody: unknown = {};
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      rawBody = await request.json();
    } catch {
      return createErrorResponse({
        status: 400,
        message: "Invalid JSON",
        type: "invalid_request",
      });
    }
  }

  const validation = validateBody(freeProxySyncSchema, rawBody);
  if (isValidationFailure(validation)) {
    return createErrorResponse({
      status: 400,
      message: validation.error.message,
      type: "invalid_request",
    });
  }

  try {
    const providers =
      validation.data.sources && validation.data.sources.length > 0
        ? validation.data.sources
            .map((id) => getProvider(id as FreeProxySourceId))
            .filter((p): p is NonNullable<typeof p> => p != null)
        : getEnabledProviders();

    const results: Record<string, unknown> = {};
    for (const provider of providers) {
      results[provider.id] = await provider.sync();
    }

    // 代理池维护：验证并添加10个可用代理，同时验证现有代理池
    const proxyMaintenance = await maintainProxyPool({
      targetNewProxies: 10,
      maxTestAttempts: 100,
      validateExisting: true,
    });


    return Response.json({ 
      success: true, 
      results,
      proxyMaintenance,
    });
  } catch (error) {
    return createErrorResponseFromUnknown(error, "Failed to sync free proxies");
  }
}
