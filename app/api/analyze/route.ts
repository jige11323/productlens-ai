import { NextRequest, NextResponse } from "next/server";

type ProductInfo = {
  title: string;
  category: string;
  price: string;
  brand: string;
  rating: string;
  reviewCount: string;
  asin: string;
  imageUrl: string;
  specs: Record<string, string>;
  features: string[];
  sourceUrl: string;
};

type QualityItem = {
  name: string;
  result: "通过" | "建议优化" | "风险";
  note: string;
};

type AnalysisResult = {
  productInfo: ProductInfo;
  analysis: {
    targetUsers: string[];
    scenarios: string[];
    painPoints: string[];
    sellingPoints: string[];
    contentAngles: string[];
  };
  videoScript: {
    hook: string;
    script: string;
    wordCount: number;
  };
  qualityCheck: {
    score: number;
    breakdown: string[];
    items: QualityItem[];
  };
  fetchedAt: string;
  sourceMode: "page" | "fallback";
};

const LLM_BASE_URL = (process.env.MINIMAX_BASE_URL || "https://api.minimax.chat/v1").replace(/\/$/, "");
const LLM_MODEL = process.env.MINIMAX_MODEL || "MiniMax-Text-01";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { url?: string; language?: string };
    const productUrl = normalizeUrl(body.url || "");
    const language: "zh" | "en" = body.language === "en" ? "en" : "zh";

    if (!productUrl) {
      return NextResponse.json(
        { error: language === "en" ? "Please enter a valid Amazon product URL." : "请输入有效的 Amazon 商品链接。" },
        { status: 400 }
      );
    }

    const page = await fetchProductPage(productUrl);
    const extracted = extractProductInfo(page.text, productUrl);
    const result = await generateAnalysis(extracted, page.text.slice(0, 16000), page.mode, language);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "分析失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeUrl(raw: string) {
  try {
    const url = new URL(raw.trim());
    if (!/^https?:$/.test(url.protocol)) return "";
    if (!/(^|\.)amazon\./i.test(url.hostname)) return "";
    return url.toString();
  } catch {
    return "";
  }
}

async function fetchProductPage(url: string): Promise<{ text: string; mode: "page" | "fallback" }> {
  const headers = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9,zh-CN;q=0.8"
  };

  try {
    const response = await fetch(url, { headers, next: { revalidate: 0 } });
    const html = await response.text();
    if (response.ok && html.length > 1000 && !/captcha|robot check|enter the characters/i.test(html)) {
      return { text: html, mode: "page" };
    }
  } catch {
    // Continue to reader fallback.
  }

  try {
    const readerUrl = `https://r.jina.ai/http://${url.replace(/^https?:\/\//, "")}`;
    const response = await fetch(readerUrl, { headers: { accept: "text/plain" }, next: { revalidate: 0 } });
    const text = await response.text();
    if (response.ok && text.length > 500) {
      return { text, mode: "fallback" };
    }
  } catch {
    // Let the LLM work with URL-level context below.
  }

  return {
    text: `无法稳定抓取页面正文。请基于链接中的 ASIN 和可确认信息谨慎分析，不要编造具体参数。URL: ${url}`,
    mode: "fallback"
  };
}

