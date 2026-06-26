#!/usr/bin/env node
/**
 * 为什么代理没有被添加？- 原因诊断脚本
 * 用法：node scripts/diagnose-why-no-proxy.mjs
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || process.env.MANAGEMENT_KEY;

if (!API_KEY) {
  console.error('❌ 请设置环境变量: API_KEY 或 MANAGEMENT_KEY');
  process.exit(1);
}

async function diagnoseWhyNoProxy() {
  console.log('🔍 诊断：为什么代理没有被添加到 proxypool？\n');
  
  let diagnosis = {
    proxyPoolEnabled: null,
    concurrency: null,
    proxyManagerCalled: null,
    proxiesFetched: null,
    reason: null,
  };
  
  // 1. 检查 TheOldLLM 配置
  console.log('1️⃣ 检查 TheOldLLM 配置...');
  try {
    const res = await fetch(`${BASE_URL}/api/providers/theoldllm`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    });
    const data = await res.json();
    
    const config = data.providerSpecificData || {};
    diagnosis.proxyPoolEnabled = config.useProxyPool === true;
    diagnosis.concurrency = config.proxyConcurrency || 0;
    
    console.log(`   useProxyPool: ${diagnosis.proxyPoolEnabled ? '✅ true' : '❌ false'}`);
    console.log(`   proxyConcurrency: ${diagnosis.concurrency}`);
    
    if (!diagnosis.proxyPoolEnabled) {
      diagnosis.reason = '代理池未启用';
      console.log('   ⚠️  代理池未启用！这是最常见的原因。');
      console.log('   💡 解决：访问配置页面 → 启用代理池 → 保存\n');
      return printResult(diagnosis);
    }
    
    if (diagnosis.concurrency < 1) {
      diagnosis.reason = '并发数配置错误';
      console.log('   ⚠️  并发数 < 1！代理池无法工作。');
      console.log('   💡 解决：设置并发数（推荐 3-5）→ 保存\n');
      return printResult(diagnosis);
    }
    
    console.log('   ✅ 配置正确\n');
  } catch (error) {
    console.log(`   ❌ 无法获取配置: ${error.message}\n`);
    diagnosis.reason = '无法获取配置';
    return printResult(diagnosis);
  }
  
  // 2. 检查 ProxyManager 状态
  console.log('2️⃣ 检查 ProxyManager 状态...');
  try {
    const res = await fetch(`${BASE_URL}/api/settings/proxy-manager`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    });
    const data = await res.json();
    
    if (data.success && data.stats) {
      const stats = data.stats;
      diagnosis.proxyManagerCalled = stats.liveCache > 0 || stats.proxyPool > 0;
      diagnosis.proxiesFetched = stats.liveCache;
      
      console.log(`   已验证可用: ${stats.proxyPool}`);
      console.log(`   待验证: ${stats.liveCache}`);
      console.log(`   正在使用: ${stats.currentlyUsing}`);
      console.log(`   成功历史: ${stats.successfulProxies}`);
      
      if (stats.liveCache === 0 && stats.proxyPool === 0 && stats.successfulProxies === 0) {
        diagnosis.reason = 'ProxyManager 从未被调用';
        console.log('   ⚠️  所有统计都是 0！ProxyManager 从未被触发。');
        console.log('   💡 原因：');
        console.log('      - 配置保存后还没有发起过请求');
        console.log('      - 或者请求没有路由到 TheOldLLM');
        console.log('   💡 解决：发起一个 TheOldLLM 请求\n');
        return printResult(diagnosis);
      }
      
      if (stats.liveCache > 0 && stats.proxyPool === 0) {
        diagnosis.reason = '有待验证代理，但都没有验证成功';
        console.log('   ⚠️  有待验证代理，但"已验证可用"为 0！');
        console.log('   💡 可能原因：');
        console.log('      - 所有代理连接都失败了');
        console.log('      - 或者代理连接成功但 API 返回错误（4xx/5xx）');
        console.log('   💡 解决：');
        console.log('      - 增加并发数（更多代理 = 更高成功率）');
        console.log('      - 检查 TheOldLLM API 状态');
        console.log('      - 等待缓存过期（5分钟）重新获取\n');
        return printResult(diagnosis);
      }
      
      if (stats.proxyPool > 0) {
        diagnosis.reason = '代理池正常工作';
        console.log('   ✅ 代理池正常工作！已有代理被成功验证。\n');
        return printResult(diagnosis);
      }
      
      console.log('   ✅ ProxyManager 已被调用\n');
    }
  } catch (error) {
    console.log(`   ❌ 无法获取 ProxyManager 状态: ${error.message}\n`);
    diagnosis.reason = '无法获取 ProxyManager 状态';
    return printResult(diagnosis);
  }
  
  // 3. 检查 proxy_registry
  console.log('3️⃣ 检查 proxy_registry（已验证代理池）...');
  try {
    const res = await fetch(`${BASE_URL}/api/settings/proxies`, {
      headers: { Authorization: `Bearer ${API_KEY}` }
    });
    const data = await res.json();
    
    const autoProxies = (data.items || []).filter(p => 
      p.name && p.name.includes('TheOldLLM-Auto')
    );
    
    console.log(`   总代理数: ${data.items?.length || 0}`);
    console.log(`   自动添加: ${autoProxies.length}`);
    
    if (autoProxies.length > 0) {
      console.log('   ✅ 有自动添加的代理！');
      console.log('   最近添加的代理：');
      autoProxies.slice(0, 3).forEach((p, i) => {
        console.log(`      ${i+1}. ${p.host}:${p.port} (${p.type})`);
      });
    } else {
      console.log('   ℹ️  没有自动添加的代理');
    }
    console.log();
  } catch (error) {
    console.log(`   ❌ 无法获取 proxy_registry: ${error.message}\n`);
  }
  
  printResult(diagnosis);
}

function printResult(diagnosis) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 诊断结果\n');
  
  console.log('配置状态：');
  console.log(`  代理池启用: ${diagnosis.proxyPoolEnabled === true ? '✅ 是' : diagnosis.proxyPoolEnabled === false ? '❌ 否' : '❓ 未知'}`);
  console.log(`  并发数: ${diagnosis.concurrency || '❓ 未知'}`);
  console.log();
  
  console.log('运行状态：');
  console.log(`  ProxyManager 调用: ${diagnosis.proxyManagerCalled === true ? '✅ 是' : diagnosis.proxyManagerCalled === false ? '❌ 否' : '❓ 未知'}`);
  console.log(`  实时代理获取: ${diagnosis.proxiesFetched > 0 ? `✅ ${diagnosis.proxiesFetched} 个` : diagnosis.proxiesFetched === 0 ? '❌ 0 个' : '❓ 未知'}`);
  console.log();
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`\n🎯 结论: ${diagnosis.reason || '需要更多信息'}\n`);
  
  // 给出具体的下一步建议
  if (diagnosis.reason === '代理池未启用') {
    console.log('🔧 立即修复：');
    console.log('   1. 访问: ' + BASE_URL + '/dashboard/providers/theoldllm');
    console.log('   2. 打开"启用代理池"开关');
    console.log('   3. 设置"代理并发数"为 5');
    console.log('   4. 点击"保存配置"');
    console.log('   5. 发起一个测试请求');
  } else if (diagnosis.reason === 'ProxyManager 从未被调用') {
    console.log('🔧 立即测试：');
    console.log('   发起一个 TheOldLLM 请求：');
    console.log('   curl -X POST ' + BASE_URL + '/api/v1/chat/completions \\');
    console.log('     -H "Content-Type: application/json" \\');
    console.log('     -H "Authorization: Bearer YOUR_API_KEY" \\');
    console.log('     -d \'{"model":"GPT_5_4","messages":[{"role":"user","content":"test"}]}\'');
  } else if (diagnosis.reason === '有待验证代理，但都没有验证成功') {
    console.log('🔧 可能的解决方案：');
    console.log('   1. 增加并发数到 10（更多代理提高成功率）');
    console.log('   2. 等待 5 分钟缓存过期，重新获取代理');
    console.log('   3. 检查是否是 TheOldLLM API 问题（限流/token）');
    console.log('   4. 查看日志中的详细错误信息');
  } else if (diagnosis.reason === '代理池正常工作') {
    console.log('✨ 一切正常！代理池正在按预期工作。');
  }
  
  console.log();
}

diagnoseWhyNoProxy().catch(console.error);
