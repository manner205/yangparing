import { useState, useRef } from "react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip, ReferenceLine, Cell, Legend,
} from "recharts";

const API_BASE = "https://golden-path205.vercel.app";

const CHART_COLORS = {
  text: "#94a3b8",
  grid: "#2a2f42",
  tooltip: "#0f1119",
};

const KR_STOCKS = [
  { ticker: "005930", name: "삼성전자", market: "코스피" },
  { ticker: "005935", name: "삼성전자우", market: "코스피" },
  { ticker: "000660", name: "SK하이닉스", market: "코스피" },
  { ticker: "207940", name: "삼성바이오로직스", market: "코스피" },
  { ticker: "373220", name: "LG에너지솔루션", market: "코스피" },
  { ticker: "005380", name: "현대차", market: "코스피" },
  { ticker: "000270", name: "기아", market: "코스피" },
  { ticker: "068270", name: "셀트리온", market: "코스피" },
  { ticker: "051910", name: "LG화학", market: "코스피" },
  { ticker: "035420", name: "NAVER", market: "코스피" },
  { ticker: "035720", name: "카카오", market: "코스피" },
  { ticker: "105560", name: "KB금융", market: "코스피" },
  { ticker: "055550", name: "신한지주", market: "코스피" },
  { ticker: "086790", name: "하나금융지주", market: "코스피" },
  { ticker: "071050", name: "한국금융지주", market: "코스피" },
  { ticker: "024110", name: "기업은행", market: "코스피" },
  { ticker: "003550", name: "LG", market: "코스피" },
  { ticker: "028260", name: "삼성물산", market: "코스피" },
  { ticker: "066570", name: "LG전자", market: "코스피" },
  { ticker: "034730", name: "SK", market: "코스피" },
  { ticker: "017670", name: "SK텔레콤", market: "코스피" },
  { ticker: "030200", name: "KT", market: "코스피" },
  { ticker: "032830", name: "삼성생명", market: "코스피" },
  { ticker: "000810", name: "삼성화재", market: "코스피" },
  { ticker: "096770", name: "SK이노베이션", market: "코스피" },
  { ticker: "009150", name: "삼성전기", market: "코스피" },
  { ticker: "012330", name: "현대모비스", market: "코스피" },
  { ticker: "010130", name: "고려아연", market: "코스피" },
  { ticker: "015760", name: "한국전력", market: "코스피" },
  { ticker: "033780", name: "KT&G", market: "코스피" },
  { ticker: "006400", name: "삼성SDI", market: "코스피" },
  { ticker: "009830", name: "한화솔루션", market: "코스피" },
  { ticker: "005490", name: "POSCO홀딩스", market: "코스피" },
  { ticker: "034220", name: "LG디스플레이", market: "코스피" },
  { ticker: "088980", name: "맥쿼리인프라", market: "코스피" },
  { ticker: "090430", name: "아모레퍼시픽", market: "코스피" },
  { ticker: "034020", name: "두산에너빌리티", market: "코스피" },
  { ticker: "042660", name: "한화오션", market: "코스피" },
  { ticker: "003490", name: "대한항공", market: "코스피" },
  { ticker: "010140", name: "삼성중공업", market: "코스피" },
  { ticker: "329180", name: "HD현대중공업", market: "코스피" },
  { ticker: "267250", name: "HD현대", market: "코스피" },
  { ticker: "047050", name: "포스코인터내셔널", market: "코스피" },
  { ticker: "047810", name: "한국항공우주", market: "코스피" },
  { ticker: "018260", name: "삼성에스디에스", market: "코스피" },
  { ticker: "011200", name: "HMM", market: "코스피" },
  { ticker: "139480", name: "이마트", market: "코스피" },
  { ticker: "086520", name: "에코프로", market: "코스닥" },
  { ticker: "247540", name: "에코프로비엠", market: "코스닥" },
  { ticker: "028300", name: "HLB", market: "코스닥" },
  { ticker: "039490", name: "키움증권", market: "코스닥" },
  { ticker: "196170", name: "알테오젠", market: "코스닥" },
  { ticker: "069500", name: "KODEX 200", market: "코스피" },
  { ticker: "229200", name: "KODEX 코스닥150", market: "코스피" },
  { ticker: "379800", name: "KODEX 미국S&P500TR", market: "코스피" },
  { ticker: "441640", name: "KODEX 미국배당커버드콜액티브", market: "코스피" },
  { ticker: "091160", name: "KODEX 반도체", market: "코스피" },
  { ticker: "360750", name: "TIGER 미국S&P500", market: "코스피" },
  { ticker: "133690", name: "TIGER 미국나스닥100", market: "코스피" },
  { ticker: "448290", name: "TIGER 미국배당다우존스", market: "코스피" },
  { ticker: "446720", name: "SOL 미국배당다우존스", market: "코스피" },
  { ticker: "442580", name: "SOL 미국S&P500", market: "코스피" },
  { ticker: "463240", name: "RISE 미국배당다우존스", market: "코스피" },
  { ticker: "462990", name: "ACE 미국배당다우존스", market: "코스피" },
  { ticker: "411060", name: "ACE 미국나스닥100", market: "코스피" },
  { ticker: "161510", name: "PLUS 고배당주", market: "코스피" },
  { ticker: "114260", name: "KODEX 국고채10년", market: "코스피" },
];

