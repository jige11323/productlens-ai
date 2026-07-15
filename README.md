# ProductLens AI

AI 产品分析助理。输入 Amazon 商品链接后，系统会自动抓取商品信息，并生成产品信息整理、产品分析、中文短视频口播文案和质量检查结果。

## 功能

- Amazon 商品链接输入与校验
- 商品标题、价格、品牌、评分、主图、ASIN、核心功能提取
- AI 产品理解分析：目标用户、使用场景、用户痛点、核心卖点、内容角度
- 150 字以内中文短视频口播文案，包含前 5 秒钩子
- 质量检查：夸大描述、不可验证信息、字数和合规风险
- 无登录注册，打开即用

## 技术栈

- Next.js App Router
- TypeScript
- React
- MiniMax API 或 OpenAI 兼容 Chat Completions API
- 原生 CSS

## 本地运行

```bash
npm install
npm run dev
```

打开 http://localhost:3000

## 环境变量

推荐使用 MiniMax，在 `.env.local` 或 Vercel Environment Variables 中配置：

```bash
AI_PROVIDER=minimax
MINIMAX_API_KEY=你的 MiniMax API Key
MINIMAX_GROUP_ID=你的 MiniMax Group ID
MINIMAX_MODEL=abab6.5s-chat
```

如果需要切回 OpenAI 或 OpenAI 兼容网关，可以改成：

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=你的密钥
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

`OPENAI_BASE_URL` 也可以填写其他 OpenAI 兼容模型服务地址。

## 部署

推荐使用 Vercel：

1. 将代码推送到 GitHub。
2. 在 Vercel 导入仓库。
3. 在 Vercel Project Settings 中添加 MiniMax 环境变量。
4. 部署后使用公开 Amazon 商品链接测试。

## 设计说明

本项目把页面设计成分析工作台，而不是营销落地页。笔试评审可以直接看到完整工作流：链接输入、抓取进度、结构化产品信息、分析维度、口播文案和质量检查。

## 已知限制

Amazon 页面存在反爬限制。当前版本优先直接解析商品页面，并在抓取不完整时降级到 Reader 解析和保守 AI 分析。生产环境建议接入 Firecrawl、ScraperAPI、Rainforest API 等专业商品数据服务。
