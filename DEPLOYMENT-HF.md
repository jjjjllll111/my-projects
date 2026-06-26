# Deployment to HuggingFace Space

Complete guide for deploying OmniRoute to HuggingFace Space using GitHub Actions.

## Architecture Overview

### Problem

OmniRoute is too large to build directly on HF Space (16GB free tier limit).
Building requires 12+ GB and frequently hits OOM (Out Of Memory) errors.

### Solution

**Pre-build strategy**: Build on GitHub Actions, deploy artifacts to HF Space.

\\\
┌─────────────────────┐
│ GitHub Actions │
│ ───────────────── │
│ 1. npm ci │
│ 2. npm run build │──┐
│ 3. Generate dist/ │ │
└─────────────────────┘ │
│ Push dist/
┌─────────────────────┐ │
│ HF Space │◄─┘
│ ───────────────── │
│ 1. Copy dist/ │
│ 2. Start runtime │
│ 3. Serve on :7860 │
└─────────────────────┘
\\\

## Setup Instructions

### 1. Configure GitHub Secrets

Add HuggingFace token to GitHub repository secrets:

1. Go to: https://github.com/jjjjllll111/omniroute-private/settings/secrets/actions
2. Click **New repository secret**
3. Name: `HF_TOKEN`
4. Value: `your_hf_token`
5. Click **Add secret**

### 2. Initialize HF Space Repository

The HF Space needs initial files before GitHub Actions can push to it:

\\\powershell

# Clone HF Space

cd C:\Users\Administrator\Documents
git clone https://VVVVY001:your_hf_token@huggingface.co/spaces/VVVVY001/myrouter hf-space-init

cd hf-space-init

# Copy initial files

Copy-Item C:\Users\Administrator\Documents\omniroute-src\Dockerfile.hf Dockerfile
Copy-Item C:\Users\Administrator\Documents\omniroute-src\README-HF.md README.md

# Create placeholder for dist/

New-Item -ItemType Directory -Force dist
Set-Content dist\.gitkeep ""

# Commit and push

git add .
git commit -m "Initialize HF Space with pre-build setup"
git push

# Cleanup

cd ..
Remove-Item -Recurse -Force hf-space-init
\\\

### 3. Enable GitHub Actions Workflow

The workflow is already created at \.github/workflows/build-and-deploy-hf.yml\.

To trigger it:

\\\powershell
cd C:\Users\Administrator\Documents\omniroute-src

# Commit workflow files

git add .github/workflows/build-and-deploy-hf.yml
git add Dockerfile.hf README-HF.md DEPLOYMENT-HF.md
git commit -m "Add HuggingFace Space deployment workflow"
git push origin main
\\\

The workflow will:

1. ✅ Trigger on every push to \main\
2. ✅ Build with 6GB heap on GitHub Actions
3. ✅ Push \dist/\ to HF Space
4. ✅ HF Space auto-rebuilds

### 4. Manual Trigger (Optional)

Trigger the workflow manually:

1. Go to: https://github.com/jjjjllll111/omniroute-private/actions
2. Select **Build and Deploy to HuggingFace**
3. Click **Run workflow** → **Run workflow**

## Workflow Details

### Build Configuration

- **Runner**: ubuntu-latest
- **Node.js**: 26
- **Build Heap**: 6GB (\--max-old-space-size=6144\)
- **Build Time**: ~5-10 minutes
- **Features**:
  - Turbopack enabled
  - Source maps disabled
  - Legacy peer deps

### Runtime Configuration

- **Base Image**: node:26-trixie-slim
- **Runtime Heap**: 8GB
- **Port**: 7860
- **Data Dir**: /data/omniroute
- **Sync**: 5-minute rsync to persistent storage

## Files Structure

\\\
omniroute-private/
├── .github/workflows/
│ └── build-and-deploy-hf.yml # GitHub Actions workflow
├── Dockerfile.hf # HF Space Dockerfile (runtime only)
├── README-HF.md # HF Space documentation
└── DEPLOYMENT-HF.md # This file

HF Space (after first deploy):
myrouter/
├── Dockerfile # Copied from Dockerfile.hf
├── README.md # Copied from README-HF.md
└── dist/ # Built artifacts from GitHub Actions
├── dev/
│ └── run-standalone.mjs # Startup script
├── data/ # Runtime data
└── ... # Other built files
\\\

## Monitoring

### Check Build Status

- **GitHub Actions**: https://github.com/jjjjllll111/omniroute-private/actions
- **HF Space**: https://huggingface.co/spaces/VVVVY001/myrouter

### Check Runtime

- **Space URL**: https://vvvvy001-myrouter.hf.space
- **Health Check**: https://vvvvy001-myrouter.hf.space/api/health
- **Logs**: Available in HF Space UI

## Troubleshooting

### Build Fails on GitHub Actions

Check workflow logs:

1. Go to Actions tab
2. Click on failed run
3. Expand build step

Common issues:

- **OOM**: Increase heap size in workflow
- **Dependencies**: Check npm ci output
- **TypeScript**: Check for type errors

### HF Space Fails to Start

Check HF Space logs in the web UI.

Common issues:

- **Port mismatch**: Ensure PORT=7860
- **Missing files**: Check if dist/ was pushed
- **Permissions**: Check file ownership

### Deployment Not Triggering

1. Ensure HF_TOKEN secret is set correctly
2. Check git clone step in workflow logs
3. Verify HF Space repository exists

## Updating Deployment

To deploy changes:

\\\powershell
cd C:\Users\Administrator\Documents\omniroute-src

# Make your changes...

# Commit and push

git add .
git commit -m "Your change description"
git push origin main

# GitHub Actions will automatically:

# 1. Build the project

# 2. Push to HF Space

# 3. Trigger HF Space rebuild

\\\

## Advanced: Local Testing

Test the HF Dockerfile locally:

\\\powershell

# Build locally first

npm run build

# Test HF Dockerfile

docker build -f Dockerfile.hf -t omniroute-hf-test .
docker run -p 7860:7860 -e PORT=7860 omniroute-hf-test
\\\

## Resources

- **HF Token**: Stored in \C:\Users\Administrator\Documents\hf.txt\
- **GitHub Token**: Stored in \C:\Users\Administrator\Documents\ghcp.txt\
- **Space**: https://huggingface.co/spaces/VVVVY001/myrouter
- **Repo**: https://github.com/jjjjllll111/omniroute-private

## Support

For issues:

1. Check GitHub Actions logs
2. Check HF Space logs
3. Verify secrets are configured
4. Ensure dist/ directory is being pushed