function searchKrStocks(query) {
  if (!query) return [];
  const q = query.trim().toLowerCase();
  return KR_STOCKS.filter(
    (s) => s.name.toLowerCase().includes(q) || s.ticker.includes(q)
  ).slice(0, 8);
}

function pct(v) { const s = v >= 0 ? "+" : ""; return `${s}${v.toFixed(2)}%`; }
function fmtPct(v, d = 1) { const s = v >= 0 ? "+" : ""; return `${s}${v.toFixed(d)}%`; }

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#1a1f2e", border: "1px solid #2a2f42", borderRadius: 8, padding: "8px 10px", fontSize: 11 }}>
      <div style={{ color: "#94a3b8", marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: p.color }} />
          <span style={{ color: "#94a3b8" }}>{p.name}:</span>
          <span style={{ fontWeight: 600, color: "#fff" }}>{Number(p.value).toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

function MetricCard({ label, value, sub, color }) {
  return (
    <div style={{ border: "1px solid #2a2f42", borderRadius: 12, background: "#1a2035", padding: "8px 12px" }}>
      <div style={{ fontSize: 10, color: "#94a3b8" }}>{label}</div>
      <div style={{ marginTop: 2, fontSize: 13, fontWeight: 700, color: color ?? "#fff" }}>{value}</div>
      {sub && <div style={{ marginTop: 2, fontSize: 9, color: "#94a3b8" }}>{sub}</div>}
    </div>
  );
}

const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = String(new Date().getMonth() + 1).padStart(2, "0");

export default function BacktestTab() {
  const [holdings, setHoldings] = useState([]);
  const [startDate, setStartDate] = useState(`${CURRENT_YEAR - 5}-01`);
  const [endDate, setEndDate] = useState(`${CURRENT_YEAR}-${CURRENT_MONTH}`);
  const [dividendReinvest, setDividendReinvest] = useState(true);
  const [benchmark, setBenchmark] = useState("SPY");
  const [selectedPeriod, setSelectedPeriod] = useState(5);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const [newTicker, setNewTicker] = useState("");
  const [newName, setNewName] = useState("");
  const [newQty, setNewQty] = useState("");
  const [inputMode, setInputMode] = useState("amount");
  const [newAmount, setNewAmount] = useState("");
  const [priceLoading, setPriceLoading] = useState(false);
  const [fetchedPrice, setFetchedPrice] = useState(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState(null);
  const searchTimerRef = useRef(null);

  const [amountCurrency, setAmountCurrency] = useState("KRW");
  const [exchangeRate, setExchangeRate] = useState(null);

  const isKrTicker = (t) => /^\d{6}$/.test(t);
  const selectedCurrency = selectedStock ? (isKrTicker(selectedStock.ticker) ? "KRW" : "USD") : "KRW";
  const effectiveCurrency = selectedCurrency === "KRW" ? "KRW" : amountCurrency;
  const currencySymbol = effectiveCurrency === "USD" ? "$" : "₩";
  const amountPlaceholder = effectiveCurrency === "USD" ? "투자금액 (달러, 예: 10000)" : "투자금액 (원, 예: 5000000)";

  const handleSearchInput = (val) => {
    setSearchQuery(val);
    setSelectedStock(null);
    setFetchedPrice(null);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!val.trim()) { setSearchResults([]); return; }
    if (/[가-힣]/.test(val)) {
      setSearchResults(searchKrStocks(val));
    } else {
      searchTimerRef.current = setTimeout(async () => {
        setSearchLoading(true);
        try {
          const res = await fetch(`${API_BASE}/api/stock-search?q=${encodeURIComponent(val)}`);
          if (res.ok) setSearchResults(await res.json());
        } finally { setSearchLoading(false); }
      }, 300);
    }
  };

  const selectStock = (s) => {
    setSelectedStock(s);
    setNewTicker(s.ticker);
    setNewName(s.name);
    setSearchQuery(s.name);
    setSearchResults([]);
    setFetchedPrice(null);
    setNewAmount("");
    if (!isKrTicker(s.ticker)) {
      setAmountCurrency("KRW");
      if (!exchangeRate) {
        fetch(`${API_BASE}/api/stock-prices?tickers=USDKRW%3DX`)
          .then((r) => r.json())
          .then((d) => { const rate = d["USDKRW=X"]?.price; if (rate) setExchangeRate(rate); })
          .catch(() => {});
      }
    }
    if (inputMode === "amount") lookupCurrentPrice(s.ticker);
  };

  const clearSelectedStock = () => {
    setSelectedStock(null); setNewTicker(""); setNewName("");
    setSearchQuery(""); setSearchResults([]); setFetchedPrice(null);
  };

  const lookupCurrentPrice = async (ticker) => {
    if (!ticker) return;
    setPriceLoading(true); setFetchedPrice(null);
    try {
      const res = await fetch(`${API_BASE}/api/stock-prices?tickers=${ticker.toUpperCase()}`);
      if (res.ok) {
        const data = await res.json();
        const price = (data[ticker.toUpperCase()] ?? data[ticker])?.price ?? 0;
        setFetchedPrice(price > 0 ? price : null);
      }
    } finally { setPriceLoading(false); }
  };

  const addHoldingByAmount = async () => {
    if (!newTicker || !newAmount) return;
    const amount = parseFloat(newAmount.replace(/[,\s]/g, ""));
    if (isNaN(amount) || amount <= 0) return;
    let price = fetchedPrice;
    if (!price) {
      setPriceLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/stock-prices?tickers=${newTicker.toUpperCase()}`);
        if (res.ok) { const d = await res.json(); price = (d[newTicker.toUpperCase()] ?? d[newTicker])?.price ?? 0; }
      } finally { setPriceLoading(false); }
    }
    if (!price || price <= 0) { setError(`${newTicker} 현재가를 조회할 수 없습니다.`); return; }
    let effectivePrice = price;
    if (selectedCurrency === "USD" && effectiveCurrency === "KRW") effectivePrice = price * (exchangeRate ?? 1350);
    const qty = Math.floor(amount / effectivePrice);
    if (qty < 1) { setError("투자금액이 현재가보다 적습니다."); return; }
    const krwInvestment = effectiveCurrency === "KRW" ? amount : amount * (exchangeRate ?? 1350);
    setHoldings((prev) => [...prev, { ticker: newTicker.toUpperCase(), name: newName || newTicker.toUpperCase(), quantity: qty, price, investmentAmount: Math.round(krwInvestment) }]);
    setNewTicker(""); setNewName(""); setNewAmount(""); setFetchedPrice(null); clearSelectedStock();
    setError(null);
  };

  const addHolding = () => {
    if (!newTicker || !newQty) return;
    const qty = parseInt(newQty, 10);
    if (isNaN(qty) || qty <= 0) return;
    setHoldings((prev) => [...prev, { ticker: newTicker.toUpperCase(), name: newName || newTicker.toUpperCase(), quantity: qty }]);
    setNewTicker(""); setNewName(""); setNewQty(""); clearSelectedStock();
    setError(null);
  };

  const removeHolding = (idx) => setHoldings((prev) => prev.filter((_, i) => i !== idx));
  const updateQty = (idx, val) => {
    const qty = val === "" ? 0 : parseInt(val, 10);
    if (isNaN(qty) || qty < 0) return;
    setHoldings((prev) => prev.map((h, i) => (i === idx ? { ...h, quantity: qty } : h)));
  };

  const handleRun = async () => {
    if (!holdings.length) { setError("종목이 없습니다."); return; }
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/backtest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holdings: holdings.map((h) => ({ ticker: h.ticker, quantity: h.quantity, name: h.name })),
          startDate, endDate, dividendReinvest, benchmark: benchmark || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "백테스트 오류");
      setResult(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const m = result?.portfolio.metrics;
  const bm = result?.benchmark;
  const hasBench = !!bm;

  const s = {
    wrap: { background: "#0f1119", borderRadius: 16, border: "1px solid #2a2f42", overflow: "hidden", marginBottom: 12 },
    sectionHeader: { borderBottom: "1px solid #2a2f42", padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" },
    sectionTitle: { fontSize: 12, fontWeight: 600, color: "#fff" },
    p3: { padding: 12 },
    input: { width: "100%", background: "#0f1119", border: "1px solid #2a2f42", borderRadius: 6, padding: "6px 8px", fontSize: 12, color: "#fff", outline: "none", boxSizing: "border-box" },
    toggleWrap: { display: "flex", gap: 4, background: "#0f1119", border: "1px solid #2a2f42", borderRadius: 8, padding: 2 },
    toggleBtn: (active) => ({
      flex: 1, borderRadius: 6, padding: "4px 0", fontSize: 10, fontWeight: 600, border: "none", cursor: "pointer",
      background: active ? "#3b82f6" : "transparent", color: active ? "#fff" : "#94a3b8", transition: "all 0.15s",
    }),
    addBtn: { width: "100%", borderRadius: 8, background: "rgba(59,130,246,0.15)", border: "1px solid rgba(59,130,246,0.3)", padding: "6px 0", fontSize: 12, fontWeight: 500, color: "#93c5fd", cursor: "pointer" },
    runBtn: (disabled) => ({ width: "100%", borderRadius: 12, background: disabled ? "#1e293b" : "#3b82f6", color: disabled ? "#475569" : "#fff", border: "none", padding: "10px 0", fontSize: 14, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer" }),
    label: { fontSize: 10, color: "#94a3b8", marginBottom: 4 },
    row: { display: "flex", gap: 8, alignItems: "center" },
    grid3: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  };

  return (
    <div style={{ fontFamily: "inherit" }}>
      {/* 종목 구성 */}
      <div style={s.wrap}>
        <div style={s.sectionHeader}>
          <span style={s.sectionTitle}>종목 구성 ({holdings.length})</span>
          {(() => {
            const total = holdings.reduce((sum, h) => sum + (h.investmentAmount ?? 0), 0);
            return total > 0 ? (
              <span style={{ fontSize: 10, color: "#fbbf24", fontWeight: 500 }}>
                총 {total >= 100_000_000 ? `₩${(total / 100_000_000).toFixed(1)}억` : `₩${Math.round(total / 10_000).toLocaleString()}만`}
              </span>
            ) : null;
          })()}
        </div>

        {holdings.length > 0 && (
          <div>
            {holdings.map((h, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid #2a2f42" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</div>
                  <div style={{ fontSize: 10, color: "#94a3b8" }}>{h.ticker}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {h.price && h.price > 0 && (
                    <div style={{ fontSize: 9, color: "rgba(251,191,36,0.7)", textAlign: "right", marginRight: 2 }}>
                      ≈ {(() => {
                        const v = isKrTicker(h.ticker) ? h.quantity * h.price : h.quantity * h.price * (exchangeRate ?? 1350);
                        return v >= 100_000_000 ? `₩${(v / 100_000_000).toFixed(1)}억` : `₩${Math.round(v / 10_000).toLocaleString()}만`;
                      })()}
                    </div>
                  )}
                  <input
                    type="number" value={h.quantity || ""}
                    onChange={(e) => updateQty(i, e.target.value)}
                    style={{ width: 70, background: "#0f1119", border: "1px solid #2a2f42", borderRadius: 4, padding: "2px 6px", fontSize: 12, color: "#fff", textAlign: "right" }}
                    min={1}
                  />
                  <span style={{ fontSize: 10, color: "#94a3b8" }}>주</span>
                  <button onClick={() => removeHolding(i)} style={{ marginLeft: 4, color: "#f87171", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 종목 추가 폼 */}
        <div style={{ ...s.p3, borderTop: holdings.length > 0 ? "1px solid #2a2f42" : "none", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={s.toggleWrap}>
            {["amount", "shares"].map((mode) => (
              <button key={mode} onClick={() => { setInputMode(mode); setFetchedPrice(null); }} style={s.toggleBtn(inputMode === mode)}>
                {mode === "amount" ? "💰 금액 입력" : "🔢 주 수 입력"}
              </button>
            ))}
          </div>

          {/* 종목 검색 */}
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: "#0f1119", border: "1px solid #2a2f42", borderRadius: 6, padding: "6px 8px" }}>
              <svg style={{ width: 14, height: 14, flexShrink: 0, color: "#94a3b8" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                placeholder="종목명 또는 티커 (삼성전자, SCHD…)"
                value={searchQuery}
                onChange={(e) => handleSearchInput(e.target.value)}
                style={{ flex: 1, background: "transparent", border: "none", fontSize: 12, color: "#fff", outline: "none" }}
              />
              {searchLoading && <span style={{ fontSize: 10, color: "#94a3b8" }}>…</span>}
              {searchQuery && (
                <button onClick={clearSelectedStock} style={{ color: "#94a3b8", background: "none", border: "none", cursor: "pointer", fontSize: 12 }}>✕</button>
              )}
            </div>
            {searchResults.length > 0 && !selectedStock && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, marginTop: 4, borderRadius: 12, border: "1px solid #2a2f42", background: "#0f1119", boxShadow: "0 8px 24px rgba(0,0,0,0.5)", overflow: "hidden" }}>
                {searchResults.map((r) => (
                  <button key={r.ticker} onClick={() => selectStock(r)}
                    style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "none", border: "none", borderBottom: "1px solid #2a2f42", cursor: "pointer", textAlign: "left" }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "#fff" }}>{r.name}</div>
                      <div style={{ fontSize: 10, color: "#94a3b8" }}>{r.ticker}</div>
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8", flexShrink: 0, marginLeft: 8 }}>{r.market}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedStock && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderRadius: 8, border: "1px solid rgba(59,130,246,0.4)", background: "rgba(59,130,246,0.1)", padding: "6px 10px" }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#93c5fd" }}>{selectedStock.name}</span>
                <span style={{ marginLeft: 6, fontSize: 10, color: "#94a3b8" }}>{selectedStock.ticker}</span>
              </div>
              <button onClick={clearSelectedStock} style={{ fontSize: 10, color: "#94a3b8", background: "none", border: "none", cursor: "pointer", marginLeft: 8 }}>✕</button>
            </div>
          )}

          {inputMode === "amount" ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {selectedCurrency === "USD" && (
                <div style={s.toggleWrap}>
                  {["KRW", "USD"].map((c) => (
                    <button key={c} onClick={() => { setAmountCurrency(c); setNewAmount(""); }} style={s.toggleBtn(amountCurrency === c)}>
                      {c === "KRW" ? "원화 ₩" : "달러 $"}
                    </button>
                  ))}
                </div>
              )}
              <div style={{ position: "relative" }}>
                <input placeholder={amountPlaceholder} type="number" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} style={{ ...s.input, paddingRight: 48 }} />
                <span style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#94a3b8" }}>{effectiveCurrency === "USD" ? "달러 ($)" : "원"}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 4, minHeight: 16 }}>
                {priceLoading && <span style={{ fontSize: 10, color: "#94a3b8" }}>현재가 조회 중…</span>}
                {!priceLoading && fetchedPrice && (
                  <>
                    <span style={{ fontSize: 10, color: "#94a3b8" }}>
                      {selectedCurrency === "USD"
                        ? `$${fetchedPrice.toFixed(2)}${exchangeRate ? ` (≈₩${Math.round(fetchedPrice * exchangeRate).toLocaleString()})` : ""}`
                        : `₩${fetchedPrice.toLocaleString()}`}
                    </span>
                    {newAmount && parseFloat(newAmount) > 0 && (() => {
                      const amt = parseFloat(newAmount);
                      const qty = selectedCurrency === "USD" && effectiveCurrency === "KRW" && exchangeRate
                        ? Math.floor(amt / (fetchedPrice * exchangeRate))
                        : Math.floor(amt / fetchedPrice);
                      return qty > 0 ? <span style={{ fontSize: 10, fontWeight: 600, color: "#93c5fd" }}>→ 약 {qty.toLocaleString()}주</span> : null;
                    })()}
                  </>
                )}
                {!priceLoading && !fetchedPrice && newTicker && (
                  <button onClick={() => lookupCurrentPrice(newTicker)} style={{ fontSize: 10, color: "#60a5fa", background: "none", border: "none", cursor: "pointer" }}>현재가 조회</button>
                )}
              </div>
            </div>
          ) : (
            <input placeholder="수량 (주)" type="number" value={newQty} onChange={(e) => setNewQty(e.target.value)} style={s.input} />
          )}

          <button onClick={inputMode === "amount" ? addHoldingByAmount : addHolding} disabled={priceLoading} style={s.addBtn}>
            + 종목 추가
          </button>
          <p style={{ fontSize: 9, color: "#64748b", margin: 0 }}>종목명(삼성전자) 또는 티커(005930, SCHD)로 검색 후 선택하세요</p>
        </div>
      </div>

      {/* 백테스트 설정 */}
      <div style={{ ...s.wrap, padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={s.sectionTitle}>백테스트 설정</div>

        <div>
          <div style={s.label}>기간</div>
          <div style={{ ...s.row, gap: 8 }}>
            <input type="month" value={startDate} onChange={(e) => { setStartDate(e.target.value); setSelectedPeriod(null); }} style={s.input} />
            <span style={{ color: "#94a3b8", fontSize: 12 }}>~</span>
            <input type="month" value={endDate} onChange={(e) => { setEndDate(e.target.value); setSelectedPeriod(null); }} style={s.input} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {[{ label: "1년", y: 1 }, { label: "3년", y: 3 }, { label: "5년", y: 5 }, { label: "10년", y: 10 }, { label: "15년", y: 15 }].map(({ label, y }) => {
            const isSel = selectedPeriod === y;
            return (
              <button key={label} onClick={() => {
                const end = new Date(), start = new Date(end);
                start.setFullYear(start.getFullYear() - y);
                setStartDate(`${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`);
                setEndDate(`${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}`);
                setSelectedPeriod(y);
              }}
                style={{ borderRadius: 8, border: isSel ? "1px solid rgba(59,130,246,0.6)" : "1px solid #2a2f42", background: isSel ? "rgba(59,130,246,0.2)" : "#0f1119", color: isSel ? "#93c5fd" : "#94a3b8", padding: "4px 10px", fontSize: 10, fontWeight: 500, cursor: "pointer" }}>
                {label}
              </button>
            );
          })}
        </div>

        <div style={s.grid2}>
          <div>
            <div style={s.label}>배당재투자</div>
            <button onClick={() => setDividendReinvest((v) => !v)}
              style={{ width: "100%", borderRadius: 8, border: dividendReinvest ? "1px solid rgba(34,197,94,0.4)" : "1px solid #2a2f42", background: dividendReinvest ? "rgba(34,197,94,0.15)" : "#0f1119", color: dividendReinvest ? "#4ade80" : "#94a3b8", padding: "6px 0", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
              {dividendReinvest ? "ON ✓" : "OFF"}
            </button>
          </div>
          <div>
            <div style={s.label}>벤치마크</div>
            <select value={benchmark} onChange={(e) => setBenchmark(e.target.value)}
              style={{ ...s.input, padding: "6px 8px" }}>
              <option value="069500">KODEX 200</option>
              <option value="SPY">SPY (S&P500, 원화환산)</option>
              <option value="">없음</option>
            </select>
          </div>
        </div>

        <button onClick={handleRun} disabled={loading || holdings.length === 0} style={s.runBtn(loading || holdings.length === 0)}>
          {loading ? "계산 중…" : "백테스트 실행"}
        </button>
      </div>

      {error && (
        <div style={{ borderRadius: 12, border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)", padding: "8px 12px", fontSize: 12, color: "#f87171", marginBottom: 12 }}>
          {error}
        </div>
      )}

      {/* 결과 */}
      {result && m && (
        <>
          <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", marginBottom: 8 }}>{result.dateRange.start} ~ {result.dateRange.end}</div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ ...s.label, marginBottom: 6 }}>내 포트폴리오</div>
            <div style={s.grid3}>
              <MetricCard label="CAGR (연복리)" value={pct(m.cagr * 100)} color={m.cagr >= 0 ? "#f87171" : "#34d399"} />
              <MetricCard label="MDD (최대낙폭)" value={`-${(m.mdd * 100).toFixed(1)}%`} color="#fb923c" />
              <MetricCard label="Sharpe 비율" value={m.sharpe.toFixed(2)} color={m.sharpe >= 1 ? "#fbbf24" : "#fff"} />
              <MetricCard label="총 수익률" value={pct(m.totalReturn * 100)} color={m.totalReturn >= 0 ? "#f87171" : "#34d399"} />
              <MetricCard label="연 변동성" value={`${(m.volatility * 100).toFixed(1)}%`} />
              {hasBench && <MetricCard label={`vs ${bm.name}`} value={pct((m.cagr - bm.metrics.cagr) * 100)} sub="CAGR 초과수익" color={(m.cagr - bm.metrics.cagr) >= 0 ? "#f87171" : "#34d399"} />}
            </div>
          </div>

          {hasBench && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ ...s.label, marginBottom: 6 }}>{bm.name}</div>
              <div style={s.grid3}>
                <MetricCard label="CAGR" value={pct(bm.metrics.cagr * 100)} color={bm.metrics.cagr >= 0 ? "#60a5fa" : "#34d399"} />
                <MetricCard label="MDD" value={`-${(bm.metrics.mdd * 100).toFixed(1)}%`} color="rgba(251,146,60,0.7)" />
                <MetricCard label="Sharpe" value={bm.metrics.sharpe.toFixed(2)} />
              </div>
            </div>
          )}

          {/* 자산 추이 차트 */}
          <div style={{ ...s.wrap, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>자산 추이 (시작=100)</div>
            <div style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={result.chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                  <XAxis dataKey="date" tick={{ fill: CHART_COLORS.text, fontSize: 8 }} tickFormatter={(v) => v.slice(0, 7)} interval={Math.floor(result.chartData.length / 6)} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 8 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <ReferenceLine y={100} stroke={CHART_COLORS.text} strokeDasharray="4 2" strokeOpacity={0.4} />
                  <Line type="monotone" dataKey="portfolio" name="포트폴리오" stroke="#ef4444" dot={false} strokeWidth={2} />
                  {hasBench && <Line type="monotone" dataKey="benchmark" name={bm.name} stroke="#3b82f6" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />}
                  <Legend wrapperStyle={{ fontSize: 10, color: CHART_COLORS.text, paddingTop: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 연도별 수익률 */}
          <div style={{ ...s.wrap, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>연도별 수익률</div>
            <div style={{ height: 176 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={result.annualData} margin={{ top: 10, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} vertical={false} />
                  <XAxis dataKey="year" tick={{ fill: CHART_COLORS.text, fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: CHART_COLORS.text, fontSize: 8 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`]} contentStyle={{ background: CHART_COLORS.tooltip, border: `1px solid ${CHART_COLORS.grid}`, borderRadius: 8, fontSize: 11 }} labelStyle={{ color: CHART_COLORS.text }} cursor={{ fill: "rgba(255,255,255,0.05)" }} />
                  <ReferenceLine y={0} stroke={CHART_COLORS.text} strokeOpacity={0.5} />
                  <Bar dataKey="portfolio" name="포트폴리오" maxBarSize={22} radius={[2, 2, 0, 0]}>
                    {result.annualData.map((e, i) => <Cell key={i} fill={e.portfolio >= 0 ? "#ef4444" : "#10b981"} fillOpacity={0.85} />)}
                  </Bar>
                  {hasBench && <Bar dataKey="benchmark" name={bm.name} maxBarSize={22} radius={[2, 2, 0, 0]} fill="#3b82f6" fillOpacity={0.5} />}
                  <Legend wrapperStyle={{ fontSize: 10, color: CHART_COLORS.text }} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 연도별 수익률 테이블 */}
            <div style={{ marginTop: 12, overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #2a2f42" }}>
                    <th style={{ padding: "6px 0", textAlign: "left", fontSize: 10, fontWeight: 500, color: "#94a3b8", width: 48 }}>연도</th>
                    <th style={{ padding: "6px 0", textAlign: "right", fontSize: 10, fontWeight: 500, color: "#94a3b8" }}>내 포트폴리오</th>
                    {hasBench && <th style={{ padding: "6px 0", textAlign: "right", fontSize: 10, fontWeight: 500, color: "#94a3b8" }}>{bm.name}</th>}
                    {hasBench && <th style={{ padding: "6px 0", textAlign: "right", fontSize: 10, fontWeight: 500, color: "#94a3b8" }}>초과수익</th>}
                  </tr>
                </thead>
                <tbody>
                  {[...result.annualData].reverse().map((row) => {
                    const excess = hasBench && row.benchmark != null ? row.portfolio - row.benchmark : null;
                    return (
                      <tr key={row.year} style={{ borderBottom: "1px solid rgba(42,47,66,0.5)" }}>
                        <td style={{ padding: "6px 0", fontSize: 10, color: "#94a3b8" }}>{row.year}</td>
                        <td style={{ padding: "6px 0", textAlign: "right", fontSize: 11, fontWeight: 600, color: row.portfolio >= 0 ? "#f87171" : "#34d399" }}>{fmtPct(row.portfolio)}</td>
                        {hasBench && <td style={{ padding: "6px 0", textAlign: "right", fontSize: 11, fontWeight: 600, color: (row.benchmark ?? 0) >= 0 ? "#60a5fa" : "#34d399" }}>{row.benchmark != null ? fmtPct(row.benchmark) : "—"}</td>}
                        {hasBench && <td style={{ padding: "6px 0", textAlign: "right", fontSize: 10, color: excess != null ? (excess >= 0 ? "rgba(248,113,113,0.8)" : "rgba(52,211,153,0.8)") : "#94a3b8" }}>{excess != null ? fmtPct(excess) : "—"}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 배당 수익 분석 */}
          {result.dividendAnalysis?.totalAnnualDiv > 0 && (() => {
            const da = result.dividendAnalysis;
            const fmtKrw = (v) => v >= 100_000_000 ? `₩${(v / 100_000_000).toFixed(2)}억` : `₩${Math.round(v / 10_000).toLocaleString()}만`;
            return (
              <div style={{ ...s.wrap }}>
                <div style={{ ...s.sectionHeader, gap: 8 }}>
                  <span style={s.sectionTitle}>배당 수익 분석</span>
                  <span style={{ fontSize: 9, color: "#94a3b8" }}>{da.items.find((d) => d.divYear)?.divYear ?? ""}년 기준</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderBottom: "1px solid #2a2f42" }}>
                  {[
                    { label: "예상 연간 배당금", value: fmtKrw(da.totalAnnualDiv), sub: `월 ${fmtKrw(Math.round(da.totalAnnualDiv / 12))}`, color: "#fbbf24" },
                    { label: "배당수익률", value: `${da.portfolioDivYield.toFixed(2)}%`, color: da.portfolioDivYield >= 3 ? "#f87171" : "#fff" },
                    { label: "배당성장률(DGR)", value: da.portfolioDgr != null ? `${da.portfolioDgr >= 0 ? "+" : ""}${da.portfolioDgr.toFixed(1)}%` : "—", color: da.portfolioDgr == null ? "#94a3b8" : da.portfolioDgr >= 0 ? "#f87171" : "#34d399" },
                  ].map((item, i) => (
                    <div key={i} style={{ padding: "10px 12px", textAlign: "center", borderRight: i < 2 ? "1px solid #2a2f42" : "none" }}>
                      <div style={{ fontSize: 9, color: "#94a3b8", marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>{item.value}</div>
                      {item.sub && <div style={{ fontSize: 9, color: "#94a3b8", marginTop: 2 }}>{item.sub}</div>}
                    </div>
                  ))}
                </div>
                <div>
                  {da.items.filter((d) => d.hasDividend).map((d, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", padding: "8px 12px", gap: 8, borderBottom: "1px solid rgba(42,47,66,0.5)" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                        <div style={{ fontSize: 9, color: "#94a3b8" }}>{d.ticker}</div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#fbbf24" }}>{fmtKrw(d.annualDivTotal)}</div>
                        <div style={{ fontSize: 9, color: "#94a3b8" }}>
                          수익률 {d.divYield.toFixed(2)}%
                          {d.dgr != null && <span style={{ marginLeft: 4, color: d.dgr >= 0 ? "rgba(248,113,113,0.8)" : "rgba(52,211,153,0.8)" }}>DGR {d.dgr >= 0 ? "+" : ""}{d.dgr.toFixed(1)}%</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* 종목별 성과 */}
          {result.holdingPerf.length > 0 && (
            <div style={s.wrap}>
              <div style={s.sectionHeader}>
                <span style={s.sectionTitle}>종목별 성과</span>
              </div>
              <div>
                {result.holdingPerf.map((h, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", padding: "8px 12px", gap: 8, borderBottom: "1px solid rgba(42,47,66,0.5)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</div>
                      <div style={{ fontSize: 9, color: "#94a3b8" }}>{h.ticker}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: h.cagr != null && h.cagr >= 0 ? "#f87171" : "#34d399" }}>{h.cagr != null ? `CAGR ${fmtPct(h.cagr)}` : "데이터없음"}</div>
                      {h.return != null && <div style={{ fontSize: 9, color: h.return >= 0 ? "rgba(248,113,113,0.7)" : "rgba(52,211,153,0.7)" }}>총 {fmtPct(h.return)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderRadius: 12, border: "1px solid #2a2f42", background: "#0f1119", padding: "8px 12px", marginBottom: 12 }}>
            <div style={{ fontSize: 9, color: "#64748b", lineHeight: 1.6 }}>
              <div>• CAGR: 연평균 복리 수익률 · MDD: 최대 낙폭 · Sharpe: (CAGR−3.5%) ÷ 연변동성</div>
              <div>• 배당재투자 ON: adjclose 기준 / OFF: close 기준</div>
              <div>• 데이터 출처: Yahoo Finance · 과거 성과가 미래를 보장하지 않습니다</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
