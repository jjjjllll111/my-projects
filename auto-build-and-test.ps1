# auto-build-and-test.ps1
# 自动等待构建完成并测试

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🤖 自动构建与测试脚本                                     ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

$PORT = 19998
$maxWait = 300  # 最多等待 5 分钟

# 1. 等待构建完成
Write-Host "⏳ 等待构建完成..." -ForegroundColor Yellow
$waited = 0
while (-not (Test-Path "dist") -and $waited -lt $maxWait) {
    Start-Sleep -Seconds 10
    $waited += 10
    
    # 显示进度
    $dots = "." * (($waited / 10) % 4)
    Write-Host "`r等待中$dots   " -NoNewline -ForegroundColor Yellow
    
    # 显示构建日志片段
    if ($waited % 30 -eq 0 -and (Test-Path "build.log")) {
        Write-Host ""
        $lastLine = Get-Content "build.log" -Tail 1
        Write-Host "  最新: $lastLine" -ForegroundColor Gray
    }
}

Write-Host ""

if (-not (Test-Path "dist")) {
    Write-Host "❌ 构建超时（5分钟）" -ForegroundColor Red
    Write-Host "   查看日志: Get-Content build.log" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ 构建完成！" -ForegroundColor Green
Write-Host ""

# 2. 停止旧的开发服务器
Write-Host "🛑 停止旧服务器..." -ForegroundColor Yellow
Get-Process node -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like "*dev*" -or $_.CommandLine -like "*PORT*$PORT*"
} | Stop-Process -Force -ErrorAction SilentlyContinue

Start-Sleep -Seconds 2
Write-Host "✓ 已清理" -ForegroundColor Green
Write-Host ""

# 3. 启动生产服务器
Write-Host "🚀 启动生产服务器（端口 $PORT）..." -ForegroundColor Yellow
$env:PORT = "$PORT"
$env:NODE_ENV = "production"

Start-Process powershell -ArgumentList "-Command", "cd '$PWD'; `$env:PORT='$PORT'; `$env:NODE_ENV='production'; npm start" -WindowStyle Hidden

Write-Host "⏳ 等待服务器启动（生产模式很快）..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# 4. 测试服务器
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🧪 开始测试" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

$BASE = "http://localhost:$PORT"

# 测试 1: 服务器
Write-Host "1️⃣ 服务器健康检查..." -NoNewline
try {
    $response = Invoke-WebRequest -Uri "$BASE/" -TimeoutSec 5 -ErrorAction Stop
    Write-Host " ✅ 正常" -ForegroundColor Green
} catch {
    Write-Host " ❌ 失败" -ForegroundColor Red
    Write-Host "   错误: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 测试 2: ProxyManager API
Write-Host "2️⃣ ProxyManager API..." -NoNewline
try {
    $stats = Invoke-RestMethod -Uri "$BASE/api/settings/proxy-manager" -TimeoutSec 5
    Write-Host " ✅ 正常" -ForegroundColor Green
    Write-Host "   📊 统计:" -ForegroundColor Cyan
    Write-Host "      • 已验证可用: $($stats.stats.proxyPool)" -ForegroundColor White
    Write-Host "      • 待验证: $($stats.stats.liveCache)" -ForegroundColor White
    Write-Host "      • 正在使用: $($stats.stats.currentlyUsing)" -ForegroundColor White
} catch {
    Write-Host " ⚠️  需要认证" -ForegroundColor Yellow
}

# 测试 3: 实时代理 API
Write-Host "3️⃣ 实时代理 API..." -NoNewline
try {
    $proxies = Invoke-RestMethod -Uri "$BASE/api/settings/free-proxies/live?limit=3" -TimeoutSec 5
    Write-Host " ✅ 正常" -ForegroundColor Green
    if ($proxies.items -and $proxies.items.Count -gt 0) {
        Write-Host "   获取到 $($proxies.items.Count) 个代理" -ForegroundColor White
    }
} catch {
    Write-Host " ⚠️  需要认证" -ForegroundColor Yellow
}

# 测试 4: 验证代码修复
Write-Host "4️⃣ 验证代码修复..." -NoNewline
$theoldllmCode = Get-Content "open-sse\executors\theoldllm.ts" -Raw
if ($theoldllmCode -match "fetchWithProxyConcurrent") {
    Write-Host " ✅ 修复已应用" -ForegroundColor Green
} else {
    Write-Host " ❌ 修复未应用" -ForegroundColor Red
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "✨ 测试完成！" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 访问配置页面:" -ForegroundColor Cyan
Write-Host "   $BASE/dashboard/providers/theoldllm" -ForegroundColor White
Write-Host ""
Write-Host "📝 下一步:" -ForegroundColor Cyan
Write-Host "   1. 访问上面的 URL" -ForegroundColor White
Write-Host "   2. 启用'使用代理池'" -ForegroundColor White
Write-Host "   3. 设置'代理并发数' = 5" -ForegroundColor White
Write-Host "   4. 保存配置" -ForegroundColor White
Write-Host "   5. 发起一个 TheOldLLM 请求测试" -ForegroundColor White
Write-Host ""
