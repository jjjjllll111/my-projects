"use client";
import { useState } from "react";
import { Button } from "@/shared/components";
import { useTranslations } from "next-intl";
import ProxyRegistryManager from "../ProxyRegistryManager";
import VercelRelayModal from "./VercelRelayModal";
import CloudflareRelayModal from "./CloudflareRelayModal";

export default function ProxyPoolTab() {
  const t = useTranslations("settings");
  const [vercelModalOpen, setVercelModalOpen] = useState(false);
  const [cloudflareModalOpen, setCloudflareModalOpen] = useState(false);

  const showVercelRelay = process.env.NEXT_PUBLIC_VERCEL_RELAY_ENABLED !== "false";
  const showCloudflareRelay = process.env.NEXT_PUBLIC_CLOUDFLARE_RELAY_ENABLED !== "false";

  const handleVercelDeployed = (_poolProxyId: string, relayUrl: string) => {
    alert(`${t("vercelRelaySuccess")}: ${relayUrl}`);
  };

  const handleCloudflareDeployed = (_poolProxyId: string, relayUrl: string) => {
    alert(`${t("cloudflareRelaySuccess")}: ${relayUrl}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        {showVercelRelay && (
          <Button
            size="sm"
            variant="secondary"
            icon="cloud_upload"
            onClick={() => setVercelModalOpen(true)}
          >
            {t("vercelRelayButton")}
          </Button>
        )}
        {showCloudflareRelay && (
          <Button
            size="sm"
            variant="secondary"
            icon="cloud_upload"
            onClick={() => setCloudflareModalOpen(true)}
          >
            {t("cloudflareRelayButton")}
          </Button>
        )}
      </div>
      <ProxyRegistryManager />
      <VercelRelayModal
        isOpen={vercelModalOpen}
        onClose={() => setVercelModalOpen(false)}
        onDeployed={handleVercelDeployed}
      />
      <CloudflareRelayModal
        isOpen={cloudflareModalOpen}
        onClose={() => setCloudflareModalOpen(false)}
        onDeployed={handleCloudflareDeployed}
      />
    </div>
  );
}
