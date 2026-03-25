import { useState, useEffect, useCallback, useRef } from "react";
import { db, storage } from "./firebase";
import { collection, doc, onSnapshot, addDoc, deleteDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// ─── Initial Data ───────────────────────────────────────────────
const MEMBERS = ["전진아","이형석","장인현","변영선","홍대우","한상민","이상민","오지선","이지은","김차훈","배정아","이영호"];
const TOTAL_ROUNDS = 38;
const PER_ROUND = 25000;
const ACCESS_CODE = "1819";
const ADMIN_ID = "manner205";
const ADMIN_PW = "!2Dldudgh";

const INITIAL_PAYMENTS = (() => {
  const p = {};
  MEMBERS.forEach(m => { p[m] = Array(TOTAL_ROUNDS).fill(false); });
  // Rounds 1-4: all paid
  MEMBERS.forEach(m => { for(let i=0;i<4;i++) p[m][i]=true; });
  // Round 5: all except 변영선
  MEMBERS.forEach(m => { if(m!=="변영선") p[m][4]=true; });
  // Round 6
  ["전진아","홍대우","이상민","오지선","이지은","배정아"].forEach(m => p[m][5]=true);
  // Rounds 7-38 for 홍대우,오지선,배정아
  ["홍대우","오지선"].forEach(m => { for(let i=6;i<TOTAL_ROUNDS;i++) p[m][i]=true; });
  ["배정아"].forEach(m => { for(let i=6;i<19;i++) p[m][i]=true; });
  return p;
})();

const ROUND_LABELS = Array.from({length:TOTAL_ROUNDS},(_,i)=>{
  const startYear=25, startMonth=11;
  const total = startMonth-1+i;
  const y = startYear + Math.floor(total/12);
  const mo = (total%12)+1;
  return `'${String(y).padStart(2,'0')}.${String(mo).padStart(2,'0')}`;
});

const INITIAL_STOCKS = [
  {id:1,name:"KODEX200",code:"069500",price:81025,qty:8},
  {id:2,name:"PLUS 고배당주",code:"161510",price:25240,qty:25},
  {id:3,name:"KODEX AI반도체",code:"395160",price:26815,qty:13},
  {id:4,name:"삼성전자",code:"005930",price:186300,qty:4},
];
const INITIAL_CASH = 24285;

const INITIAL_DEPOSITS = [
  {id:1, name:"국민은행 정기예금", startDate:"26.01.27", endDate:"27.01.27",
   amount:1000000, rate:2.80, maturityAmount:1023690}
];

const INITIAL_CANDIDATES = [
  {id:1,name:"일본 오사카",desc:"맛집 투어와 유니버셜 스튜디오",emoji:"🇯🇵"},
  {id:2,name:"베트남 다낭",desc:"리조트 휴양과 호이안 관광",emoji:"🇻🇳"},
  {id:3,name:"태국 방콕",desc:"야시장, 사원, 마사지 천국",emoji:"🇹🇭"},
];

// ─── Google Sheets ──────────────────────────────────────────────
const SHEET_ID = "1-6BbzuG1RR10IU8X3U9daL5N5UuvNzTnpAO-5avcKXY";
const SHEET_PAYMENTS_GID = "0";
const SHEET_INVEST_GID = "278279642";

function parseCSVRow(row) {
  const result = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '"') { inQuote = !inQuote; }
    else if (c === ',' && !inQuote) { result.push(cur.trim()); cur = ""; }
    else { cur += c; }
  }
  result.push(cur.trim());
  return result;
}

function parsePaymentsCSV(csv) {
  const rows = csv.split('\n').map(parseCSVRow);
  const headerRow = rows[4]; // 회차, 구분, 전진아, 이형석, ...
  const memberCols = headerRow.slice(2).filter(h => h && h !== '');
  const payments = {};
  memberCols.forEach(m => { payments[m] = Array(TOTAL_ROUNDS).fill(false); });
  for (let i = 5; i < rows.length; i++) {
    const row = rows[i];
    const roundIdx = parseInt(row[0]) - 1;
    if (isNaN(roundIdx) || roundIdx < 0 || roundIdx >= TOTAL_ROUNDS) continue;
    memberCols.forEach((m, ci) => { payments[m][roundIdx] = row[ci + 2] === 'O'; });
  }
  return payments;
}

function parseInvestCSV(csv) {
  const rows = csv.split('\n').map(parseCSVRow);
  const stocks = [];
  let cash = 0;
  const deposits = [];
  let inDeposit = false;
  let stockId = 1;
  let depositId = 1;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row[1] === '종목명' && row[2] === '신규일') { inDeposit = true; continue; }
    if (row[1] === '예수금') {
      cash = parseInt(String(row[4]).replace(/[₩,]/g, '')) || 0;
      continue;
    }
    if (!inDeposit) {
      if (row[1] && row[2] && /^\d{6}$/.test(row[2])) {
        const price = parseInt(String(row[3]).replace(/[₩,]/g, '')) || 0;
        const qty = parseInt(row[4]) || 0;
        stocks.push({ id: stockId++, name: row[1], code: row[2], price, qty });
      }
    } else {
      if (row[1] && row[1] !== '종목명') {
        const amount = parseInt(String(row[4]).replace(/[₩,]/g, '')) || 0;
        const rate = parseFloat(row[5]) || 0;
        const maturity = parseInt(String(row[6]).replace(/[₩,]/g, '')) || 0;
        if (amount > 0) {
          deposits.push({ id: depositId++, name: row[1], startDate: row[2].replace(/`/g,''), endDate: row[3].replace(/`/g,''), amount, rate, maturityAmount: maturity });
        }
      }
    }
  }
  return { stocks, cash, deposits };
}

// ─── Utility ────────────────────────────────────────────────────
const fmt = n => n?.toLocaleString("ko-KR") ?? "0";



async function fetchStockInfo(code) {
  const res = await fetch(`/naver-finance/api/stock/${code}/basic`);
  if (!res.ok) throw new Error('fetch failed');
  const data = await res.json();
  const price = parseInt(String(data.closePrice ?? data.currentPrice ?? 0).replace(/,/g,'')) || 0;
  return { name: data.stockName ?? '', price };
}

