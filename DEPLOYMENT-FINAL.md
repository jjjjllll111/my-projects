# HuggingFace Space Deployment - Final Setup Guide

**Date**: 2026-06-23  
**Architecture**: Pre-build + Auto-download

## ✅ What's Been Completed

### 1. GitHub Actions Workflow (my-projects repo)

- ✅ Created complete build workflow at: https://github.com/jjjjllll111/my-projects/blob/main/.github/workflows/ci.yml
- ✅ Workflow performs full `npm run build:release`
- ✅ Creates `omniroute-dist.tar.gz` and uploads to GitHub Release
- ✅ Triggers HF Space restart after upload
- ✅ Secrets configured (GH_PAT, HF_TOKEN)

### 2. GitHub Release Setup

- ✅ Release tag: `hf-latest`
- ✅ Artifact: `omniroute-dist.tar.gz`
- ✅ Auto-updated on each build

### 3. HuggingFace Space Configuration

- ✅ Dockerfile created with auto-download logic
- ✅ Uses GitHub API to fetch latest build (no caching)
- ✅ Extracts and runs on startup
- ✅ README documentation complete

## 🔧 Required: Configure HF Space Secret

**Critical Step**: Add GITHUB_TOKEN to HF Space

1. Go to: https://huggingface.co/spaces/VVVVY001/myrouter/settings
2. Click **Variables and secrets** (left sidebar)
3. Under **Repository secrets**, click **New secret**
4. Name: `GITHUB_TOKEN`
5. Value: (your GitHub token with `repo` scope)
   - Use the token from: `C:\Users\Administrator\Documents\ghcp.txt`
   - Token: `your_github_token`
6. Click **Save**

**Why needed**: HF Space downloads build from private GitHub Release

## 🚀 Deploy Now

Once the secret is added, trigger the first build:

```powershell
# Option 1: Via gh CLI (recommended)
cd C:\Users\Administrator\Documents\my-projects
gh workflow run ci.yml --ref main

# Option 2: Via web UI
# Go to: https://github.com/jjjjllll111/my-projects/actions/workflows/ci.yml
# Click "Run workflow" → Select "main" → "Run workflow"
```

## 📊 Deployment Flow

```
1. Trigger workflow (manual)
   ↓
2. GitHub Actions builds OmniRoute (5-10 minutes)
   ↓
3. Uploads omniroute-dist.tar.gz to Release
   ↓
4. Triggers HF Space restart
   ↓
5. HF Space downloads latest build via API
   ↓
6. Extracts and starts application
   ↓
7. ✅ Running at https://vvvvy001-myrouter.hf.space
```

## 🔍 Monitoring

### During Build (GitHub Actions)

- URL: https://github.com/jjjjllll111/my-projects/actions
- Watch for:
  - ✅ Build project
  - ✅ Create distribution archive
  - ✅ Upload to GitHub Release
  - ✅ Restart HuggingFace Space

### During Deployment (HF Space)

- URL: https://huggingface.co/spaces/VVVVY001/myrouter
- Watch for:
  - ✅ Building (1-2 minutes)
  - ✅ Running
- Check logs for:
  - "Downloading latest build..."
  - "Build extracted successfully"
  - "Starting OmniRoute..."

### After Deployment

- **Health Check**: https://vvvvy001-myrouter.hf.space/api/health
- **Expected Response**: `{"status":"ok",...}`

## 🛠️ Troubleshooting

### If HF Space build fails with "GITHUB_TOKEN not set"

→ Follow "Required: Configure HF Space Secret" above

### If GitHub Actions workflow fails

```powershell
# Check logs
gh run list --repo jjjjllll111/my-projects --workflow ci.yml --limit 1
gh run view <run-id> --repo jjjjllll111/my-projects --log-failed
```

### If HF Space downloads but fails to start

- Check HF Space logs for extraction errors
- Verify dist/ contains `dev/run-standalone.mjs`

## 📁 Architecture Summary

**Build**: `my-projects` repo Actions → builds `omniroute-private` → GitHub Release  
**Deploy**: HF Space → downloads from Release → extracts → runs  
**Update**: Re-run workflow → auto-restarts Space → downloads new build

## 🔄 Future Deployments

After initial setup, deploying updates is simple:

```powershell
# Just trigger the workflow
cd C:\Users\Administrator\Documents\my-projects
gh workflow run ci.yml --ref main
```

Or click "Run workflow" on: https://github.com/jjjjllll111/my-projects/actions/workflows/ci.yml

## 📝 Quick Reference

| Resource       | URL                                                                     |
| -------------- | ----------------------------------------------------------------------- |
| Workflow       | https://github.com/jjjjllll111/my-projects/actions/workflows/ci.yml     |
| Release        | https://github.com/jjjjllll111/omniroute-private/releases/tag/hf-latest |
| HF Space       | https://huggingface.co/spaces/VVVVY001/myrouter                         |
| Space Settings | https://huggingface.co/spaces/VVVVY001/myrouter/settings                |
| Health Check   | https://vvvvy001-myrouter.hf.space/api/health                           |

## ✨ Next Steps

1. **Add GITHUB_TOKEN to HF Space** (see above)
2. **Run workflow** (see Deploy Now section)
3. **Wait 10-15 minutes** (build + deploy)
4. **Verify** health check endpoint
5. **Done!** 🎉

---

**Status**: Ready to deploy (pending HF Space secret configuration)
