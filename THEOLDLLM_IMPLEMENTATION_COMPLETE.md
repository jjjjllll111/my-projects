# TheOldLLM Dynamic Model Discovery - Implementation Complete

## Implementation Summary

Successfully implemented dynamic model discovery for TheOldLLM provider, allowing users to fetch the latest models from the TheOldLLM website by clicking the "Sync Models" button.

## Changes Made

### 1. Created Shared Model Discovery Service
**File**: `src/lib/providers/theoldllmModels.ts` (NEW)

- **Main function**: `fetchTheOldLlmModels()` - Fetches and parses models from https://theoldllm.vercel.app/
- **HTML parsing**: Regex-based extraction (no external dependencies)
- **Model ID mapping**: Converts display names to internal IDs (e.g., "GPT-5.4" → "GPT_5_4")
- **Context length estimation**: Intelligent estimation based on model name
- **Fallback list**: 25 models from actual website (updated 2026-06-25)
- **Error handling**: Graceful fallback to static list if scraping fails

### 2. Modified Models API Route
**File**: `src/app/api/providers/[id]/models/route.ts`

- **Line 12**: Added import: `import { fetchTheOldLlmModels } from "@/lib/providers/theoldllmModels";`
- **Lines 887-915**: Added special handling for theoldllm provider
  - Calls `fetchTheOldLlmModels()` for live scraping
  - Filters hidden models via `getModelIsHidden()`
  - Returns models with source metadata (live_scrape/fallback)
  - Falls through to standard modelsUrl handling on error

### 3. Refactored Discover-Models API
**File**: `src/app/api/providers/theoldllm/discover-models/route.ts`

- **Before**: ~200 lines with duplicated scraping logic
- **After**: ~60 lines using shared `fetchTheOldLlmModels()` function
- **Query param**: `?live=false` to skip live fetch (for testing)
- **Benefits**: Single source of truth, easier maintenance

## No-Auth Provider Status

| Provider | Model Source | Dynamic Discovery | Status |
|----------|--------------|-------------------|--------|
| **TheOldLLM** | HTML scraping | ✅ **NEW** | ✅ Implemented |
| **OpenCode** | `/v1/models` API | ✅ Existing | ✅ Already working |
| **DuckDuckGo** | Static list (6) | ❌ | ℹ️ Not needed |
| **Chipotle** | Static list (1) | ❌ | ℹ️ Not needed |
| **MiMoCode** | Static list (1) | ❌ | ℹ️ Not needed |

## How It Works

### User Flow
1. User visits `/dashboard/providers/theoldllm`
2. Clicks "Sync Models" button
3. Frontend calls `/api/providers/theoldllm/discover-models`
4. Backend:
   - Fetches HTML from https://theoldllm.vercel.app/
   - Parses model names using regex
   - Maps to internal IDs
   - Returns models with metadata
5. UI updates with live model list (25+ models)

### Programmatic Access
```bash
# Via unified models endpoint
GET /api/providers/theoldllm/models

# Via dedicated discovery endpoint
GET /api/providers/theoldllm/discover-models
GET /api/providers/theoldllm/discover-models?live=false  # Use fallback
```

### Response Format
```json
{
  "data": [
    {
      "id": "GPT_5_4",
      "name": "GPT-5.4",
      "context_length": 400000
    }
  ],
  "_meta": {
    "count": 25,
    "source": "live_scrape",
    "timestamp": "2026-06-25T05:00:00.000Z",
    "notice": "Successfully discovered 25 models from TheOldLLM website",
    "websiteUrl": "https://theoldllm.vercel.app",
    "usageHint": "Click 'Sync Models' button to fetch latest models from website"
  }
}
```

## Technical Details

### HTML Parsing Strategy
- **No dependencies**: Uses native regex (no jsdom, cheerio, etc.)
- **Robust pattern**: Matches model name spans with specific CSS classes
- **Duplicate prevention**: Set-based deduplication
- **Error tolerance**: Skips malformed entries, continues parsing

### Model ID Mapping
```typescript
// Display name → Internal ID examples:
"GPT-5.4"           → "GPT_5_4"
"Claude 4.6 Opus"   → "CLAUDE_4_6_OPUS"
"OpenRouter GPT-4o" → "GPT_4O"  // Prefix removed
"O4 Mini"           → "O4_MINI"
```

### Context Length Estimation
```typescript
GPT-5 series:        400,000 tokens
O3/O4 series:        200,000 tokens
Claude series:       200,000 tokens
Gemini 2/3:        1,000,000 tokens
DeepSeek/Grok:       200,000 tokens
Default:             128,000 tokens
```

### Fallback Behavior
If live scraping fails:
1. Returns 25-model static fallback list
2. Sets `source: "fallback"`
3. Includes error message in `warning` field
4. System remains functional (no user-facing errors)

## Integration with Existing Systems

### Model Filtering
- ✅ Respects user's hidden model preferences
- ✅ Works with `excludeHidden` query parameter
- ✅ Integrates with `getModelIsHidden()` from localDb

### Passthrough Mode
- ✅ TheOldLLM registry has `passthroughModels: true`
- ✅ Users can try models beyond the discovered list
- ✅ Executor handles any model name

### LLMLingua Configuration Page
File: `open-sse/services/compression/engines/llmlingua/apiBackend.ts`

Already implemented (previous work):
- ✅ 3-source model aggregation (static + DB + custom)
- ✅ Free/no-auth provider support
- ✅ Hidden model filtering
- ✅ Environment-aware URL resolution

## Testing

### Manual Testing
```bash
# Start dev server
npm run dev

# Visit provider page
open http://localhost:3000/dashboard/providers/theoldllm

# Click "Sync Models" button
# Verify 25+ models appear
```

### API Testing
```bash
# Test live discovery
curl http://localhost:3000/api/providers/theoldllm/discover-models

# Test fallback mode
curl http://localhost:3000/api/providers/theoldllm/discover-models?live=false

# Test unified endpoint
curl http://localhost:3000/api/providers/theoldllm/models
```

### Expected Results
- Live scraping: 25+ models from website
- Fallback mode: 25 static models
- Error handling: No crashes, graceful degradation
- Performance: <15s timeout, usually <3s response

## Files Modified

| File | Lines | Change Type |
|------|-------|-------------|
| `src/lib/providers/theoldllmModels.ts` | +188 | NEW |
| `src/app/api/providers/[id]/models/route.ts` | +30 | Modified |
| `src/app/api/providers/theoldllm/discover-models/route.ts` | -150 | Refactored |

## Benefits

1. **Single Source of Truth**: Shared `fetchTheOldLlmModels()` function
2. **Automatic Updates**: Models sync from live website
3. **Zero Maintenance**: No manual model list updates needed
4. **Graceful Fallback**: Static list if scraping fails
5. **User Control**: "Sync Models" button for on-demand refresh
6. **Better UX**: Shows latest 25+ models instead of 8 static models

## Future Improvements

1. **Caching**: Add Redis/SQLite cache with TTL
2. **Background Sync**: Periodic auto-refresh (e.g., every 6 hours)
3. **Diff Detection**: Notify users when new models are added
4. **Model Metadata**: Scrape pricing, capabilities, context length
5. **Other Providers**: Apply similar pattern to other HTML-only providers

## Related Work

- LLMLingua configuration page: Already supports dynamic model discovery
- Qdrant vector store: Reference implementation for dynamic discovery pattern
- OpenCode provider: Standard `/v1/models` API endpoint (no special handling needed)

---

**Status**: ✅ Implementation Complete  
**Date**: 2026-06-25  
**Version**: v3.8.31
