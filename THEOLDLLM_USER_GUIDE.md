# TheOldLLM 动态模型发现 - 用户使用指南

## 🎯 功能概述

TheOldLLM 提供商现在支持**动态模型发现**！系统会自动从 TheOldLLM 网站抓取最新的模型列表，无需手动更新。

## ✨ 主要特性

- ✅ **自动发现**: 从 https://theoldllm.vercel.app/ 实时抓取模型
- ✅ **一键同步**: 点击"同步模型"按钮即可刷新列表
- ✅ **智能回退**: 如果网络抓取失败，自动使用25个模型的静态列表
- ✅ **隐藏模型过滤**: 只显示你选择激活的模型
- ✅ **免鉴权访问**: 无需 API 密钥或凭证

## 📖 使用方法

### 方式1：通过提供商页面同步（推荐）

1. 访问提供商管理页面：
   ```
   https://你的域名/dashboard/providers/theoldllm
   ```

2. 点击页面上的 **"同步模型"** 或 **"从 /models 导入"** 按钮

3. 系统会：
   - 从 TheOldLLM 网站抓取最新模型列表
   - 显示发现的模型数量（通常 25+ 个）
   - 自动过滤你隐藏的模型
   - 更新模型选择器

### 方式2：通过 API 直接调用

```bash
# 获取最新模型列表
curl https://你的域名/api/providers/theoldllm/discover-models

# 使用静态列表（跳过网络请求，用于测试）
curl https://你的域名/api/providers/theoldllm/discover-models?live=false
```

### 方式3：在 LLMLingua 配置页面使用

1. 访问 LLMLingua 压缩配置页面：
   ```
   https://你的域名/dashboard/context/llmlingua
   ```

2. 在模型选择器中：
   - 免鉴权提供商（包括 TheOldLLM）的模型会自动显示
   - 已隐藏的模型会被过滤掉
   - 支持搜索和选择

## 📋 当前可发现的模型（示例）

TheOldLLM 当前提供 **25+ 个模型**，包括：

### OpenAI 系列 (10个)
- GPT-5.4, GPT-5.3, GPT-5.2, GPT-5.1, GPT-5
- OpenRouter GPT-4o, GPT-4o Mini, GPT-4
- O4 Mini, O3 Mini

### Anthropic 系列 (3个)
- Claude 4.6 Opus, Claude 4.6 Sonnet, Claude 4.5 Haiku

### Google 系列 (4个)
- Gemini 3 Pro, Gemini 2.5 Pro, Gemini 2.0 Flash, Gemini 1.5 Flash

### 其他提供商 (8个)
- Perplexity: Sonar Pro, Sonar Deep Research
- DeepSeek: R1, V3 (Together & OpenRouter 版本)
- xAI: Grok 4 (OpenRouter)
- OpenRouter: Web Search

> 💡 **注意**: 模型列表会实时更新，以上仅为示例。

## 🔍 免鉴权提供商状态

| 提供商 | 模型发现方式 | 状态 |
|--------|-------------|------|
| **TheOldLLM** | HTML 网页抓取 | ✅ 动态发现 (新) |
| **OpenCode** | `/v1/models` API | ✅ 动态发现 (已有) |
| **DuckDuckGo AI Chat** | 静态列表 | ℹ️ 6个固定模型 |
| **Chipotle Pepper AI** | 静态列表 | ℹ️ 1个固定模型 |
| **MiMoCode** | 静态列表 | ℹ️ 1个固定模型 |

## ⚙️ 高级设置

### 隐藏不需要的模型

1. 进入提供商页面
2. 找到你不想使用的模型
3. 点击"隐藏"按钮
4. 该模型将从所有模型选择器中消失

### 使用直通模式

TheOldLLM 支持 **passthrough 模式**，即使模型不在发现列表中，你也可以手动输入模型名称尝试使用。

## 🚀 性能说明

- **首次加载**: 约 2-5 秒（从网站抓取模型）
- **超时设置**: 15 秒（如果超时则使用静态列表）
- **缓存**: 建议定期点击"同步模型"以获取最新列表

## 🐛 故障排查

### 问题：点击同步后没有新模型

**可能原因**:
1. 网络连接问题
2. TheOldLLM 网站临时不可用
3. HTML 结构发生变化

**解决方法**:
- 系统会自动回退到 25 个模型的静态列表
- 稍后再次尝试同步
- 检查浏览器控制台的错误信息

### 问题：模型数量少于预期

**可能原因**:
- 你隐藏了某些模型

**解决方法**:
- 检查提供商页面的隐藏模型设置
- 取消隐藏你需要的模型

## 📚 相关文档

- [完整实现细节](./THEOLDLLM_IMPLEMENTATION_COMPLETE.md)
- [技术架构](./docs/architecture/ARCHITECTURE.md)
- [API 参考](./docs/reference/API_REFERENCE.md)

## 💡 提示

- 定期同步模型列表以获取 TheOldLLM 的最新模型
- 使用隐藏功能整理你的模型选择器
- OpenCode 提供商也支持动态发现，无需额外配置

---

**更新日期**: 2026-06-25  
**功能状态**: ✅ 生产就绪
