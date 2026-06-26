/**
 * Test script for TheOldLLM API endpoints
 * Run: node --import tsx/esm scripts/test-theoldllm-api.ts
 */

const API_BASE = "https://theoldllm.vercel.app";

const possibleEndpoints = [
  "/api/models",
  "/v1/models",
  "/api/chatgpt/models",
  "/api/available-models",
  "/models",
];

async function testEndpoint(url: string) {
  console.log(`\nTesting: ${url}`);
  console.log("=".repeat(60));
  
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });

    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Headers:`, Object.fromEntries(response.headers.entries()));

    const contentType = response.headers.get("content-type");
    
    if (contentType?.includes("application/json")) {
      const data = await response.json();
      console.log(`Response:`, JSON.stringify(data, null, 2));
      return { success: response.ok, data, url };
    } else {
      const text = await response.text();
      console.log(`Response (first 500 chars):`, text.substring(0, 500));
      return { success: false, text, url };
    }
  } catch (error) {
    console.log(`Error:`, error instanceof Error ? error.message : String(error));
    return { success: false, error, url };
  }
}

async function main() {
  console.log("🔍 TheOldLLM API Endpoint Discovery");
  console.log("=" .repeat(60));
  console.log(`Base URL: ${API_BASE}`);
  console.log(`Testing ${possibleEndpoints.length} possible endpoints...\n`);

  const results = [];

  for (const endpoint of possibleEndpoints) {
    const fullUrl = `${API_BASE}${endpoint}`;
    const result = await testEndpoint(fullUrl);
    results.push(result);
    
    // Delay between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log("\n\n📊 SUMMARY");
  console.log("=".repeat(60));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`✅ Successful: ${successful.length}`);
  console.log(`❌ Failed: ${failed.length}`);

  if (successful.length > 0) {
    console.log("\n✨ Working endpoints:");
    successful.forEach(r => {
      console.log(`  - ${r.url}`);
      if (r.data) {
        const models = r.data.models || r.data.data || [];
        console.log(`    Models found: ${Array.isArray(models) ? models.length : 'unknown'}`);
      }
    });
  }

  if (successful.length === 0) {
    console.log("\n⚠️  No working model endpoints found.");
    console.log("TheOldLLM might:");
    console.log("  1. Not expose a public models API");
    console.log("  2. Require authentication for model listing");
    console.log("  3. Use a different endpoint structure");
    console.log("\nRecommendation: Use specialized model discovery or keep static list.");
  }
}

main().catch(console.error);
