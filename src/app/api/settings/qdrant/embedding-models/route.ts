import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/shared/utils/apiAuth";
import { AI_MODELS } from "@/shared/constants/models";
import { EMBEDDING_PROVIDERS } from "@omniroute/open-sse/config/embeddingRegistry.ts";
import { getProviderConnections } from "@/lib/db/providers";
import { sanitizeErrorMessage } from "@omniroute/open-sse/utils/error.ts";

type EmbeddingModelOption = {
  value: string;
  label: string;
};

type ProviderConnectionLike = {
  provider?: unknown;
  apiKey?: unknown;
  isActive?: unknown;
};

const EMBEDDING_PROVIDER_ALIASES: Record<string, string> = {
  jina: "jina-ai",
  voyage: "voyage-ai",
};

function hasUsableApiKey(connection: ProviderConnectionLike): boolean {
  return typeof connection.apiKey === "string" && connection.apiKey.trim().length > 0;
}

function normalizeProviderId(providerId: string): string {
  return EMBEDDING_PROVIDER_ALIASES[providerId] || providerId;
}

function isLikelyEmbeddingModel(provider: string, model: string, name: string): boolean {
  const haystack = `${provider}/${model} ${name}`.toLowerCase();
  if (haystack.includes("embedding")) return true;
  if (haystack.includes("embed")) return true;
  if (haystack.includes("text-embedding")) return true;
  return false;
}

function pushOption(options: EmbeddingModelOption[], value: string, label: string) {
  if (options.some((o) => o.value === value)) return;
  options.push({ value, label });
}

export async function GET(request: NextRequest) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const activeConnections = (await getProviderConnections({
      isActive: true,
    })) as ProviderConnectionLike[];
    const activeCredentialProviders = new Set(
      activeConnections
        .filter(hasUsableApiKey)
        .map((connection) => normalizeProviderId(String(connection.provider || "").trim()))
        .filter(Boolean)
    );

    const options: EmbeddingModelOption[] = [];

    // Add registered embedding models only for providers with active API credentials.
    for (const [providerId, provider] of Object.entries(EMBEDDING_PROVIDERS)) {
      if (!activeCredentialProviders.has(normalizeProviderId(providerId))) continue;
      for (const model of provider.models || []) {
        const value = `${providerId}/${model.id}`;
        pushOption(options, value, `${value} - ${model.name}`);
      }
    }

    // Add catalog models for active credential providers that are not in the embedding registry.
    for (const model of AI_MODELS as any[]) {
      const provider = String(model.provider || "");
      const modelId = String(model.model || "");
      const name = String(model.name || "");
      if (!activeCredentialProviders.has(normalizeProviderId(provider))) continue;
      if (!isLikelyEmbeddingModel(provider, modelId, name)) continue;
      const value = `${provider}/${modelId}`;
      pushOption(options, value, `${value} - ${name}`);
    }

    // Add OpenRouter account models that explicitly support embeddings.
    if (activeCredentialProviders.has("openrouter")) {
      try {
        const connections = activeConnections.filter(
          (c) =>
            normalizeProviderId(String(c.provider || "")) === "openrouter" && hasUsableApiKey(c)
        );
        const apiKey = connections[0]?.apiKey as string | undefined;

        if (apiKey) {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 7000);
          let res: Response;
          try {
            res = await fetch("https://openrouter.ai/api/v1/models?output_modalities=embeddings", {
              method: "GET",
              headers: {
                Authorization: `Bearer ${apiKey}`,
              },
              cache: "no-store",
              signal: controller.signal,
            });
          } finally {
            clearTimeout(timeout);
          }
          if (res.ok) {
            const data = (await res.json().catch(() => null)) as any;
            const rows = Array.isArray(data?.data) ? data.data : [];
            for (const row of rows) {
              const id = typeof row?.id === "string" ? row.id.trim() : "";
              if (!id) continue;
              const value = `openrouter/${id}`;
              pushOption(options, value, `${value} - ${String(row?.name || id)}`);
            }
          }
        }
      } catch {
        // Best effort only: keep endpoint fast and resilient.
      }
    }

    options.sort((a, b) => a.value.localeCompare(b.value)); // teknik sıralama: ASCII kasıtlı

    return NextResponse.json({ models: options });
  } catch (error) {
    const message = sanitizeErrorMessage(error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: { message }, models: [] }, { status: 500 });
  }
}
