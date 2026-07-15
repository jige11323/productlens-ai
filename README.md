# ProductLens AI

电商商品分析工作台。输入 Amazon 商品链接，自动抓取商品信息，由 MiniMax 生成结构化的产品分析、消费者洞察和可直接用于短视频投放的口播文案，并给出可追溯的质量评分。

> 打开即用，无登录注册，单页工作流：链接输入 → 抓取 → 分析 → 文案 → 质检 → 复制。

## 核心能力

- **商品信息整理**：标题、价格、品牌、评分、评论数、ASIN、主图、规格、核心功能
- **产品分析**：目标用户、使用场景、用户痛点、核心卖点、内容角度
- **短视频口播文案**：钩子 + 痛点共鸣 + 卖点种草 + 场景代入 + 软性 CTA，120–150 字，按电商种草结构组织
- **质量检查**：标题真实性、价格一致性、合规风险、字数合规，并按可解释公式计算 0–100 分
- **一键分享**：顶栏分享按钮复制当前页面链接
- **一键复制文案**：短视频文案卡片支持整段复制（含钩子）

## 技术栈

- Next.js 15 (App Router)
- React 19 + TypeScript
- MiniMax `chat/completions` 兼容端点
- 原生 CSS（设计令牌化、无 UI 框架依赖）
- `lucide-react` 图标

## 本地运行

```bash
npm install
npm run dev
```

打开 http://localhost:3000

## 环境变量

在 `.env.local` 中配置以下变量：

```bash
MINIMAX_API_KEY=你的 MiniMax API Key
MINIMAX_MODEL=MiniMax-Text-01
MINIMAX_BASE_URL=https://api.minimax.chat/v1
```

接口走标准 Bearer Token 鉴权，**不需要** Group ID。

## 部署到 Vercel

1. 推送代码到 GitHub
2. 在 Vercel 导入仓库
3. Project Settings → Environment Variables 添加：
   - `MINIMAX_API_KEY`
   - `MINIMAX_MODEL`（可选，默认 `MiniMax-Text-01`）
4. 部署后用公开 Amazon 商品链接测试

## 评分公式

质量评分由后端按公式**确定性**计算，**不**信任 LLM 自己打的分，确保可解释、可复现：

| 维度 | 规则 | 扣分 |
|---|---|---|
| 风险项 | 每出现 1 个 `result = "风险"` | -15 |
| 建议优化 | 每出现 1 个 `result = "建议优化"` | -5 |
| 文案超字 | script > 150 字 | -10 |
| 文案过短 | 0 < script < 80 字 | -5 |
| 字段缺失 | 标题 / 品牌 / 价格 / 主图 每缺 1 个 | -5 |
| 无功能 | `features` 为空 | -10 |
| 数据降级 | 抓取走 Reader fallback | -10 |

基础分 100，最低 0。扣分明细会作为标签展示在质量卡片底部。

## 目录结构

```
app/
  api/analyze/route.ts   # 后端：抓取 + MiniMax 调用 + 评分公式
  globals.css            # 设计令牌 + 全部组件样式
  layout.tsx             # 根布局
  page.tsx               # 工作台 UI
.env.local               # 本地环境变量（git 忽略）
```

## 已知限制

- **反爬**：Amazon 页面存在反爬限制。代码会先尝试直接解析商品页，失败时降级到 `r.jina.ai` Reader；两者都失败则基于 URL 中的 ASIN 保守分析。
- **生产建议**：接入 Firecrawl / ScraperAPI / Rainforest API 等专业商品数据服务以提高字段完整度。
- **模型差异**：不同 MiniMax 模型对 JSON 严格度、长文案的遵循度不同，如遇解析失败可在 `.env.local` 切换 `MINIMAX_MODEL`。