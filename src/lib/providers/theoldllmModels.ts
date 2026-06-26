/**
 * TheOldLLM Models Discovery Service
 * Shared logic for fetching and parsing models from TheOldLLM website
 */

export interface TheOldLlmModel {
  id: string;
  name: string;
  contextLength?: number;
}

export interface TheOldLlmDiscoveryResult {
  ok: boolean;
  models: TheOldLlmModel[];
  source: "live_scrape" | "fallback";
  error?: string;
}

// Fallback static list (updated 2026-06-25 from actual website)
const FALLBACK_MODELS: TheOldLlmModel[] = [
  // OpenAI models (10)
  { id: "GPT_5_4", name: "GPT-5.4", contextLength: 400000 },
  { id: "GPT_5_3", name: "GPT-5.3", contextLength: 400000 },
  { id: "GPT_5_2", name: "GPT-5.2", contextLength: 400000 },
  { id: "GPT_5_1", name: "GPT-5.1", contextLength: 400000 },
  { id: "GPT_5", name: "GPT-5", contextLength: 400000 },
  { id: "GPT_4O", name: "GPT-4o", contextLength: 128000 },
  { id: "GPT_4O_MINI", name: "OpenRouter GPT-4o Mini", contextLength: 128000 },
  { id: "GPT_4", name: "OpenRouter GPT-4", contextLength: 128000 },
  { id: "O4_MINI", name: "O4 Mini", contextLength: 200000 },
  { id: "O3_MINI", name: "O3 Mini", contextLength: 200000 },
  
  // Anthropic models (3)
  { id: "CLAUDE_4_6_OPUS", name: "Claude 4.6 Opus", contextLength: 200000 },
  { id: "CLAUDE_4_6_SONNET", name: "Claude 4.6 Sonnet", contextLength: 200000 },
  { id: "CLAUDE_4_5_HAIKU", name: "Claude 4.5 Haiku", contextLength: 200000 },
  
  // Google models (4)
  { id: "GEMINI_3_PRO", name: "Gemini 3 Pro", contextLength: 1000000 },
  { id: "GEMINI_2_5_PRO", name: "Gemini 2.5 Pro", contextLength: 1000000 },
  { id: "GEMINI_2_0_FLASH", name: "Gemini 2.0 Flash", contextLength: 1000000 },
  { id: "GEMINI_1_5_FLASH", name: "Gemini 1.5 Flash", contextLength: 1000000 },
  
  // Perplexity models (2)
  { id: "SONAR_PRO", name: "Sonar Pro", contextLength: 128000 },
  { id: "SONAR_DEEP_RESEARCH", name: "Sonar Deep Research", contextLength: 128000 },
  
  // DeepSeek models (4)
  { id: "DEEPSEEK_R1_TOGETHER", name: "Together DeepSeek R1", contextLength: 200000 },
  { id: "DEEPSEEK_R1_OPENROUTER", name: "OpenRouter DeepSeek R1", contextLength: 200000 },
  { id: "DEEPSEEK_V3_TOGETHER", name: "Together DeepSeek V3", contextLength: 200000 },
  { id: "DEEPSEEK_V3_OPENROUTER", name: "OpenRouter DeepSeek V3", contextLength: 200000 },
  
  // xAI models (1)
  { id: "GROK_4_OPENROUTER", name: "OpenRouter Grok 4", contextLength: 128000 },
  
  // OpenRouter models (1)
  { id: "OPENROUTER_WEB_SEARCH", name: "OpenRouter Web Search", contextLength: 128000 },
];

/**
 * Parse model names from HTML using regex (no external dependencies)
 */
