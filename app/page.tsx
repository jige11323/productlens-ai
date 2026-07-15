"use client";

import {
  AlertTriangle,
  BarChart3,
  Check,
  Clipboard,
  FileSearch,
  Globe,
  Link,
  Loader2,
  Play,
  Radar,
  Share2,
  ShieldCheck,
  Target,
  Wand2,
  Users,
  Lightbulb,
  MessageSquareQuote
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

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

type AnalyzeResult = {
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
    items: Array<{
      name: string;
      result: "通过" | "建议优化" | "风险";
      note: string;
    }>;
  };
  fetchedAt: string;
  sourceMode: "page" | "fallback";
};

const sampleUrl = "https://www.amazon.com/dp/B0F6YQ96L5";

export default function Home() {
  const [url, setUrl] = useState(sampleUrl);
  const [language, setLanguage] = useState<"zh" | "en">("zh");
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [shareCopied, setShareCopied] = useState(false);
  const [scriptCopied, setScriptCopied] = useState(false);

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, language })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "分析失败");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "分析失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fall through to legacy fallback.
    }
    try {
      const input = document.createElement("textarea");
      input.value = text;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      return true;
    } catch {
      return false;
    }
  }

  async function sharePage() {
    const ok = await copyToClipboard(window.location.href);
    if (ok) {
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1800);
    }
  }

  async function copyScript() {
    if (!result) return;
    const fullText = `【钩子】${result.videoScript.hook}\n\n${result.videoScript.script}`;
    const ok = await copyToClipboard(fullText);
    if (ok) {
      setScriptCopied(true);
      window.setTimeout(() => setScriptCopied(false), 1800);
    }
  }

  const fetchedTime = useMemo(() => {
    if (!result?.fetchedAt) return "-";
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(result.fetchedAt));
  }, [result?.fetchedAt]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Radar size={20} />
          </div>
          Product<span>Lens</span> AI
        </div>
        <div className="top-actions">
          <span className="top-tag">AI 产品分析助理</span>
          <button
            className={`icon-button ${shareCopied ? "is-success" : ""}`}
            type="button"
            onClick={sharePage}
            aria-label="分享"
            title={shareCopied ? "已复制链接" : "复制当前页面链接"}
          >
            {shareCopied ? <Check size={16} /> : <Share2 size={16} />}
          </button>
          {shareCopied ? <span className="top-toast">链接已复制</span> : null}
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <section className="panel">
            <form onSubmit={analyze} className="side-section">
              <h2 className="step-title">
                <span className="step-index">1</span>
                输入商品链接
              </h2>
              <input
                className="url-input"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://www.amazon.com/dp/..."
              />
              <button className="primary-button" disabled={loading} type="submit">
                {loading ? <Loader2 className="spin" size={18} /> : <Play size={18} />}
                {loading ? "正在分析" : "开始分析"}
              </button>
              {error ? <div className="error-box">{error}</div> : null}
            </form>

            <div className="side-section">
              <h2 className="step-title">
                <span className="step-index">2</span>
                分析选项
              </h2>
              <OptionRow icon={<Link size={16} />} label="站点" value="Amazon 美国站" />
              <LanguageSelector value={language} onChange={setLanguage} />
              <OptionRow icon={<BarChart3 size={16} />} label="深度" value="标准分析" />
              <label className="check-row">
                <ShieldCheck size={16} color="#079a97" />
                包含内容质量检查
              </label>
            </div>

            <div className="side-section">
              <h2 className="step-title">
                <span className="step-index">3</span>
                分析进度
              </h2>
              <div className="progress-list">
                <ProgressItem done={Boolean(result) || loading} active={loading} label="抓取商品数据" />
                <ProgressItem done={Boolean(result) || loading} active={loading} label="解析商品信息" />
                <ProgressItem done={Boolean(result) || loading} active={loading} label="分析商品维度" />
                <ProgressItem done={Boolean(result)} active={loading} label="生成报告" />
              </div>
            </div>

            <div className="side-section">
              <h2 className="step-title">
                <span className="step-index">4</span>
                本次分析信息
              </h2>
              <div className="meta-grid">
                <span>分析时间</span>
                <strong>{fetchedTime}</strong>
                <span>商品来源</span>
                <strong>{result ? "Amazon" : "-"}</strong>
                <span>ASIN</span>
                <strong>{result?.productInfo.asin || "-"}</strong>
                <span>数据模式</span>
                <strong>{result?.sourceMode === "fallback" ? "降级解析" : result ? "页面解析" : "-"}</strong>
              </div>
            </div>
          </section>
        </aside>

        <section className="results">
          {result ? (
            <ResultView result={result} scriptCopied={scriptCopied} onCopyScript={copyScript} />
          ) : (
            <EmptyState />
          )}
        </section>
      </div>
    </main>
  );
}

function OptionRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="field-row">
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        {icon}
        {label}
      </span>
      <div className="select-like">{value}</div>
    </div>
  );
}

function LanguageSelector({
  value,
  onChange
}: {
  value: "zh" | "en";
  onChange: (next: "zh" | "en") => void;
}) {
  return (
    <div className="field-row">
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Globe size={16} />
        语言
      </span>
      <div className="lang-switch" role="tablist" aria-label="输出语言">
        <button
          type="button"
          role="tab"
          aria-selected={value === "zh"}
          className={`lang-option ${value === "zh" ? "active" : ""}`}
          onClick={() => onChange("zh")}
        >
          中文
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={value === "en"}
          className={`lang-option ${value === "en" ? "active" : ""}`}
          onClick={() => onChange("en")}
        >
          English
        </button>
      </div>
    </div>
  );
}

function ProgressItem({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  return (
    <div className="progress-item">
      <span className={`progress-dot ${done ? "done" : active ? "active" : ""}`}>
        {done ? <Check size={14} /> : active ? <Loader2 size={14} className="spin" /> : null}
      </span>
      <span>{label}</span>
      <span className="small-meta">{done ? "完成" : active ? "进行中" : "等待"}</span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="panel empty-state">
      <div className="empty-state-inner">
        <div className="empty-icon">
          <FileSearch size={36} strokeWidth={2.2} />
        </div>
        <h2>输入 Amazon 商品链接开始分析</h2>
        <p>系统会整理商品信息、提炼用户洞察，并按你选择的语言生成短视频口播文案。</p>
      </div>
      <div className="empty-samples">
        <div className="empty-samples-title">分析完成后会输出</div>
        <div className="sample-grid">
          <div className="sample-card">
            <div className="sample-icon">
              <Users size={18} />
            </div>
            <div>
              <h4>目标用户画像</h4>
              <p>年龄、身份、购买动机与决策路径</p>
            </div>
          </div>
          <div className="sample-card">
            <div className="sample-icon">
              <Lightbulb size={18} />
            </div>
            <div>
              <h4>使用场景与痛点</h4>
              <p>真实使用时机、用户未被满足的需求</p>
            </div>
          </div>
          <div className="sample-card">
            <div className="sample-icon">
              <MessageSquareQuote size={18} />
            </div>
            <div>
              <h4>150 字口播文案</h4>
              <p>含 5 秒钩子，可直接用于短视频投放</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultView({
  result,
  scriptCopied,
  onCopyScript
}: {
  result: AnalyzeResult;
  scriptCopied: boolean;
  onCopyScript: () => void;
}) {
  const product = result.productInfo;
  const specs = Object.entries(product.specs || {}).slice(0, 6);
  const scriptChars = (result.videoScript.script || "").replace(/\s/g, "").length;
  const hookChars = (result.videoScript.hook || "").replace(/\s/g, "").length;
  const totalChars = scriptChars + hookChars;
  const scriptStatus: "ok" | "warn" | "over" =
    scriptChars > 150 ? "over" : scriptChars >= 120 ? "ok" : "warn";

  return (
    <div className="result-grid">
      <section className="card">
        <h2 className="card-title">一、产品信息整理</h2>
        <div className="product-layout">
          <div className="product-image">
            {product.imageUrl ? <img src={product.imageUrl} alt={product.title} /> : <span className="image-empty">无主图</span>}
          </div>
          <div>
            <h3 className="product-title">{product.title || "未识别商品名称"}</h3>
            <div className="small-meta">
              {product.rating ? `评分 ${product.rating}` : "评分待识别"}
              {product.reviewCount ? ` | ${product.reviewCount} 条评论` : ""}
            </div>
            <div className="price">{product.price || "价格待识别"}</div>
            <div className="spec-grid">
              <span>品牌：</span>
              <strong>{product.brand || "-"}</strong>
              <span>品类：</span>
              <strong>{product.category || "-"}</strong>
              <span>ASIN：</span>
              <strong>{product.asin || "-"}</strong>
              {specs.map(([key, value]) => (
                <FragmentSpec key={key} label={key} value={value} />
              ))}
            </div>
            <div className="tag-list">
              {(product.features || []).slice(0, 6).map((feature) => (
                <span className="tag" key={feature}>
                  {feature.length > 16 ? `${feature.slice(0, 16)}...` : feature}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">二、产品分析</h2>
        <div className="metric-grid">
          <Metric label="目标用户" value={`${result.analysis.targetUsers.length || 0} 类`} />
          <Metric label="使用场景" value={`${result.analysis.scenarios.length || 0} 个`} />
          <Metric label="核心卖点" value={`${result.analysis.sellingPoints.length || 0} 条`} />
          <Metric label="质量评分" value={`${result.qualityCheck.score}/100`} />
        </div>
        <div className="analysis-columns">
          <ListBlock title="目标用户" items={result.analysis.targetUsers} icon={<Target size={14} />} />
          <ListBlock title="使用场景" items={result.analysis.scenarios} icon={<Check size={14} />} />
          <ListBlock title="用户痛点" items={result.analysis.painPoints} icon={<AlertTriangle size={14} />} />
          <ListBlock title="核心卖点" items={result.analysis.sellingPoints} icon={<Wand2 size={14} />} />
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">三、短视频口播文案</h2>
        <div className="script-box">
          <span className="hook">开场钩子：{result.videoScript.hook || "未生成"}</span>
          <br />
          {result.videoScript.script || "暂无文案"}
        </div>
        <div className="script-meta">
          <div className="word-counts">
            <div className="word-chip">
              <span className="word-chip-label">钩子</span>
              <span className="word-chip-value">{hookChars}</span>
              <span className="word-chip-unit">字</span>
            </div>
            <div className="word-chip">
              <span className="word-chip-label">正文</span>
              <span className={`word-chip-value status-${scriptStatus}`}>{scriptChars}</span>
              <span className="word-chip-unit">/ 150</span>
            </div>
            <div className="word-chip total">
              <span className="word-chip-label">合计</span>
              <span className="word-chip-value">{totalChars}</span>
              <span className="word-chip-unit">字</span>
            </div>
          </div>
          <button
            className={`ghost-button ${scriptCopied ? "is-success" : ""}`}
            type="button"
            onClick={onCopyScript}
            disabled={!result.videoScript.script}
          >
            {scriptCopied ? <Check size={16} /> : <Clipboard size={16} />}
            {scriptCopied ? "已复制" : "复制文案"}
          </button>
        </div>
      </section>

      <section className="card">
        <h2 className="card-title">四、质量检查</h2>
        <div className="quality-table">
          <div className="quality-row quality-head">
            <span>检查项</span>
            <span>结果</span>
            <span>说明</span>
          </div>
          {result.qualityCheck.items.map((item) => (
            <div className="quality-row" key={item.name}>
              <span>{item.name}</span>
              <span className={statusClass(item.result)}>{item.result}</span>
              <span>{item.note}</span>
            </div>
          ))}
        </div>
        <div className="score-row">
          <div className="score-info">
            <span className="score-label">质量评分</span>
            <strong className="score">{result.qualityCheck.score}</strong>
            <span className="score-max">/ 100</span>
          </div>
          <div className="breakdown-tags">
            {result.qualityCheck.breakdown.map((item) => (
              <span
                key={item}
                className={`breakdown-tag ${item === "无扣分项" ? "is-empty" : "is-penalty"}`}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function FragmentSpec({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span>{label}：</span>
      <strong>{value}</strong>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </div>
  );
}

function ListBlock({ title, items, icon }: { title: string; items: string[]; icon: React.ReactNode }) {
  return (
    <div>
      <h3 className="mini-title">{title}</h3>
      <ul className="list">
        {(items.length ? items : ["等待分析结果"]).map((item) => (
          <li key={item}>
            {icon}
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function statusClass(status: string) {
  if (status === "通过") return "status-pass";
  if (status === "风险") return "status-risk";
  return "status-warn";
}
