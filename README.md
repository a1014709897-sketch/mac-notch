# Mac Notch

在 Mac 顶部查看 **Claude Code、Codex 和 WorkBuddy** 的任务状态、订阅额度与本机 Token 用量。仅支持 macOS。

**[产品官网与交互演示](https://a1014709897-sketch.github.io/mac-notch/)** · **[下载](https://github.com/a1014709897-sketch/mac-notch/releases/tag/v0.2.11)**

## 预览

以下为独立应用的窗口截图，使用演示数据。黑色中央区域为真实硬件摄像头预留位置。

| 空闲常驻 | 等待协助 | 完成提醒 |
|---|---|---|
| ![空闲](docs/screenshots/idle-idle.png) | ![协助](docs/screenshots/idle-waiting.png) | ![完成](docs/screenshots/idle-ended.png) |

[双工具运行](docs/screenshots/running-running.png) · [刘海展开面板](docs/screenshots/dashboard.png) · [工具设置](docs/screenshots/setup.png)

## 功能

- Claude 橙色小怪兽、Codex 蓝紫花瓣和 WorkBuddy 白绿猫耳头部；运行时动画与三点，等待协助时轻量 `?`，完成时细线 `✓`。
- 刘海条可从三种工具中任选最多两个，空闲时保留各自入口；没有状态文案、跑马灯或额外一行。
- 普通状态使用每块屏幕的基础宽度；多任务计数按需扩宽两侧，中心位置保持不变。真实摄像头区域留空；无刘海屏幕也贴住屏幕顶边。
- 单工具：左侧图标、右侧状态，整条可以点击。双工具：各自点击跳转。单击打开对应官方客户端，右击打开控制页，双击由刘海自身展开用量与额度面板。控制页支持交换右击和双击，自动避免绑定冲突。悬停不展开。
- 默认开启“刘海条空闲时显示剩余额度”：空闲显示图标＋最紧张窗口的剩余百分比，任务状态优先；未知为 `—`，缓存值带提示圆点。菜单栏三个工具可独立显示或隐藏，允许三个全开，不受刘海条两个工具的限制；可右击刘海条或再次打开 Mac Notch 应用进入设置。
- 同工具多任务显示已完成/总数（如 `1/3`），数字变化有轻微过渡；图标各状态保持空闲尺寸，进度固定 15px，长计数通过扩展两侧空间容纳；协助问号优先，全部完成后显示勾。
- “任务完成通知”默认开启，可在设置中关闭并自动保存；关闭时收起当前及排队的完成通知，重新开启不补弹旧通知，任务状态与完成标记保留。
- Claude / Codex 完成时都可展开通知：工具名称、会话标题及完成勾、本轮摘要，整块点击跳转，底边倒计时 5 秒收起。切回对应工具并持续停留约 1–2 秒，会消除该工具已有的完成提醒；运行中和待协助状态不变。这是工具级提醒消除，不改动客户端自己的会话已读状态。
- 两个彩色菜单栏图标分别显示 Claude / Codex 剩余额度。百分比取已知窗口中最小剩余值；不把本地 token 消耗当成订阅额度。
- 首次打开显示工具设置：Claude Code / Codex 独立开关、登录启动。所有开关立即生效并自动保存；关闭工具后，停止它的状态和额度读取，并隐藏对应图标；全部关闭仍保留设置入口。
- 双击展开面板可切换日、周、月的 Token 与标准 API 费用估算：日按小时、本周从周一、本月从 1 日统计，点击柱子查看细分数据。数字仅来自本机记录，不是账号全部设备的账单。

- “需要协助通知”与完成通知分别开关，控制页提供实际效果图和预览。协助通知的会话标题后显示问号，Codex 正文展示待回答问题，部分回答后更新剩余内容；缺少正文时显示通用提示。关闭或点击通知不等于回答。
- 空闲时默认在刘海条显示剩余额度；保留旧配置中手动关闭的选择。
- 控制页支持检查更新、下载并校验本机架构的安装包，再由用户打开安装包完成升级。

- WorkBuddy 开启后按需打开中国版 Web 授权页，用于读取剩余额度；可取消或重新登录，凭据加密保存在 Mac Notch 独立配置中。

## 下载

[GitHub Releases](https://github.com/a1014709897-sketch/mac-notch/releases) 提供 Apple Silicon（arm64）和 Intel（x64）的 DMG、应用 ZIP、源码 ZIP 和 SHA-256 校验文件。v0.2.11 为小范围体验版，使用 ad-hoc 签名，尚未 Apple Developer ID 公证，macOS 可能阻止打开。

也可以把这条命令发给有终端权限的 Agent，或在自己的 Mac 终端运行：

```sh
curl -fsSL https://a1014709897-sketch.github.io/mac-notch/install.sh | bash
```

[安装脚本](site/install.sh) 固定下载当前已验证的版本，自动识别 Apple Silicon / Intel 并选择对应安装包，检查系统、SHA-256、应用身份和签名完整性后安装到 `~/Applications`。无需 sudo；不会覆盖已有应用，也不会关闭 macOS 安全保护。安装后从用户 Applications 文件夹打开。仅验证不安装可在命令末尾使用 `bash -s -- --verify-only`。网站源码、部署和域名配置见 [网站维护说明](docs/WEBSITE.md)。

## 快速开始

要求：macOS 13+、Node.js 22.15+（建议 Node 24）、npm。默认本地构建为 Apple Silicon，Intel 使用 `npm run dist:x64`。两种体验包均可下载，仍需在 Intel 真机上验收。

```sh
npm ci
# 如果本机 npm 禁用了依赖安装脚本：
node node_modules/electron/install.js
npm run verify
npm start
```

```sh
npm run smoke          # 九种状态、实际顶部坐标、展开面板与工具开关检查
npm run demo           # 模拟额度和趋势；独立临时配置，不读取真实登录
npm run pack           # dist/mac-arm64/Mac Notch.app
npm run dist           # arm64 DMG + ZIP
npm run dist:x64       # Intel DMG + ZIP
npm run source         # 不含 node_modules、凭据和本地配置的源码包
npm run release:local  # 完整构建、源码归档与 SHA-256 校验清单
```

## 登录与额度

**Codex**：先在官方客户端或 CLI 登录订阅账号。应用只读 `$CODEX_HOME/auth.json`（默认 `~/.codex/auth.json`）的访问令牌，调用 ChatGPT 额度接口。API Key 登录没有订阅额度，显示明确提示。

**Claude**：如果没有获取 Claude 状态，请运行 Claude Code CLI（`claude`），完成订阅账号登录后刷新。应用读取 `CLAUDE_CODE_OAUTH_TOKEN`、Claude Code 凭据文件或 macOS Keychain 的 `Claude Code-credentials`。仅登录 Claude 桌面版不保证存在额度查询凭据；任务状态与订阅额度是不同的数据来源。

不再要求用户手动填写 sessionKey 或代理地址。默认沿用系统代理；旧版本已保存的应用代理和加密凭据继续兼容。凭据仅发送到对应厂商接口，界面不接收令牌。Keychain 读取可能触发 macOS 权限提示；应用不会改写或自动续期厂商令牌。

默认两分钟刷新一次额度；429 至少退避五分钟。失败会显示错误和缓存标记；未知额度显示 `—`，不伪装成 0% 或 100%。代理只影响本应用的额度请求。

## 本机用量与费用估算

后台线程只读 Claude Code `projects` / `transcripts` 与 Codex `sessions` / `archived_sessions` 的 JSONL 用量字段。每 30 秒自动增量扫描，读取最近 31 个日历日以支持本机时区的日、周、月统计；没有本机记录的网页、远程任务和其他设备用量不会出现。

Codex 新版按 response ID 去重，并排除镜像累计事件；旧版采用累计差值。Claude 同一个消息的重复片段只计一次。缓存输入单列计价，推理输出不重复相加。已删除或缺失的日志无法恢复。未识别模型显示“未计价”，不冒充免费。

价格使用 2026-11-02 的标准 API 公开费率，见 [价格表来源与口径](docs/USAGE.md)。套餐优惠、长上下文阶梯、加速档、工具调用等费用可能不同，**估算金额不是官方账单或订阅实付**。

## 状态来源与限制

- Codex：只读本地 SQLite 线程目录，读取近期 JSONL 的追加记录。同步提问、异步问题及匹配回答均可识别。只保留状态与问题索引，不把问题正文发给界面。
- Claude：只读会话注册表，核验 PID 和进程启动时间；桌面版完成需要观察到同一用户轮次的 `completedTurns` 增长。注册表 `idle` 或进程消失不会被当作任务成功。
- 启动时不会把旧历史任务误报为刚完成。观察断开超过 30 秒会退回空闲；已观察到的待协助问题不会仅因日志静默而超时；不保证覆盖所有客户端弹窗、远程执行器或权限确认。
- 点击切换到**客户端**，不保证定位到具体会话。同一工具的多个任务聚合，等待协助优先。
- 新的普通用户指令视为替代旧的未答选择题；上下文注入不会清除等待。客户端外部取消问题而不写日志，可能暂时保留等待状态。
- 基础宽度根据屏幕硬件计算，多任务计数可扩宽；切换屏幕后重新定位。全屏时仍显示，锁屏时隐藏。
- 本期完成确认状态仅驻留内存，应用重启后不恢复旧提醒；自动更新、跨设备同步、多账号切换不在本期范围。

## 文档

- [需求与验收](docs/REQUIREMENTS.md)
- [架构和数据流](docs/ARCHITECTURE.md)
- [从原型到独立项目的取舍](docs/DECISIONS.md)
- [构建、发布与签名](docs/RELEASE.md)
- [验证记录](docs/VALIDATION.md)
- [来源声明](THIRD_PARTY_NOTICES.md)

## 开源与分发

<!--
MIT。复用代码保留 Token Monitor 的原始版权声明，详见第三方声明。Claude、Codex 及相关标识归各自权利人所有。
-->

仓库未配置任何上游自动更新地址。GitHub CI 构建不自动发布 Release。应用使用独立的 bundle ID 和本仓库更新源。当前体验版采用 ad-hoc 签名，没有 Developer ID 公证；正式分发签名流程见发布文档。
