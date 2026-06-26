import { NextResponse } from "next/server";
import { LLMLINGUA_MODELS } from "@omniroute/open-sse/services/compression/engines/llmlingua/constants";
import { getAvailableChatModels } from "@omniroute/open-sse/services/compression/engines/llmlingua/apiBackend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/compression/llmlingua/models
 * Returns combined list of ONNX and API models for LLMLingua compression.
 * 
 * Internal API - no authentication required (called from config page).
 */
export async function GET() {
  try {
    // ONNX models (local)
    const onnxModels = Object.values(LLMLINGUA_MODELS).map((m) => ({
      value: m.id,
      label: m.label,
      type: "onnx",
      sizeMB: m.sizeMB,
    }));

    // API models (dynamic from service providers)
    let apiModels: Array<{ value: string; label: string; type: string; sizeMB: number }> = [];
    let apiError: string | null = null;

    try {
      const apiModelIds = await getAvailableChatModels();
      apiModels = apiModelIds.map((id) => ({
        value: id,
        label: `${id} (API)`,
        type: "api",
        sizeMB: 0,
      }));
    } catch (error) {
      console.error("[llmlingua-models-api] Failed to fetch API models:", error);
      apiError = "Failed to discover API models";
    }

    // Combine: ONNX first, then API models
    const allModels = [...onnxModels, ...apiModels];

    return NextResponse.json({
      success: apiError === null,
      models: allModels,
      count: allModels.length,
      onnxCount: onnxModels.length,
      apiCount: apiModels.length,
      ...(apiError && { warning: apiError }),
    });
  } catch (error) {
    console.error("[llmlingua-models-api] Unexpected error:", error);
    
    // Fallback to ONNX models only
    const onnxModels = Object.values(LLMLINGUA_MODELS).map((m) => ({
      value: m.id,
      label: m.label,
      type: "onnx",
      sizeMB: m.sizeMB,
    }));

    return NextResponse.json({
      success: false,
      models: onnxModels,
      count: onnxModels.length,
      onnxCount: onnxModels.length,
      apiCount: 0,
      error: "Failed to load models, showing ONNX fallback only",
    });
  }
}
