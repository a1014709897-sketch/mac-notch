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

若 npm 配置了 `ignore-scripts=true`，Electron 二进制不会自动下载，执行 `node node_modules/electron/install.js`。图标 PNG 已纳入源码；重新生成运行 `npx electron scripts/icons.js`，菜单栏光学校准图标运行 `npx electron scripts/tray-icons.cjs`。

## 发布身份

<!--
产品名 Mac Notch，仓库 `a1014709897-sketch/mac-notch`，bundle ID `io.github.a1014709897-sketch.macnotch`。首发后保持此身份，避免用户的安全存储/登录启动身份变化。没有绑定 Token Monitor 的更新源。
-->

当前固定使用 `build.mac.identity="-"` 生成 ad-hoc 签名产物，关闭 hardened runtime 和自动公证；本地 `codesign --verify --deep --strict` 已通过。这种签名没有 Apple Developer ID 身份，也没有公证。Gatekeeper 对从互联网下载的未公证应用可能阻止启动。这不是面向普通用户的最终分发签名状态，不应宣传“已公证”。不提供关闭系统安全检查的安装步骤。

正式分发：使用自己 Apple Developer 账号的 Developer ID Application 证书，替换 `identity:"-"`、启用 hardened runtime 和合适 entitlements、移除 `notarize:false`，完成 `notarytool submit --wait` 与 `stapler staple`，再用 `codesign --verify --deep --strict`、`spctl --assess --type execute` 检查。在 CI 中用受保护 secrets 注入证书与公证凭据，不写入仓库。

## GitHub

发布目标为 https://github.com/a1014709897-sketch/mac-notch 。CI 在 macOS 构建两个架构并保存 artifacts，不自动发布 Release。

```sh
npm run release:local
# 检查安装包、确认工作区干净，再推送提交和版本标签。
```

v0.2.1 体验版说明使用 `docs/releases/v0.2.1.md`，附件包括 DMG、应用 ZIP、源码 ZIP 和 SHA256SUMS.txt。发布后核对远端标签对应的提交和附件摘要。

发布检查：许可证和第三方说明完整；README 不包含本机路径；截图使用演示数据；明确人工验收与平台范围；签名与公证状态准确；Release 附 SHA256 校验文件。

## v0.2.1 体验版流程

本地构建 arm64 安装包并通过打包版 smoke 后，将应用 ZIP 的 SHA-256 固定写入 `site/install.sh`，再生成源码 ZIP 和校验清单。源码包需包含最终版本的安装脚本和文档。提交全部变更，版本标签与提交绑定，远端 CI 通过后发布 GitHub prerelease，并部署官网。官网和 README 明确链接 `releases/tag/v0.2.1`，避免 `latest` 跳到旧稳定版。

发布后检查附件摘要，运行公开安装脚本的 `--verify-only`，确认下载的版本、应用身份、签名完整性及 SHA-256 一致。此检查不等于 Gatekeeper 认可，也不替代另一台 Mac 的安装验收。

## v0.2.1 Intel 补充发布

Intel DMG / ZIP 使用与标签提交 `b88d1cc84869a0e08a36a8828be67f0686a86d9d` 一致的应用源码和依赖在本机交叉构建；该标签的 GitHub Actions `41610614041` 也已通过 x64 构建。不移动版本标签、不替换既有 arm64 安装包和版本源码归档。更新 Release 附件及合并校验清单后，再推送官网安装脚本。脚本分别固定 arm64 / x64 的 SHA-256，使用 `hw.optional.arm64` 优先识别真实 Apple Silicon 硬件，避免 Rosetta shell 被误判成 Intel。网站和安装脚本补充修改记录在后续 main 提交；原版本源码归档仍准确对应原标签。

## 应用内手动更新

控制页支持检查更新、下载并校验 DMG、打开安装包。仍不自动替换应用。每个架构的附件命名必须为 `Mac-Notch-<版本>-<架构>.dmg`，并提供 GitHub SHA-256 digest 或匹配的 `SHA256SUMS.txt`。仅发布包含当前架构产物的完整版本；发布前测试断网、下载中断、校验失败、体验版渠道及 Rosetta 架构识别。当前 ad-hoc 签名和公证状态不因新增下载功能而改变。

应用内更新缓存最多保留一份完整 DMG：启动时保留版本最高的一份并清除中断残留；新版下载且校验成功后移除其他旧包，下载失败保留原有包。清理仅作用于应用私有 updates 目录中符合更新器命名的普通文件，不扫描用户下载目录或卸载挂载磁盘。清理失败不阻止应用启动，下载时再次尝试并报告失败。

## v0.2.8

合并更新缓存清理、设置面板尺寸与 Dock 生命周期、空闲额度和菜单栏示意图。发布前重新构建双架构，使用最终 ZIP 的 SHA-256 更新官网安装脚本，再生成源码 ZIP 和校验清单。
