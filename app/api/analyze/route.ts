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
    items: Array<{
      name: string;
      result: "通过" | "建议优化" | "风险";
      note: string;
    }>;
  };
  fetchedAt: string;
  sourceMode: "page" | "fallback";
};

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { url?: string };
    const productUrl = normalizeUrl(body.url || "");

    if (!productUrl) {
      return NextResponse.json({ error: "请输入有效的 Amazon 商品链接。" }, { status: 400 });
    }

    const page = await fetchProductPage(productUrl);
    const extracted = extractProductInfo(page.text, productUrl);
    const result = await generateAnalysis(extracted, page.text.slice(0, 16000), page.mode);

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

  const imageUrl =
    pickString(jsonLd, ["image"]) ||
    meta(source, "og:image") ||
    clean(firstMatch(source, /"hiRes"\s*:\s*"([^"]+)"/i)) ||
    "";

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

async function generateAnalysis(product: ProductInfo, pageText: string, sourceMode: "page" | "fallback"): Promise<AnalysisResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 OPENAI_API_KEY，请先在 .env.local 中配置。");
  }

  const prompt = `你是电商 AI 产品分析助手。请只基于提供的商品信息分析，不要编造无法确认的认证、疗效、销量、价格或极限承诺。

输出必须是严格 JSON，不要 Markdown。

要求：
1. productInfo 整理产品名称、品类、价格、品牌、评分、评论数、ASIN、图片、规格、核心功能。
2. analysis 给出目标用户、使用场景、用户痛点、核心卖点、内容角度，每项 3-5 条。
3. videoScript 生成中文短视频口播文案，总字数 150 字以内，hook 是前 5 秒钩子，script 是完整口播。
4. qualityCheck 检查是否有夸大、超字数、无法验证信息、合规风险，给 0-100 分。
5. 如果页面抓取不完整，要在 note 中提醒，不要硬编参数。

已提取信息：
${JSON.stringify(product, null, 2)}

页面文本片段：
${pageText}`;

  let response: Response;
  try {
    response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.35,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "你擅长电商产品理解、消费者洞察和短视频口播文案。你必须输出可解析 JSON，并对无法验证的信息保持克制。"
          },
          { role: "user", content: prompt }
        ]
      })
    });
  } catch {
    throw new Error("无法连接 OpenAI API。若在国内本地运行，请配置 OPENAI_BASE_URL 为可访问的 OpenAI 兼容网关；部署到 Vercel 后通常可直接访问。");
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI API 调用失败：${response.status} ${text.slice(0, 180)}`);
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("AI 没有返回有效内容。");

  const parsed = JSON.parse(content) as Partial<AnalysisResult>;

  return {
    productInfo: { ...product, ...(parsed.productInfo || {}) },
    analysis: {
      targetUsers: parsed.analysis?.targetUsers || [],
      scenarios: parsed.analysis?.scenarios || [],
      painPoints: parsed.analysis?.painPoints || [],
      sellingPoints: parsed.analysis?.sellingPoints || [],
      contentAngles: parsed.analysis?.contentAngles || []
    },
    videoScript: {
      hook: parsed.videoScript?.hook || "",
      script: parsed.videoScript?.script || "",
      wordCount: parsed.videoScript?.wordCount || countChineseChars(parsed.videoScript?.script || "")
    },
    qualityCheck: {
      score: parsed.qualityCheck?.score ?? 80,
      items: parsed.qualityCheck?.items || []
    },
    fetchedAt: new Date().toISOString(),
    sourceMode
  };
}

function firstMatch(source: string, pattern: RegExp) {
  return pattern.exec(source)?.[1] || "";
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
