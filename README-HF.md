# OmniRoute on HuggingFace Space

Unified AI proxy/router running on HuggingFace Space with **231 AI providers**.

## Architecture

This Space uses a **pre-build strategy** to avoid memory limitations:

1. **Build Phase**: GitHub Actions compiles the project (6GB heap)
2. **Deploy Phase**: Pre-built \dist/\ pushed to this Space
3. **Runtime Phase**: 8GB heap, persistent storage

## Deployment Flow

\\\mermaid
graph LR
    A[Push to GitHub] --> B[GitHub Actions Build]
    B --> C[Push dist/ to HF Space]
    C --> D[HF Space Auto-rebuild]
    D --> E[Running Instance]
\\\

## Resources

- **Total Memory**: 16GB (HF free tier)
- **Runtime Heap**: 8GB Node.js
- **Port**: 7860
- **Persistent Storage**: \/data/omniroute\ (5-min sync)

## API Endpoints

- Health: \GET /api/health\
- Chat: \POST /api/v1/chat/completions\
- Embeddings: \POST /api/v1/embeddings\
- Image Gen: \POST /api/v1/images/generations\
- Full API docs: See main README

## Environment Variables

Key variables configured for HF Space:
- \NODE_ENV=production\
- \PORT=7860\
- \DATA_DIR=/data/omniroute\
- \NODE_OPTIONS=--max-old-space-size=8192\

## Source

- **GitHub Repo**: https://github.com/jjjjllll111/omniroute-private
- **Upstream**: https://github.com/diegosouzapw/OmniRoute

## Version

Build SHA written to \BUILD_SHA\ file on each deploy.
