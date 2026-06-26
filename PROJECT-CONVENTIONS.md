# OmniRoute 私有仓库项目规范

## 仓库结构

| 仓库 | 用途 | 地址 |
|------|------|------|
| **上游源仓库** | 官方开源仓库 | \diegosouzapw/OmniRoute\ |
| **私有仓库** | 我们的私有定制版 | \jjjjllll111/omniroute-private\ |
| **公开仓库** | CI 构建专用 | \jjjjllll111/my-projects\ |
| **HF 空间** | 部署运行 | \VVVVY001/OmniRoute\ |

## 开发工作流（必须严格遵守）

### 1. 代码修改 → PR 提交

**所有修改必须通过 PR 提交，禁止直接推送到 main 分支。**

\\\ash
# 从最新 main 创建分支
git checkout main
git pull origin main
git checkout -b fix/your-feature-name

# 修改代码...
git add -A
git commit -m "fix(scope): description"

# 推送并创建 PR
git push origin fix/your-feature-name
gh pr create --repo jjjjllll111/omniroute-private --base main --head fix/your-feature-name
\\\

### 2. PR 审查 → 合并

- PR 创建后等待审查确认
- 确认无问题后合并到 main 分支
- 合并后删除功能分支

### 3. CI 构建（公开仓库执行）

公开仓库 \jjjjllll111/my-projects\ 中的 \ci.yml\ 负责：

1. 拉取私有仓库 main 分支代码
2. \
pm ci\ → 构建插件 → \uild:release\
3. \
pm pack\ 生成 .tgz
4. 上传到私有仓库 release \private-latest\

\\\ash
# 触发构建
gh workflow run ci.yml --repo jjjjllll111/my-projects -f ref=main
\\\

### 4. HF 空间部署

CI 构建成功后，推送更改到 HF 空间触发自动重启：

\\\ash
cd C:\\Users\\Administrator\\Documents\\OmniRoute-hf
git push origin main
\\\

HF 空间的 \start.sh\ 会从私有仓库 release 下载最新 .tgz 并安装。

## 上游同步流程

当上游源仓库有新版本时：

\\\ash
# 1. 拉取上游最新代码
git fetch upstream
git checkout -b merge/upstream-vX.Y.Z

# 2. 合并上游 main
git merge upstream/main

# 3. 解决冲突（保留我们的私有修改 + 上游新功能）
# 4. 提交合并
git commit --no-edit
git push origin merge/upstream-vX.Y.Z

# 5. 创建 PR 审查
gh pr create --title "chore: 合并上游 vX.Y.Z"
\\\

## 关键规则

1. **绝不推送到上游源仓库** — 上游是只读参考
2. **私有仓库 main 分支受保护** — 必须通过 PR 合并
3. **构建在公开仓库执行** — 私有仓库 CI 额度已用完
4. **所有 workflow 已删除** — 私有仓库不运行任何 GitHub Actions
5. **HF 空间自动部署** — push 到 HF 仓库即触发重启

## 冲突解决原则

合并上游更新时：
- **lock 文件** (package-lock.json 等): 使用上游版本
- **CI/CD 文件**: 使用上游版本（我们不运行这些 CI）
- **providerRegistry/schemas**: 使用上游版本（上游有新 provider）
- **OAuth 路由**: 保留我们的 qoder/gitlab-duo 特殊处理
- **models 路由**: 保留我们的 qoder 动态模型获取逻辑
- **proxy/relay 文件**: 保留我们的 Cloudflare/Vercel relay 支持
