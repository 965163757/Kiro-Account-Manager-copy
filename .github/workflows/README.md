# GitHub Actions 工作流说明

## 构建工作流 (build.yml)

自动构建所有平台的安装包，用于测试和开发。

### 支持的平台
- **Windows x64**: `.msi` 和 `.exe` 安装包
- **macOS ARM64** (Apple Silicon): `.dmg` 和 `.app`
- **macOS Intel**: `.dmg` 和 `.app`
- **Linux x64**: `.AppImage` 和 `.deb`

### 触发方式
1. **手动触发**: 在 GitHub Actions 页面点击 "Run workflow"
2. **自动触发**: 推送到 `main` 分支或创建 Pull Request

### 下载构建产物
构建完成后，在 Actions 页面的工作流运行详情中下载对应平台的 artifacts。

## 发布工作流 (release.yml)

自动构建并发布到 GitHub Releases。

### 触发方式
创建并推送版本标签：
```bash
git tag v1.5.2
git push origin v1.5.2
```

或手动触发（在 Actions 页面）。

### 发布内容
- 所有平台的安装包
- `latest.json` - 自动更新配置
- `latest-deb.json` - Linux deb 包更新配置

## 配置要求

### 必需的 Secrets
如果需要代码签名和自动更新功能，需要在仓库设置中添加：

- `TAURI_SIGNING_PRIVATE_KEY`: Tauri 更新签名私钥
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: 私钥密码

### 生成签名密钥
```bash
# 安装 Tauri CLI
npm install -g @tauri-apps/cli

# 生成密钥对
tauri signer generate -w ~/.tauri/myapp.key

# 将私钥内容添加到 GitHub Secrets
```

## 本地构建

### 开发构建
```bash
npm install
npm run tauri dev
```

### 生产构建
```bash
npm run tauri build
```

### 指定目标平台
```bash
# macOS ARM64
npm run tauri build -- --target aarch64-apple-darwin

# macOS Intel
npm run tauri build -- --target x86_64-apple-darwin

# Windows
npm run tauri build -- --target x86_64-pc-windows-msvc
```
