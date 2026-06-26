import { createErrorResponse, createErrorResponseFromUnknown } from "@/lib/api/errorResponse";

/**
 * Cron endpoint to sync free-pool proxies every 3 hours
 * Trigger: External cron service (e.g., cron-job.org)
 * Authentication: CRON_SECRET env var or x-cron-secret header
 */
export async function POST(request: Request) {
  try {
    // Verify cron secret
    const expectedSecret = process.env.CRON_SECRET;
    const providedSecret = request.headers.get("x-cron-secret") || new URL(request.url).searchParams.get("secret");

    if (expectedSecret && providedSecret !== expectedSecret) {
      return createErrorResponse({
        status: 401,
        message: "Invalid cron secret",
        type: "unauthorized",
      });
    }

    // Call internal sync API
    const baseUrl = process.env.NEXTAUTH_URL || `${new URL(request.url).protocol}//${new URL(request.url).host}`;
    const syncUrl = `${baseUrl}/api/settings/free-proxies/sync`;

    const syncResponse = await fetch(syncUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Pass through authentication if needed
        cookie: request.headers.get("cookie") || "",
      },
    });

    if (!syncResponse.ok) {
      const error = await syncResponse.text();
      return createErrorResponse({
        status: syncResponse.status,
        message: `Sync failed: ${error}`,
        type: "internal_error",
      });
    }

    const result = await syncResponse.json();
    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      syncResult: result,
    });
  } catch (error) {
    return createErrorResponseFromUnknown(error, "Failed to sync free proxies");
  }
}

/**
 * GET endpoint for manual testing
 */
export async function GET(request: Request) {
  return POST(request);
}
