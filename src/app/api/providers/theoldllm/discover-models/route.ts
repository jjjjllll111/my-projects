import { NextResponse } from "next/server";
import { fetchTheOldLlmModels } from "@/lib/providers/theoldllmModels";

/**
 * GET /api/providers/theoldllm/discover-models
 * 
 * Dynamically parses available models from TheOldLLM website HTML
 * Called when user clicks "Sync Models" button on provider page
 * 
 * No auth required - this is a public model discovery endpoint
 * 
 * Query params:
 *   - live=false : Skip live fetch, return fallback list immediately
 */

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const useLive = searchParams.get("live") !== "false"; // Default to live

  let result;
  if (useLive) {
    result = await fetchTheOldLlmModels();
  } else {
    // For testing/development: use fallback without hitting network
    const { getTheOldLlmFallbackModels } = await import("@/lib/providers/theoldllmModels");
    result = {
      ok: false,
      models: getTheOldLlmFallbackModels(),
      source: "static" as const,
    };
  }

  // Return in the format expected by the models sync system
  return NextResponse.json({
    data: result.models.map(m => ({
      id: m.id,
      name: m.name,
      ...(m.contextLength && { context_length: m.contextLength }),
    })),
    // Also include metadata for debugging
    _meta: {
      count: result.models.length,
      source: result.source,
      timestamp: new Date().toISOString(),
      ...(result.error && { warning: result.error }),
      notice:
        result.source === "live_scrape"
          ? `Successfully discovered ${result.models.length} models from TheOldLLM website`
          : `Using fallback list (${result.models.length} models). ${result.error || "Live scraping unavailable"}. TheOldLLM supports passthrough mode.`,
      websiteUrl: "https://theoldllm.vercel.app",
      usageHint: "Click 'Sync Models' button to fetch latest models from website",
    },
  });
}
