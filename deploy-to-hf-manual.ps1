# Manual build and deploy to HuggingFace Space
# Use this when GitHub Actions billing is unavailable

Write-Host "🔨 Starting local build..." -ForegroundColor Cyan

# Step 1: Clean old build
if (Test-Path ".build") { Remove-Item -Recurse -Force .build }
if (Test-Path "dist") { Remove-Item -Recurse -Force dist }

# Step 2: Build with optimized settings
$env:NODE_OPTIONS = "--max-old-space-size=8192"
$env:OMNIROUTE_USE_TURBOPACK = "1"
$env:NEXT_DISABLE_SOURCEMAPS = "true"
$env:GENERATE_SOURCEMAP = "false"

Write-Host "⚙️  Building project (this may take 5-10 minutes)..." -ForegroundColor Yellow
npm run build

if (-not (Test-Path "dist")) {
    Write-Host "❌ Build failed - dist/ not created" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Build completed successfully" -ForegroundColor Green
Write-Host "📦 Build size: " -NoNewline
$distSize = (Get-ChildItem dist -Recurse | Measure-Object -Property Length -Sum).Sum / 1MB
Write-Host ("{0:N2} MB" -f $distSize) -ForegroundColor Cyan

# Step 3: Clone HF Space
Write-Host "
📥 Cloning HF Space repository..." -ForegroundColor Cyan
$hfToken = (Get-Content C:\Users\Administrator\Documents\hf.txt).Trim()

if (Test-Path "hf-deploy-temp") { Remove-Item -Recurse -Force hf-deploy-temp }
git clone https://VVVVY001:${hfToken}@huggingface.co/spaces/VVVVY001/myrouter hf-deploy-temp

# Step 4: Update HF Space with new build
Write-Host "📤 Updating HF Space with new build..." -ForegroundColor Cyan
cd hf-deploy-temp

# Remove old dist
if (Test-Path "dist") { Remove-Item -Recurse -Force dist }

# Copy new dist
Copy-Item -Recurse ..\dist .

# Commit and push
git add dist/
$commitTime = Get-Date -Format "yyyy-MM-dd HH:mm:ss UTC"
git commit -m "Deploy manual build at ${commitTime}"
git push

cd ..
Remove-Item -Recurse -Force hf-deploy-temp

Write-Host "
✅ Deployment completed!" -ForegroundColor Green
Write-Host "🔗 HF Space: https://huggingface.co/spaces/VVVVY001/myrouter" -ForegroundColor Cyan
Write-Host "⏳ Wait 1-2 minutes for HF Space to rebuild and restart" -ForegroundColor Yellow
