import { z } from "zod";

export const theoldllmConfigSchema = z.object({
  useProxyPool: z.boolean().optional().default(false),
  proxyConcurrency: z.number().min(1).max(100).optional().default(3), // 1-100 并发
  // 移除 enableDynamicModels - 强制启用动态模型发现
});

export type TheOldLlmConfigInput = z.input<typeof theoldllmConfigSchema>;
export type TheOldLlmConfigOutput = z.output<typeof theoldllmConfigSchema>;