function parseModelsFromHtml(html: string): TheOldLlmModel[] {
  const models: TheOldLlmModel[] = [];
  const seen = new Set<string>();

  try {
    // Extract all model name spans with regex
    const modelNameRegex = /<span[^>]*class="[^"]*font-semibold[^"]*text-foreground[^"]*"[^>]*>([^<]+)<\/span>/g;
    
    let match;
    while ((match = modelNameRegex.exec(html)) !== null) {
      try {
        const name = match[1].trim();
        
        // Skip empty or invalid names
        if (!name || name.length < 2) continue;
        
        // Convert to internal ID
        const id = modelNameToId(name);
        
        // Avoid duplicates
        if (seen.has(id)) continue;
        seen.add(id);
        
        // Estimate context length
        const contextLength = estimateContextLength(name);
        
        models.push({ id, name, contextLength });
      } catch {
        // Skip malformed entries
      }
    }
  } catch (error) {
    console.error("[theoldllm-discovery] HTML parsing error:", error);
  }

  return models;
}

/**
 * Convert display name to internal ID format
 */
function modelNameToId(name: string): string {
  // Remove common prefixes
  const cleaned = name
    .replace(/^(OpenRouter|Together)\s+/i, "")
    .trim();
  
  // Convert to internal ID format (uppercase with underscores)
  const id = cleaned
    .replace(/\s+/g, "_")
    .replace(/[.-]/g, "_")
    .toUpperCase();
  
  // Map to known internal IDs (maintain compatibility with executor)
  const idMap: Record<string, string> = {
    "GPT_4O": "GPT_4O",
    "GPT_5": "GPT_5",
    "GPT_5_1": "GPT_5_1",
    "GPT_5_2": "GPT_5_2",
    "GPT_5_3": "GPT_5_3",
    "GPT_5_4": "GPT_5_4",
    "CLAUDE_OPUS_4": "CLAUDE_4_6_OPUS",
    "CLAUDE_SONNET_4": "CLAUDE_4_6_SONNET",
    "CLAUDE_HAIKU_3_5": "CLAUDE_4_5_HAIKU",
    "CLAUDE_4_6_OPUS": "CLAUDE_4_6_OPUS",
    "CLAUDE_4_6_SONNET": "CLAUDE_4_6_SONNET",
    "CLAUDE_4_5_HAIKU": "CLAUDE_4_5_HAIKU",
  };
  
  return idMap[id] || id;
}

/**
 * Estimate context length based on model name
 */
function estimateContextLength(name: string): number {
  if (name.includes("GPT-5") || name.includes("GPT 5")) return 400000;
  if (name.includes("O4") || name.includes("O3")) return 200000;
  if (name.includes("GPT-4") || name.includes("GPT 4")) return 128000;
  if (name.includes("Claude")) return 200000;
  if (name.includes("Gemini 3")) return 1000000;
  if (name.includes("Gemini 2")) return 1000000;
  if (name.includes("Gemini 1")) return 1000000;
  if (name.includes("DeepSeek")) return 200000;
  if (name.includes("Grok")) return 128000;
  if (name.includes("Sonar")) return 128000;
  return 128000; // Default
}

/**
 * Fetch and parse models from TheOldLLM website
 * Main entry point for model discovery
 */
export async function fetchTheOldLlmModels(): Promise<TheOldLlmDiscoveryResult> {
  try {
    console.log("[theoldllm-discovery] Fetching live models from website...");
    
    const response = await fetch("https://theoldllm.vercel.app/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    console.log("[theoldllm-discovery] HTML fetched, parsing models...");
    
    const models = parseModelsFromHtml(html);
    
    if (models.length > 0) {
      console.log(`[theoldllm-discovery] Successfully parsed ${models.length} models from website`);
      return {
        ok: true,
        models,
        source: "live_scrape",
      };
    }
    
    console.warn("[theoldllm-discovery] No models found in HTML, using fallback");
    return {
      ok: false,
      models: FALLBACK_MODELS,
      source: "fallback",
      error: "No models found in HTML",
    };
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[theoldllm-discovery] Live fetch failed:", errorMsg);
    return {
      ok: false,
      models: FALLBACK_MODELS,
      source: "fallback",
      error: errorMsg,
    };
  }
}

/**
 * Get fallback models (for testing or when live fetch is disabled)
 */
export function getTheOldLlmFallbackModels(): TheOldLlmModel[] {
  return FALLBACK_MODELS;
}
