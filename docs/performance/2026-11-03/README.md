# Mac Notch 0.2.9 CPU 优化实测

基线：远端 `origin/main` / `9e41c15`（v0.2.9）。优化只修改独立 Mac Notch 的 `src/renderer/mascots.js`，未同步 Token Monitor，未修改任务扫描、状态机、通知队列、用量、账号或更新逻辑。

## 为什么做这些改动

持续开销近似由唤醒频率、每帧工作量和无变化时仍执行的工作决定。原实现为固定 160×160 Canvas、24fps 表情重画，同时 CSS 循环位移动画独立运行。22 CSS px 图标在这台 2× 屏幕只需 44×44 物理像素；固定 160×160 的像素数量约为所需的 13.2 倍。这个倍数仅是像素面积，不能直接当作 CPU 降幅。

- 画布按 `22 × devicePixelRatio` 生成，屏幕密度变化时重建；身体图样仍复用缓存。
- 以可见表情为键，跳过重复上传；眼睛位移按半个设计单位归组，22px 图标下基础位移约 0.11 CSS px（Codex / WorkBuddy 内部 1.3× 缩放后约 0.143px）。眨眼、眯眼、等待招呼、多任务星光分别保留变化键。这是亚像素采样取舍，不声称逐像素一致。
- 小图标和执行中圆点的循环位移与原有 24fps 表情共用一次调度。持续时间、轨迹和状态含义保留；循环位移采样从显示器刷新节拍改为最多 24fps。完成的一次性动作、通知和面板过渡仍用原有 compositor 动画。
- 空闲位移在原 keyframes 的静止区间不再推进合成；隐藏、减少动态效果、没有图标时停止图标调度。Codex 完成表情不反复重画。显示窗口不重播已结束的完成动作。

## 受控 A/B 方法

同一台 Apple Silicon Mac，16 个逻辑 CPU、128 GiB 内存、2× 显示比例，Electron 45.1.0。两个版本顺序运行、使用全新隔离 demo 配置；Claude 空闲 + Codex 指定状态，禁用 demo 通知以排除阶段切换弹窗。每个状态预热 2 秒，测量 21 秒，约每秒记录一次全部 Electron 进程累计 CPU 秒和 RSS。源代码 demo 不运行真实日志 worker 或厂商请求，因此此表用于比较绘制改动，不能当作任何用户机器上的总占用保证。

CPU = 总进程 CPU 秒增量 / 墙钟秒增量 × 100。**100% 为一个核心**，不是整机百分比。前后进程数、场景和采样方法相同。原始数据见 [before.json](before.json) 与 [after.json](after.json)。

| 场景 | 优化前平均 CPU | 优化后平均 CPU | 变化 |
|---|---:|---:|---:|
| 双工具空闲 | 15.07% | 4.38% | 降低 70.9% |
| Codex 执行中 + Claude 空闲 | 21.70% | 9.25% | 降低 57.4% |
| Codex 等待协助 + Claude 空闲 | 17.21% | 8.01% | 降低 53.5% |
| Codex 已完成 + Claude 空闲 | 13.59% | 3.71% | 降低 72.7% |
| 窗口隐藏 | 0.30% | 0.32% | 绝对差 0.02 个百分点，基本相同 |

RSS 加总约 585–605 MiB，前后没有显著下降。RSS 可能重复统计共享页，也不同于 Activity Monitor / top 的内存足迹；不要把此值与之前的 440–570 MB 足迹直接比较。此次主要减少持续 CPU 工作，未更换 Electron 架构，未测功率、温度或电池续航。不能由 CPU 降幅直接宣称发热降低同样百分比。

## 重现

在独立临时目录从基线提交提取 `src/`、`assets/`、`package.json`，链接同一份 `node_modules/`。使用最终版 benchmark 脚本分别运行：

```sh
NOTCH_PERF_ROOT=/absolute/path/to/baseline NOTCH_PERF_OUTPUT=/tmp/before.json node_modules/.bin/electron scripts/performance.js
NOTCH_PERF_OUTPUT=/tmp/after.json node_modules/.bin/electron scripts/performance.js
```

默认依次测 idle/running/waiting/ended/hidden，每个 21 秒。可用 `NOTCH_PERF_SECONDS`（7–120）和 `NOTCH_PERF_STATES` 缩小复测范围。脚本通过生产 demo 入口创建临时设置目录，不读写日用设置。PNG 使用演示额度，未保存真实会话内容。

## 验证与边界

`npm run verify`：126 项测试通过。新增 6 项图标调度回归覆盖三个工具的全部表情、隐藏/恢复、减少动态效果、DPR、DOM 重建后的动画相位、完成动画不重播及首帧绑定前的可见性变化。

`npm run pack`：arm64 构建、Electron/Koffi 架构与签名完整性检查通过（ad-hoc，未公证）。打包 `.app --smoke` 返回 `ok: true`，覆盖设置、手势、额度、通知、前台抑制、折叠与重开、鼠标穿透及 WorkBuddy 布局，详见 [smoke.json](smoke.json)。检查了优化前后空闲截图及打包运行态截图。

已安装到 `/Applications/Mac Notch.app` 并启动，版本仍为 0.2.9（本地优化构建，不是已发布的新版本）。旧应用已在本机缓存目录备份。安装的 `mascots.js` 与源码逐字节一致，SHA-256 为 `4a2d3932d167c408b3aba3d14b6492fbbb326d36d1112c7f8341fcd628160237`。日用设置未修改。

安装后又用 `top` 连续取 12 轮样本，丢弃第一轮 CPU 初值，得到真实运行 CPU 平均 **11.47%**、范围 **7.8%–14.0%**，内存足迹加总约 **457–485 MiB**。见 [live-after.json](live-after.json)。此时包含真实任务扫描与用量 worker，不是受控 demo；它只验证安装后的实际占用，不与旧 0.2.8 的不同时间、不同任务样本计算严格降幅。

原有未跟踪的 `site/AGENTS.md` 保留，不纳入本次改动。没有发布 Release、推送远端或更新官网。

未覆盖 Intel 真机、不同刷新率/缩放屏幕、长时间耗电与温升、真实 Claude/Codex/WorkBuddy 账号的全部端到端场景。自动检查和本机截图不能代替这些分发验收。
