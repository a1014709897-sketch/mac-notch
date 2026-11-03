# Mac Notch

A small macOS companion for **Claude and Codex**: animated task status at the notch, subscription quotas in the menu bar. 本项目第一期仅支持 macOS。

> v0.1.0：独立提取版。原型来自 Token Monitor 的本地定制；此仓库具有独立入口、配置目录与构建流程。没有 Token 历史账单、同步服务器或多供应商仪表盘。

## 预览

以下为独立应用的窗口截图，使用演示数据。黑色中央区域为真实硬件摄像头预留位置。

| 空闲常驻 | 等待协助 | 完成提醒 |
|---|---|---|
| ![空闲](docs/screenshots/idle-idle.png) | ![协助](docs/screenshots/idle-waiting.png) | ![完成](docs/screenshots/idle-ended.png) |

[双工具运行](docs/screenshots/running-running.png) · [额度与设置面板](docs/screenshots/quotas.png)

## 功能

- Claude 橙色小怪兽、Codex 蓝紫图标；运行时动画与三点，等待协助时轻量 `?`，完成时细线 `✓`。
- 空闲时两位小伙伴常驻，Claude 左、Codex 右；没有状态文案、跑马灯或额外一行。
- 每块屏幕上的收起宽度固定，状态变化不撑宽。真实摄像头区域留空；外接无刘海屏幕使用固定宽度胶囊。
- 单工具：左侧图标、右侧状态，整条可以点击。双工具：各自点击跳转。单击打开对应官方客户端，双击打开额度与设置。悬停不展开。
- 已完成提醒在点击或切回客户端后清除；完成时已处于对应客户端，则保留 2 秒。运行和待协助不会因点击而当作完成。
- 两个彩色菜单栏图标分别显示 Claude / Codex 剩余额度。百分比取已知窗口中最小剩余值；不把本地 token 消耗当成订阅额度。
- 设置中支持系统代理或本应用专用代理、Claude 网页凭据加密保存、登录启动。

## 快速开始

要求：macOS 13+、Node.js 22.15+（建议 Node 24）、npm。首发本地构建为 Apple Silicon；Intel 构建命令和 CI 可用，但需要在 Intel Mac 上单独验收。

```sh
npm ci
# 如果本机 npm 禁用了依赖安装脚本：
node node_modules/electron/install.js
npm run verify
npm start
```

无需 Token Monitor，也不会读取其配置。第一次与已安装的 Token Monitor 同时运行会出现两套刘海/菜单栏项目；请在使用时退出其中一套。

```sh
npm run smoke          # 六种窗口状态与图标资源检查
npm run demo           # 使用模拟额度，可切换空闲/运行/协助/完成；不读取真实登录
npm run pack           # dist/mac-arm64/Mac Notch.app
npm run dist           # arm64 DMG + ZIP
npm run dist:x64       # Intel DMG + ZIP
npm run source         # 不含 node_modules、凭据和本地配置的源码包
npm run release:local  # 完整构建、源码归档与 SHA-256 校验清单
```

## 登录与额度

**Codex**：先在官方客户端或 CLI 登录订阅账号。应用只读 `$CODEX_HOME/auth.json`（默认 `~/.codex/auth.json`）的访问令牌，调用 ChatGPT 额度接口。API Key 登录没有订阅额度，显示明确提示。

**Claude**：优先读取 `CLAUDE_CODE_OAUTH_TOKEN`、Claude Code 凭据文件或 macOS Keychain 的 `Claude Code-credentials`。如果仅使用 Claude 桌面版、没有 Claude Code 登录，可在设置中自行填写 Claude 网页的 sessionKey。仅桌面版登录不保证存在可用于额度查询的凭据。

凭据不发送给 Mac Notch 的服务器（本项目没有服务器），只用于对应厂商额度接口。手工输入的 Claude sessionKey 使用 Electron safeStorage 加密。Keychain 读取可能触发 macOS 权限提示。应用不替用户刷新/改写 Claude 或 Codex 的登录令牌，也不执行推理任务来探测余额。

默认两分钟刷新一次额度；429 至少退避五分钟。失败会显示错误和缓存标记；未知额度显示 `—`，不伪装成 0% 或 100%。代理只影响本应用的额度请求。

## 状态来源与限制

- Codex：只读本地 SQLite 线程目录，读取近期 JSONL 的追加记录。同步提问、异步问题及匹配回答均可识别。只保留状态与问题索引，不把问题正文发给界面。
- Claude：只读会话注册表，核验 PID 和进程启动时间；桌面版完成需要观察到同一用户轮次的 `completedTurns` 增长。注册表 `idle` 或进程消失不会被当作任务成功。
- 启动时不会把旧历史任务误报为刚完成。观察断开超过 30 秒会退回空闲；已观察到的待协助问题不会仅因日志静默而超时；不保证覆盖所有客户端弹窗、远程执行器或权限确认。
- 点击切换到**客户端**，不保证定位到具体会话。同一工具的多个任务聚合，等待协助优先。
- 新的普通用户指令视为替代旧的未答选择题；上下文注入不会清除等待。客户端外部取消问题而不写日志，可能暂时保留等待状态。
- 固定宽度是每块屏幕内固定；切换到不同硬件屏幕会重新计算。全屏时仍显示，锁屏时隐藏。
- 本期完成确认状态仅驻留内存，应用重启后不恢复旧提醒；自动更新、跨设备同步、多账号切换不在本期范围。

## 文档

- [需求与验收](docs/REQUIREMENTS.md)
- [架构和数据流](docs/ARCHITECTURE.md)
- [从原型到独立项目的取舍](docs/DECISIONS.md)
- [构建、发布与签名](docs/RELEASE.md)
- [验证记录](docs/VALIDATION.md)
- [来源声明](THIRD_PARTY_NOTICES.md)

## 开源与分发

MIT。复用代码保留 Token Monitor 的原始版权声明，详见第三方声明。Claude、Codex 及相关标识归各自权利人所有。

仓库未配置任何上游自动更新地址。GitHub CI 构建不自动发布 Release。公开分发前，应设置自己的 bundle ID、Apple Developer 签名和公证；当前默认产物为 ad-hoc 签名，没有 Developer ID 公证，不能宣称为已公证发行版。
