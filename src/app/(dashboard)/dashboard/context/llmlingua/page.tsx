"use client";

import { useEffect, useState } from "react";
import type { EngineConfigField } from "@omniroute/open-sse/services/compression/engines/types";
import { EngineConfigForm } from "@/shared/components/compression/EngineConfigForm";

/**
 * Custom LLMLingua configuration page with dynamic model loading.
 * 
 * Fetches both ONNX and API models dynamically, then renders a configuration
 * form with the combined model list.
 */

interface EngineEntry {
  id: string;
  name: string;
  description: string;
  icon: string;
  stackable: boolean;
  stackPriority: number;
  metadata: { description?: string; [key: string]: unknown };
  configSchema: EngineConfigField[];
}

interface CompressionSettings {
  engines?: Record<string, { enabled?: boolean; level?: string }>;
  llmlingua?: Record<string, unknown>;
  [key: string]: unknown;
}

export default function LlmlinguaPage() {
  const [engine, setEngine] = useState<EngineEntry | null>(null);
  const [configState, setConfigState] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // Load in parallel: engine info, dynamic models, and current settings
        const [enginesRes, modelsRes, settingsRes] = await Promise.all([
          fetch("/api/compression/engines"),
          fetch("/api/compression/llmlingua/models"),
          fetch("/api/settings/compression"),
        ]);

        if (cancelled) return;

        // Parse responses
        const enginesData = enginesRes.ok ? await enginesRes.json() : null;
        const modelsData = modelsRes.ok ? await modelsRes.json() : null;
        const settingsData = settingsRes.ok ? await settingsRes.json() : null;

        // Find llmlingua engine
        const llmlinguaEngine = enginesData?.engines?.find(
          (e: EngineEntry) => e.id === "llmlingua"
        );

        if (!llmlinguaEngine) {
          setError("LLMLingua engine not found");
          setLoading(false);
          return;
        }

        // Patch the model field with dynamic options
        // Use models array even if success is false (ONNX fallback)
        if (modelsData?.models && Array.isArray(modelsData.models)) {
          const modelField = llmlinguaEngine.configSchema.find(
            (f: EngineConfigField) => f.key === "model"
          );
          if (modelField) {
            modelField.options = modelsData.models.map((m: { value: string; label: string }) => ({
              value: m.value,
              label: m.label,
            }));
          }
        }

        // Initialize config state with defaults and stored values
        const defaults: Record<string, unknown> = {};
        for (const field of llmlinguaEngine.configSchema) {
          defaults[field.key] = field.defaultValue;
        }

        const storedConfig = settingsData?.llmlingua ?? {};
        const initialConfig = { ...defaults, ...storedConfig };

        if (!cancelled) {
          setEngine(llmlinguaEngine);
          setConfigState(initialConfig);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.error("[llmlingua-page] Load error:", err);
          setError("Failed to load configuration");
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Strip the 'enabled' key - that's managed by the panel
      const { enabled: _ignored, ...detail } = configState;

      const res = await fetch("/api/settings/compression", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llmlingua: detail }),
      });

      if (!res.ok) {
        setSaveError("Failed to save configuration");
      } else {
        setSaveSuccess(true);
      }
    } catch (err) {
      console.error("[llmlingua-page] Save error:", err);
      setSaveError("Failed to save configuration");
    } finally {
      setSaving(false);
    }
  }

  // Reset save success when config changes
  useEffect(() => {
    if (saveSuccess) {
      setSaveSuccess(false);
    }
  }, [configState]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-text-muted text-sm">
        Loading LLMLingua configuration...
      </div>
    );
  }

  if (error || !engine) {
    return (
      <div className="p-6 text-sm text-destructive">
        {error ?? "Failed to load LLMLingua engine"}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{engine.icon}</span>
          <h1 className="text-2xl font-semibold text-text">{engine.name}</h1>
        </div>
        <p className="text-sm text-text-muted">{engine.description}</p>
        {engine.metadata?.description && (
          <p className="text-sm text-text-muted">{engine.metadata.description}</p>
        )}
      </div>

      {/* Dynamic model info banner */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <span className="text-lg">✨</span>
          <div className="space-y-1">
            <p className="text-sm font-medium text-text">Dynamic Model Discovery</p>
            <p className="text-xs text-text-muted">
              Model list includes ONNX models (local) and API models (from configured providers).
              API models use LLM providers instead of downloading large model files.
            </p>
          </div>
        </div>
      </div>

      {/* Configuration form */}
      <div className="rounded-lg border border-border bg-surface p-6">
        <EngineConfigForm
          schema={engine.configSchema}
          value={configState}
          onChange={setConfigState}
        />

        {/* Save button */}
        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Configuration"}
          </button>
          {saveError && (
            <span className="text-sm text-destructive">{saveError}</span>
          )}
          {saveSuccess && !saveError && (
            <span className="text-sm text-green-600">
              Configuration saved successfully
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
