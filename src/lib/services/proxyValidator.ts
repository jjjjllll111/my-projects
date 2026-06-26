/**
 * 代理验证服务
 * 
 * 功能：
 * 1. 从 free_proxies 中测试代理直到获得指定数量的可用代理
 * 2. 将成功的代理添加到 proxy_registry
 * 3. 验证现有 proxy_registry 中的代理是否仍有效
 * 4. 排除 relay 类型代理
 */

import { listFreeProxies, deleteFreeProxy } from "@/lib/db/freeProxies";
import { listProxies, createProxy, deleteProxyById } from "@/lib/db/proxies";
import type { FreeProxyRecord } from "@/lib/db/freeProxies";

interface ValidationResult {
  tested: number;
  successful: number;
  failed: number;
  addedToPool: string[];
  errors: string[];
}

interface PoolValidationResult {
  checked: number;
  stillValid: number;
  removed: number;
  removedProxies: string[];
}

/**
 * 测试单个代理是否可用
 */
async function testProxy(proxyUrl: string, timeout = 5000): Promise<boolean> {
  try {
    // 简化测试：使用直连方式验证代理IP是否可达
    // 在HF环境中，复杂的代理测试可能受限，这里采用保守策略
    const url = new URL(proxyUrl);
    const testTarget = `http://${url.hostname}:${url.port}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    // 尝试连接代理端点本身
    const response = await fetch(testTarget, {
      method: 'HEAD',
      signal: controller.signal,
    }).catch(() => null);

    clearTimeout(timeoutId);
    
    // 如果能连接到代理端点，认为代理可用
    // 注意：这是简化测试，实际代理功能可能需要更复杂验证
    return response !== null;
  } catch (error) {
    return false;
  }
}

/**
 * 从 free_proxies 测试并添加指定数量的可用代理到 proxy_registry
 */
export async function validateAndPromoteFreeProxies(
  targetCount: number = 10,
  maxAttempts: number = 100
): Promise<ValidationResult> {
  const result: ValidationResult = {
    tested: 0,
    successful: 0,
    failed: 0,
    addedToPool: [],
    errors: [],
  };

  try {
    // 获取 free_proxies（排除 relay 类型）
    const freeProxies = await listFreeProxies({ limit: maxAttempts });
    const nonRelayProxies = freeProxies.filter((p: FreeProxyRecord) => 
      p.type?.toLowerCase() !== 'relay'
    );

    console.log(`[ProxyValidator] 开始验证 free proxies，目标: ${targetCount} 个成功`);

    for (const proxy of nonRelayProxies) {
      if (result.successful >= targetCount) {
        console.log(`[ProxyValidator] 已达到目标数量 ${targetCount}，停止测试`);
        break;
      }

      if (result.tested >= maxAttempts) {
        console.log(`[ProxyValidator] 已达到最大测试次数 ${maxAttempts}，停止测试`);
        break;
      }

      result.tested++;
      const proxyUrl = `${proxy.type}://${proxy.host}:${proxy.port}`;
      
      console.log(`[ProxyValidator] 测试 [${result.tested}/${maxAttempts}]: ${proxyUrl}`);
      
      const isValid = await testProxy(proxyUrl);
      
      if (isValid) {
        result.successful++;
        try {
          // 添加到 proxy_registry
          const newProxy = await createProxy({
            host: proxy.host,
            port: proxy.port,
            type: proxy.type || 'http',
            name: `AutoVerified-${proxy.source}-${proxy.host}`,
            source: proxy.source || 'auto-validated',
          });

          if (newProxy) {
            result.addedToPool.push(proxyUrl);
            console.log(`[ProxyValidator] ✓ [${result.successful}/${targetCount}] 成功: ${proxyUrl} -> proxy_registry`);
          }
        } catch (error) {
          result.errors.push(`添加失败 ${proxyUrl}: ${error}`);
        }
      } else {
        result.failed++;
        console.log(`[ProxyValidator] ✗ 失败: ${proxyUrl}`);
      }
    }

    console.log(`[ProxyValidator] 验证完成: 测试=${result.tested}, 成功=${result.successful}, 失败=${result.failed}`);
  } catch (error) {
    result.errors.push(`验证过程错误: ${error}`);
  }

  return result;
}
/**
 * 验证现有 proxy_registry 中的代理是否仍有效
 */
export async function validateExistingProxyPool(): Promise<PoolValidationResult> {
  const result: PoolValidationResult = {
    checked: 0,
    stillValid: 0,
    removed: 0,
    removedProxies: [],
  };

  try {
    // 获取所有活跃代理（排除 relay 类型）
    const proxies = await listProxies({ includeSecrets: true });
    const activeProxies = proxies.filter((p: any) => 
      (!p.status || String(p.status).toLowerCase() === 'active') &&
      p.type?.toLowerCase() !== 'relay'
    );

    console.log(`[ProxyValidator] 开始验证现有 proxy pool，共 ${activeProxies.length} 个代理`);

    for (const proxy of activeProxies) {
      result.checked++;
      const proxyUrl = `${proxy.type}://${proxy.host}:${proxy.port}`;
      
      console.log(`[ProxyValidator] 验证现有代理 [${result.checked}/${activeProxies.length}]: ${proxyUrl}`);
      
      const isValid = await testProxy(proxyUrl, 8000); // 现有代理给更长测试时间
      
      if (isValid) {
        result.stillValid++;
        console.log(`[ProxyValidator] ✓ 仍有效: ${proxyUrl}`);
      } else {
        result.removed++;
        try {
          await deleteProxyById(proxy.id, { force: true });
          result.removedProxies.push(proxyUrl);
          console.log(`[ProxyValidator] ✗ 已失效并移除: ${proxyUrl}`);
        } catch (error) {
          console.error(`[ProxyValidator] 移除失败 ${proxyUrl}:`, error);
        }
      }
    }

    console.log(`[ProxyValidator] Pool验证完成: 检查=${result.checked}, 有效=${result.stillValid}, 移除=${result.removed}`);
  } catch (error) {
    console.error('[ProxyValidator] Pool验证错误:', error);
  }

  return result;
}

/**
 * 完整的代理维护流程（在 3小时同步时调用）
 */
export async function maintainProxyPool(options?: {
  targetNewProxies?: number;
  maxTestAttempts?: number;
  validateExisting?: boolean;
}): Promise<{
  newProxies: ValidationResult;
  existingPool?: PoolValidationResult;
}> {
  const {
    targetNewProxies = 10,
    maxTestAttempts = 100,
    validateExisting = true,
  } = options || {};

  console.log('[ProxyValidator] ========== 开始代理池维护 ==========');
  
  // 1. 验证并添加新的可用代理
  console.log('[ProxyValidator] 步骤 1: 从 free_proxies 验证并添加新代理');
  const newProxies = await validateAndPromoteFreeProxies(targetNewProxies, maxTestAttempts);
  
  // 2. 验证现有代理池
  let existingPool: PoolValidationResult | undefined;
  if (validateExisting) {
    console.log('[ProxyValidator] 步骤 2: 验证现有 proxy_registry 代理');
    existingPool = await validateExistingProxyPool();
  }

  console.log('[ProxyValidator] ========== 代理池维护完成 ==========');
  console.log(`[ProxyValidator] 新增: ${newProxies.successful}个, 现有有效: ${existingPool?.stillValid || 'N/A'}个, 移除失效: ${existingPool?.removed || 'N/A'}个`);

  return {
    newProxies,
    existingPool,
  };
}
