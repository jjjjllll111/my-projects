/**
 * Quick test script for TheOldLLM dynamic model discovery
 * Run: node --import tsx/esm scripts/test-theoldllm-discovery.ts
 */

async function testDiscoveryAPI() {
  console.log("🧪 Testing TheOldLLM Dynamic Model Discovery\n");
  console.log("=" .repeat(60));

  const baseUrl = process.env.OMNIROUTE_BASE_URL || "http://localhost:7860";
  const apiUrl = `${baseUrl}/api/providers/theoldllm/discover-models`;

  console.log(`\nAPI Endpoint: ${apiUrl}\n`);

  try {
    console.log("📡 Fetching models...");
    const response = await fetch(apiUrl, {
      signal: AbortSignal.timeout(30000),
    });

    console.log(`Status: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const text = await response.text();
      console.error(`❌ Error: ${text}`);
      return;
    }

    const data = await response.json();

    console.log("\n✅ Success!");
    console.log(`\nModels found: ${data._meta?.count || data.data?.length || 0}`);
    console.log(`Source: ${data._meta?.source || "unknown"}`);
    console.log(`Timestamp: ${data._meta?.timestamp || new Date().toISOString()}`);

    if (data._meta?.warning) {
      console.log(`⚠️  Warning: ${data._meta.warning}`);
    }

    if (data._meta?.notice) {
      console.log(`\n💡 ${data._meta.notice}`);
    }

    console.log("\n📋 Model Summary:");
    console.log("-".repeat(60));

    // Group models by category
    const categories = new Map<string, any[]>();
    
    for (const model of data.data || []) {
      const name = model.name || model.id;
      let category = "Other";
      
      if (name.includes("GPT") || name.includes("O4") || name.includes("O3")) {
        category = "OpenAI";
      } else if (name.includes("Claude")) {
        category = "Anthropic";
      } else if (name.includes("Gemini")) {
        category = "Google";
      } else if (name.includes("DeepSeek")) {
        category = "DeepSeek";
      } else if (name.includes("Sonar")) {
        category = "Perplexity";
      } else if (name.includes("Grok")) {
        category = "xAI";
      }

      if (!categories.has(category)) {
        categories.set(category, []);
      }
      categories.get(category)!.push(model);
    }

    for (const [category, models] of categories.entries()) {
      console.log(`\n${category} (${models.length}):`);
      models.forEach((m) => {
        const contextInfo = m.context_length 
          ? ` [${(m.context_length / 1000).toFixed(0)}K]` 
          : "";
        console.log(`  - ${m.id}${contextInfo}`);
      });
    }

    console.log("\n" + "=".repeat(60));
    console.log("✨ Test completed successfully!");

    // Test static fallback
    console.log("\n\n🧪 Testing Static Fallback (live=false)...\n");
    const staticUrl = `${apiUrl}?live=false`;
    const staticResponse = await fetch(staticUrl);
    const staticData = await staticResponse.json();
    
    console.log(`Fallback models: ${staticData._meta?.count || staticData.data?.length || 0}`);
    console.log(`Source: ${staticData._meta?.source || "unknown"}`);

  } catch (error) {
    console.error("\n❌ Test failed:", error instanceof Error ? error.message : String(error));
  }
}

testDiscoveryAPI().catch(console.error);
