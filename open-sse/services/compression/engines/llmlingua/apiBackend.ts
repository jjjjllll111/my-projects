/**
 * LLMLingua API backend - Dynamic model selection with proper filtering
 *
 * Returns available models from:
 * - FREE_APIKEY providers (no credentials needed)
 * - Configured providers (user has added credentials)
 *
 * Excludes hidden models and non-chat models.
 */

import type { LlmlinguaBackend, LlmlinguaBackendOptions } from "./index.ts";

// Import internal data sources
let getProviderConnections: any;
let getHiddenModelsByProvider: any;
let AI_MODELS: any[];
let AI_PROVIDERS: any;
let FREE_APIKEY_PROVIDER_IDS: Set<string>;
let NOAUTH_PROVIDERS: any;

/**
 * Get available models by checking configured providers
 */
async function getInternalModels(): Promise<string[]> {
  try {
    // Lazy import to avoid circular dependencies
    if (!getProviderConnections || !getHiddenModelsByProvider) {
      const dbModule = await import("@/lib/db/providers.ts");
      getProviderConnections = dbModule.getProviderConnections;

      const modelsDbModule = await import("@/lib/db/models.ts");
      getHiddenModelsByProvider = modelsDbModule.getHiddenModelsByProvider;
    }

    if (!AI_MODELS) {
      const modelsModule = await import("@/shared/constants/models.ts");
      AI_MODELS = modelsModule.AI_MODELS;
    }

    if (!AI_PROVIDERS || !FREE_APIKEY_PROVIDER_IDS || !NOAUTH_PROVIDERS) {
      const providersModule = await import("@/shared/constants/providers.ts");
      AI_PROVIDERS = providersModule.AI_PROVIDERS;
      FREE_APIKEY_PROVIDER_IDS = providersModule.FREE_APIKEY_PROVIDER_IDS;
      NOAUTH_PROVIDERS = providersModule.NOAUTH_PROVIDERS;
    }

    console.log(`[llmlingua-api] Discovering available models from configured providers`);

    // Get active provider connections from database (isActive: true)
    const connections = (await getProviderConnections({ isActive: true })) || [];
    const activeProviderIds = new Set(connections.map((c: any) => String(c.provider || "")));

    // Get hidden models
    const hiddenByProvider = getHiddenModelsByProvider() || new Map();

    // Build provider ID to aliases map
    const providerAliasMap = new Map<string, Set<string>>();
    Object.values(AI_PROVIDERS || {}).forEach((provider: any) => {
      const id = String(provider.id || "");
      const aliases = new Set<string>([id]);

      if (provider.alias && typeof provider.alias === "string") {
        aliases.add(provider.alias);
      }
      if (provider.aliases && Array.isArray(provider.aliases)) {
        provider.aliases.forEach((alias: string) => aliases.add(String(alias)));
      }

      providerAliasMap.set(id, aliases);
      // Also map each alias to the full set
      aliases.forEach((alias) => {
        providerAliasMap.set(alias, aliases);
      });
    });

    // Filter models
    const availableModels = AI_MODELS.filter((model) => {
      const modelId = String(model.model || "");
      const providerId = String(model.provider || "");
      const name = String(model.name || modelId).toLowerCase();

      // Exclude non-chat models
      if (name.includes("embedding")) return false;
      if (name.includes("whisper")) return false;
      if (name.includes("tts")) return false;
      if (name.includes("dall-e")) return false;
      if (name.includes("image")) return false;
      if (name.includes("audio")) return false;
      if (modelId.includes("embedding")) return false;

      // Check if model is hidden (by provider alias or ID)
      const aliases = providerAliasMap.get(providerId) || new Set([providerId]);
      const isHidden = Array.from(aliases).some((alias) => {
        const hiddenModels = hiddenByProvider.get(alias) || new Set();
        return hiddenModels.has(modelId);
      });
      if (isHidden) return false;

      // Check if provider is available
      // Either: free (no-auth) provider OR active configured provider (API key or OAuth)
      const isFreeProvider = Array.from(aliases).some(
        (alias) =>
          (NOAUTH_PROVIDERS && NOAUTH_PROVIDERS[alias]?.noAuth === true) ||
          FREE_APIKEY_PROVIDER_IDS.has(alias)
      );

      const isConfigured = Array.from(aliases).some((alias) => activeProviderIds.has(alias));

      return isFreeProvider || isConfigured;
    }).map((model) => `${model.provider}/${model.model}`);

    console.log(`[llmlingua-api] Found ${availableModels.length} available chat models`);

    // Fallback if no models found
    if (availableModels.length === 0) {
      console.warn("[llmlingua-api] No models available, using fallback");
      return ["openai/gpt-4o-mini"];
    }

    return availableModels;
  } catch (err) {
    console.warn("[llmlingua-api] Model discovery error:", err);
    return ["openai/gpt-4o-mini"];
  }
}

let cachedModels: string[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Get available chat models with caching
 */
async function getAvailableChatModels(): Promise<string[]> {
  const now = Date.now();
  if (cachedModels && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedModels;
  }

  const models = await getInternalModels();

  if (models.length > 0) {
    cachedModels = models;
    cacheTimestamp = now;
  }

  return models;
}

/**
 * Get the base URL for internal API calls
 */
function getInternalApiUrl(): string {
  if (process.env.OMNIROUTE_BASE_URL) {
    return process.env.OMNIROUTE_BASE_URL;
  }

  if (process.env.SPACE_HOST) {
    return `https://${process.env.SPACE_HOST}`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL;
  }

  const port = process.env.PORT || 7860;
  return `http://localhost:${port}`;
}

/**
 * API backend implementation - calls internal OmniRoute endpoint
 */
export const apiBackend: LlmlinguaBackend = async (
  text: string,
  opts?: LlmlinguaBackendOptions
): Promise<string> => {
  try {
    let model = opts?.model;

    if (!model) {
      const availableModels = await getAvailableChatModels();
      model = availableModels[0];
      if (!model) {
        console.warn("[llmlingua-api] No models available, returning original");
        return text;
      }
    }

    const [provider, ...modelParts] = model.split("/");
    const modelId = modelParts.join("/");

    const targetRate = opts?.compressionRate || 0.5;
    const targetLength = Math.floor(text.length * targetRate);

    const prompt = `Compress the following text to approximately ${targetLength} characters (${Math.floor(targetRate * 100)}%) while preserving ALL key information:\n\n${text}`;

    const baseUrl = getInternalApiUrl();
    const apiUrl = `${baseUrl}/v1/chat/completions`;

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-OmniRoute-Internal": "llmlingua-compression",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: "system",
            content:
              "You are a text compression expert. Compress text preserving all key information.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
        max_tokens: Math.max(targetLength * 2, 500),
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.warn(`[llmlingua-api] HTTP ${response.status}, returning original`);
      return text;
    }

    let result;
    try {
      result = await response.json();
    } catch (jsonErr) {
      console.warn("[llmlingua-api] Invalid JSON in completion response:", jsonErr);
      return text;
    }

    const compressed = result.choices?.[0]?.message?.content;

    if (!compressed || typeof compressed !== "string") {
      console.warn("[llmlingua-api] Invalid response, returning original");
      return text;
    }

    if (compressed.length >= text.length * 0.95) {
      console.warn("[llmlingua-api] Compression ineffective, returning original");
      return text;
    }

    return compressed.trim();
  } catch (err) {
    console.warn("[llmlingua-api] Backend error, returning original:", err);
    return text;
  }
};

export { getAvailableChatModels };