// ─── Main App ───────────────────────────────────────────────────
export default function App() {
  const [accessGranted, setAccessGranted] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminForm, setAdminForm] = useState({id:"",pw:""});
  const [adminError, setAdminError] = useState("");
  const [activeTab, setActiveTab] = useState("home");
  const swipeTouchStartX = useRef(null);
  const swipeTouchStartY = useRef(null);
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Data states
  const [payments, setPayments] = useState(INITIAL_PAYMENTS);
  const [stocks, setStocks] = useState(INITIAL_STOCKS);
  const [cashBalance, setCashBalance] = useState(INITIAL_CASH);
  const [deposits, setDeposits] = useState(INITIAL_DEPOSITS);
  const [candidates, setCandidates] = useState(INITIAL_CANDIDATES);
  const [votes, setVotes] = useState({});
  const [voterName, setVoterName] = useState("");
  const [editingStock, setEditingStock] = useState(null);
  const [newStock, setNewStock] = useState({name:"",code:"",price:"",qty:""});
  const [showNewStock, setShowNewStock] = useState(false);
  const [newCandidate, setNewCandidate] = useState({name:"",desc:"",emoji:"🌍"});

  const loadSheetData = useCallback(() => {
    setIsRefreshing(true);
    const base = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=`;
    Promise.all([
      fetch(base + SHEET_PAYMENTS_GID).then(r => r.text()),
      fetch(base + SHEET_INVEST_GID).then(r => r.text()),
    ]).then(([payCSV, investCSV]) => {
      setPayments(parsePaymentsCSV(payCSV));
      const { stocks, cash, deposits } = parseInvestCSV(investCSV);
      setStocks(stocks);
      setCashBalance(cash);
      setDeposits(deposits);
    }).catch(() => {}).finally(() => setIsRefreshing(false));
  }, []);

  // Load from Google Sheets on mount
  useEffect(() => { loadSheetData(); }, [loadSheetData]);

  // ─── Firestore 실시간 연동: 여행정보 ─────────────────────────────
  useEffect(() => {
    const unsub = onSnapshot(doc(db, "trip", "voteData"), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.candidates) setCandidates(data.candidates);
        if (data.votes) setVotes(data.votes);
      }
    });
    return () => unsub();
  }, []);

  // ─── 실시간 주가 자동갱신 ────────────────────────────────────────
  const stocksRef = useRef(stocks);
  useEffect(() => { stocksRef.current = stocks; }, [stocks]);
  useEffect(() => {
    const refresh = async () => {
      const curr = stocksRef.current;
      if (!curr.length) return;
      const updated = await Promise.all(curr.map(async s => {
        try {
          const info = await fetchStockInfo(s.code);
          return { ...s, price: info.price };
        } catch { return s; }
      }));
      setStocks(updated);
    };
    refresh();
    const id = setInterval(refresh, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const savePayments = useCallback((p) => { setPayments(p); },[]);
  const saveStocks = useCallback((s,c) => { setStocks(s); setCashBalance(c); },[]);
  const saveDeposits = useCallback((d) => { setDeposits(d); },[]);
  const saveVotes = useCallback(async (cands, v) => {
    setCandidates(cands); setVotes(v);
    try { await setDoc(doc(db, "trip", "voteData"), { candidates: cands, votes: v }); } catch(e) { console.error(e); }
  }, []);

  // ─── Access Gate ──────────────────────────────────────────────
  if (!accessGranted) {
    return (
      <div style={styles.gateWrap}>
        <div style={styles.gateBg}>
          {[...Array(20)].map((_,i)=>(
            <div key={i} style={{...styles.floatingCircle,
              width: 10+Math.random()*60, height: 10+Math.random()*60,
              left:`${Math.random()*100}%`, top:`${Math.random()*100}%`,
              animationDelay:`${Math.random()*6}s`, animationDuration:`${4+Math.random()*6}s`
            }}/>
          ))}
        </div>
        <div style={styles.gateCard}>
          <div style={styles.gateLogo}>🧅</div>
          <h1 style={styles.gateTitle}>1819기 양파링</h1>
          <p style={styles.gateSubtitle}>30년 그리고 함께</p>
          <div style={styles.gateInputWrap}>
            <div style={styles.pinDots}>
              {[0,1,2,3].map(i=>(
                <div key={i} style={{
                  ...styles.pinDot,
                  background: codeInput.length > i ? "#F59E0B" : "rgba(255,255,255,0.15)",
                  transform: codeInput.length > i ? "scale(1.2)" : "scale(1)",
                  boxShadow: codeInput.length > i ? "0 0 12px rgba(245,158,11,0.5)" : "none"
                }}/>
              ))}
            </div>
            <input
              type="password" maxLength={4} value={codeInput}
              onChange={e => {
                const v = e.target.value.replace(/\D/g,"");
                setCodeInput(v); setCodeError(false);
                if(v.length===4){
                  if(v===ACCESS_CODE){ setTimeout(()=>setAccessGranted(true),300); }
                  else { setCodeError(true); setTimeout(()=>{setCodeInput("");setCodeError(false);},800); }
                }
              }}
              placeholder="비밀번호 4자리"
              style={{...styles.gateInput, borderColor: codeError?"#EF4444":"rgba(255,255,255,0.1)"}}
              autoFocus
            />
            {codeError && <p style={styles.gateError}>비밀번호가 올바르지 않습니다</p>}
          </div>
          <p style={styles.gateHint}>모임 비밀번호를 입력해주세요</p>
        </div>
      </div>
    );
  }

  // ─── Computed Values ──────────────────────────────────────────
  const totalCollected = Object.values(payments).reduce((sum,arr)=>sum+arr.filter(Boolean).length*PER_ROUND,0);
  const stockTotal = stocks.reduce((s,st)=>s+st.price*st.qty,0)+cashBalance;
  const stockInvested = 1800000;
  const stockProfit = stockTotal - stockInvested;
  const stockReturn = stockInvested > 0 ? ((stockProfit/stockInvested)*100).toFixed(2) : "0";
  const depositTotal = deposits.reduce((s,d)=>s+d.maturityAmount,0);
  const tossBalance = totalCollected - stockInvested - deposits.reduce((s,d)=>s+d.amount,0);
  const currentProgress = 5;
  const progressPct = ((currentProgress/TOTAL_ROUNDS)*100).toFixed(1);

  const togglePayment = (member, round) => {
    if(!isAdmin) return;
    const next = {...payments, [member]: [...payments[member]]};
    next[member][round] = !next[member][round];
    savePayments(next);
  };

  const handleVote = (candidateId) => {
    if(!voterName.trim()) return;
    if(votes[voterName.trim()]) return;
    const nv = {...votes, [voterName.trim()]: candidateId};
    saveVotes(candidates, nv);
  };

  const addCandidate = () => {
    if(!newCandidate.name.trim()) return;
    const nc = [...candidates, {id:Date.now(), ...newCandidate}];
    saveVotes(nc, votes);
    setNewCandidate({name:"",desc:"",emoji:"🌍"});
  };

  const removeCandidate = (id) => {
    const nc = candidates.filter(c=>c.id!==id);
    const nv = {...votes};
    Object.keys(nv).forEach(k=>{ if(nv[k]===id) delete nv[k]; });
    saveVotes(nc, nv);
  };

  const saveStockEdit = (id, field, value) => {
    const ns = stocks.map(s=>s.id===id?{...s,[field]:field==="name"||field==="code"?value:Number(value)||0}:s);
    saveStocks(ns, cashBalance);
  };

  const addStock = () => {
    if(!newStock.name) return;
    const ns = [...stocks, {id:Date.now(),name:newStock.name,code:newStock.code,price:Number(newStock.price)||0,qty:Number(newStock.qty)||0}];
    saveStocks(ns, cashBalance);
    setNewStock({name:"",code:"",price:"",qty:""});
    setShowNewStock(false);
  };

  const removeStock = (id) => {
    saveStocks(stocks.filter(s=>s.id!==id), cashBalance);
  };

  const TABS = [
    {key:"home",label:"홈",icon:"🏠"},
    {key:"payments",label:"납입현황",icon:"💰"},
    {key:"invest",label:"투자현황",icon:"📈"},
    {key:"money",label:"머니머니",icon:"💎"},
    {key:"vote",label:"여행정보",icon:"✈️"},
  ];

  return (
    <div style={styles.appWrap}>
      {/* Admin Modal */}
      {showAdminModal && (
        <div style={styles.modalOverlay} onClick={()=>setShowAdminModal(false)}>
          <div style={styles.modalCard} onClick={e=>e.stopPropagation()}>
            <h3 style={styles.modalTitle}>🔐 관리자 로그인</h3>
            <input placeholder="아이디" value={adminForm.id} onChange={e=>setAdminForm({...adminForm,id:e.target.value})} style={styles.modalInput}/>
            <input placeholder="비밀번호" type="password" value={adminForm.pw} onChange={e=>setAdminForm({...adminForm,pw:e.target.value})} style={styles.modalInput}
              onKeyDown={e=>{
                if(e.key==="Enter"){
                  if(adminForm.id===ADMIN_ID && adminForm.pw===ADMIN_PW){ setIsAdmin(true); setShowAdminModal(false); setAdminError(""); }
                  else setAdminError("아이디 또는 비밀번호가 올바르지 않습니다");
                }
              }}
            />
            {adminError && <p style={styles.errorText}>{adminError}</p>}
            <div style={{display:"flex",gap:8,marginTop:12}}>
              <button style={styles.btnSecondary} onClick={()=>setShowAdminModal(false)}>취소</button>
              <button style={styles.btnPrimary} onClick={()=>{
                if(adminForm.id===ADMIN_ID && adminForm.pw===ADMIN_PW){ setIsAdmin(true); setShowAdminModal(false); setAdminError(""); }
                else setAdminError("아이디 또는 비밀번호가 올바르지 않습니다");
              }}>로그인</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div style={styles.headerLeft}>
            <span style={styles.headerLogo}>🧅</span>
            <div>
              <h1 style={styles.headerTitle}>1819기 양파링</h1>
              <p style={styles.headerSub}>30년 그리고 함께 · 해외여행 프로젝트</p>
            </div>
          </div>
          <div style={styles.headerRight}>
            {isAdmin ? (
              <button style={styles.adminBadge} onClick={()=>{setIsAdmin(false);setAdminForm({id:"",pw:""});}}>
                👑 관리자 · 로그아웃
              </button>
            ) : (
              <button style={styles.loginBtn} onClick={()=>setShowAdminModal(true)}>
                관리자 로그인
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Tab Nav */}
      <nav style={styles.tabBar}>
        <div style={styles.tabBarInner}>
          {TABS.map(t=>(
            <button key={t.key} onClick={()=>setActiveTab(t.key)}
              style={{...styles.tabBtn, ...(activeTab===t.key?styles.tabBtnActive:{})}}>
              <span style={styles.tabIcon}>{t.icon}</span>
              <span style={styles.tabLabel}>{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* Pull to refresh indicator */}
      <div style={{
        textAlign:'center', overflow:'hidden', display:'flex',
        alignItems:'center', justifyContent:'center',
        color:'#888', fontSize:13,
        height: isRefreshing ? 40 : pullY > 0 ? Math.min(pullY * 0.5, 40) : 0,
        transition: pullY === 0 ? 'height 0.3s' : 'none',
      }}>
        {isRefreshing ? '새로고침 중...' : pullY >= 80 ? '↑ 놓으면 새로고침' : '↓ 당겨서 새로고침'}
      </div>

      {/* Content */}
      <main style={styles.main}
        onTouchStart={e => {
          swipeTouchStartX.current = e.touches[0].clientX;
          swipeTouchStartY.current = e.touches[0].clientY;
        }}
        onTouchMove={e => {
          if (swipeTouchStartY.current === null) return;
          const dy = e.touches[0].clientY - swipeTouchStartY.current;
          const dx = e.touches[0].clientX - swipeTouchStartX.current;
          if (dy > 0 && Math.abs(dy) > Math.abs(dx) && window.scrollY === 0) {
            setPullY(Math.min(dy, 160));
          }
        }}
        onTouchEnd={e => {
          if (swipeTouchStartX.current === null) return;
          const dx = e.changedTouches[0].clientX - swipeTouchStartX.current;
          const dy = e.changedTouches[0].clientY - swipeTouchStartY.current;
          swipeTouchStartX.current = null;
          swipeTouchStartY.current = null;
          if (pullY >= 80 && !isRefreshing) loadSheetData();
          setPullY(0);
          if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
          const TAB_KEYS = ["home","payments","invest","money","vote"];
          const cur = TAB_KEYS.indexOf(activeTab);
          if (dx < 0 && cur < TAB_KEYS.length - 1) setActiveTab(TAB_KEYS[cur + 1]);
          if (dx > 0 && cur > 0) setActiveTab(TAB_KEYS[cur - 1]);
        }}
      >
        {activeTab==="home" && <HomeTab totalCollected={totalCollected} stockTotal={stockTotal} depositTotal={depositTotal} tossBalance={tossBalance} progressPct={progressPct} currentProgress={currentProgress} members={MEMBERS} payments={payments} setActiveTab={setActiveTab} />}
        {activeTab==="payments" && <PaymentsTab payments={payments} isAdmin={isAdmin} togglePayment={togglePayment} />}
        {activeTab==="invest" && <InvestTab stocks={stocks} cashBalance={cashBalance} deposits={deposits} isAdmin={isAdmin} stockTotal={stockTotal} stockInvested={stockInvested} stockProfit={stockProfit} stockReturn={stockReturn} editingStock={editingStock} setEditingStock={setEditingStock} saveStockEdit={saveStockEdit} removeStock={removeStock} showNewStock={showNewStock} setShowNewStock={setShowNewStock} newStock={newStock} setNewStock={setNewStock} addStock={addStock} saveStocks={saveStocks} saveDeposits={saveDeposits} />}
        {activeTab==="money" && <MoneyTab isAdmin={isAdmin} />}
        {activeTab==="vote" && <VoteTab candidates={candidates} votes={votes} voterName={voterName} setVoterName={setVoterName} handleVote={handleVote} isAdmin={isAdmin} addCandidate={addCandidate} newCandidate={newCandidate} setNewCandidate={setNewCandidate} removeCandidate={removeCandidate} members={MEMBERS} saveVotes={saveVotes}/>}
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <p>© 2025 1819기 양파링 · 우리의 30년을 함께 만들어가는 중 🧅</p>
      </footer>
    </div>
  );
}

// ─── Home Tab ───────────────────────────────────────────────────
function HomeTab({totalCollected, stockTotal, depositTotal, tossBalance, progressPct, currentProgress, members, payments, setActiveTab}) {
  const totalTarget = MEMBERS.length * TOTAL_ROUNDS * PER_ROUND;
  const totalEval = stockTotal + depositTotal + tossBalance;
  const memberStats = members.map(m=>({name:m, paid:payments[m].filter(Boolean).length}));
  const isMobile = window.innerWidth < 600;
  const evalColor = totalEval > totalCollected ? "#F87171" : totalEval < totalCollected ? "#60A5FA" : "rgba(255,255,255,0.5)";

  return (
    <div style={styles.contentWrap}>
      {/* Hero */}
      <div style={styles.heroCard}>
        <div style={styles.heroGlow}/>
        {isMobile ? (
          <>
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              <img src="/img05.png" alt="" style={{flex:1,width:0,borderRadius:10,boxShadow:"0 4px 12px rgba(0,0,0,0.5)"}}/>
              <img src="/img04.png" alt="" style={{flex:1,width:0,borderRadius:10,boxShadow:"0 4px 12px rgba(0,0,0,0.5)"}}/>
            </div>
            <div style={{textAlign:"center"}}>
              <h2 style={styles.heroTitle}>함께 모으는 여행 자금</h2>
              <div style={styles.heroAmount}>₩{fmt(totalCollected)}</div>
              <div style={{marginTop:10,marginBottom:4}}>
                <span style={{fontSize:11,color:"rgba(255,255,255,0.45)"}}>총 평가금</span>
                <div style={{fontSize:22,fontWeight:800,color:evalColor,letterSpacing:-0.5,filter:`drop-shadow(0 0 8px ${evalColor}88)`}}>₩{fmt(totalEval)}</div>
              </div>
              <p style={styles.heroSub}>목표 ₩{fmt(totalTarget)}</p>
            </div>
          </>
        ) : (
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20}}>
            <img src="/img05.png" alt="" style={{width:220,borderRadius:12,boxShadow:"0 4px 16px rgba(0,0,0,0.5)",flexShrink:0}}/>
            <div style={{flex:1,textAlign:"center",position:"relative",zIndex:1}}>
              <h2 style={styles.heroTitle}>함께 모으는 여행 자금</h2>
              <div style={styles.heroAmount}>₩{fmt(totalCollected)}</div>
              <div style={{marginTop:10,marginBottom:4}}>
                <span style={{fontSize:11,color:"rgba(255,255,255,0.45)"}}>총 평가금</span>
                <div style={{fontSize:22,fontWeight:800,color:evalColor,letterSpacing:-0.5,filter:`drop-shadow(0 0 8px ${evalColor}88)`}}>₩{fmt(totalEval)}</div>
              </div>
              <p style={styles.heroSub}>목표 ₩{fmt(totalTarget)}</p>
            </div>
            <img src="/img04.png" alt="" style={{width:220,borderRadius:12,boxShadow:"0 4px 16px rgba(0,0,0,0.5)",flexShrink:0}}/>
          </div>
        )}
        <div style={styles.progressBarOuter}>
          <div style={{...styles.progressBarInner, width:`${progressPct}%`}}>
            <span style={styles.progressText}>{progressPct}%</span>
          </div>
        </div>
        <p style={styles.progressLabel}>{currentProgress}회차 / {TOTAL_ROUNDS}회차 진행 중</p>
      </div>

      {/* Summary Cards */}
      <div style={styles.cardGrid}>
        <div style={styles.summaryCard}>
          <div style={{...styles.cardIcon, background:"linear-gradient(135deg,#3B82F6,#6366F1)"}}>💰</div>
          <div style={styles.cardLabel}>총 모금 원금</div>
          <div style={styles.cardValue}>₩{fmt(totalCollected)}</div>
        </div>
        <div style={{...styles.summaryCard, cursor:"pointer"}} onClick={()=>setActiveTab("invest")}>
          <div style={{...styles.cardIcon, background:"linear-gradient(135deg,#10B981,#059669)"}}>📈</div>
          <div style={styles.cardLabel}>주식 평가금</div>
          <div style={styles.cardValue}>₩{fmt(stockTotal)}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={{...styles.cardIcon, background:"linear-gradient(135deg,#F59E0B,#D97706)"}}>🏦</div>
          <div style={styles.cardLabel}>예금 평가금</div>
          <div style={styles.cardValue}>₩{fmt(depositTotal)}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={{...styles.cardIcon, background:"linear-gradient(135deg,#14B8A6,#0D9488)"}}>🏧</div>
          <div style={styles.cardLabel}>토스모임통장</div>
          <div style={styles.cardValue}>₩{fmt(tossBalance)}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={{...styles.cardIcon, background:"linear-gradient(135deg,#EC4899,#BE185D)"}}>👥</div>
          <div style={styles.cardLabel}>모임 인원</div>
          <div style={styles.cardValue}>{MEMBERS.length}명</div>
        </div>
      </div>

      {/* Member Progress */}
      <div style={styles.sectionCard}>
        <h3 style={styles.sectionTitle}>👥 멤버별 납입 현황</h3>
        <div style={styles.memberGrid}>
          {memberStats.map(m=>{
            const done = m.paid >= TOTAL_ROUNDS;
            return (
            <div key={m.name} onClick={()=>setActiveTab("payments")} style={{...styles.memberItem, cursor:"pointer", ...(done?{
              background:"linear-gradient(135deg,rgba(245,158,11,0.2),rgba(251,191,36,0.1),rgba(217,119,6,0.15))",
              border:"1px solid rgba(245,158,11,0.6)",
              boxShadow:"0 0 16px rgba(245,158,11,0.2), inset 0 0 20px rgba(245,158,11,0.05)",
              position:"relative",
              overflow:"hidden",
            }:{})}}>
              {done && <div style={{position:"absolute",top:0,left:0,right:0,height:2,background:"linear-gradient(90deg,transparent,#F59E0B,#FCD34D,#F59E0B,transparent)"}}/>}
              <div style={{...styles.memberAvatar, ...(done?{
                background:"linear-gradient(135deg,#F59E0B,#FCD34D,#D97706)",
                boxShadow:"0 0 12px rgba(245,158,11,0.6)",
                fontSize:18,
              }:{})}}>
                {done ? "👑" : m.name[0]}
              </div>
              <div style={{...styles.memberName, ...(done?{
                color:"#FCD34D",
                fontWeight:700,
                textShadow:"0 0 8px rgba(245,158,11,0.5)",
              }:{})}}>{m.name}</div>
              <div style={styles.memberMiniBar}>
                <div style={{...styles.memberMiniBarFill, width:`${(m.paid/TOTAL_ROUNDS)*100}%`, ...(done?{background:"linear-gradient(90deg,#F59E0B,#FCD34D,#FBBF24)"}:{})}}/>
              </div>
              <div style={{...styles.memberCount, ...(done?{
                color:"#F59E0B",
                fontWeight:700,
                fontSize:12,
                letterSpacing:"0.5px",
              }:{})}}>
                {done ? "🎉 완납!" : `${m.paid}/${TOTAL_ROUNDS}회`}
              </div>
            </div>
            );
          })}
        </div>
      </div>

      {/* Info */}
      <div style={styles.sectionCard}>
        <h3 style={styles.sectionTitle}>📋 모금 안내</h3>
        <div style={styles.infoGrid}>
          <div style={styles.infoItem}><span style={styles.infoLabel}>입금 계좌</span><span style={styles.infoValue}>토스뱅크 1002-2535-5608</span></div>
          <div style={styles.infoItem}><span style={styles.infoLabel}>1회 납입금</span><span style={styles.infoValue}>₩25,000</span></div>
          <div style={styles.infoItem}><span style={styles.infoLabel}>총 납입 횟수</span><span style={styles.infoValue}>38회</span></div>
          <div style={styles.infoItem}><span style={styles.infoLabel}>납입 규칙</span><span style={styles.infoValue}>선납입 OK, 후납입 X</span></div>
        </div>
      </div>
    </div>
  );
}

// ─── Payments Tab ───────────────────────────────────────────────
function PaymentsTab({payments, isAdmin, togglePayment}) {
  const [selectedMember, setSelectedMember] = useState(null);
  const now = new Date();
  const currentLabel = `'${String(now.getFullYear()%100).padStart(2,'0')}.${String(now.getMonth()+1).padStart(2,'0')}`;
  const isMobile = window.innerWidth < 600;
  
  return (
    <div style={styles.contentWrap}>
      <div style={styles.sectionCard}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <h3 style={styles.sectionTitle}>💰 경비 납입 현황표</h3>
          {isAdmin && <span style={styles.editHint}>✏️ 셀을 클릭하여 납입 상태를 변경할 수 있습니다</span>}
        </div>
        
        {/* Mobile: member selector */}
        <div style={styles.memberSelector}>
          <select value={selectedMember||""} onChange={e=>setSelectedMember(e.target.value||null)} style={{...styles.selectInput, background:"#fff", color:"#000", border:"1px solid #ccc"}}>
            <option value="">전체 보기 (가로 스크롤)</option>
            {MEMBERS.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        {selectedMember ? (
          <div style={styles.memberDetail}>
            <div style={styles.memberDetailHeader}>
              <div style={styles.memberDetailAvatar}>{selectedMember[0]}</div>
              <div>
                <div style={styles.memberDetailName}>{selectedMember}</div>
                <div style={styles.memberDetailSub}>{payments[selectedMember].filter(Boolean).length}회 납입 완료</div>
              </div>
            </div>
            <div style={styles.roundGrid}>
              {ROUND_LABELS.map((label,i)=>(
                <div key={i} onClick={()=>togglePayment(selectedMember,i)}
                  style={{...styles.roundCell, background: payments[selectedMember][i]?"#10B981":"rgba(255,255,255,0.05)",
                    cursor:isAdmin?"pointer":"default", border: payments[selectedMember][i]?"1px solid #059669":"1px solid rgba(255,255,255,0.08)"}}>
                  <div style={styles.roundLabel}>{label}</div>
                  <div style={{fontSize:18}}>{payments[selectedMember][i]?"✅":"—"}</div>
                  <div style={styles.roundNum}>{i+1}회차</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{...styles.th,position:"sticky",left:0,zIndex:2,background:"#1a1a2e",minWidth:isMobile?36:55,fontSize:isMobile?10:undefined}}>회차</th>
                  <th style={{...styles.th,position:"sticky",left:isMobile?36:55,zIndex:2,background:"#1a1a2e",minWidth:isMobile?50:65,fontSize:isMobile?10:undefined}}>날짜</th>
                  {MEMBERS.map(m=>(
                    <th key={m} style={{...styles.th,
                      minWidth:isMobile?26:60,
                      fontSize:isMobile?10:11,
                      writingMode:isMobile?"vertical-rl":undefined,
                      letterSpacing:isMobile?1:undefined,
                      padding:isMobile?"10px 4px":undefined,
                      whiteSpace:"nowrap",
                    }}>{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROUND_LABELS.map((label,i)=>{
                  const isCurrent = label===currentLabel;
                  return (
                  <tr key={i} style={{background:isCurrent?"rgba(245,158,11,0.12)":i%2===0?"rgba(255,255,255,0.02)":"transparent", outline:isCurrent?"1px solid rgba(245,158,11,0.4)":"none"}}>
                    <td style={{...styles.td,position:"sticky",left:0,background:isCurrent?"#2e2410":"#1a1a2e",fontWeight:700,fontSize:isMobile?10:11,color:isCurrent?"#F59E0B":"inherit"}}>{i+1}</td>
                    <td style={{...styles.td,position:"sticky",left:isMobile?36:55,background:isCurrent?"#2e2410":"#1a1a2e",fontSize:isMobile?10:11,whiteSpace:"nowrap",fontWeight:isCurrent?700:400,color:isCurrent?"#F59E0B":"inherit"}}>
                      {isCurrent ? "👉 "+label : label}
                    </td>
                    {MEMBERS.map(m=>(
                      <td key={m} onClick={()=>togglePayment(m,i)}
                        style={{...styles.td,cursor:isAdmin?"pointer":"default",textAlign:"center",
                          padding:isMobile?"4px 2px":undefined,
                          background:payments[m][i]?"rgba(16,185,129,0.15)":"transparent",
                          transition:"all 0.2s"}}>
                        <span style={{fontSize:isMobile?12:14}}>{payments[m][i]?"✅":""}</span>
                      </td>
                    ))}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Invest Tab ─────────────────────────────────────────────────
const EMPTY_DEP = {name:"",startDate:"",endDate:"",amount:"",rate:"",maturityAmount:""};

function InvestTab({stocks, cashBalance, deposits, isAdmin, stockTotal, stockInvested, stockProfit, stockReturn, editingStock, setEditingStock, saveStockEdit, removeStock, showNewStock, setShowNewStock, newStock, setNewStock, addStock, saveStocks, saveDeposits}) {
  const [editingDepId, setEditingDepId] = useState(null);
  const [depForm, setDepForm] = useState(EMPTY_DEP);
  const [showNewDep, setShowNewDep] = useState(false);
  const [newDepForm, setNewDepForm] = useState(EMPTY_DEP);
  const [editCash, setEditCash] = useState(false);
  const [cashForm, setCashForm] = useState(cashBalance);
  const [lookupCode, setLookupCode] = useState("");
  const [lookupQty, setLookupQty] = useState("");
  const [lookupResult, setLookupResult] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");

  const handleLookup = async () => {
    if (!lookupCode.trim()) return;
    setLookupLoading(true); setLookupError(""); setLookupResult(null);
    try {
      const info = await fetchStockInfo(lookupCode.trim());
      setLookupResult(info);
      setNewStock({...newStock, code:lookupCode.trim(), name:info.name, price:info.price, qty:lookupQty});
    } catch {
      setLookupError("종목을 찾을 수 없습니다. 종목코드를 확인해주세요.");
    } finally { setLookupLoading(false); }
  };

  return (
    <div style={styles.contentWrap}>
      {/* Stock Summary */}
      <div style={styles.investHero}>
        <h3 style={styles.investTitle}>📈 주식 투자 현황</h3>
        <div style={styles.investRow}>
          <div style={styles.investStat}>
            <span style={styles.investLabel}>총 투자금</span>
            <span style={styles.investVal}>₩{fmt(stockInvested)}</span>
          </div>
          <div style={styles.investStat}>
            <span style={styles.investLabel}>총 평가금</span>
            <span style={{...styles.investVal,color:stockProfit>0?"#F87171":stockProfit<0?"#60A5FA":"rgba(255,255,255,0.9)"}}>₩{fmt(stockTotal)}</span>
          </div>
          <div style={styles.investStat}>
            <span style={styles.investLabel}>수익금</span>
            <span style={{...styles.investVal,color:stockProfit>0?"#F87171":stockProfit<0?"#60A5FA":"rgba(255,255,255,0.9)"}}>
              {stockProfit>0?"+":""}₩{fmt(stockProfit)}
            </span>
          </div>
          <div style={styles.investStat}>
            <span style={styles.investLabel}>수익률</span>
            <span style={{...styles.investVal,color:stockProfit>0?"#F87171":stockProfit<0?"#60A5FA":"rgba(255,255,255,0.9)"}}>{stockProfit>0?"+":""}{stockReturn}%</span>
          </div>
        </div>
      </div>

      {/* Stock Table */}
      <div style={styles.sectionCard}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:16}}>
          <h3 style={{...styles.sectionTitle,margin:0}}>보유 종목</h3>
          {isAdmin && <button style={styles.btnSmallPrimary} onClick={()=>setShowNewStock(!showNewStock)}>+ 종목 추가</button>}
        </div>

        {showNewStock && isAdmin && (
          <div style={styles.newStockForm}>
            <div style={{display:"flex",gap:6}}>
              <input placeholder="종목코드 (예: 005930)" value={lookupCode} onChange={e=>{setLookupCode(e.target.value);setLookupResult(null);setLookupError("");}} style={{...styles.inputSmall,flex:1}}
                onKeyDown={e=>e.key==="Enter"&&handleLookup()}/>
              <button style={styles.btnSmallPrimary} onClick={handleLookup} disabled={lookupLoading}>
                {lookupLoading ? "검색중..." : "검색"}
              </button>
            </div>
            {lookupError && <p style={{margin:0,fontSize:12,color:"#EF4444"}}>{lookupError}</p>}
            {lookupResult && (
              <>
                <div style={{padding:"8px 12px",borderRadius:8,background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.3)",fontSize:13}}>
                  <span style={{fontWeight:700,color:"#34D399"}}>{lookupResult.name}</span>
                  <span style={{color:"rgba(255,255,255,0.5)",marginLeft:8}}>현재가 ₩{fmt(lookupResult.price)}</span>
                </div>
                <input placeholder="수량" type="number" value={lookupQty} onChange={e=>{setLookupQty(e.target.value);setNewStock({...newStock,qty:e.target.value});}} style={styles.inputSmall}/>
                <button style={styles.btnSmallPrimary} onClick={()=>{
                  addStock();
                  setLookupCode(""); setLookupQty(""); setLookupResult(null); setLookupError("");
                }}>추가</button>
              </>
            )}
          </div>
        )}

        <div style={styles.stockCards}>
          {stocks.map(s=>(
            <div key={s.id} style={styles.stockCard}>
              {editingStock===s.id && isAdmin ? (
                <div style={styles.stockEditWrap}>
                  <input value={s.name} onChange={e=>saveStockEdit(s.id,"name",e.target.value)} style={styles.inputSmall} placeholder="종목명"/>
                  <input value={s.code} onChange={e=>saveStockEdit(s.id,"code",e.target.value)} style={styles.inputSmall} placeholder="코드"/>
                  <input type="number" value={s.price} onChange={e=>saveStockEdit(s.id,"price",e.target.value)} style={styles.inputSmall} placeholder="현재가"/>
                  <input type="number" value={s.qty} onChange={e=>saveStockEdit(s.id,"qty",e.target.value)} style={styles.inputSmall} placeholder="수량"/>
                  <div style={{display:"flex",gap:6}}>
                    <button style={styles.btnSmallPrimary} onClick={()=>setEditingStock(null)}>완료</button>
                    <button style={styles.btnSmallDanger} onClick={()=>removeStock(s.id)}>삭제</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={styles.stockCardHeader}>
                    <div>
                      <div style={styles.stockName}>{s.name}</div>
                      <div style={styles.stockCode}>{s.code}</div>
                    </div>
                    {isAdmin && <button style={styles.editBtn} onClick={()=>setEditingStock(s.id)}>✏️</button>}
                  </div>
                  <div style={styles.stockDetails}>
                    <div style={styles.stockDetailItem}>
                      <span style={styles.stockDetailLabel}>현재가</span>
                      <span style={styles.stockDetailVal}>₩{fmt(s.price)}</span>
                    </div>
                    <div style={styles.stockDetailItem}>
                      <span style={styles.stockDetailLabel}>보유수량</span>
                      <span style={styles.stockDetailVal}>{s.qty}주</span>
                    </div>
                    <div style={styles.stockDetailItem}>
                      <span style={styles.stockDetailLabel}>평가금</span>
                      <span style={{...styles.stockDetailVal,color:"#10B981",fontWeight:700}}>₩{fmt(s.price*s.qty)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
          {/* Cash */}
          <div style={styles.stockCard}>
            <div style={styles.stockCardHeader}>
              <div><div style={styles.stockName}>예수금</div></div>
              {isAdmin && !editCash && <button style={styles.editBtn} onClick={()=>{setEditCash(true);setCashForm(cashBalance);}}>✏️</button>}
            </div>
            {editCash && isAdmin ? (
              <div style={{display:"flex",gap:8,alignItems:"center",marginTop:8}}>
                <input type="number" value={cashForm} onChange={e=>setCashForm(Number(e.target.value)||0)} style={styles.inputSmall}/>
                <button style={styles.btnSmallPrimary} onClick={()=>{saveStocks(stocks,cashForm);setEditCash(false);}}>저장</button>
              </div>
            ) : (
              <div style={{...styles.stockDetailVal,color:"#10B981",fontWeight:700,marginTop:8,fontSize:18}}>₩{fmt(cashBalance)}</div>
            )}
          </div>
        </div>
        <p style={styles.disclaimer}>* 실시간 가격은 10분 주기로 업데이트되어 실제 총액과 약간의 차이가 있을 수 있음 · 포트폴리오 리밸런싱 2회</p>
      </div>

      {/* Deposit */}
      <div style={styles.sectionCard}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{...styles.sectionTitle,margin:0}}>🏦 예금 현황</h3>
          {isAdmin && <button style={styles.btnSmallPrimary} onClick={()=>setShowNewDep(!showNewDep)}>+ 예금 추가</button>}
        </div>

        {showNewDep && isAdmin && (
          <div style={{...styles.depositEditForm,marginBottom:16,padding:14,borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)"}}>
            <p style={{margin:"0 0 8px",fontSize:13,fontWeight:600,color:"rgba(255,255,255,0.6)"}}>새 예금 추가</p>
            <input placeholder="상품명" value={newDepForm.name} onChange={e=>setNewDepForm({...newDepForm,name:e.target.value})} style={styles.inputSmall}/>
            <input placeholder="신규일 (예: 26.01.27)" value={newDepForm.startDate} onChange={e=>setNewDepForm({...newDepForm,startDate:e.target.value})} style={styles.inputSmall}/>
            <input placeholder="만기일 (예: 27.01.27)" value={newDepForm.endDate} onChange={e=>setNewDepForm({...newDepForm,endDate:e.target.value})} style={styles.inputSmall}/>
            <input placeholder="예금액" type="number" value={newDepForm.amount} onChange={e=>setNewDepForm({...newDepForm,amount:e.target.value})} style={styles.inputSmall}/>
            <input placeholder="금리(%)" type="number" step="0.01" value={newDepForm.rate} onChange={e=>setNewDepForm({...newDepForm,rate:e.target.value})} style={styles.inputSmall}/>
            <input placeholder="만기예상금" type="number" value={newDepForm.maturityAmount} onChange={e=>setNewDepForm({...newDepForm,maturityAmount:e.target.value})} style={styles.inputSmall}/>
            <div style={{display:"flex",gap:8}}>
              <button style={styles.btnSmallPrimary} onClick={()=>{
                if(!newDepForm.name) return;
                saveDeposits([...deposits,{id:Date.now(),name:newDepForm.name,startDate:newDepForm.startDate,endDate:newDepForm.endDate,amount:Number(newDepForm.amount)||0,rate:Number(newDepForm.rate)||0,maturityAmount:Number(newDepForm.maturityAmount)||0}]);
                setNewDepForm(EMPTY_DEP); setShowNewDep(false);
              }}>추가</button>
              <button style={styles.btnSecondary} onClick={()=>{setShowNewDep(false);setNewDepForm(EMPTY_DEP);}}>취소</button>
            </div>
          </div>
        )}

        {deposits.map(dep=>(
          <div key={dep.id} style={{...styles.depositCard,marginBottom:12}}>
            {editingDepId===dep.id && isAdmin ? (
              <div style={styles.depositEditForm}>
                <input placeholder="상품명" value={depForm.name} onChange={e=>setDepForm({...depForm,name:e.target.value})} style={styles.inputSmall}/>
                <input placeholder="신규일" value={depForm.startDate} onChange={e=>setDepForm({...depForm,startDate:e.target.value})} style={styles.inputSmall}/>
                <input placeholder="만기일" value={depForm.endDate} onChange={e=>setDepForm({...depForm,endDate:e.target.value})} style={styles.inputSmall}/>
                <input placeholder="예금액" type="number" value={depForm.amount} onChange={e=>setDepForm({...depForm,amount:e.target.value})} style={styles.inputSmall}/>
                <input placeholder="금리(%)" type="number" step="0.01" value={depForm.rate} onChange={e=>setDepForm({...depForm,rate:e.target.value})} style={styles.inputSmall}/>
                <input placeholder="만기예상금" type="number" value={depForm.maturityAmount} onChange={e=>setDepForm({...depForm,maturityAmount:e.target.value})} style={styles.inputSmall}/>
                <div style={{display:"flex",gap:8}}>
                  <button style={styles.btnSmallPrimary} onClick={()=>{
                    saveDeposits(deposits.map(d=>d.id===dep.id?{...d,...depForm,amount:Number(depForm.amount)||0,rate:Number(depForm.rate)||0,maturityAmount:Number(depForm.maturityAmount)||0}:d));
                    setEditingDepId(null);
                  }}>저장</button>
                  <button style={styles.btnSecondary} onClick={()=>setEditingDepId(null)}>취소</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <div style={styles.depositName}>{dep.name}</div>
                  {isAdmin && (
                    <div style={{display:"flex",gap:6}}>
                      <button style={styles.editBtn} onClick={()=>{setEditingDepId(dep.id);setDepForm({...dep});}}>✏️</button>
                      <button style={{...styles.editBtn,color:"#EF4444"}} onClick={()=>saveDeposits(deposits.filter(d=>d.id!==dep.id))}>🗑️</button>
                    </div>
                  )}
                </div>
                <div style={styles.depositGrid}>
                  <div style={styles.depositItem}><span style={styles.depositLabel}>신규일</span><span>{dep.startDate}</span></div>
                  <div style={styles.depositItem}><span style={styles.depositLabel}>만기일</span><span>{dep.endDate}</span></div>
                  <div style={styles.depositItem}><span style={styles.depositLabel}>예금액</span><span>₩{fmt(dep.amount)}</span></div>
                  <div style={styles.depositItem}><span style={styles.depositLabel}>금리</span><span>{dep.rate}%</span></div>
                  <div style={styles.depositItem}><span style={styles.depositLabel}>만기예상금</span><span style={{color:"#10B981",fontWeight:700}}>₩{fmt(dep.maturityAmount)}</span></div>
                  <div style={styles.depositItem}><span style={styles.depositLabel}>예상수익</span><span style={{color:"#10B981"}}>₩{fmt(dep.maturityAmount-dep.amount)}</span></div>
                </div>
              </>
            )}
          </div>
        ))}
        {deposits.length===0 && <p style={{textAlign:"center",color:"rgba(255,255,255,0.3)",fontSize:13,padding:"20px 0"}}>등록된 예금이 없습니다</p>}
      </div>
    </div>
  );
}

// ─── Money Tab ──────────────────────────────────────────────────
const EMPTY_FORM = {title:"", category:"연금", content:"", link:""};

function MoneyTab({isAdmin}) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const CATEGORIES = ["연금","ETF"];
  const categoryColors = { "연금": "#6366F1", "ETF": "#10B981" };

  // Firestore 실시간 연동
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "moneyPosts"), (snap) => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      setPosts(data);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setImageFile(null);
    setImagePreview(null);
    setShowForm(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const addPost = async () => {
    if(!form.title.trim() || !form.content.trim()) return;
    setUploading(true);
    try {
      let imageUrl = "";
      if (imageFile) {
        const storageRef = ref(storage, `moneyPosts/${Date.now()}_${imageFile.name}`);
        await uploadBytes(storageRef, imageFile);
        imageUrl = await getDownloadURL(storageRef);
      }
      await addDoc(collection(db, "moneyPosts"), {
        ...form,
        imageUrl,
        createdAt: serverTimestamp(),
      });
      resetForm();
    } catch(e) { console.error(e); }
    finally { setUploading(false); }
  };

  const removePost = async (id) => {
    try { await deleteDoc(doc(db, "moneyPosts", id)); } catch(e) { console.error(e); }
  };

  return (
    <div style={styles.contentWrap}>
      {/* Header */}
      <div style={{...styles.sectionCard, background:"linear-gradient(135deg,rgba(99,102,241,0.12),rgba(139,92,246,0.08))", border:"1px solid rgba(99,102,241,0.2)", marginTop:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:12}}>
          <div>
            <h3 style={{...styles.sectionTitle, margin:0}}>💎 머니머니</h3>
            <p style={{fontSize:13,color:"rgba(255,255,255,0.45)",marginTop:6}}>연금, 재테크 등 유용한 금융 정보를 공유해요</p>
          </div>
          {isAdmin && (
            <button style={styles.btnSmallPrimary} onClick={()=>setShowForm(!showForm)}>
              {showForm ? "취소" : "+ 글 작성"}
            </button>
          )}
        </div>
      </div>

      {/* Write Form */}
      {showForm && isAdmin && (
        <div style={{...styles.sectionCard, marginTop:12}}>
          <h4 style={{fontSize:15,fontWeight:700,marginBottom:14,color:"rgba(255,255,255,0.8)"}}>새 글 작성</h4>
          <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}
            style={{...styles.selectInput, marginBottom:10, background:"#1a1a2e", color:"#fff"}}>
            {CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
          </select>
          <input placeholder="제목" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}
            style={{...styles.inputSmall, width:"100%", marginBottom:10}}/>
          <textarea placeholder="내용을 입력하세요..." value={form.content} onChange={e=>setForm({...form,content:e.target.value})}
            style={{...styles.inputSmall, width:"100%", minHeight:100, resize:"vertical", marginBottom:10}}/>
          <input placeholder="참고 링크 (선택)" value={form.link} onChange={e=>setForm({...form,link:e.target.value})}
            style={{...styles.inputSmall, width:"100%", marginBottom:10}}/>

          {/* 이미지 첨부 */}
          <div style={{marginBottom:14}}>
            <button style={{...styles.btnSecondary, fontSize:12}} onClick={()=>fileInputRef.current?.click()}>
              🖼️ 이미지 첨부 {imageFile ? `(${imageFile.name})` : "(선택)"}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} style={{display:"none"}}/>
            {imagePreview && (
              <div style={{marginTop:10, position:"relative", display:"inline-block"}}>
                <img src={imagePreview} alt="미리보기" style={{maxWidth:"100%", maxHeight:200, borderRadius:8, objectFit:"cover"}}/>
                <button onClick={()=>{setImageFile(null);setImagePreview(null);if(fileInputRef.current)fileInputRef.current.value="";}}
                  style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,0.6)",border:"none",color:"#fff",borderRadius:"50%",width:24,height:24,cursor:"pointer",fontSize:14}}>
                  ×
                </button>
              </div>
            )}
          </div>

          <div style={{display:"flex",gap:8}}>
            <button style={styles.btnSmallPrimary} onClick={addPost} disabled={uploading}>
              {uploading ? "업로드 중..." : "등록"}
            </button>
            <button style={styles.btnSecondary} onClick={resetForm}>취소</button>
          </div>
        </div>
      )}

      {/* Category filters */}
      <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:16}}>
        {CATEGORIES.map(c=>(
          <span key={c} style={{padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:600,cursor:"default",
            background:`${categoryColors[c]}22`, border:`1px solid ${categoryColors[c]}55`, color:categoryColors[c]}}>
            {c}
          </span>
        ))}
      </div>

      {/* Posts */}
      {loading ? (
        <div style={{...styles.sectionCard, textAlign:"center", padding:"40px 20px", marginTop:16}}>
          <p style={{color:"rgba(255,255,255,0.4)", fontSize:14}}>불러오는 중...</p>
        </div>
      ) : posts.length === 0 ? (
        <div style={{...styles.sectionCard, textAlign:"center", padding:"40px 20px", marginTop:16}}>
          <div style={{fontSize:48, marginBottom:12}}>💡</div>
          <p style={{color:"rgba(255,255,255,0.4)", fontSize:14}}>아직 공유된 정보가 없습니다</p>
          <p style={{color:"rgba(255,255,255,0.25)", fontSize:12, marginTop:6}}>연금, 재테크 정보를 함께 나눠봐요!</p>
        </div>
      ) : (
        posts.map(post => (
          <div key={post.id} style={{...styles.sectionCard, marginTop:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12,marginBottom:10}}>
              <div style={{flex:1}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                  <span style={{padding:"2px 10px",borderRadius:12,fontSize:11,fontWeight:700,
                    background:`${categoryColors[post.category]}22`, border:`1px solid ${categoryColors[post.category]}55`,
                    color:categoryColors[post.category]}}>
                    {post.category}
                  </span>
                  <span style={{fontSize:11,color:"rgba(255,255,255,0.3)"}}>
                    {post.createdAt?.toDate ? post.createdAt.toDate().toLocaleDateString("ko-KR") : ""}
                  </span>
                </div>
                <h4 style={{fontSize:15,fontWeight:700,color:"rgba(255,255,255,0.9)",marginBottom:8}}>{post.title}</h4>
              </div>
              {isAdmin && (
                <button style={{...styles.editBtn,color:"#EF4444",flexShrink:0}} onClick={()=>removePost(post.id)}>🗑️</button>
              )}
            </div>
            <p style={{fontSize:13,color:"rgba(255,255,255,0.6)",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{post.content}</p>
            {post.imageUrl && (
              <img src={post.imageUrl} alt="첨부 이미지"
                style={{marginTop:12, maxWidth:"100%", borderRadius:10, objectFit:"cover", maxHeight:400, display:"block"}}/>
            )}
            {post.link && (
              <a href={post.link} target="_blank" rel="noopener noreferrer"
                style={{display:"inline-block",marginTop:10,fontSize:12,color:"#6366F1",textDecoration:"underline"}}>
                🔗 참고 링크
              </a>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ─── Vote Tab ───────────────────────────────────────────────────
function VoteTab({candidates, votes, voterName, setVoterName, handleVote, isAdmin, addCandidate, newCandidate, setNewCandidate, removeCandidate, members, saveVotes}) {
  const voteCounts = {};
  candidates.forEach(c=>voteCounts[c.id]=0);
  Object.values(votes).forEach(id=>{if(voteCounts[id]!==undefined)voteCounts[id]++;});
  const totalVotes = Object.keys(votes).length;
  const maxVotes = Math.max(0,...Object.values(voteCounts));
  const myVote = votes[voterName.trim()];

  const resetVotes = () => {
    saveVotes(candidates, {});
  };

  return (
    <div style={styles.contentWrap}>
      <div style={styles.sectionCard}>
        <h3 style={styles.sectionTitle}>✈️ 여행지 투표 & 정보</h3>
        <p style={styles.voteSubtitle}>1인 1표, 가고 싶은 여행지에 투표해주세요!</p>

        {/* Voter select */}
        <div style={styles.voterSelect}>
          <label style={styles.voterLabel}>투표자 이름</label>
          <select value={voterName} onChange={e=>setVoterName(e.target.value)} style={styles.selectInput}>
            <option value="">이름을 선택하세요</option>
            {members.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
          {myVote && <span style={styles.votedBadge}>투표 완료 ✅</span>}
        </div>

        {/* Candidate cards */}
        <div style={styles.voteGrid}>
          {candidates.map(c=>{
            const count = voteCounts[c.id]||0;
            const pct = totalVotes>0?((count/totalVotes)*100).toFixed(0):0;
            const isWinning = count===maxVotes && count>0;
            const isMyVote = myVote===c.id;
            return (
              <div key={c.id} style={{...styles.voteCard, border:isMyVote?"2px solid #F59E0B":"2px solid rgba(255,255,255,0.06)", boxShadow:isWinning?"0 0 30px rgba(245,158,11,0.15)":"none"}}>
                {isWinning && <div style={styles.winBadge}>🏆 1위</div>}
                <div style={styles.voteEmoji}>{c.emoji}</div>
                <div style={styles.voteName}>{c.name}</div>
                <div style={styles.voteDesc}>{c.desc}</div>
                <div style={styles.voteBarOuter}>
                  <div style={{...styles.voteBarInner, width:`${pct}%`}}/>
                </div>
                <div style={styles.voteCount}>{count}표 ({pct}%)</div>
                {!myVote && voterName && (
                  <button style={styles.voteBtn} onClick={()=>handleVote(c.id)}>투표하기</button>
                )}
                {isMyVote && <div style={styles.myVoteMark}>내 투표 ✅</div>}
                {isAdmin && <button style={styles.removeCandBtn} onClick={()=>removeCandidate(c.id)}>삭제</button>}
              </div>
            );
          })}
        </div>

        {/* Vote status */}
        <div style={styles.voteStatus}>
          <span>총 {totalVotes}명 투표 완료</span>
          <span> · </span>
          <span>{members.length - totalVotes}명 미투표</span>
        </div>
        {totalVotes > 0 && (
          <div style={styles.voterList}>
            <strong>투표 현황: </strong>
            {Object.entries(votes).map(([name,id])=>{
              const c = candidates.find(x=>x.id===id);
              return <span key={name} style={styles.voterTag}>{name} → {c?.emoji} {c?.name}</span>;
            })}
          </div>
        )}
      </div>

      {/* Admin: add candidate */}
      {isAdmin && (
        <div style={styles.sectionCard}>
          <h3 style={styles.sectionTitle}>🛠 후보지 관리 (관리자)</h3>
          <div style={styles.addCandForm}>
            <input placeholder="이모지 (예: 🇯🇵)" value={newCandidate.emoji} onChange={e=>setNewCandidate({...newCandidate,emoji:e.target.value})} style={{...styles.inputSmall,width:80}}/>
            <input placeholder="여행지 이름" value={newCandidate.name} onChange={e=>setNewCandidate({...newCandidate,name:e.target.value})} style={styles.inputSmall}/>
            <input placeholder="설명" value={newCandidate.desc} onChange={e=>setNewCandidate({...newCandidate,desc:e.target.value})} style={{...styles.inputSmall,flex:1}}/>
            <button style={styles.btnSmallPrimary} onClick={addCandidate}>추가</button>
          </div>
          <button style={{...styles.btnSmallDanger,marginTop:12}} onClick={resetVotes}>투표 초기화</button>
        </div>
      )}
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────
const keyframes = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;900&family=Outfit:wght@300;400;500;600;700;800&display=swap');
@keyframes float { 0%,100%{transform:translateY(0) scale(1);opacity:0.08} 50%{transform:translateY(-30px) scale(1.1);opacity:0.15} }
@keyframes slideUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
@keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Noto Sans KR','Outfit',sans-serif; background:#0f0f1a; color:#E5E7EB; }
::-webkit-scrollbar { height:6px;width:6px; }
::-webkit-scrollbar-track { background:rgba(255,255,255,0.03); }
::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.15);border-radius:3px; }
input,select,button { font-family:inherit; }
`;

if (typeof document !== "undefined") {
  const id = "yangpa-styles";
  if (!document.getElementById(id)) {
    const s = document.createElement("style");
    s.id = id; s.textContent = keyframes;
    document.head.appendChild(s);
  }
}

const styles = {
  // Gate
  gateWrap: {minHeight:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(160deg,#0f0f1a 0%,#1a1025 50%,#0f1a1a 100%)",position:"relative",overflowY:"auto",overflowX:"hidden",padding:"20px 20px",boxSizing:"border-box"},
  gateBg: {position:"fixed",inset:0,overflow:"hidden",pointerEvents:"none"},
  floatingCircle: {position:"absolute",borderRadius:"50%",background:"radial-gradient(circle,rgba(245,158,11,0.3),transparent)",animation:"float 6s ease-in-out infinite"},
  gateCard: {position:"relative",textAlign:"center",padding:"32px 24px",borderRadius:24,background:"rgba(255,255,255,0.04)",backdropFilter:"blur(40px)",border:"1px solid rgba(255,255,255,0.08)",maxWidth:380,width:"100%",animation:"slideUp 0.6s ease-out",boxSizing:"border-box"},
  gateLogo: {fontSize:48,marginBottom:6,filter:"drop-shadow(0 0 20px rgba(245,158,11,0.3))"},
  gateTitle: {fontSize:24,fontWeight:800,background:"linear-gradient(135deg,#F59E0B,#FBBF24,#F59E0B)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:-0.5},
  gateSubtitle: {fontSize:13,color:"rgba(255,255,255,0.5)",marginTop:4,letterSpacing:2},
  gateInputWrap: {marginTop:24},
  pinDots: {display:"flex",justifyContent:"center",gap:12,marginBottom:16},
  pinDot: {width:14,height:14,borderRadius:"50%",transition:"all 0.3s cubic-bezier(0.4,0,0.2,1)"},
  gateInput: {width:"100%",padding:"14px 16px",borderRadius:12,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",color:"#fff",fontSize:18,textAlign:"center",letterSpacing:12,outline:"none",transition:"border-color 0.3s"},
  gateError: {color:"#EF4444",fontSize:13,marginTop:8,animation:"pulse 0.5s"},
  gateHint: {fontSize:13,color:"rgba(255,255,255,0.35)",marginTop:20},

  // App
  appWrap: {minHeight:"100vh",background:"linear-gradient(180deg,#0f0f1a,#111122)",fontFamily:"'Noto Sans KR','Outfit',sans-serif"},

  // Header
  header: {background:"rgba(15,15,26,0.85)",backdropFilter:"blur(20px)",borderBottom:"1px solid rgba(255,255,255,0.06)",position:"sticky",top:0,zIndex:100},
  headerInner: {maxWidth:1200,margin:"0 auto",padding:"12px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12},
  headerLeft: {display:"flex",alignItems:"center",gap:12},
  headerLogo: {fontSize:32,filter:"drop-shadow(0 0 8px rgba(245,158,11,0.3))"},
  headerTitle: {fontSize:18,fontWeight:800,background:"linear-gradient(135deg,#F59E0B,#FBBF24)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"},
  headerSub: {fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:1},
  headerRight: {display:"flex",alignItems:"center",gap:8},
  loginBtn: {padding:"8px 16px",borderRadius:10,border:"1px solid rgba(245,158,11,0.3)",background:"rgba(245,158,11,0.08)",color:"#F59E0B",fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.2s"},
  adminBadge: {padding:"8px 16px",borderRadius:10,border:"1px solid rgba(245,158,11,0.4)",background:"linear-gradient(135deg,rgba(245,158,11,0.15),rgba(245,158,11,0.05))",color:"#FBBF24",fontSize:13,fontWeight:600,cursor:"pointer"},

  // Tabs
  tabBar: {background:"rgba(15,15,26,0.6)",backdropFilter:"blur(10px)",borderBottom:"1px solid rgba(255,255,255,0.04)",position:"sticky",top:56,zIndex:99,overflowX:"auto"},
  tabBarInner: {maxWidth:1200,margin:"0 auto",display:"flex",padding:"0 12px"},
  tabBtn: {flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"12px 8px",border:"none",background:"transparent",color:"rgba(255,255,255,0.4)",fontSize:11,fontWeight:500,cursor:"pointer",borderBottom:"2px solid transparent",transition:"all 0.2s",minWidth:70},
  tabBtnActive: {color:"#F59E0B",borderBottomColor:"#F59E0B"},
  tabIcon: {fontSize:20},
  tabLabel: {fontSize:12,fontWeight:600},

  // Main
  main: {maxWidth:1200,margin:"0 auto",padding:"0 12px 40px"},
  contentWrap: {animation:"slideUp 0.4s ease-out"},

  // Hero
  heroCard: {position:"relative",padding:"24px 20px 20px",borderRadius:20,background:"linear-gradient(135deg,rgba(245,158,11,0.12),rgba(99,102,241,0.08))",border:"1px solid rgba(245,158,11,0.15)",marginTop:20,overflow:"hidden"},
  heroGlow: {position:"absolute",top:-60,right:-60,width:200,height:200,borderRadius:"50%",background:"radial-gradient(circle,rgba(245,158,11,0.15),transparent)",pointerEvents:"none"},
  heroTitle: {fontSize:16,color:"rgba(255,255,255,0.6)",fontWeight:500,marginBottom:8},
  heroAmount: {fontSize:36,fontWeight:900,background:"linear-gradient(135deg,#FBBF24,#F59E0B,#D97706)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",letterSpacing:-1},
  heroSub: {fontSize:13,color:"rgba(255,255,255,0.45)",marginTop:8},
  progressBarOuter: {marginTop:20,height:24,borderRadius:12,background:"rgba(255,255,255,0.06)",overflow:"hidden"},
  progressBarInner: {height:"100%",borderRadius:12,background:"linear-gradient(90deg,#F59E0B,#FBBF24,#F59E0B)",backgroundSize:"200% 100%",animation:"shimmer 3s linear infinite",display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:10,minWidth:50,transition:"width 0.6s ease"},
  progressText: {fontSize:11,fontWeight:700,color:"#0f0f1a"},
  progressLabel: {fontSize:12,color:"rgba(255,255,255,0.4)",marginTop:8},

  // Cards
  cardGrid: {display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:12,marginTop:16},
  summaryCard: {padding:20,borderRadius:16,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",textAlign:"center"},
  cardIcon: {width:44,height:44,borderRadius:12,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,margin:"0 auto 10px"},
  cardLabel: {fontSize:12,color:"rgba(255,255,255,0.45)",marginBottom:4},
  cardValue: {fontSize:18,fontWeight:700,color:"#F5F5F5"},

  // Section
  sectionCard: {padding:"24px 20px",borderRadius:20,background:"rgba(255,255,255,0.025)",border:"1px solid rgba(255,255,255,0.06)",marginTop:16},
  sectionTitle: {fontSize:18,fontWeight:700,marginBottom:16,display:"flex",alignItems:"center",gap:8},

  // Member grid
  memberGrid: {display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:10},
  memberItem: {padding:12,borderRadius:12,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.05)",textAlign:"center"},
  memberAvatar: {width:36,height:36,borderRadius:"50%",background:"linear-gradient(135deg,#F59E0B,#D97706)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 6px",fontSize:14,fontWeight:700,color:"#0f0f1a"},
  memberName: {fontSize:13,fontWeight:600,marginBottom:4},
  memberMiniBar: {height:4,borderRadius:2,background:"rgba(255,255,255,0.08)",overflow:"hidden",marginBottom:4},
  memberMiniBarFill: {height:"100%",borderRadius:2,background:"linear-gradient(90deg,#10B981,#34D399)",transition:"width 0.4s ease"},
  memberCount: {fontSize:11,color:"rgba(255,255,255,0.4)"},

  // Info
  infoGrid: {display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:8},
  infoItem: {display:"flex",justifyContent:"space-between",padding:"10px 14px",borderRadius:10,background:"rgba(255,255,255,0.03)",fontSize:13},
  infoLabel: {color:"rgba(255,255,255,0.45)",fontWeight:500},
  infoValue: {fontWeight:600,color:"#F5F5F5",textAlign:"right"},

  // Table
  editHint: {fontSize:12,color:"#F59E0B",fontWeight:500,opacity:0.8},
  memberSelector: {marginBottom:12},
  selectInput: {width:"100%",padding:"10px 14px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",color:"#fff",fontSize:14,outline:"none"},
  tableWrap: {overflowX:"auto",borderRadius:12,border:"1px solid rgba(255,255,255,0.06)"},
  table: {width:"100%",borderCollapse:"collapse",fontSize:12},
  th: {padding:"10px 6px",textAlign:"center",background:"rgba(245,158,11,0.08)",color:"#FBBF24",fontWeight:600,fontSize:11,borderBottom:"1px solid rgba(255,255,255,0.06)",whiteSpace:"nowrap"},
  td: {padding:"8px 6px",borderBottom:"1px solid rgba(255,255,255,0.03)",fontSize:12,color:"#E5E7EB"},

  // Member detail
  memberDetail: {},
  memberDetailHeader: {display:"flex",alignItems:"center",gap:12,marginBottom:16},
  memberDetailAvatar: {width:48,height:48,borderRadius:"50%",background:"linear-gradient(135deg,#F59E0B,#D97706)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:800,color:"#0f0f1a"},
  memberDetailName: {fontSize:20,fontWeight:700},
  memberDetailSub: {fontSize:13,color:"rgba(255,255,255,0.45)"},
  roundGrid: {display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:8},
  roundCell: {padding:"10px 8px",borderRadius:10,textAlign:"center",transition:"all 0.2s"},
  roundLabel: {fontSize:11,color:"rgba(255,255,255,0.5)",marginBottom:2},
  roundNum: {fontSize:10,color:"rgba(255,255,255,0.3)",marginTop:2},

  // Invest
  investHero: {padding:"28px 24px",borderRadius:20,background:"linear-gradient(135deg,rgba(16,185,129,0.1),rgba(99,102,241,0.06))",border:"1px solid rgba(16,185,129,0.12)",marginTop:20},
  investTitle: {fontSize:18,fontWeight:700,marginBottom:16},
  investRow: {display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12},
  investStat: {display:"flex",flexDirection:"column",gap:4},
  investLabel: {fontSize:12,color:"rgba(255,255,255,0.4)"},
  investVal: {fontSize:20,fontWeight:800},

  stockCards: {display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:12},
  stockCard: {padding:16,borderRadius:14,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",transition:"all 0.2s"},
  stockCardHeader: {display:"flex",justifyContent:"space-between",alignItems:"flex-start"},
  stockName: {fontSize:15,fontWeight:700},
  stockCode: {fontSize:11,color:"rgba(255,255,255,0.35)",marginTop:2},
  stockDetails: {marginTop:12,display:"flex",flexDirection:"column",gap:6},
  stockDetailItem: {display:"flex",justifyContent:"space-between",fontSize:13},
  stockDetailLabel: {color:"rgba(255,255,255,0.4)"},
  stockDetailVal: {fontWeight:600},
  stockEditWrap: {display:"flex",flexDirection:"column",gap:8},
  editBtn: {background:"none",border:"none",fontSize:16,cursor:"pointer",padding:4,opacity:0.6},
  disclaimer: {fontSize:11,color:"rgba(255,255,255,0.3)",marginTop:16,textAlign:"center"},

  // Deposit
  depositCard: {padding:20,borderRadius:14,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)"},
  depositName: {fontSize:16,fontWeight:700,marginBottom:12},
  depositGrid: {display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8},
  depositItem: {display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,0.04)",fontSize:13},
  depositLabel: {color:"rgba(255,255,255,0.4)"},
  depositEditForm: {display:"flex",flexDirection:"column",gap:8},

  // Vote
  voteSubtitle: {fontSize:14,color:"rgba(255,255,255,0.45)",marginBottom:20,marginTop:-8},
  voterSelect: {display:"flex",alignItems:"center",gap:12,marginBottom:20,flexWrap:"wrap"},
  voterLabel: {fontSize:13,fontWeight:600,whiteSpace:"nowrap"},
  votedBadge: {fontSize:13,color:"#10B981",fontWeight:600},
  voteGrid: {display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14},
  voteCard: {padding:20,borderRadius:16,background:"rgba(255,255,255,0.03)",textAlign:"center",position:"relative",transition:"all 0.3s"},
  winBadge: {position:"absolute",top:10,right:10,fontSize:12,fontWeight:700,color:"#FBBF24"},
  voteEmoji: {fontSize:42,marginBottom:8},
  voteName: {fontSize:17,fontWeight:700,marginBottom:4},
  voteDesc: {fontSize:12,color:"rgba(255,255,255,0.4)",marginBottom:14},
  voteBarOuter: {height:8,borderRadius:4,background:"rgba(255,255,255,0.06)",overflow:"hidden",marginBottom:6},
  voteBarInner: {height:"100%",borderRadius:4,background:"linear-gradient(90deg,#F59E0B,#FBBF24)",transition:"width 0.5s ease",minWidth:0},
  voteCount: {fontSize:13,fontWeight:600,color:"rgba(255,255,255,0.6)",marginBottom:10},
  voteBtn: {padding:"10px 24px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#F59E0B,#D97706)",color:"#0f0f1a",fontWeight:700,fontSize:14,cursor:"pointer",transition:"all 0.2s"},
  myVoteMark: {fontSize:13,color:"#10B981",fontWeight:600,marginTop:4},
  removeCandBtn: {marginTop:8,padding:"4px 10px",borderRadius:6,border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.1)",color:"#EF4444",fontSize:11,cursor:"pointer"},
  voteStatus: {textAlign:"center",marginTop:20,fontSize:13,color:"rgba(255,255,255,0.4)"},
  voterList: {marginTop:12,padding:14,borderRadius:10,background:"rgba(255,255,255,0.03)",fontSize:12,lineHeight:2.2,display:"flex",flexWrap:"wrap",alignItems:"center",gap:4},
  voterTag: {display:"inline-block",padding:"3px 10px",borderRadius:20,background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.15)",fontSize:12,color:"#FBBF24",marginRight:4},

  addCandForm: {display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"},
  newStockForm: {display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:16,padding:12,borderRadius:10,background:"rgba(255,255,255,0.03)"},

  // Forms
  inputSmall: {padding:"8px 12px",borderRadius:8,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",color:"#fff",fontSize:13,outline:"none",minWidth:80},
  btnPrimary: {padding:"10px 24px",borderRadius:10,border:"none",background:"linear-gradient(135deg,#F59E0B,#D97706)",color:"#0f0f1a",fontWeight:700,fontSize:14,cursor:"pointer"},
  btnSecondary: {padding:"10px 24px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",color:"#E5E7EB",fontWeight:600,fontSize:14,cursor:"pointer"},
  btnSmallPrimary: {padding:"6px 14px",borderRadius:8,border:"none",background:"linear-gradient(135deg,#F59E0B,#D97706)",color:"#0f0f1a",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"},
  btnSmallDanger: {padding:"6px 14px",borderRadius:8,border:"1px solid rgba(239,68,68,0.3)",background:"rgba(239,68,68,0.1)",color:"#EF4444",fontWeight:600,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"},

  // Modal
  modalOverlay: {position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20},
  modalCard: {background:"#1a1a2e",borderRadius:20,padding:"32px 28px",maxWidth:360,width:"100%",border:"1px solid rgba(255,255,255,0.08)"},
  modalTitle: {fontSize:20,fontWeight:700,marginBottom:20,textAlign:"center"},
  modalInput: {width:"100%",padding:"12px 16px",borderRadius:10,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.05)",color:"#fff",fontSize:14,outline:"none",marginBottom:10},
  errorText: {fontSize:12,color:"#EF4444",marginTop:-4,marginBottom:4},

  // Footer
  footer: {textAlign:"center",padding:"24px 20px",borderTop:"1px solid rgba(255,255,255,0.04)",fontSize:12,color:"rgba(255,255,255,0.25)"},
};