function extractProductInfo(source: string, sourceUrl: string): ProductInfo {
  const jsonLd = extractJsonLd(source);
  const title =
    pickString(jsonLd, ["name"]) ||
    clean(firstMatch(source, /<span[^>]+id=["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i)) ||
    clean(firstMatch(source, /<title[^>]*>([\s\S]*?)<\/title>/i)) ||
    "待识别商品";

  const imageUrl = extractProductImageUrl(source, jsonLd);

  const price =
    pickString(jsonLd, ["offers", "price"]) ||
    clean(firstMatch(source, /class=["'][^"']*a-price-whole[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)) ||
    "";

  const brand =
    pickString(jsonLd, ["brand", "name"]) ||
    clean(firstMatch(source, /品牌[^<]{0,20}<[^>]+>([^<]+)/i)) ||
    "";

  const rating =
    pickString(jsonLd, ["aggregateRating", "ratingValue"]) ||
    clean(firstMatch(source, /([0-5](?:\.\d)?) out of 5 stars/i)) ||
    "";

  const reviewCount =
    pickString(jsonLd, ["aggregateRating", "reviewCount"]) ||
    clean(firstMatch(source, /([\d,]+)\s+ratings/i)) ||
    "";

  const features = Array.from(source.matchAll(/<span[^>]+class=["'][^"']*a-list-item[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi))
    .map((item) => clean(item[1]))
    .filter((item) => item.length > 12 && item.length < 220)
    .slice(0, 6);

  const asin = firstMatch(sourceUrl, /\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i) || "";

  return {
    title,
    category: "",
    price: price ? (price.startsWith("$") ? price : `$${price}`) : "",
    brand,
    rating,
    reviewCount,
    asin,
    imageUrl,
    specs: {},
    features,
    sourceUrl
  };
}

function extractJsonLd(source: string): unknown {
  const matches = source.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of matches) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) {
        const product = parsed.find((item) => item?.["@type"] === "Product");
        if (product) return product;
      }
      if (parsed?.["@type"] === "Product") return parsed;
      if (Array.isArray(parsed?.["@graph"])) {
        const product = parsed["@graph"].find((item: { "@type"?: string }) => item?.["@type"] === "Product");
        if (product) return product;
      }
    } catch {
      // Ignore malformed JSON-LD blocks.
    }
  }
  return {};
}

async function generateAnalysis(
  product: ProductInfo,
  pageText: string,
  sourceMode: "page" | "fallback",
  language: "zh" | "en" = "zh"
): Promise<AnalysisResult> {
  const systemPrompt =
    language === "en"
      ? "You are an expert in e-commerce product understanding, consumer insights, and short video scripts. You must output parseable JSON and stay conservative with unverifiable claims. All user-facing text must be in English; proper nouns (brand names, model numbers) may be kept as-is."
      : "你擅长电商产品理解、消费者洞察和短视频口播文案。你必须输出可解析 JSON，并对无法验证的信息保持克制。所有面向用户的中文文案、翻译、解读必须使用简体中文，专有名词（如品牌名、型号）可保留原文。";

  const prompt = buildAnalysisPrompt(product, pageText, language);
  const content = await callLLM(systemPrompt, prompt);
  const parsed = parseJsonContent(content) as Partial<AnalysisResult>;

  const finalProduct: ProductInfo = { ...product, ...(parsed.productInfo || {}) };
  finalProduct.imageUrl = sanitizeProductImageUrl(finalProduct.imageUrl) || product.imageUrl || "";
  const finalScript = {
    hook: parsed.videoScript?.hook || "",
    script: parsed.videoScript?.script || "",
    wordCount: parsed.videoScript?.wordCount || countChineseChars(parsed.videoScript?.script || "")
  };
  const finalItems: QualityItem[] = parsed.qualityCheck?.items || [];
  const quality = computeQualityScore(finalProduct, finalScript, finalItems, sourceMode);

  return {
    productInfo: finalProduct,
    analysis: {
      targetUsers: parsed.analysis?.targetUsers || [],
      scenarios: parsed.analysis?.scenarios || [],
      painPoints: parsed.analysis?.painPoints || [],
      sellingPoints: parsed.analysis?.sellingPoints || [],
      contentAngles: parsed.analysis?.contentAngles || []
    },
    videoScript: finalScript,
    qualityCheck: {
      score: quality.score,
      breakdown: quality.breakdown,
      items: finalItems
    },
    fetchedAt: new Date().toISOString(),
    sourceMode
  };
}

function computeQualityScore(
  product: ProductInfo,
  script: { hook: string; script: string; wordCount: number },
  items: QualityItem[],
  sourceMode: "page" | "fallback"
): { score: number; breakdown: string[] } {
  let score = 100;
  const breakdown: string[] = [];

  const risks = items.filter((i) => i.result === "风险").length;
  const warns = items.filter((i) => i.result === "建议优化").length;
  if (risks > 0) {
    const penalty = risks * 15;
    score -= penalty;
    breakdown.push(`风险项 ×${risks} -${penalty}`);
  }
  if (warns > 0) {
    const penalty = warns * 5;
    score -= penalty;
    breakdown.push(`建议优化 ×${warns} -${penalty}`);
  }

  const scriptChars = (script.script || "").replace(/\s/g, "").length;
  if (scriptChars > 150) {
    score -= 10;
    breakdown.push("文案超字(>150) -10");
  } else if (scriptChars > 0 && scriptChars < 80) {
    score -= 5;
    breakdown.push("文案过短(<80) -5");
  }

  const missing: string[] = [];
  if (!product.title) missing.push("标题");
  if (!product.brand) missing.push("品牌");
  if (!product.price) missing.push("价格");
  if (!product.imageUrl) missing.push("主图");
  if (missing.length > 0) {
    const penalty = missing.length * 5;
    score -= penalty;
    breakdown.push(`缺字段(${missing.join("/")}) -${penalty}`);
  }

  const features = product.features || [];
  if (features.length === 0) {
    score -= 10;
    breakdown.push("无核心功能 -10");
  }

  if (sourceMode === "fallback") {
    score -= 10;
    breakdown.push("数据降级解析 -10");
  }

  if (breakdown.length === 0) {
    breakdown.push("无扣分项");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, breakdown };
}

function buildAnalysisPrompt(product: ProductInfo, pageText: string, language: "zh" | "en" = "zh") {
  if (language === "en") {
    return `You are an e-commerce AI product analysis assistant for cross-border e-commerce sellers. Analyze only the provided product information; do not fabricate unverifiable certifications, effects, sales, prices, or extreme promises.

Output must be strict JSON. No Markdown, no explanations, no extra prose.

JSON structure required:
{
  "productInfo": {
    "title": "English product name (keep original brand/model)",
    "category": "English category",
    "price": "Original currency and price string",
    "brand": "Brand name as-is",
    "rating": "Rating string as-is",
    "reviewCount": "Review count string as-is",
    "asin": "ASIN as-is",
    "imageUrl": "Image URL as-is",
    "specs": { "Spec name in English": "Spec value as-is" },
    "features": ["English core feature 1", "English core feature 2"],
    "sourceUrl": "Original product URL"
  },
  "analysis": {
    "targetUsers": ["English target user 1", "English target user 2"],
    "scenarios": ["English scenario 1", "English scenario 2"],
    "painPoints": ["English pain point 1", "English pain point 2"],
    "sellingPoints": ["English selling point 1", "English selling point 2"],
    "contentAngles": ["English content angle 1", "English content angle 2"]
  },
  "videoScript": {
    "hook": "English opening hook (first 5 seconds, 10-15 words)",
    "script": "Full English voiceover (use line breaks to separate Pain → Selling Points → Scenario → CTA)",
    "wordCount": 0
  },
  "qualityCheck": {
    "score": 0,
    "items": [
      { "name": "English check name", "result": "通过 | 建议优化 | 风险", "note": "English note" }
    ]
  }
}

Requirements:
- qualityCheck.score is ignored by the system; the backend computes the score from items + word count + field completeness + data source. You only need to produce items (each item's result MUST be one of: "通过" / "建议优化" / "风险"). No need to score.
1. productInfo: user-facing fields (title, category, spec keys, features) MUST be in English; structured fields (brand, model, ASIN, price, rating) kept as-is.
2. analysis: all array items in English, 3-5 items each, short phrases.
3. videoScript: English e-commerce short video voiceover (TikTok/Reels/Shorts). Structure the script with line breaks:
   - Pain point (1-2 sentences, second person "you/we")
   - Selling points (2-3 sentences, each citing a REAL feature from productInfo.features/specs)
   - Scenario (1 sentence, concrete usage moment)
   - Soft CTA (1 sentence: "Check the link in bio", "Comment '1' and I'll DM you", etc.)
   Total: 120-150 words for script (excluding hook). Hook goes in videoScript.hook, NOT repeated in script.
4. qualityCheck.items MUST include at least 4 checks covering: title accuracy, price-description consistency, copy compliance, word-count compliance. name and note in English; result values "通过" / "建议优化" / "风险".
5. If page extraction is incomplete or a value can't be confirmed, leave the field empty or use "TBD", and note it in qualityCheck.note. Don't fabricate.

Extracted product info:
${JSON.stringify(product, null, 2)}

Page text snippet:
${pageText}`;
  }

  return `你是电商 AI 产品分析助手，目标用户是中国卖家/运营。请只基于提供的商品信息分析，不要编造无法确认的认证、疗效、销量、价格或极限承诺。

输出必须是严格 JSON，不要 Markdown，不要解释，不要任何额外说明文字。

JSON 结构必须包含：
{
  "productInfo": {
    "title": "中文产品名（保留英文品牌/型号）",
    "category": "中文品类",
    "price": "保留原始货币与价格字符串",
    "brand": "品牌名原文",
    "rating": "评分字符串原文",
    "reviewCount": "评论数字符串原文",
    "asin": "ASIN 原文",
    "imageUrl": "图片 URL 原文",
    "specs": { "规格名（中文）": "规格值（原文）" },
    "features": ["中文核心功能 1", "中文核心功能 2"],
    "sourceUrl": "原商品链接"
  },
  "analysis": {
    "targetUsers": ["中文描述的目标用户 1", "中文描述的目标用户 2"],
    "scenarios": ["中文使用场景 1", "中文使用场景 2"],
    "painPoints": ["中文用户痛点 1", "中文用户痛点 2"],
    "sellingPoints": ["中文核心卖点 1", "中文核心卖点 2"],
    "contentAngles": ["中文内容角度 1", "中文内容角度 2"]
  },
  "videoScript": {
    "hook": "中文开场钩子（前 5 秒吸睛句，10-15 字）",
    "script": "完整中文口播文案（按 痛点 → 卖点 → 场景 → CTA 结构组织，使用换行分隔）",
    "wordCount": 0
  },
  "qualityCheck": {
    "score": 0,
    "items": [
      { "name": "中文检查项名", "result": "通过", "note": "中文说明" }
    ]
  }
}

要求：
- qualityCheck.score 字段会被系统忽略，分数由后端按公式根据 items + 文案字数 + 字段完整度 + 数据来源计算；你只负责给出 items（每项必须给出 result 三选一：'通过' / '建议优化' / '风险'），不需要打分。
1. productInfo 中面向中文用户阅读的字段（title、category、specs 键、features）必须翻译为简体中文；brand、型号、ASIN、价格、评分等结构化字段保留原文。
2. analysis 的所有数组元素全部用简体中文，每项 3-5 条，短句，不要超过 30 字。
3. videoScript 生成简体中文电商短视频口播文案，用于抖音/小红书种草投放。要求按以下结构生成 script，每段都用换行分隔：
   - 钩子句（1 句，10-15 字）：用反问、悬念或反差吸引停留，例如"为什么 XXX 都在用它？"、"你还在用 XXX 吗？"、"这个 XX 块的小东西，真的救了我"。
   - 痛点共鸣（1-2 句）：说出目标用户在目标场景中正在忍受的麻烦，使用"你/我们"第二人称。
   - 卖点种草（2-3 句，每句提一个**该商品真实的具体功能**）：从 productInfo.features / specs 中挑出最差异化、最有数字感的特性，用"它/这款"开头，不要堆砌形容词，必须可被视频画面佐证。
   - 场景代入（1 句）：描述一个具体使用时刻（例如"加班到十点回家，把它挂在钥匙上…"），让用户脑补画面。
   - 软性 CTA（1 句）：不要写"立即购买"，用"感兴趣的可以去详情页看看"、"评论区扣1我发链接"、"点头像进橱窗"等。
   - 整体语气：第一人称或朋友口吻，口语化、有节奏感，可适度使用短句和数字。
   - 总字数：script 控制在 120-150 字之间（不含 hook），hook 单独放在 videoScript.hook 字段里，不要重复出现在 script 中。
4. qualityCheck 的 items 至少 4 项，覆盖：标题真实性、价格与描述一致、文案合规、文案字数合规；name 和 note 用简体中文；result 取值 "通过" / "建议优化" / "风险"。
5. 如果页面抓取不完整或参数无法确认，在对应字段留空或写"待确认"，并在 qualityCheck.note 中提醒，不要硬编。

已提取信息：
${JSON.stringify(product, null, 2)}

页面文本片段：
${pageText}`;
}

async function callLLM(systemPrompt: string, prompt: string) {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 MINIMAX_API_KEY，请先在 .env.local 中配置。");
  }

  let response: Response;
  try {
    response = await fetch(`${LLM_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.35,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ]
      })
    });
  } catch {
    throw new Error("无法连接 MiniMax API。请确认网络访问和 API Key 配置正确。");
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MiniMax API 调用失败：${response.status} ${text.slice(0, 240)}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("MiniMax 没有返回有效内容。");
  return content;
}

function parseJsonContent(content: string) {
  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(content.slice(start, end + 1));
    }
    throw new Error("AI 返回内容不是有效 JSON，请重试。");
  }
}

function firstMatch(source: string, pattern: RegExp) {
  return pattern.exec(source)?.[1] || "";
}

function extractProductImageUrl(source: string, jsonLd: unknown) {
  const candidates = [
    pickString(jsonLd, ["image"]),
    meta(source, "og:image"),
    clean(firstMatch(source, /"hiRes"\s*:\s*"([^"]+)"/i)),
    clean(firstMatch(source, /"large"\s*:\s*"([^"]+)"/i)),
    clean(firstMatch(source, /data-old-hires=["']([^"']+)["']/i)),
    ...Array.from(source.matchAll(/https?:\\?\/\\?\/[^"'\s<>]+/gi)).map((match) => match[0])
  ];

  for (const candidate of candidates) {
    const safeUrl = sanitizeProductImageUrl(candidate);
    if (safeUrl) return safeUrl;
  }

  return "";
}

function sanitizeProductImageUrl(input: string) {
  if (!input) return "";

  const normalized = clean(input)
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/^http:\/\//i, "https://");

  try {
    const url = new URL(normalized);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    const allowedHost =
      host === "m.media-amazon.com" ||
      host === "images-na.ssl-images-amazon.com" ||
      host.endsWith(".ssl-images-amazon.com");

    if (!allowedHost) return "";
    if (!/\.(jpg|jpeg|png|webp)$/i.test(path)) return "";
    if (/uedata|\/1\/batch\/|fls-na|pixel|tracking/i.test(normalized)) return "";

    return url.toString();
  } catch {
    return "";
  }
}

function meta(source: string, property: string) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return clean(
    firstMatch(
      source,
      new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i")
    )
  );
}

function clean(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function pickString(input: unknown, path: string[]): string {
  let current = input as Record<string, unknown> | string | string[] | undefined;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return "";
    current = current[key] as Record<string, unknown> | string | string[] | undefined;
  }
  if (Array.isArray(current)) return String(current[0] || "");
  return typeof current === "string" || typeof current === "number" ? String(current) : "";
}

function countChineseChars(input: string) {
  return input.replace(/\s/g, "").length;
}
