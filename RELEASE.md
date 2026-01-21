# Release Guide

本指南说明如何创建新版本并触发自动打包发布。

## 自动发布流程

项目配置了两个 GitHub Actions workflow：

### 1. **Build on Push** (`.github/workflows/build-on-push.yml`)
- **触发条件**：推送到 main/master/develop 分支，或创建 PR
- **功能**：
  - 类型检查（TypeScript）
  - 构建应用
  - 上传构建产物（保留7天）
- **用途**：持续集成，确保代码质量

### 2. **Build and Release** (`.github/workflows/release.yml`)
- **触发条件**：推送版本标签（`v*.*.*` 格式）或手动触发
- **功能**：
  - 构建生产版本
  - 创建 ZIP 压缩包
  - 自动创建 GitHub Release
  - 上传构建产物（保留90天）
- **用途**：正式版本发布

## 发布新版本

### 方法 1：通过 Git 标签（推荐）

```bash
# 1. 更新 package.json 中的版本号
npm version patch  # 2.3.0 -> 2.3.1
# 或
npm version minor  # 2.3.0 -> 2.4.0
# 或
npm version major  # 2.3.0 -> 3.0.0

# 2. 推送代码和标签到 GitHub
git push && git push --tags

# GitHub Actions 会自动检测到标签并开始构建发布
```

### 方法 2：手动创建标签

```bash
# 1. 手动更新 package.json 中的 version 字段
# 例如：2.3.0 -> 2.4.0

# 2. 提交更改
git add package.json
git commit -m "chore: bump version to 2.4.0"

# 3. 创建标签
git tag v2.4.0

# 4. 推送
git push && git push --tags
```

### 方法 3：GitHub 手动触发

1. 访问 GitHub 仓库的 **Actions** 页面
2. 选择 **Build and Release** workflow
3. 点击 **Run workflow** 按钮
4. 选择要发布的分支
5. 点击 **Run workflow** 确认

## 版本号规范

遵循语义化版本（Semantic Versioning）：

- **MAJOR（主版本）**：不兼容的 API 修改
- **MINOR（次版本）**：向下兼容的功能新增
- **PATCH（修订版本）**：向下兼容的问题修正

格式：`v{MAJOR}.{MINOR}.{PATCH}`

例如：
- `v2.3.0` - 当前版本
- `v2.3.1` - 修复 bug
- `v2.4.0` - 新增功能
- `v3.0.0` - 重大更新

## Release 内容

自动创建的 Release 包含：

1. **发布说明**：
   - 功能列表
   - 安装说明
   - 性能优化说明
   - 自动生成的更新日志

2. **附件**：
   - `gemini-tagger-pro-dist.zip` - 生产构建包

3. **构建产物**：
   - 可在 Actions 页面下载原始 dist 文件夹

## 发布检查清单

发布前确保：

- [ ] 代码已合并到主分支
- [ ] 所有测试通过
- [ ] `package.json` 版本号已更新
- [ ] 重要更改已记录在 commit message 中
- [ ] 本地构建成功（`npm run build`）

## 回滚版本

如果需要回滚：

```bash
# 1. 删除远程标签
git push --delete origin v2.4.0

# 2. 删除本地标签
git tag -d v2.4.0

# 3. 在 GitHub 上删除对应的 Release

# 4. 重新创建正确的标签
git tag v2.4.0
git push --tags
```

## 查看构建状态

- 访问仓库的 **Actions** 页面
- 查看 workflow 运行状态
- 点击具体的 workflow run 查看详细日志

## 故障排查

### 构建失败

1. 检查 Actions 日志中的错误信息
2. 确保所有依赖都在 `package.json` 中声明
3. 本地运行 `npm run build` 验证

### Release 未创建

1. 检查标签格式是否为 `v*.*.*`
2. 确保仓库有 **write** 权限
3. 检查 `GITHUB_TOKEN` 是否有效

### 权限问题

在仓库设置中：
1. Settings → Actions → General
2. Workflow permissions → 选择 "Read and write permissions"
3. 保存更改
