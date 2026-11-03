# 构建与发布

## 本地构建

```sh
npm ci
npm run verify
npm run smoke
npm run pack
npm run dist
npm run source
npm run checksums
```

也可直接执行 `npm run release:local` 完成校验、打包、源码归档和 SHA-256 清单生成。

`dist` 默认生成 Apple Silicon 的 `.app`、DMG 与 ZIP。Intel 使用 `npm run dist:x64`。不将本机 node_modules 或用户配置加入源码包。`package-lock.json` 固定依赖图。

若 npm 配置了 `ignore-scripts=true`，Electron 二进制不会自动下载，执行 `node node_modules/electron/install.js`。图标 PNG 已纳入源码；重新生成运行 `npx electron scripts/icons.js`。

## 发布身份

产品名 Mac Notch，仓库 `a1014709897-sketch/mac-notch`，bundle ID `io.github.a1014709897-sketch.macnotch`。首发后保持此身份，避免用户的安全存储/登录启动身份变化。没有绑定 Token Monitor 的更新源。

当前固定使用 `build.mac.identity="-"` 生成 ad-hoc 签名产物，关闭 hardened runtime 和自动公证；本地 `codesign --verify --deep --strict` 已通过。这种签名没有 Apple Developer ID 身份，也没有公证。Gatekeeper 对从互联网下载的未公证应用可能阻止启动。这不是面向普通用户的最终分发签名状态，不应宣传“已公证”。不提供关闭系统安全检查的安装步骤。

正式分发：使用自己 Apple Developer 账号的 Developer ID Application 证书，替换 `identity:"-"`、启用 hardened runtime 和合适 entitlements、移除 `notarize:false`，完成 `notarytool submit --wait` 与 `stapler staple`，再用 `codesign --verify --deep --strict`、`spctl --assess --type execute` 检查。在 CI 中用受保护 secrets 注入证书与公证凭据，不写入仓库。

## GitHub

发布目标为 https://github.com/a1014709897-sketch/mac-notch 。CI 在 macOS 构建两个架构并保存 artifacts，不自动发布 Release。

```sh
npm run release:local
# 检查安装包、确认工作区干净，再推送提交和版本标签。
```

首发说明使用 `docs/releases/v0.1.0.md`，附件包括 DMG、应用 ZIP、源码 ZIP 和 SHA256SUMS.txt。发布后核对远端标签对应的提交和附件摘要。

发布检查：许可证和第三方说明完整；README 不包含本机路径；截图使用演示数据；明确人工验收与平台范围；签名与公证状态准确；Release 附 SHA256 校验文件。
