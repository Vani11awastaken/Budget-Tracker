import { useState, useEffect } from "react";
import { id, tx } from "@instantdb/react";
import { db } from "./db";

const DEFAULT_FIXED = [
  { id: "insurance", name: "Car Insurance", monthlyAmount: 0 },
  { id: "phone",     name: "Phone Bill",    monthlyAmount: 0 },
  { id: "amazon",    name: "Amazon Prime",  monthlyAmount: 0 },
  { id: "claude",    name: "Claude Pro",    monthlyAmount: 0 },
  { id: "gas",       name: "Gas",           monthlyAmount: 0 },
  { id: "giving",    name: "Giving",        monthlyAmount: 0 },
];
const DEFAULT_CATS = [
  { id: "food",    name: "Food",        weeklyLimit: 0, monthlyLimit: 0 },
  { id: "repairs", name: "Car Repairs", weeklyLimit: 0, monthlyLimit: 0 },
  { id: "misc",    name: "Misc",        weeklyLimit: 0, monthlyLimit: 0 },
];
const INCOME_TYPES = ["Sale", "Stock", "Other"];

const T  = "#0e7490";
const T2 = "#0e749022";
const T3 = "#0e749055";
const T4 = "#0e749015";
const T5 = "#0e749033";

const fmt   = n => Number(n).toFixed(2);
const toNum = s => parseFloat(s) || 0;
const toStr = n => n > 0 ? String(n) : "";
const uid   = () => Date.now().toString() + Math.random().toString(36).slice(2);

function getWeekStart() {
  const s = new Date(); const day = s.getDay();
  s.setDate(s.getDate() + (day === 0 ? -6 : 1 - day)); s.setHours(0,0,0,0); return s;
}
function getLastWeekStart() { const s = getWeekStart(); s.setDate(s.getDate()-7); return s; }
function getMonthStart()    { const n=new Date(); return new Date(n.getFullYear(),n.getMonth(),1); }
function getLastMonthStart(){ const n=new Date(); return new Date(n.getFullYear(),n.getMonth()-1,1); }
function getLastMonthEnd()  { return getMonthStart(); }
function barColor(pct)      { return pct>=1?"#ef4444":pct>=0.75?"#f59e0b":"#22c55e"; }

// ============ AUTH GATE ============
export default function App() {
  const { isLoading, user, error } = db.useAuth();

  useEffect(() => { document.body.style.background="#0f0f13"; return ()=>{document.body.style.background=""}; },[]);

  if (isLoading) return <CenterMsg text="Loading..." />;
  if (error)     return <CenterMsg text={"Error: " + error.message} />;
  if (!user)     return <Login />;
  return <Tracker user={user} />;
}

