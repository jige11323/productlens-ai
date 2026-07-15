"use client";

import {
  AlertTriangle,
  BarChart3,
  Check,
  Clipboard,
  Download,
  FileSearch,
  Link,
  Loader2,
  Play,
  Radar,
  Share2,
  ShieldCheck,
  Sparkles,
  Target,
  Wand2
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
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url })
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
          <span>AI 产品分析助理</span>
          <button className="ghost-button" type="button">
            <Download size={16} />
            导出报告
          </button>
          <button className="icon-button" type="button" aria-label="分享">
            <Share2 size={16} />
          </button>
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
              <OptionRow icon={<Sparkles size={16} />} label="语言" value="中文输出" />
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
          <div className="panel tabs">
            <div className="tab-list">
              <span className="tab active">分析结果</span>
              <span className="tab">竞品对比</span>
              <span className="tab">流量词洞察</span>
              <span className="tab">市场洞察</span>
            </div>
            <div className="toolbar">
              <button className="ghost-button" type="button">
                <Clipboard size={16} />
                复制文案
              </button>
            </div>
          </div>

          {result ? <ResultView result={result} /> : <EmptyState />}
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
      <div>
        <FileSearch size={42} color="#079a97" />
        <h2>输入 Amazon 商品链接开始分析</h2>
        <p>系统会整理商品信息、提炼用户洞察，并生成 150 字以内的中文短视频口播文案。</p>
      </div>
    </div>
  );
}

function ResultView({ result }: { result: AnalyzeResult }) {
  const product = result.productInfo;
  const specs = Object.entries(product.specs || {}).slice(0, 6);

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
        <div className="score-row">
          <span className="small-meta">字数：{result.videoScript.wordCount || 0} / 150</span>
          <button className="ghost-button" type="button">
            <Clipboard size={16} />
            复制文案
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
          <span>
            质量评分：<strong className="score">{result.qualityCheck.score}</strong> / 100
          </span>
          <button className="ghost-button" type="button">
            查看优化建议
          </button>
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
