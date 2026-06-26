import type { RegistryEntry } from "../../shared.ts";

export const theoldllmProvider: RegistryEntry = {
  id: "theoldllm",
  alias: "tllm",
  format: "openai",
  executor: "theoldllm",
  // Playwright-backed executor — no standard auth; uses embedded browser for token generation
  baseUrl: "https://theoldllm.vercel.app/api/chatgpt",
  baseUrls: ["https://theoldllm.vercel.app/api/chatgpt"],
  authType: "none",
  authHeader: "none",
  defaultContextLength: 200000,
  // Note: Dynamic model discovery available via /api/providers/theoldllm/discover-models
  // Current list updated 2026-06-25 from live website (25 models)
  models: [
    // OpenAI models (10)
    { id: "GPT_5_4", name: "GPT-5.4 (The Old LLM 🆓)", contextLength: 400000 },
    { id: "GPT_5_3", name: "GPT-5.3 (The Old LLM 🆓)", contextLength: 400000 },
    { id: "GPT_5_2", name: "GPT-5.2 (The Old LLM 🆓)", contextLength: 400000 },
    { id: "GPT_5_1", name: "GPT-5.1 (The Old LLM 🆓)", contextLength: 400000 },
    { id: "GPT_5", name: "GPT-5 (The Old LLM 🆓)", contextLength: 400000 },
    { id: "GPT_4O", name: "GPT-4o (The Old LLM 🆓)", contextLength: 128000 },
    { id: "GPT_4O_MINI", name: "OpenRouter GPT-4o Mini (The Old LLM 🆓)", contextLength: 128000 },
    { id: "GPT_4", name: "OpenRouter GPT-4 (The Old LLM 🆓)", contextLength: 128000 },
    { id: "O4_MINI", name: "O4 Mini (The Old LLM 🆓)", contextLength: 200000 },
    { id: "O3_MINI", name: "O3 Mini (The Old LLM 🆓)", contextLength: 200000 },
    
    // Anthropic models (3)
    { id: "CLAUDE_4_6_OPUS", name: "Claude 4.6 Opus (The Old LLM 🆓)", contextLength: 200000 },
    { id: "CLAUDE_4_6_SONNET", name: "Claude 4.6 Sonnet (The Old LLM 🆓)", contextLength: 200000 },
    { id: "CLAUDE_4_5_HAIKU", name: "Claude 4.5 Haiku (The Old LLM 🆓)", contextLength: 200000 },
    
    // Google models (4)
    { id: "GEMINI_3_PRO", name: "Gemini 3 Pro (The Old LLM 🆓)", contextLength: 1000000 },
    { id: "GEMINI_2_5_PRO", name: "Gemini 2.5 Pro (The Old LLM 🆓)", contextLength: 1000000 },
    { id: "GEMINI_2_0_FLASH", name: "Gemini 2.0 Flash (The Old LLM 🆓)", contextLength: 1000000 },
    { id: "GEMINI_1_5_FLASH", name: "Gemini 1.5 Flash (The Old LLM 🆓)", contextLength: 1000000 },
    
    // Perplexity models (2)
    { id: "SONAR_PRO", name: "Sonar Pro (The Old LLM 🆓)", contextLength: 128000 },
    { id: "SONAR_DEEP_RESEARCH", name: "Sonar Deep Research (The Old LLM 🆓)", contextLength: 128000 },
    
    // DeepSeek models (4)
    { id: "DEEPSEEK_R1_TOGETHER", name: "Together DeepSeek R1 (The Old LLM 🆓)", contextLength: 200000 },
    { id: "DEEPSEEK_R1_OPENROUTER", name: "OpenRouter DeepSeek R1 (The Old LLM 🆓)", contextLength: 200000 },
    { id: "DEEPSEEK_V3_TOGETHER", name: "Together DeepSeek V3 (The Old LLM 🆓)", contextLength: 200000 },
    { id: "DEEPSEEK_V3_OPENROUTER", name: "OpenRouter DeepSeek V3 (The Old LLM 🆓)", contextLength: 200000 },
    
    // xAI models (1)
    { id: "GROK_4_OPENROUTER", name: "OpenRouter Grok 4 (The Old LLM 🆓)", contextLength: 128000 },
    
    // OpenRouter models (1)
    { id: "OPENROUTER_WEB_SEARCH", name: "OpenRouter Web Search (The Old LLM 🆓)", contextLength: 128000 },
  ],
  passthroughModels: true,
};

// theoldllm特定配置
export interface TheOldLlmConfig {
  useProxyPool?: boolean;        // 是否启用代理池
  proxyConcurrency?: number;      // 代理并发数 (1-100)
}

export const DEFAULT_THEOLDLLM_CONFIG: TheOldLlmConfig = {
  useProxyPool: false,
  proxyConcurrency: 3,
};
