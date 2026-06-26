# 快速测试脚本 - 在服务器启动后运行
# 用法: .\test-proxy-fix.ps1

$BASE_URL = "http://localhost:7890"

Write-Host "🧪 测试 ProxyManager 修复" -ForegroundColor Cyan
Write-Host "=" * 50

# 1. 测试服务器
Write-Host "`n1️⃣ 测试服务器连接..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BASE_URL/api/health" -Method GET
    Write-Host "✅ 服务器正常运行" -ForegroundColor Green
} catch {
    Write-Host "❌ 服务器未启动或无法访问" -ForegroundColor Red
    Write-Host "请确保服务器在 http://localhost:7890 运行"
    exit 1
}

# 2. 测试 ProxyManager API
Write-Host "`n2️⃣ 测试 ProxyManager 统计 API..." -ForegroundColor Yellow
try {
    $stats = Invoke-RestMethod -Uri "$BASE_URL/api/settings/proxy-manager" -Method GET
    if ($stats.success) {
        Write-Host "✅ ProxyManager API 正常" -ForegroundColor Green
        Write-Host "   已验证可用: $($stats.stats.proxyPool)"
        Write-Host "   待验证: $($stats.stats.liveCache)"
        Write-Host "   正在使用: $($stats.stats.currentlyUsing)"
    } else {
        Write-Host "⚠️  API 返回错误" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ ProxyManager API 失败: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. 测试实时代理 API
Write-Host "`n3️⃣ 测试实时代理获取 API..." -ForegroundColor Yellow
try {
    $proxies = Invoke-RestMethod -Uri "$BASE_URL/api/settings/free-proxies/live?limit=3" -Method GET
    if ($proxies.items -and $proxies.items.Count -gt 0) {
        Write-Host "✅ 成功获取 $($proxies.items.Count) 个实时代理" -ForegroundColor Green
        $proxies.items | ForEach-Object {
            Write-Host "   $($_.type)://$($_.host):$($_.port) (质量: $($_.qualityScore))"
        }
    } else {
        Write-Host "⚠️  未获取到代理" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ 实时代理 API 失败: $($_.Exception.Message)" -ForegroundColor Red
}

# 4. 检查修复的代码
Write-Host "`n4️⃣ 验证代码修复..." -ForegroundColor Yellow
$theoldllmCode = Get-Content "open-sse\executors\theoldllm.ts" -Raw
if ($theoldllmCode -match "fetchWithProxyConcurrent") {
    Write-Host "✅ theoldllm.ts 已修复（使用并发版本）" -ForegroundColor Green
} else {
    Write-Host "❌ theoldllm.ts 未修复" -ForegroundColor Red
}

$formCode = Get-Content "src\app\(dashboard)\dashboard\providers\components\TheOldLlmConfigForm.tsx" -Raw
if ($formCode -match "proxy-manager") {
    Write-Host "✅ TheOldLlmConfigForm.tsx 已修复（使用正确 API）" -ForegroundColor Green
} else {
    Write-Host "❌ TheOldLlmConfigForm.tsx 未修复" -ForegroundColor Red
}

if (Test-Path "src\app\api\settings\proxy-manager\route.ts") {
    Write-Host "✅ proxy-manager API 已创建" -ForegroundColor Green
} else {
    Write-Host "❌ proxy-manager API 不存在" -ForegroundColor Red
}

Write-Host "`n" + ("=" * 50)
Write-Host "✨ 测试完成！" -ForegroundColor Cyan
Write-Host "`n💡 下一步："
Write-Host "   1. 访问: http://localhost:7890/dashboard/providers/theoldllm"
Write-Host "   2. 启用代理池并设置并发数"
Write-Host "   3. 发起一个 TheOldLLM 测试请求"
Write-Host "   4. 观察统计数据变化"
