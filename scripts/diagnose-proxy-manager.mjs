#!/usr/bin/env node
/**
 * ProxyManager 诊断脚本
 * 用法：node scripts/diagnose-proxy-manager.mjs
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function diagnose() {
  console.log('🔍 ProxyManager 诊断工具\n');
  
  // 1. 测试 ProxyManager 统计 API
  console.log('1️⃣ 测试 ProxyManager 统计 API...');
  try {
    const res = await fetch(`${BASE_URL}/api/settings/proxy-manager`);
    const data = await res.json();
    
    if (data.success) {
      console.log('   ✅ API 正常');
      console.log('   📊 当前状态：');
      console.log(`      已验证可用: ${data.stats.proxyPool}`);
      console.log(`      待验证: ${data.stats.liveCache}`);
      console.log(`      正在使用: ${data.stats.currentlyUsing}`);
      console.log(`      成功历史: ${data.stats.successfulProxies}`);
      
      if (data.stats.liveCacheExpiry > 0) {
        const remaining = Math.max(0, data.stats.liveCacheExpiry - Date.now());
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        console.log(`      缓存剩余: ${minutes}分${seconds}秒`);
      } else {
        console.log(`      缓存状态: 未激活`);
      }
    } else {
      console.log('   ❌ API 返回错误');
      console.log('   ', data.error);
    }
  } catch (error) {
    console.log('   ❌ API 请求失败');
    console.log('   ', error.message);
  }
  
  console.log();
  
  // 2. 测试实时代理获取 API
  console.log('2️⃣ 测试实时代理获取 API...');
  try {
    const res = await fetch(`${BASE_URL}/api/settings/free-proxies/live?limit=5`);
    const data = await res.json();
    
    if (data.items && Array.isArray(data.items)) {
      console.log(`   ✅ 成功获取 ${data.items.length} 个实时代理`);
      if (data.items.length > 0) {
        console.log('   示例代理：');
        data.items.slice(0, 3).forEach((p, i) => {
          console.log(`      ${i+1}. ${p.type}://${p.host}:${p.port} (质量: ${p.qualityScore || 'N/A'})`);
        });
      }
    } else {
      console.log('   ❌ 获取失败或无可用代理');
    }
  } catch (error) {
    console.log('   ❌ API 请求失败');
    console.log('   ', error.message);
  }
  
  console.log();
  
  // 3. 检查 proxy_registry
  console.log('3️⃣ 检查 proxy_registry（已验证代理池）...');
  try {
    const res = await fetch(`${BASE_URL}/api/settings/proxies`);
    const data = await res.json();
    
    if (data.items && Array.isArray(data.items)) {
      console.log(`   ✅ proxy_registry 中有 ${data.items.length} 个代理`);
      
      // 统计来源
      const bySources = {};
      data.items.forEach(p => {
        const source = p.source || 'unknown';
        bySources[source] = (bySources[source] || 0) + 1;
      });
      
      if (Object.keys(bySources).length > 0) {
        console.log('   按来源统计：');
        Object.entries(bySources).forEach(([source, count]) => {
          console.log(`      ${source}: ${count} 个`);
        });
      }
      
      // 显示最近添加的代理
      const autoProxies = data.items.filter(p => 
        p.name && p.name.includes('TheOldLLM-Auto')
      );
      
      if (autoProxies.length > 0) {
        console.log(`   🎯 自动添加的代理: ${autoProxies.length} 个`);
        autoProxies.slice(0, 3).forEach((p, i) => {
          console.log(`      ${i+1}. ${p.host}:${p.port} (${p.type})`);
        });
      }
    } else {
      console.log('   ℹ️  proxy_registry 为空（正常，等待第一次验证）');
    }
  } catch (error) {
    console.log('   ❌ API 请求失败');
    console.log('   ', error.message);
  }
  
  console.log();
  
  // 4. 总结和建议
  console.log('📝 诊断总结：');
  console.log('   1. 如果"待验证"为 0，说明还没有触发过 TheOldLLM 请求');
  console.log('   2. 如果"已验证可用"为 0，说明还没有成功验证任何代理');
  console.log('   3. 发起一个 TheOldLLM 请求后，应该看到：');
  console.log('      - "待验证"变成 150');
  console.log('      - 日志中出现 [ProxyManager] 和 [fetchWithProxyConcurrent] 输出');
  console.log('      - 成功后，"已验证可用"递增');
  console.log();
  console.log('🚀 下一步：');
  console.log('   1. 确保 TheOldLLM 配置中启用了"使用代理池"');
  console.log('   2. 设置"代理并发数"（推荐 3-5）');
  console.log('   3. 保存配置');
  console.log('   4. 发起一个 TheOldLLM 请求');
  console.log('   5. 观察日志和统计变化');
}

diagnose().catch(console.error);
