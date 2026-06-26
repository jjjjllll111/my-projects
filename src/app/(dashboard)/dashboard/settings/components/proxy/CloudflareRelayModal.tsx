"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/shared/components";

interface CloudflareRelayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeployed: (poolProxyId: string, relayUrl: string) => void;
}

export default function CloudflareRelayModal({ isOpen, onClose, onDeployed }: CloudflareRelayModalProps) {
  const t = useTranslations("settings");
  const [apiToken, setApiToken] = useState("");
  const [accountId, setAccountId] = useState("");
  const [workerName, setWorkerName] = useState("omniroute-relay");
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDeploy = async () => {
    if (!apiToken.trim()) {
      setError(t("cloudflareRelayTokenRequired"));
      return;
    }
    if (!accountId.trim()) {
      setError(t("cloudflareRelayAccountRequired"));
      return;
    }
    setDeploying(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/proxy/cloudflare-deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiToken: apiToken.trim(),
          accountId: accountId.trim(),
          workerName: workerName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error?.message || t("cloudflareRelayDeployFailed"));
      } else {
        setApiToken("");
        setAccountId("");
        onDeployed(data.poolProxyId as string, data.relayUrl as string);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unknownError"));
    } finally {
      setDeploying(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloudflare-relay-title"
    >
      <div className="bg-surface rounded-lg shadow-xl p-6 w-full max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h2 id="cloudflare-relay-title" className="text-lg font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary" aria-hidden="true">
              cloud_upload
            </span>
            {t("cloudflareRelayModalTitle")}
          </h2>
          <button onClick={onClose} aria-label={t("close")} className="text-text-muted hover:text-text">
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
        </div>

        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded p-3 text-xs text-yellow-300">
          {t("cloudflareRelayWarning")}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block" htmlFor="cf-api-token">
              {t("cloudflareRelayTokenLabel")}
            </label>
            <input
              id="cf-api-token"
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              className="w-full text-sm bg-surface-alt border border-border rounded px-3 py-2 focus:outline-none focus:border-primary"
              placeholder="Cloudflare API Token..."
              autoComplete="off"
            />
            <p className="text-xs text-text-muted mt-1">
              {t("cloudflareRelayTokenHint")}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block" htmlFor="cf-account-id">
              {t("cloudflareRelayAccountLabel")}
            </label>
            <input
              id="cf-account-id"
              type="text"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full text-sm bg-surface-alt border border-border rounded px-3 py-2 focus:outline-none focus:border-primary"
              placeholder="Account ID"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block" htmlFor="cf-worker-name">
              {t("cloudflareRelayWorkerLabel")}
            </label>
            <input
              id="cf-worker-name"
              type="text"
              value={workerName}
              onChange={(e) => setWorkerName(e.target.value)}
              className="w-full text-sm bg-surface-alt border border-border rounded px-3 py-2 focus:outline-none focus:border-primary"
              placeholder="omniroute-relay"
            />
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded p-2">
            {error}
          </div>
        )}

        <p className="text-xs text-text-muted">{t("cloudflareRelayFreeTierNote")}</p>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={deploying}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleDeploy} disabled={deploying}>
            {deploying ? t("cloudflareRelayDeploying") : t("cloudflareRelayDeploy")}
          </Button>
        </div>
      </div>
    </div>
  );
}
