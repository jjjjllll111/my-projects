import { getProviderConnections, updateProviderConnection } from '@/lib/localDb';
import { getAccessToken, getRefreshLeadMs, supportsTokenRefresh } from '@omniroute/open-sse/services/tokenRefresh.ts';
import * as log from '../utils/logger';

let refreshTimer: NodeJS.Timeout | null = null;
const REFRESH_INTERVAL_MS = 30 * 60 * 1000;

async function refreshExpiringTokens() {
  try {
    const allConnections = await getProviderConnections();
    const now = Date.now();
    for (const conn of allConnections) {
      if (!conn.refreshToken || !conn.expiresAt) continue;
      if (!supportsTokenRefresh(conn.provider)) continue;
      const expiresAt = new Date(conn.expiresAt).getTime();
      const leadMs = getRefreshLeadMs(conn.provider);
      if (expiresAt - now < leadMs) {
        log.info('TOKEN_REFRESH_SCHEDULER', `Proactively refreshing ${conn.provider} token`, { connectionId: conn.id, expiresIn: Math.round((expiresAt - now) / 1000) });
        try {
          const result = await getAccessToken(conn.provider, { connectionId: conn.id, refreshToken: conn.refreshToken, accessToken: conn.accessToken, expiresAt: conn.expiresAt, providerSpecificData: conn.providerSpecificData });
          if (result?.accessToken) {
            await updateProviderConnection(conn.id, { accessToken: result.accessToken, refreshToken: result.refreshToken || conn.refreshToken, expiresAt: result.expiresAt || new Date(Date.now() + (result.expiresIn || 7200) * 1000).toISOString() });
            log.info('TOKEN_REFRESH_SCHEDULER', `Successfully refreshed ${conn.provider} token`);
          }
        } catch (err) {
          log.error('TOKEN_REFRESH_SCHEDULER', `Failed to refresh ${conn.provider} token`, { error: (err as Error).message });
        }
      }
    }
  } catch (err) {
    log.error('TOKEN_REFRESH_SCHEDULER', 'Error in refresh loop', { error: (err as Error).message });
  }
}

export function startTokenRefreshScheduler() {
  if (refreshTimer) return;
  log.info('TOKEN_REFRESH_SCHEDULER', 'Starting background token refresh scheduler');
  refreshTimer = setInterval(refreshExpiringTokens, REFRESH_INTERVAL_MS);
  refreshTimer.unref?.();
  setTimeout(refreshExpiringTokens, 60 * 1000);
}

export function stopTokenRefreshScheduler() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; log.info('TOKEN_REFRESH_SCHEDULER', 'Stopped background token refresh scheduler'); }
}