function CenterMsg({ text }) {
  return (
    <div style={{background:"#0f0f13",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#666",fontFamily:"system-ui"}}>
      {text}
    </div>
  );
}

function Login() {
  const [email, setEmail]       = useState("");
  const [sentEmail, setSentEmail] = useState("");
  const [code, setCode]         = useState("");
  const [err, setErr]           = useState("");
  const [busy, setBusy]         = useState(false);

  const inp = {width:"100%",background:"#0a0a10",border:"1px solid #2a2a3a",borderRadius:10,color:"#fff",padding:"12px 14px",fontSize:15,boxSizing:"border-box",outline:"none",marginBottom:12};
  const btn = {width:"100%",background:"#0e7490",border:"none",borderRadius:12,color:"#fff",padding:"13px 0",fontSize:15,fontWeight:700,cursor:"pointer",opacity:busy?0.6:1};

  async function sendCode(e) {
    e.preventDefault();
    if (!email) return;
    setBusy(true); setErr("");
    try {
      await db.auth.sendMagicCode({ email });
      setSentEmail(email);
    } catch (e) {
      setErr(e.body?.message || e.message || "Failed to send code");
    }
    setBusy(false);
  }

  async function verify(e) {
    e.preventDefault();
    if (!code) return;
    setBusy(true); setErr("");
    try {
      await db.auth.signInWithMagicCode({ email: sentEmail, code });
    } catch (e) {
      setErr(e.body?.message || e.message || "Invalid code");
    }
    setBusy(false);
  }

  return (
    <div style={{fontFamily:"system-ui",background:"#0f0f13",minHeight:"100vh",color:"#e5e5e5",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#1a1a24",borderRadius:16,padding:24,border:"1px solid #22223a",width:"100%",maxWidth:380}}>
        <h1 style={{margin:"0 0 6px",fontSize:22,fontWeight:800,color:"#fff"}}>Budget Tracker</h1>
        <p style={{margin:"0 0 20px",fontSize:13,color:"#888"}}>
          {sentEmail ? `Enter the code sent to ${sentEmail}` : "Sign in with your email"}
        </p>
        {!sentEmail ? (
          <form onSubmit={sendCode}>
            <input style={inp} type="email" placeholder="you@example.com" value={email}
              onChange={e=>setEmail(e.target.value)} autoFocus />
            <button style={btn} type="submit" disabled={busy}>{busy?"Sending…":"Send Code"}</button>
          </form>
        ) : (
          <form onSubmit={verify}>
            <input style={inp} inputMode="numeric" placeholder="6-digit code" value={code}
              onChange={e=>setCode(e.target.value)} autoFocus />
            <button style={btn} type="submit" disabled={busy}>{busy?"Verifying…":"Verify"}</button>
            <button type="button" onClick={()=>{setSentEmail("");setCode("");setErr("");}}
              style={{...btn,background:"transparent",border:"1px solid #2a2a3a",marginTop:8}}>
              Use a different email
            </button>
          </form>
        )}
        {err && <p style={{color:"#ef4444",fontSize:13,marginTop:12}}>{err}</p>}
      </div>
    </div>
  );
}

// ============ TRACKER (your app) ============
function Tracker({ user }) {
  const { isLoading, error, data } = db.useQuery({
    settings:     { $: { where: { owner: user.id } } },
    transactions: { $: { where: { owner: user.id } } },
  });

  const [view,        setView]        = useState("weekly");
  const [panel,       setPanel]       = useState(null);
  const [delConfirm,  setDelConfirm]  = useState(null);
  const [draft,       setDraft]       = useState(null);
  const [incomeForm,  setIncomeForm]  = useState({ type: "Sale", amount: "", note: "" });
  const [expenseForm, setExpenseForm] = useState({ categoryId: "food", amount: "", note: "" });
  const [saving,      setSaving]      = useState(false);

  const settingsRow = data?.settings?.[0];
  const fixed        = settingsRow?.fixed        ?? DEFAULT_FIXED;
  const fixedIncome  = settingsRow?.fixedIncome  ?? 0;
  const bankBalance  = settingsRow?.bankBalance  ?? 0;
  const stockBalance = settingsRow?.stockBalance ?? 0;
  const cats         = settingsRow?.cats         ?? DEFAULT_CATS;
  const txs          = data?.transactions ?? [];

  useEffect(() => {
    if (!data || settingsRow) return;
    db.transact(tx.settings[id()].update({
      owner: user.id,
      fixed: DEFAULT_FIXED,
      fixedIncome: 0,
      bankBalance: 0,
      stockBalance: 0,
      cats: DEFAULT_CATS,
    }));
  }, [data, settingsRow, user.id]);

  async function saveSettings(nF, nFI, nBB, nSB, nC) {
    if (!settingsRow) return;
    await db.transact(tx.settings[settingsRow.id].update({
      fixed: nF, fixedIncome: nFI, bankBalance: nBB, stockBalance: nSB, cats: nC,
    }));
  }

  function openSettings() {
    setDraft({
      fixedIncome:  toStr(fixedIncome),
      bankBalance:  toStr(bankBalance),
      stockBalance: toStr(stockBalance),
      fixed: fixed.map(f=>({...f, monthlyAmount:toStr(f.monthlyAmount)})),
      cats:  cats.map(c=>({...c, weeklyLimit:toStr(c.weeklyLimit), monthlyLimit:toStr(c.monthlyLimit)})),
    });
    setPanel("settings_fixed");
  }

  async function commitSettings() {
    if(!draft)return; setSaving(true);
    const nF = draft.fixed.filter(f=>f.name.trim()).map(f=>({...f,monthlyAmount:toNum(f.monthlyAmount)}));
    const nC = draft.cats.filter(c=>c.name.trim()).map(c=>({...c,weeklyLimit:toNum(c.weeklyLimit),monthlyLimit:toNum(c.monthlyLimit)}));
    await saveSettings(nF,toNum(draft.fixedIncome),toNum(draft.bankBalance),toNum(draft.stockBalance),nC);
    setSaving(false); setPanel(null);
  }

  const updFixed = (i,field,val) => setDraft(d=>({...d,fixed:d.fixed.map((f,idx)=>idx===i?{...f,[field]:val}:f)}));
  const delFixed = i => setDraft(d=>({...d,fixed:d.fixed.filter((_,idx)=>idx!==i)}));
  const addFixed = () => setDraft(d=>({...d,fixed:[...d.fixed,{id:uid(),name:"",monthlyAmount:""}]}));
  const updCat   = (i,field,val) => setDraft(d=>({...d,cats:d.cats.map((c,idx)=>idx===i?{...c,[field]:val}:c)}));
  const delCat   = i => setDraft(d=>({...d,cats:d.cats.filter((_,idx)=>idx!==i)}));
  const addCat   = () => setDraft(d=>({...d,cats:[...d.cats,{id:uid(),name:"",weeklyLimit:"",monthlyLimit:""}]}));

  async function addTx(payload) {
    await db.transact(tx.transactions[id()].update({ ...payload, owner: user.id }));
  }
  async function deleteTx(txId) {
    setDelConfirm(null);
    await db.transact(tx.transactions[txId].delete());
  }
  function addIncome() {
    const amt=toNum(incomeForm.amount);if(!amt)return;
    addTx({kind:"income",type:incomeForm.type,amount:amt,note:incomeForm.note.trim(),date:new Date().toISOString()});
    setIncomeForm({type:"Sale",amount:"",note:""});setPanel(null);
  }
  function addExpense() {
    const amt=toNum(expenseForm.amount);if(!amt)return;
    addTx({kind:"expense",categoryId:expenseForm.categoryId,amount:amt,note:expenseForm.note.trim(),date:new Date().toISOString()});
    setExpenseForm({...expenseForm,amount:"",note:""});setPanel(null);
  }

  const start=view==="weekly"?getWeekStart():getMonthStart();
  const periodTxs=txs.filter(t=>new Date(t.date)>=start);
  const incomeTxs=periodTxs.filter(t=>t.kind==="income");
  const expenseTxs=periodTxs.filter(t=>t.kind==="expense");
  const fixedIncomePer=view==="weekly"?fixedIncome:fixedIncome*4.33;
  const totalIncome=fixedIncomePer+incomeTxs.reduce((s,t)=>s+t.amount,0);
  const totalFixed=fixed.reduce((s,f)=>s+f.monthlyAmount,0);
  const totalFixedPer=view==="weekly"?totalFixed/4.33:totalFixed;
  const totalVariable=expenseTxs.reduce((s,t)=>s+t.amount,0);
  const totalSaved=totalIncome-totalFixedPer-totalVariable;
  const spentFor=cid=>expenseTxs.filter(t=>t.categoryId===cid).reduce((s,t)=>s+t.amount,0);
  const prevStart=view==="weekly"?getLastWeekStart():getLastMonthStart();
  const prevEnd=view==="weekly"?getWeekStart():getLastMonthEnd();
  const prevTxs=txs.filter(t=>{const d=new Date(t.date);return d>=prevStart&&d<prevEnd;});
  const prevIncome=fixedIncomePer+prevTxs.filter(t=>t.kind==="income").reduce((s,t)=>s+t.amount,0);
  const prevSaved=prevTxs.length===0?0:prevIncome-totalFixedPer-prevTxs.filter(t=>t.kind==="expense").reduce((s,t)=>s+t.amount,0);
  const savedDiff=totalSaved-prevSaved;

  const card   ={background:"#1a1a24",borderRadius:16,padding:16,border:"1px solid #22223a",marginBottom:12};
  const inp    ={width:"100%",background:"#0a0a10",border:"1px solid #2a2a3a",borderRadius:10,color:"#fff",padding:"11px 14px",fontSize:15,boxSizing:"border-box",outline:"none"};
  const lbl    ={fontSize:11,color:"#888",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:6,display:"block"};
  const pill   =a=>({flex:1,padding:"9px 0",borderRadius:8,border:"none",cursor:"pointer",background:a?T:"transparent",color:a?"#fff":"#555",fontWeight:600,fontSize:14,transition:"all 0.15s"});
  const ghost  =a=>({background:a?T:"#1a1a24",border:`1px solid ${a?T:"#2a2a3a"}`,borderRadius:8,color:a?"#fff":"#666",padding:"7px 13px",cursor:"pointer",fontSize:13,fontWeight:600});
  const primBtn=c=>({width:"100%",background:c||T,border:"none",borderRadius:12,color:"#fff",padding:"13px 0",fontSize:15,fontWeight:700,cursor:"pointer"});
  const addBtn ={background:T2,border:`1px dashed ${T3}`,borderRadius:10,color:T,padding:"9px 0",fontSize:13,fontWeight:700,cursor:"pointer",width:"100%",marginTop:4};
  const delBtn ={background:"none",border:"1px solid #2a2a3a",borderRadius:8,color:"#555",cursor:"pointer",padding:"0 11px",fontSize:18,flexShrink:0,alignSelf:"stretch",display:"flex",alignItems:"center"};
  const grid   ={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:12,marginBottom:12};
  const cardInGrid = {...card, marginBottom:0};

  const mainPanels=["settings_fixed","settings_limits","log"];
  const sheetPanels=["log_income","log_expense"];
  const inSettings=["settings_fixed","settings_limits"].includes(panel);

  if (isLoading) return <CenterMsg text="Loading your data..." />;
  if (error)     return <CenterMsg text={"Error: " + error.message} />;

  return (
    <div style={{fontFamily:"system-ui,-apple-system,sans-serif",background:"#0f0f13",minHeight:"100vh",color:"#e5e5e5",padding:"20px 16px 110px",maxWidth:1100,margin:"0 auto"}}>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
        <h1 style={{margin:0,fontSize:19,fontWeight:800,color:"#fff",letterSpacing:"-0.5px"}}>Budget Tracker</h1>
        <div style={{display:"flex",gap:7}}>
          <button style={ghost(panel==="log")} onClick={()=>setPanel(panel==="log"?null:"log")}>Log</button>
          <button style={ghost(inSettings)} onClick={()=>inSettings?setPanel(null):openSettings()}>⚙</button>
          <button style={ghost(false)} onClick={()=>db.auth.signOut()}>⎋</button>
        </div>
      </div>

      {!mainPanels.includes(panel)&&(
        <div style={{display:"flex",background:"#1a1a24",borderRadius:11,padding:4,marginBottom:18}}>
          {["weekly","monthly"].map(v=>(
            <button key={v} onClick={()=>setView(v)} style={pill(view===v)}>{v[0].toUpperCase()+v.slice(1)}</button>
          ))}
        </div>
      )}

      {panel==="settings_fixed"&&draft&&(
        <div style={card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <span style={{fontWeight:700,fontSize:15}}>Fixed Costs & Income</span>
            <button onClick={()=>setPanel("settings_limits")} style={{background:"none",border:"none",color:T,cursor:"pointer",fontSize:13,fontWeight:600}}>Limits →</button>
          </div>
          <div style={{marginBottom:14,paddingBottom:14,borderBottom:"1px solid #1e1e2e"}}>
            <span style={{fontSize:11,color:"#22c55e",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",display:"block",marginBottom:10}}>Fixed Income</span>
            <span style={lbl}>Weekly Paycheck ($)</span>
            <input inputMode="decimal" placeholder="0.00" value={draft.fixedIncome} style={inp}
              onChange={e=>setDraft(d=>({...d,fixedIncome:e.target.value}))} />
          </div>
          <div style={{marginBottom:14,paddingBottom:14,borderBottom:"1px solid #1e1e2e"}}>
            <span style={{fontSize:11,color:T,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",display:"block",marginBottom:10}}>Balances</span>
            <span style={lbl}>Checking ($)</span>
            <input inputMode="decimal" placeholder="0.00" value={draft.bankBalance} style={{...inp,marginBottom:10}}
              onChange={e=>setDraft(d=>({...d,bankBalance:e.target.value}))} />
            <span style={lbl}>Stocks ($)</span>
            <input inputMode="decimal" placeholder="0.00" value={draft.stockBalance} style={inp}
              onChange={e=>setDraft(d=>({...d,stockBalance:e.target.value}))} />
          </div>
          <span style={{fontSize:11,color:"#f87171",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.07em",display:"block",marginBottom:10}}>Fixed Costs</span>
          {draft.fixed.map((f,i)=>(
            <div key={f.id} style={{marginBottom:12}}>
              <div style={{display:"flex",gap:8,marginBottom:6}}>
                <input placeholder="Name" value={f.name} style={{...inp,flex:1}}
                  onChange={e=>updFixed(i,"name",e.target.value)} />
                <button onClick={()=>delFixed(i)} style={delBtn}>×</button>
              </div>
              <input inputMode="decimal" placeholder="0.00 / mo" value={f.monthlyAmount} style={inp}
                onChange={e=>updFixed(i,"monthlyAmount",e.target.value)} />
            </div>
          ))}
          <button onClick={addFixed} style={addBtn}>+ Add Fixed Cost</button>
          <div style={{marginTop:14}}>
            <button onClick={commitSettings} disabled={saving} style={{...primBtn(),opacity:saving?0.6:1}}>
              {saving?"Saving…":"Save"}
            </button>
          </div>
        </div>
      )}

      {panel==="settings_limits"&&draft&&(
        <div style={card}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
            <button onClick={()=>setPanel("settings_fixed")} style={{background:"none",border:"none",color:T,cursor:"pointer",fontSize:13,fontWeight:600}}>← Back</button>
            <span style={{fontWeight:700,fontSize:15}}>Spending Categories</span>
          </div>
          {draft.cats.map((c,i)=>(
            <div key={c.id} style={{marginBottom:14,paddingBottom:14,borderBottom:"1px solid #1e1e2e"}}>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <input placeholder="Category name" value={c.name} style={{...inp,flex:1}}
                  onChange={e=>updCat(i,"name",e.target.value)} />
                <button onClick={()=>delCat(i)} style={delBtn}>×</button>
              </div>
              <div style={{display:"flex",gap:10}}>
                {[["weeklyLimit","Weekly"],["monthlyLimit","Monthly"]].map(([field,label])=>(
                  <div key={field} style={{flex:1}}>
                    <span style={lbl}>{label} ($)</span>
                    <input inputMode="decimal" placeholder="0.00" value={c[field]} style={inp}
                      onChange={e=>updCat(i,field,e.target.value)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
          <button onClick={addCat} style={addBtn}>+ Add Category</button>
          <div style={{marginTop:14}}>
            <button onClick={commitSettings} disabled={saving} style={{...primBtn(),opacity:saving?0.6:1}}>
              {saving?"Saving…":"Save"}
            </button>
          </div>
        </div>
      )}

      {panel==="log"&&(
        <div style={card}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>All Transactions</div>
          {txs.length===0?(
            <div style={{color:"#555",fontSize:14,textAlign:"center",padding:"20px 0"}}>No transactions yet.</div>
          ):[...txs].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,80).map(t=>{
            const cat=cats.find(c=>c.id===t.categoryId);
            const d=new Date(t.date);
            const ds=`${d.getMonth()+1}/${d.getDate()} ${d.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`;
            const inc=t.kind==="income";
            return(
              <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #1e1e2e"}}>
                <div>
                  <div style={{fontSize:14,color:"#ccc"}}>
                    {inc?t.type:cat?.name||"Unknown"}
                    {t.note?<span style={{color:"#555"}}> · {t.note}</span>:""}
                  </div>
                  <div style={{fontSize:11,color:"#555",marginTop:2}}>{ds}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
                  <span style={{fontWeight:700,color:inc?"#22c55e":"#f87171",fontSize:14}}>{inc?"+":"−"}${fmt(t.amount)}</span>
                  {delConfirm===t.id?(
                    <div style={{display:"flex",gap:5}}>
                      <button onClick={()=>deleteTx(t.id)} style={{background:"#ef4444",border:"none",borderRadius:6,color:"#fff",padding:"4px 8px",fontSize:12,cursor:"pointer",fontWeight:700}}>Del</button>
                      <button onClick={()=>setDelConfirm(null)} style={{background:"#2a2a3a",border:"none",borderRadius:6,color:"#aaa",padding:"4px 8px",fontSize:12,cursor:"pointer"}}>No</button>
                    </div>
                  ):(
                    <button onClick={()=>setDelConfirm(t.id)} style={{background:"none",border:"none",color:"#444",cursor:"pointer",fontSize:16,padding:"0 2px"}}>✕</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!mainPanels.includes(panel)&&(
        <>
          <div style={{...card,background:"#12121c",border:`1px solid ${T5}`,padding:"20px 18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:14}}>
              <div>
                <div style={{fontSize:11,color:"#888",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>Checking</div>
                <div style={{fontSize:26,fontWeight:800,color:"#fff"}}>${fmt(bankBalance)}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:"#888",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:5}}>Stocks</div>
                <div style={{fontSize:26,fontWeight:800,color:"#22c55e"}}>${fmt(stockBalance)}</div>
              </div>
            </div>
            <div style={{borderTop:"1px solid #22223a",paddingTop:12,display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
              <span style={{fontSize:12,color:"#888",textTransform:"uppercase",letterSpacing:"0.07em"}}>Total</span>
              <span style={{fontSize:22,fontWeight:800,color:"#fff"}}>${fmt(bankBalance+stockBalance)}</span>
            </div>
          </div>

          <div style={{...card,border:`1px solid ${T5}`}}>
            <div style={{fontSize:11,color:"#888",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:4}}>
              {view==="weekly"?"This Week":"This Month"}
            </div>
            <div style={{fontSize:36,fontWeight:800,color:totalSaved>=0?"#22c55e":"#ef4444",marginBottom:12}}>
              ${fmt(Math.abs(totalSaved))}
              {totalSaved<0&&<span style={{fontSize:14,fontWeight:500}}> overspent</span>}
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {[
                {label:"Income",                                       val:`+$${fmt(totalIncome)}`,    color:"#22c55e"},
                {label:`Fixed costs${view==="weekly"?" (est.)":""}`,  val:`−$${fmt(totalFixedPer)}`,  color:"#f87171"},
                {label:"Variable spending",                            val:`−$${fmt(totalVariable)}`,  color:"#f87171"},
              ].map(row=>(
                <div key={row.label} style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                  <span style={{color:"#999"}}>{row.label}</span>
                  <span style={{color:row.color,fontWeight:600}}>{row.val}</span>
                </div>
              ))}
            </div>
            <div style={{marginTop:12,paddingTop:10,borderTop:"1px solid #22223a",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,color:"#888"}}>vs last {view==="weekly"?"week":"month"}: ${fmt(Math.abs(prevSaved))}</span>
              <span style={{fontSize:12,fontWeight:700,color:savedDiff>=0?"#22c55e":"#ef4444"}}>
                {savedDiff>=0?"▲":"▼"} ${fmt(Math.abs(savedDiff))}
              </span>
            </div>
          </div>

          <div style={grid}>
            <div style={cardInGrid}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                <span style={{fontWeight:700,fontSize:14}}>Income</span>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:16,fontWeight:700,color:"#22c55e"}}>${fmt(totalIncome)}</span>
                  <button onClick={()=>setPanel("log_income")} style={{background:"#22c55e22",border:"1px solid #22c55e55",borderRadius:8,color:"#22c55e",padding:"6px 13px",cursor:"pointer",fontSize:13,fontWeight:700}}>+ Extra</button>
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"6px 0",borderTop:"1px solid #1e1e2e",alignItems:"center"}}>
                <div>
                  <span style={{color:"#888"}}>Weekly Paycheck</span>
                  <span style={{fontSize:11,color:T,background:T4,borderRadius:4,padding:"1px 6px",marginLeft:7}}>fixed</span>
                </div>
                <span style={{color:"#22c55e",fontWeight:600}}>
                  +${fmt(fixedIncomePer)}{view==="monthly"&&<span style={{color:"#555",fontWeight:400,fontSize:11}}> (est.)</span>}
                </span>
              </div>
              {incomeTxs.slice(0,4).map(t=>(
                <div key={t.id} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"6px 0",borderTop:"1px solid #1e1e2e",color:"#666"}}>
                  <span>{t.type}{t.note?` · ${t.note}`:""}</span>
                  <span style={{color:"#22c55e",fontWeight:600}}>+${fmt(t.amount)}</span>
                </div>
              ))}
            </div>

            <div style={cardInGrid}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <span style={{fontWeight:700,fontSize:14}}>Fixed Costs</span>
                <span style={{fontSize:13,color:"#f87171"}}>−${fmt(totalFixed)}/mo</span>
              </div>
              {fixed.map(f=>(
                <div key={f.id} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"5px 0",borderTop:"1px solid #1e1e2e",color:"#666"}}>
                  <span>{f.name}</span>
                  <span>${fmt(f.monthlyAmount)}/mo</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{fontSize:11,color:"#888",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:8}}>Variable Spending</div>
          <div style={grid}>
          {cats.map(cat=>{
            const spent=spentFor(cat.id);
            const limit=view==="weekly"?cat.weeklyLimit:cat.monthlyLimit;
            const pct=limit>0?spent/limit:0;
            const over=spent-limit;
            return(
              <div key={cat.id} style={{...cardInGrid,cursor:"pointer"}}
                onClick={()=>{setExpenseForm({categoryId:cat.id,amount:"",note:""});setPanel("log_expense");}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:limit>0?8:0}}>
                  <span style={{fontSize:14,fontWeight:600,color:"#ccc"}}>{cat.name}</span>
                  <div style={{textAlign:"right"}}>
                    <div>
                      <span style={{fontSize:14,fontWeight:700,color:limit>0?barColor(pct):"#fff"}}>${fmt(spent)}</span>
                      <span style={{fontSize:13,color:"#333"}}>{limit>0?` / $${fmt(limit)}`:""}</span>
                    </div>
                    {over>0&&limit>0&&(
                      <div style={{background:"#ef444420",border:"1px solid #ef444440",borderRadius:6,padding:"2px 8px",fontSize:11,color:"#ef4444",fontWeight:700,marginTop:4,display:"inline-block"}}>
                        ${fmt(over)} over
                      </div>
                    )}
                  </div>
                </div>
                {limit>0&&(
                  <>
                    <div style={{background:"#22223a",borderRadius:999,height:6,overflow:"hidden"}}>
                      <div style={{height:"100%",borderRadius:999,width:`${Math.min(pct*100,100)}%`,background:barColor(pct),transition:"width 0.4s ease"}}/>
                    </div>
                    <div style={{fontSize:11,color:"#555",marginTop:5}}>${fmt(Math.max(limit-spent,0))} remaining · tap to log</div>
                  </>
                )}
                {limit===0&&<div style={{fontSize:11,color:"#555",marginTop:6}}>no limit set · tap to log</div>}
              </div>
            );
          })}
          </div>
        </>
      )}

      {!mainPanels.includes(panel)&&!sheetPanels.includes(panel)&&(
        <div style={{position:"fixed",bottom:28,right:20,display:"flex",flexDirection:"column",gap:12,zIndex:50}}>
          <button onClick={()=>setPanel("log_income")}
            style={{width:52,height:52,borderRadius:"50%",background:"#16a34a",border:"none",color:"#fff",fontSize:20,fontWeight:700,cursor:"pointer",boxShadow:"0 4px 20px rgba(22,163,74,0.45)",display:"flex",alignItems:"center",justifyContent:"center"}}>$</button>
          <button onClick={()=>{setExpenseForm({categoryId:cats[0]?.id||"",amount:"",note:""});setPanel("log_expense");}}
            style={{width:52,height:52,borderRadius:"50%",background:T,border:"none",color:"#fff",fontSize:26,fontWeight:300,cursor:"pointer",boxShadow:`0 4px 20px ${T2}`,display:"flex",alignItems:"center",justifyContent:"center"}}>−</button>
        </div>
      )}

      {panel==="log_income"&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}
          onClick={e=>e.target===e.currentTarget&&setPanel(null)}>
          <div style={{background:"#1a1a24",borderRadius:"22px 22px 0 0",padding:"24px 20px 36px",width:"100%",maxWidth:480,boxSizing:"border-box"}}>
            <div style={{width:36,height:4,background:"#2a2a3a",borderRadius:999,margin:"0 auto 20px"}}/>
            <div style={{fontWeight:700,fontSize:17,marginBottom:4,color:"#22c55e"}}>Log Extra Income</div>
            <div style={{fontSize:13,color:"#555",marginBottom:18}}>Sales, stocks, tips — anything on top of your paycheck.</div>
            <div style={{marginBottom:13}}>
              <span style={lbl}>Type</span>
              <div style={{display:"flex",gap:8}}>
                {INCOME_TYPES.map(t=>(
                  <button key={t} onClick={()=>setIncomeForm({...incomeForm,type:t})}
                    style={{background:incomeForm.type===t?"#22c55e18":"#0a0a10",border:`1px solid ${incomeForm.type===t?"#22c55e66":"#2a2a3a"}`,borderRadius:8,color:incomeForm.type===t?"#22c55e":"#666",padding:"7px 14px",cursor:"pointer",fontSize:13,fontWeight:600}}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:13}}>
              <span style={lbl}>Amount ($)</span>
              <input inputMode="decimal" placeholder="0.00" value={incomeForm.amount} autoFocus
                onChange={e=>setIncomeForm({...incomeForm,amount:e.target.value})}
                onKeyDown={e=>e.key==="Enter"&&addIncome()} style={inp}/>
            </div>
            <div style={{marginBottom:20}}>
              <span style={lbl}>Note (optional)</span>
              <input placeholder="e.g. Sold Xbox" value={incomeForm.note}
                onChange={e=>setIncomeForm({...incomeForm,note:e.target.value})}
                onKeyDown={e=>e.key==="Enter"&&addIncome()} style={inp}/>
            </div>
            <button onClick={addIncome} style={primBtn("#16a34a")}>Add Income</button>
          </div>
        </div>
      )}

      {panel==="log_expense"&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:100}}
          onClick={e=>e.target===e.currentTarget&&setPanel(null)}>
          <div style={{background:"#1a1a24",borderRadius:"22px 22px 0 0",padding:"24px 20px 36px",width:"100%",maxWidth:480,boxSizing:"border-box"}}>
            <div style={{width:36,height:4,background:"#2a2a3a",borderRadius:999,margin:"0 auto 20px"}}/>
            <div style={{fontWeight:700,fontSize:17,marginBottom:18}}>Log Expense</div>
            <div style={{marginBottom:13}}>
              <span style={lbl}>Category</span>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {cats.map(c=>(
                  <button key={c.id} onClick={()=>setExpenseForm({...expenseForm,categoryId:c.id})}
                    style={{background:expenseForm.categoryId===c.id?T2:"#0a0a10",border:`1px solid ${expenseForm.categoryId===c.id?T3:"#2a2a3a"}`,borderRadius:8,color:expenseForm.categoryId===c.id?"#7dd3e8":"#666",padding:"7px 14px",cursor:"pointer",fontSize:13,fontWeight:600}}>
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
            <div style={{marginBottom:13}}>
              <span style={lbl}>Amount ($)</span>
              <input inputMode="decimal" placeholder="0.00" value={expenseForm.amount} autoFocus
                onChange={e=>setExpenseForm({...expenseForm,amount:e.target.value})}
                onKeyDown={e=>e.key==="Enter"&&addExpense()} style={inp}/>
            </div>
            <div style={{marginBottom:20}}>
              <span style={lbl}>Note (optional)</span>
              <input placeholder="e.g. Walmart run" value={expenseForm.note}
                onChange={e=>setExpenseForm({...expenseForm,note:e.target.value})}
                onKeyDown={e=>e.key==="Enter"&&addExpense()} style={inp}/>
            </div>
            <button onClick={addExpense} style={primBtn()}>Add Expense</button>
          </div>
        </div>
      )}
    </div>
  );
}