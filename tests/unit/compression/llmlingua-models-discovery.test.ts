import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const TEST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-llmlingua-discovery-"));
const ORIGINAL_DATA_DIR = process.env.DATA_DIR;
process.env.DATA_DIR = TEST_DATA_DIR;

const core = await import("../../../src/lib/db/core.ts");
const { createProviderConnection } = await import("../../../src/lib/db/providers.ts");
const { getAvailableChatModels } =
  await import("../../../open-sse/services/compression/engines/llmlingua/apiBackend.ts");

function resetStorage() {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
}

test.beforeEach(() => {
  resetStorage();
});

test.after(() => {
  core.resetDbInstance();
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  if (ORIGINAL_DATA_DIR === undefined) {
    delete process.env.DATA_DIR;
  } else {
    process.env.DATA_DIR = ORIGINAL_DATA_DIR;
  }
});

test("LLMLingua dynamic model discovery discovers active provider models and free/no-auth models, and excludes inactive ones", async () => {
  // Create an active connection for openai, and an inactive connection for anthropic
  await createProviderConnection({
    provider: "openai",
    authType: "apikey",
    name: "OpenAI Active",
    apiKey: "sk-proj-test",
    isActive: true,
  });

  await createProviderConnection({
    provider: "anthropic",
    authType: "apikey",
    name: "Anthropic Inactive",
    apiKey: "sk-ant-test",
    isActive: false,
  });

  const models = await getAvailableChatModels();

  // 1. Should contain free provider models (e.g. theoldllm)
  const hasTheOldLlm = models.some((m) => m.startsWith("theoldllm/") || m.startsWith("tllm/"));
  assert.ok(hasTheOldLlm, "Should discover free/no-auth models of theoldllm");

  // 2. Should contain active provider (openai) models
  const hasOpenAi = models.some((m) => m.startsWith("openai/"));
  assert.ok(hasOpenAi, "Should discover active provider (openai) models");

  // 3. Should NOT contain inactive provider (anthropic) models
  const hasAnthropic = models.some((m) => m.startsWith("anthropic/"));
  assert.ok(!hasAnthropic, "Should NOT discover inactive provider (anthropic) models");
});

test("saves and retrieves LLMLingua configuration successfully", async () => {
  const { getCompressionSettings, updateCompressionSettings } =
    await import("../../../src/lib/db/compression.ts");

  // Initialize/check default settings
  const settings = await getCompressionSettings();
  assert.ok(settings.llmlingua);
  assert.equal(settings.llmlingua.model, "tinybert");
  assert.equal(settings.llmlingua.minTokens, 2000);
  assert.equal(settings.llmlingua.compressionRate, 0.5);

  // Update configuration
  const updatedSettings = await updateCompressionSettings({
    llmlingua: {
      enabled: false,
      model: "kr/claude-sonnet-4.5",
      minTokens: 2500,
      compressionRate: 0.7,
      modelPath: "/some/path",
    },
  });

  assert.equal(updatedSettings.llmlingua?.enabled, false);
  assert.equal(updatedSettings.llmlingua?.model, "kr/claude-sonnet-4.5");
  assert.equal(updatedSettings.llmlingua?.minTokens, 2500);
  assert.equal(updatedSettings.llmlingua?.compressionRate, 0.7);
  assert.equal(updatedSettings.llmlingua?.modelPath, "/some/path");

  // Get configuration again to verify persistence
  const retrievedSettings = await getCompressionSettings();
  assert.equal(retrievedSettings.llmlingua?.enabled, false);
  assert.equal(retrievedSettings.llmlingua?.model, "kr/claude-sonnet-4.5");
  assert.equal(retrievedSettings.llmlingua?.minTokens, 2500);
  assert.equal(retrievedSettings.llmlingua?.compressionRate, 0.7);
  assert.equal(retrievedSettings.llmlingua?.modelPath, "/some/path");
});
