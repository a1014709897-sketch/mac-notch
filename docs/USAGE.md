# 本机用量口径

- 日期：本机时区，今天和前 6 个日历日；不是固定 168 小时。
- 数据：只读 Claude Code 的 projects/transcripts 与 Codex sessions/archived_sessions；没有记录的任务不可恢复。网页登录本身不会产生本机用量记录。
- Claude：按 requestId + message.id 去重，后续片段替换同一消息用量。input、cache read、cache creation、output 四类互斥相加；thinking 已包含在 output 中。
- Codex：新版 token_usage_record 使用 response_id 去重，优先于同一文件镜像 token_count。旧格式按累计差值计算；第一条只计 last_token_usage，避免计入 fork 继承的历史；重复累计值不再累加。缓存输入从 inclusive input 扣除再分别计价，reasoning 已包含在 output 中。
- 更新：独立 Worker 每 30 秒增量读取追加行；未完成的 JSONL 行下次重读。重启时重新读取近期记录，不保存另一份对话内容。

## 价格

公开标准 API USD / 百万 Token，表更新于 2026-11-02：

- [OpenAI 官方价格](https://developers.openai.com/api/docs/pricing)
- [Anthropic 官方价格](https://platform.claude.com/docs/en/about-claude/pricing)

这是统一标准费率估算，用来比较使用规模，不是订阅用户实际支付金额。长上下文阶梯、服务档位、地区、工具调用和套餐折扣未折算。没有明确费率的模型/缓存类别标为未计价，部分可计价时金额带“起”。OpenAI 缓存写入没有 TTL 细节时按公开短期写入价估算；Claude 有 1 小时缓存元数据时单独计价。

UI 不显示用户提示词、回复、会话标题或文件路径，Worker 只返回日期、Token 数、费用估算、工具汇总与读取状态。
