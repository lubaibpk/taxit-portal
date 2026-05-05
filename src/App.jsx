import { useState, useCallback, useEffect } from "react";
import React from 'react';

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_KEY || "";
const USE_BACKEND  = SUPABASE_URL !== "" && SUPABASE_KEY !== "";
const ADMIN_USERNAME = process.env.REACT_APP_ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.REACT_APP_ADMIN_PASSWORD || "taxit2024";
const SESSION_KEY = "taxit_session_v1";

// ─── SEED DATA ───────────────────────────────────────────────────────────────
const SEED_USERS = [];
const ADMIN_CRED = { username: ADMIN_USERNAME, password: ADMIN_PASSWORD };
const CATS = ["Iqama renewal","Exit-re entry","CR/Article services","Mudad Services","Misa Services","VAT/Tax Services","Accounting services","Other"];

const S = {
  pending:    { label:"Pending",     color:"#b45309", bg:"#fef3c7", ring:"#fde68a" },
  inprogress: { label:"In Progress", color:"#1d4ed8", bg:"#dbeafe", ring:"#bfdbfe" },
  completed:  { label:"Completed",   color:"#047857", bg:"#d1fae5", ring:"#a7f3d0" },
  cancelled:  { label:"Cancelled",   color:"#b91c1c", bg:"#fee2e2", ring:"#fecaca"  },
};
const P = {
  unpaid:  { label:"Unpaid",  color:"#dc2626" },
  partial: { label:"Partial", color:"#d97706" },
  paid:    { label:"Paid",    color:"#059669" },
  waived:  { label:"Waived",  color:"#7c3aed" },
};

const SEED_JOBS = [];

// ─── SUPABASE ────────────────────────────────────────────────────────────────
async function sbFetch(path, opts={}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts, headers:{ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, "Content-Type":"application/json", Prefer:"return=representation", ...(opts.headers||{}) }
  });
  if (!r.ok) { const msg = await r.text(); throw new Error(msg); }
  return r.json();
}

function toDb(obj) {
  const map = { userId:"user_id", amountPaid:"amount_paid", createdAt:"created_at", updatedAt:"updated_at", adminNote:"admin_note" };
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[map[k] || k] = v;
  return out;
}

function fromDb(row) {
  const map = { user_id:"userId", amount_paid:"amountPaid", created_at:"createdAt", updated_at:"updatedAt", admin_note:"adminNote" };
  const out = {};
  for (const [k, v] of Object.entries(row)) out[map[k] || k] = v;
  return out;
}

const db = {
  insertUser:    d      => sbFetch("users", { method:"POST", body:JSON.stringify(d) }),
  updateUser:    (id,d) => sbFetch(`users?id=eq.${id}`, { method:"PATCH", body:JSON.stringify(d) }),
  deleteUser:    id     => sbFetch(`users?id=eq.${id}`, { method:"DELETE" }),
  insertJob:     d      => sbFetch("jobs",  { method:"POST", body:JSON.stringify(toDb(d)) }),
  updateJob:     (id,d) => sbFetch(`jobs?id=eq.${id}`, { method:"PATCH", body:JSON.stringify(toDb(d)) }),
  getComments:   job_id => sbFetch(`comments?job_id=eq.${job_id}&order=created_at.asc`),
  insertComment: d      => sbFetch("comments", { method:"POST", body:JSON.stringify(d) }),
  uploadFile: async (jobId, file) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${jobId}/${Date.now()}-${safeName}`;
    for (const method of ["POST", "PUT"]) {
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/job-files/${path}`, {
        method, headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": file.type || "application/octet-stream", "x-upsert": "true" }, body: file,
      });
      if (r.ok) return { path, name: file.name, size: file.size, type: file.type };
      const msg = await r.text();
      let parsed; try { parsed = JSON.parse(msg); } catch { parsed = { message: msg }; }
      if (parsed.error === "Bucket not found" || parsed.statusCode === "404") throw new Error("Storage bucket not found.");
      if (method === "PUT") throw new Error(parsed.message || msg);
    }
  },
  getFileUrl: path => `${SUPABASE_URL}/storage/v1/object/public/job-files/${path}`,
};

// ─── UTILS ───────────────────────────────────────────────────────────────────
const uid  = () => "u-" + Date.now() + Math.random().toString(36).slice(2,6);
const jid  = () => "JR-" + Date.now() + "-" + Math.random().toString(36).slice(2,5).toUpperCase();
const fmt  = iso => new Date(iso).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
const sar  = n   => `SAR ${Number(n||0).toLocaleString()}`;
const pct  = (a,b) => b>0 ? Math.min(100,Math.round(a/b*100)) : 0;
const ini  = n   => n.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();

// ─── SESSION PERSISTENCE ─────────────────────────────────────────────────────
function saveSession(session) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch(e) {}
}
function loadSession() {
  try { const s = localStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch(e) { return null; }
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch(e) {}
}

// ─── GLOBAL STYLES ───────────────────────────────────────────────────────────
const G = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-text-size-adjust: 100%; }
  body { font-family: 'Plus Jakarta Sans', sans-serif; -webkit-font-smoothing: antialiased; background:#f8faff; }
  input, select, textarea, button { font-family: inherit; outline: none; }
  button { cursor: pointer; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: #f1f5f9; }
  ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 99px; }

  @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
  @keyframes shimmer { 0%,100% { opacity:.6; } 50% { opacity:1; } }
  @keyframes spin { to { transform: rotate(360deg); } }

  .fade-up { animation: fadeUp .45s cubic-bezier(.22,1,.36,1) both; }
  .fade-up-1 { animation-delay:.05s; }
  .fade-up-2 { animation-delay:.1s; }
  .fade-up-3 { animation-delay:.15s; }
  .fade-up-4 { animation-delay:.2s; }

  .card-hover { transition: transform .2s, box-shadow .2s; }
  .card-hover:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(10,17,114,.10) !important; }

  .btn-primary { transition: transform .15s, box-shadow .15s, opacity .15s; }
  .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(10,17,114,.25) !important; }
  .btn-primary:active { transform: scale(.98); }

  .nav-btn { transition: all .15s; }
  .nav-btn:hover { background: #f1f5f9 !important; color: #1e40af !important; }

  input:focus, select:focus, textarea:focus {
    border-color: #3b5adb !important;
    box-shadow: 0 0 0 3px rgba(59,90,219,.12);
  }

  @media (max-width: 768px) {
    .hide-mobile { display: none !important; }
    .mobile-full { width: 100% !important; }
    .mobile-stack { flex-direction: column !important; }
    .mobile-p { padding: 16px !important; }
    .grid-1-mobile { grid-template-columns: 1fr !important; }
    .grid-2-mobile { grid-template-columns: 1fr 1fr !important; }
    .sidebar-mobile { transform: translateX(-100%); position: fixed !important; z-index: 200 !important; transition: transform .25s !important; height: 100vh !important; top: 0 !important; }
    .sidebar-open { transform: translateX(0) !important; }
    .mobile-content { margin-left: 0 !important; }
  }
`;

// ─── TAXIT LOGO ─────────────────────────────────────────────────────────────
const LOGO_DARK = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABkAAAAOECAYAAAD5Tf2iAAEAAElEQVR4nOz9748..."; // keeping abbreviated for space

function TaxitLogo({ scale=1, dark=false }) {
  const h = Math.round(56 * scale);
  // Simple text logo for light theme
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
      <div style={{
        width: Math.round(32*scale), height: Math.round(32*scale),
        borderRadius: Math.round(8*scale),
        background: dark ? "#fff" : "linear-gradient(135deg,#0a1a6e,#2548e8)",
        display:"flex", alignItems:"center", justifyContent:"center",
        flexShrink:0
      }}>
        <span style={{ fontSize: Math.round(14*scale), fontWeight:900, color: dark ? "#0a1a6e" : "#fff", fontFamily:"'Plus Jakarta Sans',sans-serif", letterSpacing:"-0.04em" }}>T</span>
      </div>
      <span style={{
        fontSize: Math.round(18*scale), fontWeight:800, letterSpacing:"-0.03em",
        color: dark ? "#fff" : "#0a1a6e",
        fontFamily:"'Plus Jakarta Sans',sans-serif"
      }}>taxit</span>
    </div>
  );
}

// ─── SHARED COMPONENTS ───────────────────────────────────────────────────────
const SBadge = ({v}) => {
  const c = S[v]; if (!c) return null;
  return <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 11px", borderRadius:99, fontSize:11, fontWeight:700, letterSpacing:"0.04em", background:c.bg, color:c.color, border:`1px solid ${c.ring}`, whiteSpace:"nowrap" }}>
    <span style={{ width:5, height:5, borderRadius:"50%", background:c.color, display:"inline-block", flexShrink:0 }}/>
    {c.label}
  </span>;
};

const PBadge = ({v}) => {
  const c = P[v]; if (!c) return null;
  return <span style={{ display:"inline-flex", padding:"4px 11px", borderRadius:99, fontSize:11, fontWeight:700, letterSpacing:"0.04em", color:c.color, border:`1.5px solid ${c.color}40`, background:`${c.color}10`, whiteSpace:"nowrap" }}>{c.label}</span>;
};

const Dot = ({p}) => {
  const c = { urgent:"#ef4444", high:"#f97316", medium:"#f59e0b", low:"#94a3b8" };
  return <span style={{ width:8, height:8, borderRadius:"50%", background:c[p]||"#888", display:"inline-block", flexShrink:0 }} title={p}/>;
};

function ProgressBar({ paid, total }) {
  const p = pct(paid, total);
  return (
    <div style={{ width:"100%", height:5, background:"#e2e8f0", borderRadius:99, overflow:"hidden" }}>
      <div style={{ height:"100%", width:`${p}%`, background: p >= 100 ? "#10b981" : p > 0 ? "#f59e0b" : "transparent", borderRadius:99, transition:"width .6s cubic-bezier(.22,1,.36,1)" }}/>
    </div>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", zIndex:9999,
      background:"linear-gradient(135deg,#0a1a6e,#1a35cc)", color:"#fff", padding:"12px 24px",
      borderRadius:14, fontSize:13, fontWeight:600, boxShadow:"0 8px 32px rgba(10,26,110,.25)",
      whiteSpace:"nowrap", animation:"fadeUp .3s both" }}>
      ✓ {msg}
    </div>
  );
}

// ─── STAT CARD (LIGHT) ───────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon, delay=0 }) {
  return (
    <div className={`card-hover fade-up fade-up-${delay}`} style={{
      background:"#fff", borderRadius:16, padding:"20px 22px",
      border:"1px solid #e2e8f0", boxShadow:"0 2px 12px rgba(10,26,110,.05)",
      display:"flex", flexDirection:"column", gap:8, minWidth:0
    }}>
      <div style={{ width:38, height:38, borderRadius:11, background:`${color}14`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
        {icon}
      </div>
      <div>
        <p style={{ fontSize:24, fontWeight:800, color:"#0f172a", lineHeight:1, fontFamily:"'Plus Jakarta Sans',sans-serif", letterSpacing:"-0.02em" }}>{value}</p>
        <p style={{ fontSize:12, fontWeight:600, color:"#64748b", marginTop:4 }}>{label}</p>
        {sub && <p style={{ fontSize:11, color, fontWeight:600, marginTop:2 }}>{sub}</p>}
      </div>
    </div>
  );
}

// ─── ADMIN STAT CARD (ALSO LIGHT) ────────────────────────────────────────────
function AdminStatCard({ label, value, sub, color, icon, delay=0 }) {
  return (
    <div className={`card-hover fade-up fade-up-${delay}`} style={{
      background:"#fff", borderRadius:16, padding:"20px 22px",
      border:"1px solid #e2e8f0", boxShadow:"0 2px 12px rgba(10,26,110,.05)",
      display:"flex", flexDirection:"column", gap:8, minWidth:0
    }}>
      <div style={{ width:38, height:38, borderRadius:11, background:`${color}14`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
        {icon}
      </div>
      <p style={{ fontSize:24, fontWeight:800, color:"#0f172a", lineHeight:1, fontFamily:"'Plus Jakarta Sans',sans-serif", letterSpacing:"-0.02em", marginTop:4 }}>{value}</p>
      <p style={{ fontSize:12, fontWeight:600, color:"#64748b" }}>{label}</p>
      {sub && <p style={{ fontSize:11, color, fontWeight:600 }}>{sub}</p>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGIN PAGE
// ═══════════════════════════════════════════════════════════════════════════
function Login({ onLogin, users }) {
  const [mode, setMode] = useState("customer");
  const [un, setUn]     = useState("");
  const [pw, setPw]     = useState("");
  const [showPw, setShowPw] = useState(false);
  const [err, setErr]   = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    setErr(""); setBusy(true);
    try {
      if (mode === "admin") {
        if (un.trim() === ADMIN_CRED.username && pw.trim() === ADMIN_CRED.password) onLogin({ role:"admin" });
        else setErr("Invalid admin credentials.");
      } else {
        const u = users.find(x => x.username === un.trim() && x.password === pw.trim());
        if (u) onLogin({ role:"customer", user:u }); else setErr("Invalid username or password.");
      }
    } catch(e) { setErr("Connection error. Please try again."); }
    setBusy(false);
  }

  return (
    <div style={{ minHeight:"100vh", background:"#f8faff", display:"flex", position:"relative", overflow:"hidden" }}>
      <style>{G}</style>

      {/* Decorative background */}
      <div style={{ position:"absolute", inset:0, background:"radial-gradient(ellipse 80% 60% at 10% 0%, #dbeafe 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 90% 100%, #ede9fe 0%, transparent 60%)", pointerEvents:"none" }}/>

      {/* Left decorative panel */}
      <div className="hide-mobile" style={{
        width:"42%", background:"linear-gradient(145deg, #0a1a6e 0%, #1a35cc 60%, #2548e8 100%)",
        display:"flex", flexDirection:"column", justifyContent:"space-between", padding:"48px 52px",
        position:"relative", overflow:"hidden"
      }}>
        <div style={{ position:"absolute", top:-80, right:-80, width:320, height:320, borderRadius:"50%", border:"1px solid rgba(255,255,255,.06)" }}/>
        <div style={{ position:"absolute", top:60, right:-120, width:400, height:400, borderRadius:"50%", border:"1px solid rgba(255,255,255,.04)" }}/>
        <div style={{ position:"absolute", bottom:-100, left:-60, width:280, height:280, borderRadius:"50%", background:"rgba(255,255,255,.03)" }}/>
        <div style={{ position:"relative", zIndex:1 }}>
          <TaxitLogo scale={1.8} dark/>
        </div>
        <div style={{ position:"relative", zIndex:1 }}>
          <p style={{ fontFamily:"'Instrument Serif',serif", fontSize:38, color:"#fff", lineHeight:1.25, marginBottom:20 }}>
            Compliance,<br/><em>Made Simple.</em>
          </p>
          <p style={{ fontSize:14, color:"rgba(255,255,255,.55)", lineHeight:1.7, maxWidth:320 }}>
            Submit requests, track progress, and manage payments — all in one secure platform built for Saudi Arabia compliance.
          </p>
        </div>
        <div style={{ position:"relative", zIndex:1, display:"flex", gap:24 }}>
          {[["500+","Clients"],["99%","On-time"],["ISO","Certified"]].map(([v,l]) => (
            <div key={l}>
              <p style={{ fontSize:20, fontWeight:800, color:"#fff" }}>{v}</p>
              <p style={{ fontSize:11, color:"rgba(255,255,255,.45)", marginTop:2 }}>{l}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Right login form */}
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"24px 20px", position:"relative", zIndex:1 }}>
        <div style={{ width:"100%", maxWidth:400 }} className="fade-up">
          <div style={{ display:"flex", justifyContent:"center", marginBottom:36 }}>
            <TaxitLogo scale={1.3}/>
          </div>
          <h1 style={{ fontSize:26, fontWeight:800, color:"#0f172a", marginBottom:6, letterSpacing:"-0.02em" }}>Welcome back</h1>
          <p style={{ fontSize:14, color:"#94a3b8", marginBottom:28 }}>Sign in to your account to continue</p>

          {/* Tab */}
          <div style={{ display:"flex", background:"#f1f5f9", borderRadius:12, padding:4, marginBottom:24, gap:2 }}>
            {[["customer","Client Portal","👤"],["admin","Admin Panel","⚙"]].map(([m,l,ic]) => (
              <button key={m} onClick={()=>{setMode(m);setErr("");setUn("");setPw("");}} style={{
                flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                padding:"9px 0", borderRadius:9, border:"none", fontSize:13, fontWeight:600,
                background: mode===m ? "#fff" : "transparent",
                color: mode===m ? "#0a1a6e" : "#94a3b8",
                boxShadow: mode===m ? "0 1px 8px rgba(10,26,110,.10)" : "none",
                transition:"all .2s"
              }}><span>{ic}</span>{l}</button>
            ))}
          </div>

          {[["Username","text",un,setUn,mode==="admin"?"admin":"your username"],
            ["Password",showPw?"text":"password",pw,setPw,"••••••••"]].map(([lbl,type,val,set,ph],i) => (
            <div key={lbl} style={{ marginBottom:14, position:"relative" }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:7 }}>{lbl}</label>
              <input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph}
                onKeyDown={e=>e.key==="Enter"&&go()}
                style={{ width:"100%", padding: i===1?"12px 44px 12px 14px":"12px 14px", background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:11, color:"#0f172a", fontSize:14, transition:"all .2s" }}/>
              {i===1 && <button onClick={()=>setShowPw(!showPw)} style={{ position:"absolute", right:14, top:34, background:"none", border:"none", color:"#94a3b8", fontSize:16, padding:0, lineHeight:1 }}>
                {showPw?"🙈":"👁"}
              </button>}
            </div>
          ))}

          {err && <div style={{ background:"#fff1f2", border:"1px solid #fecdd3", color:"#be123c", borderRadius:10, padding:"10px 14px", fontSize:13, marginBottom:14 }}>{err}</div>}

          <button onClick={go} disabled={busy} className="btn-primary" style={{
            width:"100%", padding:"13px", background:"linear-gradient(135deg,#0a1a6e,#2548e8)",
            border:"none", borderRadius:12, color:"#fff", fontSize:15, fontWeight:700, marginTop:4,
            opacity: busy ? 0.7 : 1, letterSpacing:"0.01em"
          }}>
            {busy ? "Signing in…" : "Sign In →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// COMMENT THREAD
// ═══════════════════════════════════════════════════════════════════════════
function CommentThread({ jobId, userName, isNew = false, initialComments = [] }) {
  const [comments, setComments] = useState(initialComments);
  const [text, setText]         = useState("");
  const [files, setFiles]       = useState([]);
  const [sending, setSending]   = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = React.useRef();

  React.useEffect(() => {
    if (!jobId || isNew || !USE_BACKEND) return;
    db.getComments(jobId).then(rows => setComments(rows || [])).catch(e => console.error("getComments:", e.message));
  }, [jobId, isNew]);

  function handleFiles(fileList) {
    const arr = Array.from(fileList).map(f => ({ name:f.name, size:f.size, type:f.type, file:f, url:URL.createObjectURL(f), path:null }));
    setFiles(p => [...p, ...arr]);
  }

  async function send() {
    if (!text.trim() && files.length === 0) return;
    setSending(true);
    try {
      const uploaded = await Promise.all(files.map(async f => {
        if (!USE_BACKEND || !jobId) return { name:f.name, size:f.size, type:f.type, url:f.url, path:null };
        const info = await db.uploadFile(jobId, f.file);
        return { ...info, url: db.getFileUrl(info.path) };
      }));
      const comment = { id:"c-"+Date.now(), job_id:jobId||null, author:userName, text:text.trim(), files:JSON.stringify(uploaded), created_at:new Date().toISOString() };
      if (USE_BACKEND && jobId && !isNew) await db.insertComment(comment);
      setComments(p => [...p, { ...comment, files:uploaded }]);
      setText(""); setFiles([]);
    } catch(e) { alert("Failed to send: " + e.message); }
    finally { setSending(false); }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + " KB";
    return (bytes/(1024*1024)).toFixed(1) + " MB";
  }
  function fileIcon(type="") {
    if (type.startsWith("image/")) return "🖼️";
    if (type.includes("pdf")) return "📄";
    if (type.includes("word")||type.includes("doc")) return "📝";
    if (type.includes("sheet")||type.includes("excel")||type.includes("csv")) return "📊";
    return "📎";
  }
  function parseFiles(f) {
    if (!f) return [];
    if (Array.isArray(f)) return f;
    try { return JSON.parse(f); } catch { return []; }
  }

  return (
    <div>
      {comments.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
          {comments.map((c, i) => {
            const cFiles = parseFiles(c.files);
            return (
              <div key={c.id||i} style={{ background:"#f8faff", borderRadius:12, padding:"12px 14px", border:"1px solid #e2e8f0" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <div style={{ width:26, height:26, borderRadius:"50%", background:"linear-gradient(135deg,#0a1a6e,#2548e8)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <span style={{ fontSize:11, color:"#fff", fontWeight:700 }}>{(c.author||"?")[0].toUpperCase()}</span>
                  </div>
                  <span style={{ fontSize:12, fontWeight:700, color:"#0f172a" }}>{c.author}</span>
                  <span style={{ fontSize:11, color:"#94a3b8", marginLeft:"auto" }}>{c.created_at ? new Date(c.created_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"}) : ""}</span>
                </div>
                {c.text && <p style={{ fontSize:13, color:"#334155", lineHeight:1.6, marginBottom:cFiles.length?8:0 }}>{c.text}</p>}
                {cFiles.length > 0 && (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:6 }}>
                    {cFiles.map((f,fi) => (
                      <a key={fi} href={f.url} target="_blank" rel="noreferrer"
                        style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", background:"#fff", border:"1px solid #e2e8f0", borderRadius:8, textDecoration:"none", fontSize:12, color:"#0a1a6e", fontWeight:600 }}>
                        <span>{fileIcon(f.type)}</span>
                        <span style={{ maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</span>
                        <span style={{ color:"#94a3b8", fontWeight:400 }}>{formatSize(f.size||0)}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ border:"1.5px solid #e2e8f0", borderRadius:12, background:dragOver?"#f0f4ff":"#fafbff", overflow:"hidden" }}
        onDragOver={e=>{e.preventDefault();setDragOver(true);}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);handleFiles(e.dataTransfer.files);}}>
        <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Add a comment or update..." rows={3}
          style={{ width:"100%", padding:"11px 14px", border:"none", background:"transparent", fontSize:13, color:"#0f172a", resize:"none", outline:"none", display:"block" }}/>
        {files.length > 0 && (
          <div style={{ padding:"8px 12px", borderTop:"1px solid #f1f4fd", display:"flex", flexWrap:"wrap", gap:6 }}>
            {files.map((f,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 8px", background:"#eef2ff", border:"1px solid #c7d2fe", borderRadius:7, fontSize:12, color:"#3730a3" }}>
                <span>{fileIcon(f.type)}</span>
                <span style={{ maxWidth:130, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</span>
                <button onClick={()=>setFiles(p=>p.filter((_,idx)=>idx!==i))} style={{ background:"none", border:"none", cursor:"pointer", color:"#6366f1", fontSize:14, lineHeight:1, padding:0 }}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", borderTop:"1px solid #f1f4fd" }}>
          <button onClick={()=>fileRef.current.click()} style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", background:"#f1f4fd", border:"1px solid #e2e8f0", borderRadius:8, fontSize:12, fontWeight:600, color:"#475569", cursor:"pointer" }}>
            📎 Attach File
          </button>
          <input ref={fileRef} type="file" multiple style={{ display:"none" }} onChange={e=>handleFiles(e.target.files)}/>
          <button onClick={send} disabled={sending||(!text.trim()&&files.length===0)}
            style={{ padding:"7px 16px", background:(text.trim()||files.length)?"linear-gradient(135deg,#0a1a6e,#2548e8)":"#e2e8f0", border:"none", borderRadius:8, color:(text.trim()||files.length)?"#fff":"#94a3b8", fontSize:13, fontWeight:700, cursor:(text.trim()||files.length)?"pointer":"default" }}>
            {sending?"Sending…":"Send →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMER PORTAL
// ═══════════════════════════════════════════════════════════════════════════
function CustomerPortal({ session, jobs, onNewJob, onLogout }) {
  const mine     = jobs.filter(j => j.userId === session.user.id);
  const invoiced = mine.reduce((s,j)=>s+(j.amount||0),0);
  const paid     = mine.reduce((s,j)=>s+(j.amountPaid||0),0);
  const [showForm, setShowForm]     = useState(false);
  const [form, setForm]             = useState({ title:"", category:CATS[0], description:"", priority:"medium" });
  const [formComments, setFormComments] = useState([]);
  const [ok, setOk]                 = useState(false);
  const [expandedJob, setExpandedJob] = useState(null);

  function submit() {
    if (!form.title.trim() || !form.description.trim()) return;
    onNewJob({ ...form, userId:session.user.id, initialComments:formComments });
    setForm({ title:"", category:CATS[0], description:"", priority:"medium" });
    setFormComments([]);
    setShowForm(false); setOk(true); setTimeout(()=>setOk(false),4000);
  }

  const stats = [
    { label:"Total Requests", value:mine.length, color:"#0a1a6e", icon:"📋", sub:`${mine.filter(j=>j.status==="pending").length} pending` },
    { label:"In Progress",    value:mine.filter(j=>j.status==="inprogress").length, color:"#2563eb", icon:"⚡", sub:"Active" },
    { label:"Completed",      value:mine.filter(j=>j.status==="completed").length,  color:"#059669", icon:"✅", sub:"Delivered" },
    { label:"Balance Due",    value:sar(invoiced-paid), color:invoiced-paid>0?"#dc2626":"#059669", icon:"💳", sub:invoiced>0?`of ${sar(invoiced)} invoiced`:"No invoices" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#f8faff" }}>
      <style>{G}</style>
      <header style={{ background:"#fff", borderBottom:"1px solid #e2e8f0", padding:"0 24px", height:64, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50, boxShadow:"0 1px 8px rgba(10,26,110,.06)" }}>
        <TaxitLogo scale={0.85}/>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div className="hide-mobile" style={{ textAlign:"right" }}>
            <p style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{session.user.name}</p>
            <p style={{ fontSize:11, color:"#94a3b8" }}>{session.user.company}</p>
          </div>
          <button onClick={onLogout} style={{ padding:"8px 14px", background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:9, color:"#0a1a6e", fontSize:12, fontWeight:600 }}>Sign out</button>
        </div>
      </header>

      <div style={{ maxWidth:960, margin:"0 auto", padding:"28px 16px" }}>
        <div className="fade-up" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12, marginBottom:24 }}>
          <div>
            <h2 style={{ fontSize:22, fontWeight:800, color:"#0f172a", letterSpacing:"-0.02em" }}>Good day, {session.user.name.split(" ")[0]} 👋</h2>
            <p style={{ color:"#94a3b8", fontSize:13, marginTop:3 }}>Track your compliance requests and payments</p>
          </div>
          <button onClick={()=>setShowForm(true)} className="btn-primary mobile-full" style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"11px 20px", background:"linear-gradient(135deg,#0a1a6e,#2548e8)", border:"none", borderRadius:12, color:"#fff", fontSize:14, fontWeight:700 }}>
            <span style={{ fontSize:18, lineHeight:1 }}>+</span> New Request
          </button>
        </div>

        {ok && <div className="fade-up" style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", color:"#15803d", borderRadius:12, padding:"12px 16px", marginBottom:20, fontSize:13, fontWeight:600 }}>
          ✓ Request submitted! Our team will be in touch soon.
        </div>}

        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:28 }} className="grid-2-mobile">
          {stats.map((s,i) => <StatCard key={s.label} {...s} delay={i+1}/>)}
        </div>

        <div className="fade-up fade-up-4">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <h3 style={{ fontSize:15, fontWeight:800, color:"#0f172a" }}>My Requests</h3>
            <span style={{ fontSize:12, color:"#94a3b8" }}>{mine.length} total</span>
          </div>

          {mine.length === 0 ? (
            <div style={{ background:"#fff", borderRadius:16, border:"1px solid #e2e8f0", padding:"52px 24px", textAlign:"center", boxShadow:"0 2px 12px rgba(10,26,110,.04)" }}>
              <p style={{ fontSize:44, marginBottom:14 }}>📋</p>
              <p style={{ fontSize:16, fontWeight:700, color:"#0f172a", marginBottom:6 }}>No requests yet</p>
              <p style={{ color:"#94a3b8", fontSize:13, marginBottom:20 }}>Submit your first compliance request to get started.</p>
              <button onClick={()=>setShowForm(true)} className="btn-primary" style={{ padding:"10px 22px", background:"linear-gradient(135deg,#0a1a6e,#2548e8)", border:"none", borderRadius:10, color:"#fff", fontSize:13, fontWeight:700 }}>+ New Request</button>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {mine.slice().reverse().map((j,i) => {
                const bl = (j.amount||0)-(j.amountPaid||0);
                return (
                  <div key={j.id} className="card-hover" style={{ background:"#fff", borderRadius:16, border:"1px solid #e2e8f0", padding:"18px 20px", boxShadow:"0 2px 10px rgba(10,26,110,.04)", animation:`fadeUp .4s ${i*.05}s both` }}>
                    <div style={{ display:"flex", gap:14, justifyContent:"space-between", flexWrap:"wrap" }}>
                      <div style={{ flex:1, minWidth:200 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                          <Dot p={j.priority}/>
                          <span style={{ fontSize:11, color:"#94a3b8", fontWeight:600 }}>{j.id}</span>
                          <span style={{ color:"#e2e8f0" }}>·</span>
                          <span style={{ fontSize:11, color:"#94a3b8" }}>{j.category}</span>
                        </div>
                        <p style={{ fontSize:15, fontWeight:700, color:"#0f172a", marginBottom:5, lineHeight:1.3 }}>{j.title}</p>
                        <p style={{ fontSize:13, color:"#64748b", lineHeight:1.6, marginBottom:j.adminNote?12:0 }}>{j.description}</p>
                        {j.adminNote && (
                          <div style={{ background:"#f0f4ff", borderLeft:"3px solid #0a1a6e", padding:"8px 12px", borderRadius:"0 8px 8px 0", fontSize:12, color:"#1e40af", lineHeight:1.5 }}>
                            <strong>Taxit update:</strong> {j.adminNote}
                          </div>
                        )}
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:7, minWidth:150 }}>
                        <SBadge v={j.status}/>
                        <PBadge v={j.payment}/>
                        {j.amount > 0 && (
                          <div style={{ width:"100%", textAlign:"right" }}>
                            <p style={{ fontSize:17, fontWeight:800, color:"#0f172a" }}>{sar(j.amount)}</p>
                            <ProgressBar paid={j.amountPaid||0} total={j.amount}/>
                            <div style={{ display:"flex", justifyContent:"space-between", marginTop:5 }}>
                              <span style={{ fontSize:10, color:"#10b981", fontWeight:600 }}>Paid {sar(j.amountPaid||0)}</span>
                              {bl>0 ? <span style={{ fontSize:10, color:"#ef4444", fontWeight:600 }}>Due {sar(bl)}</span> : <span style={{ fontSize:10, color:"#10b981", fontWeight:600 }}>✓ Settled</span>}
                            </div>
                          </div>
                        )}
                        <p style={{ fontSize:10, color:"#cbd5e1" }}>{fmt(j.createdAt)}</p>
                      </div>
                    </div>
                    <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid #f1f5f9" }}>
                      <button onClick={()=>setExpandedJob(expandedJob===j.id?null:j.id)}
                        style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#6366f1", fontWeight:600, padding:0, display:"flex", alignItems:"center", gap:6 }}>
                        💬 {expandedJob===j.id?"Hide":"Comments & Files"}
                        <span style={{ fontSize:10, color:"#94a3b8" }}>{expandedJob===j.id?"▲":"▼"}</span>
                      </button>
                      {expandedJob===j.id && (
                        <div style={{ marginTop:12 }}>
                          <CommentThread jobId={j.id} userName={session.user.name} isNew={false}/>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* New Request Modal */}
      {showForm && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.4)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:16 }} onClick={e=>e.target===e.currentTarget&&setShowForm(false)}>
          <div className="fade-up" style={{ background:"#fff", borderRadius:20, padding:"28px 24px", width:"100%", maxWidth:500, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 80px rgba(10,26,110,.15)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h3 style={{ fontSize:19, fontWeight:800, color:"#0f172a" }}>New Compliance Request</h3>
              <button onClick={()=>setShowForm(false)} style={{ background:"#f8faff", border:"1px solid #e2e8f0", borderRadius:8, width:32, height:32, color:"#64748b", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>Title *</label>
              <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Iqama renewal for Ahmed"
                style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #e2e8f0", borderRadius:11, fontSize:14, color:"#0f172a", background:"#fafbff" }}/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              {[["Category",form.category,v=>setForm({...form,category:v}),CATS.map(c=>({k:c,v:c}))],
                ["Priority",form.priority,v=>setForm({...form,priority:v}),[{k:"low",v:"Low"},{k:"medium",v:"Medium"},{k:"high",v:"High"},{k:"urgent",v:"Urgent"}]]
              ].map(([lbl,val,set,opts])=>(
                <div key={lbl}>
                  <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>{lbl}</label>
                  <select value={val} onChange={e=>set(e.target.value)} style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #e2e8f0", borderRadius:11, fontSize:13, color:"#0f172a", background:"#fafbff" }}>
                    {opts.map(o=><option key={o.k} value={o.k}>{o.v}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ marginBottom:22 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>Description *</label>
              <textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Describe your compliance need..." rows={4}
                style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #e2e8f0", borderRadius:11, fontSize:13, color:"#0f172a", resize:"vertical", background:"#fafbff" }}/>
            </div>
            <div style={{ marginBottom:18 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Comments & Attachments</label>
              <CommentThread jobId={null} userName={session.user.name} isNew={true} initialComments={formComments}/>
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>{setShowForm(false);setFormComments([]);}} style={{ flex:1, padding:"12px", background:"#f8faff", border:"1px solid #e2e8f0", borderRadius:11, fontSize:14, fontWeight:600, color:"#64748b" }}>Cancel</button>
              <button onClick={submit} className="btn-primary" style={{ flex:2, padding:"12px", background:"linear-gradient(135deg,#0a1a6e,#2548e8)", border:"none", borderRadius:11, color:"#fff", fontSize:14, fontWeight:700 }}>Submit Request</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════
function DashView({ jobs, users }) {
  const invoiced  = jobs.reduce((s,j)=>s+(j.amount||0),0);
  const collected = jobs.reduce((s,j)=>s+(j.amountPaid||0),0);
  const recent    = jobs.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,6);

  const cards = [
    { label:"Total Jobs",    value:jobs.length,  color:"#4f46e5", icon:"📋", sub:`${jobs.filter(j=>j.status==="pending").length} pending` },
    { label:"In Progress",   value:jobs.filter(j=>j.status==="inprogress").length, color:"#2563eb", icon:"⚡", sub:"Active" },
    { label:"Completed",     value:jobs.filter(j=>j.status==="completed").length,  color:"#059669", icon:"✅", sub:"Delivered" },
    { label:"Clients",       value:users.length, color:"#7c3aed", icon:"👥", sub:"Registered" },
    { label:"Collected",     value:sar(collected), color:"#059669", icon:"💰", sub:`${pct(collected,invoiced)}% of ${sar(invoiced)}` },
    { label:"Outstanding",   value:sar(invoiced-collected), color:"#d97706", icon:"⏳", sub:"Pending" },
  ];

  return (
    <div>
      <div className="fade-up" style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:22, fontWeight:800, color:"#0f172a", letterSpacing:"-0.02em" }}>Dashboard</h2>
        <p style={{ color:"#64748b", fontSize:13, marginTop:3 }}>Platform overview and financial summary</p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:24 }} className="grid-2-mobile">
        {cards.map((c,i) => <AdminStatCard key={c.label} {...c} delay={(i%4)+1}/>)}
      </div>

      {/* Payment breakdown */}
      <div className="fade-up" style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:16, padding:22, marginBottom:20, boxShadow:"0 2px 10px rgba(10,26,110,.04)" }}>
        <p style={{ fontSize:12, fontWeight:700, color:"#64748b", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:18 }}>Payment Breakdown</p>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }} className="grid-2-mobile">
          {Object.entries(P).map(([k,v]) => {
            const g = jobs.filter(j=>j.payment===k);
            return (
              <div key={k} style={{ background:"#f8faff", borderRadius:12, padding:"14px 16px", border:`1px solid ${v.color}20` }}>
                <PBadge v={k}/>
                <p style={{ fontSize:22, fontWeight:800, color:"#0f172a", marginTop:10 }}>{g.length}</p>
                <p style={{ fontSize:11, color:"#64748b", marginTop:3 }}>{sar(g.reduce((s,j)=>s+(j.amountPaid||0),0))}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent activity */}
      <div className="fade-up" style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:16, overflow:"hidden", boxShadow:"0 2px 10px rgba(10,26,110,.04)" }}>
        <div style={{ padding:"16px 22px", borderBottom:"1px solid #f1f5f9" }}>
          <p style={{ fontSize:12, fontWeight:700, color:"#64748b", letterSpacing:"0.07em", textTransform:"uppercase" }}>Recent Activity</p>
        </div>
        {recent.map((j,i) => {
          const u = users.find(x=>x.id===j.userId);
          const bl = (j.amount||0)-(j.amountPaid||0);
          return (
            <div key={j.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 22px", borderBottom:i<recent.length-1?"1px solid #f8faff":"none", gap:12, flexWrap:"wrap" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <Dot p={j.priority}/>
                <div>
                  <p style={{ fontSize:13, color:"#0f172a", fontWeight:600 }}>{j.title}</p>
                  <p style={{ fontSize:11, color:"#94a3b8" }}>{u?.name} · {fmt(j.updatedAt)}</p>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                {j.amount>0 && <span style={{ fontSize:12, fontWeight:700, color:bl>0?"#d97706":"#059669" }}>{bl>0?`Due ${sar(bl)}`:"Paid"}</span>}
                <SBadge v={j.status}/>
                <PBadge v={j.payment}/>
              </div>
            </div>
          );
        })}
        {recent.length===0 && <p style={{ padding:"32px 22px", textAlign:"center", color:"#94a3b8", fontSize:13 }}>No activity yet.</p>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — JOB REQUESTS
// ═══════════════════════════════════════════════════════════════════════════
function JobsView({ jobs, users, onUpdate, onAddJob }) {
  const [tab, setTab]         = useState("all");
  const [search, setSearch]   = useState("");
  const [editJob, setEditJob] = useState(null);
  const [ef, setEf]           = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [nf, setNf]           = useState({ userId:"", title:"", category:"Iqama renewal", description:"", priority:"medium", amount:0, amountPaid:0, payment:"unpaid" });
  const [commentCounts, setCounts] = useState({});

  React.useEffect(() => {
    if (!USE_BACKEND || jobs.length === 0) return;
    jobs.forEach(j => {
      db.getComments(j.id).then(rows => setCounts(p=>({...p,[j.id]:(rows||[]).length}))).catch(()=>{});
    });
  }, [jobs.length]);

  // Auto-derive payment status from amounts
  function derivePayment(amount, amountPaid) {
    const amt = Number(amount)||0;
    const pd  = Number(amountPaid)||0;
    if (pd <= 0 || amt === 0) return "unpaid";
    if (pd >= amt) return "paid";
    return "partial";
  }

  function handleNfAmts(field, raw) {
    const n = Math.max(0, Number(raw)||0);
    const upd = { ...nf, [field]:n };
    upd.payment = derivePayment(field==="amount"?n:nf.amount, field==="amountPaid"?n:nf.amountPaid);
    setNf(upd);
  }

  function submitNew() {
    if (!nf.userId || !nf.title.trim() || !nf.description.trim()) return;
    onAddJob({ ...nf, amount: Number(nf.amount)||0, amountPaid: Number(nf.amountPaid)||0 });
    setNf({ userId:"", title:"", category:"Iqama renewal", description:"", priority:"medium", amount:0, amountPaid:0, payment:"unpaid" });
    setShowAdd(false);
  }

  const filtered = jobs.filter(j => {
    const ok = tab==="all"||j.status===tab;
    const s  = search.toLowerCase();
    const u  = users.find(x=>x.id===j.userId);
    return ok && (!s||j.title.toLowerCase().includes(s)||j.id.toLowerCase().includes(s)||u?.name.toLowerCase().includes(s));
  });

  function openEdit(j) { setEditJob(j); setEf({ status:j.status, payment:j.payment, amount:j.amount||0, amountPaid:j.amountPaid||0, adminNote:j.adminNote||"" }); }

  function handleAmts(field, raw) {
    const n = Math.max(0, Number(raw)||0);
    const upd = { ...ef, [field]:n };
    upd.payment = derivePayment(field==="amount"?n:ef.amount, field==="amountPaid"?n:ef.amountPaid);
    setEf(upd);
  }

  const bl = Math.max(0,(ef.amount||0)-(ef.amountPaid||0));
  const nfBl = Math.max(0,(Number(nf.amount)||0)-(Number(nf.amountPaid)||0));

  return (
    <div>
      <div className="fade-up" style={{ marginBottom:20, display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:"#0f172a", letterSpacing:"-0.02em" }}>Job Requests</h2>
          <p style={{ color:"#64748b", fontSize:13, marginTop:3 }}>Manage all client compliance requests</p>
        </div>
        <button onClick={()=>setShowAdd(true)} style={{ display:"flex", alignItems:"center", gap:7, padding:"10px 18px", background:"linear-gradient(135deg,#047857,#059669)", border:"none", borderRadius:11, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer" }}>
          <span style={{ fontSize:16 }}>+</span> Assign Job to Client
        </button>
      </div>

      {/* Admin New Job Modal */}
      {showAdd && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.4)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, padding:16 }}
          onClick={e=>e.target===e.currentTarget&&setShowAdd(false)}>
          <div className="fade-up" style={{ background:"#fff", borderRadius:20, padding:"28px 24px", width:"100%", maxWidth:540, maxHeight:"92vh", overflowY:"auto", boxShadow:"0 24px 80px rgba(10,26,110,.15)", border:"1px solid #e2e8f0" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
              <h3 style={{ fontSize:18, fontWeight:800, color:"#0f172a" }}>Assign New Job to Client</h3>
              <button onClick={()=>setShowAdd(false)} style={{ background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:8, width:32, height:32, color:"#64748b", fontSize:18, cursor:"pointer" }}>×</button>
            </div>

            {/* Client */}
            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>Client *</label>
              <select value={nf.userId} onChange={e=>setNf({...nf,userId:e.target.value})}
                style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #e2e8f0", borderRadius:11, fontSize:13, color:"#0f172a", background:"#fafbff" }}>
                <option value="">— Select a client —</option>
                {users.map(u=><option key={u.id} value={u.id}>{u.name} ({u.company||u.username})</option>)}
              </select>
            </div>

            {/* Title */}
            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>Job Title *</label>
              <input value={nf.title} onChange={e=>setNf({...nf,title:e.target.value})} placeholder="e.g. VAT Return Q2 2025"
                style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #e2e8f0", borderRadius:11, fontSize:14, color:"#0f172a", background:"#fafbff" }}/>
            </div>

            {/* Category + Priority */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>Category</label>
                <select value={nf.category} onChange={e=>setNf({...nf,category:e.target.value})}
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #e2e8f0", borderRadius:11, fontSize:13, color:"#0f172a", background:"#fafbff" }}>
                  {CATS.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>Priority</label>
                <select value={nf.priority} onChange={e=>setNf({...nf,priority:e.target.value})}
                  style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #e2e8f0", borderRadius:11, fontSize:13, color:"#0f172a", background:"#fafbff" }}>
                  {[["low","Low"],["medium","Medium"],["high","High"],["urgent","Urgent"]].map(([k,v])=><option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            {/* Description */}
            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>Description *</label>
              <textarea value={nf.description} onChange={e=>setNf({...nf,description:e.target.value})} placeholder="Describe the job scope..." rows={3}
                style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #e2e8f0", borderRadius:11, fontSize:13, color:"#0f172a", background:"#fafbff", resize:"vertical" }}/>
            </div>

            {/* ── PAYMENT SECTION ── */}
            <div style={{ background:"#f8faff", border:"1.5px solid #e0e7ff", borderRadius:14, padding:"16px 18px", marginBottom:14 }}>
              <p style={{ fontSize:11, fontWeight:700, color:"#4338ca", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:14, display:"flex", alignItems:"center", gap:6 }}>
                <span>💳</span> Payment Details
              </p>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
                <div>
                  <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>Invoice Amount (SAR)</label>
                  <input type="number" value={nf.amount} onChange={e=>handleNfAmts("amount",e.target.value)} min="0" placeholder="0"
                    style={{ width:"100%", padding:"11px 13px", border:"1.5px solid #e2e8f0", borderRadius:10, color:"#0f172a", fontSize:15, fontWeight:700, background:"#fff" }}/>
                </div>
                <div>
                  <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>Amount Paid (SAR)</label>
                  <input type="number" value={nf.amountPaid} onChange={e=>handleNfAmts("amountPaid",e.target.value)} min="0" placeholder="0"
                    style={{ width:"100%", padding:"11px 13px", border:"1.5px solid #e2e8f0", borderRadius:10, color:"#0f172a", fontSize:15, fontWeight:700, background:"#fff" }}/>
                </div>
              </div>

              {/* Payment summary */}
              {(Number(nf.amount)||0) > 0 && (
                <div style={{ background:"#fff", borderRadius:10, padding:"12px 14px", border:"1px solid #e2e8f0", marginBottom:12 }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", textAlign:"center", marginBottom:8 }}>
                    {[["Invoice",sar(nf.amount),"#0f172a"],["Paid",sar(nf.amountPaid||0),"#059669"],["Balance",sar(nfBl),nfBl>0?"#d97706":"#059669"]].map(([l,v,c],i)=>(
                      <div key={l} style={{ padding:"6px", borderRight:i<2?"1px solid #f1f5f9":"none" }}>
                        <p style={{ fontSize:14, fontWeight:800, color:c }}>{v}</p>
                        <p style={{ fontSize:10, color:"#94a3b8", marginTop:2 }}>{l}</p>
                      </div>
                    ))}
                  </div>
                  <ProgressBar paid={Number(nf.amountPaid)||0} total={Number(nf.amount)||0}/>
                </div>
              )}

              {/* Payment status override */}
              <div>
                <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Payment Status</label>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {Object.entries(P).map(([k,v]) => (
                    <button key={k} onClick={()=>setNf({...nf,payment:k})} style={{
                      padding:"7px 14px", borderRadius:9, border:`2px solid ${nf.payment===k?v.color:"#e2e8f0"}`,
                      background:nf.payment===k?`${v.color}15`:"#fff", color:nf.payment===k?v.color:"#94a3b8",
                      fontSize:12, fontWeight:700, cursor:"pointer", transition:"all .15s"
                    }}>{v.label}</button>
                  ))}
                </div>
              </div>
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setShowAdd(false)} style={{ flex:1, padding:"12px", background:"#f8faff", border:"1px solid #e2e8f0", borderRadius:11, fontSize:14, fontWeight:600, color:"#64748b", cursor:"pointer" }}>Cancel</button>
              <button onClick={submitNew} className="btn-primary" style={{ flex:2, padding:"12px", background:"linear-gradient(135deg,#047857,#059669)", border:"none", borderRadius:11, color:"#fff", fontSize:14, fontWeight:700,
                opacity:(!nf.userId||!nf.title.trim()||!nf.description.trim())?0.5:1 }}>
                Assign Job
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="fade-up" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, gap:10, flexWrap:"wrap" }}>
        <div style={{ display:"flex", gap:4, background:"#f1f5f9", borderRadius:12, padding:4, flexWrap:"wrap" }}>
          {[["all","All"],["pending","Pending"],["inprogress","In Progress"],["completed","Done"]].map(([k,l]) => (
            <button key={k} onClick={()=>setTab(k)} style={{
              padding:"7px 13px", borderRadius:9, border:"none", fontSize:12, fontWeight:600,
              background: tab===k ? "#fff" : "transparent",
              color: tab===k ? "#0a1a6e" : "#64748b",
              boxShadow: tab===k ? "0 1px 6px rgba(10,26,110,.10)" : "none",
              transition:"all .15s"
            }}>{l}</button>
          ))}
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search..." style={{
          padding:"9px 14px", background:"#fff", border:"1px solid #e2e8f0",
          borderRadius:10, color:"#0f172a", fontSize:13, width:200
        }}/>
      </div>

      {/* Table */}
      <div className="fade-up hide-mobile" style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:16, overflow:"auto", boxShadow:"0 2px 10px rgba(10,26,110,.04)" }}>
        <table style={{ width:"100%", borderCollapse:"collapse", minWidth:800 }}>
          <thead>
            <tr style={{ borderBottom:"1px solid #f1f5f9", background:"#f8faff" }}>
              {["ID","Client","Title","Status","Payment","Invoice","Paid","Balance",""].map(h=>(
                <th key={h} style={{ padding:"13px 14px", textAlign:"left", fontSize:10, fontWeight:700, color:"#64748b", letterSpacing:"0.07em", textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.slice().reverse().map(j => {
              const u   = users.find(x=>x.id===j.userId);
              const jbl = (j.amount||0)-(j.amountPaid||0);
              return (
                <tr key={j.id} style={{ borderBottom:"1px solid #f8faff", transition:"background .15s" }}
                  onMouseEnter={e=>e.currentTarget.style.background="#f8faff"}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{ padding:"13px 14px", fontSize:11, color:"#4f46e5", fontWeight:700 }}>{j.id}</td>
                  <td style={{ padding:"13px 14px" }}>
                    <p style={{ fontSize:13, fontWeight:600, color:"#0f172a", whiteSpace:"nowrap" }}>{u?.name}</p>
                    <p style={{ fontSize:10, color:"#94a3b8" }}>{u?.company}</p>
                  </td>
                  <td style={{ padding:"13px 14px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                      <Dot p={j.priority}/>
                      <div>
                        <p onClick={()=>openEdit(j)} style={{ fontSize:13, color:"#1d4ed8", fontWeight:600, cursor:"pointer", textDecoration:"underline", textDecorationColor:"#bfdbfe" }}>{j.title}</p>
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:2 }}>
                          {j.adminNote && <p style={{ fontSize:10, color:"#7c3aed" }}>Note added</p>}
                          {(commentCounts[j.id]||0)>0 && (
                            <span style={{ display:"inline-flex", alignItems:"center", gap:3, background:"#eef2ff", border:"1px solid #c7d2fe", borderRadius:6, padding:"1px 6px", fontSize:10, color:"#4f46e5", fontWeight:700 }}>
                              💬 {commentCounts[j.id]}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding:"13px 14px" }}><SBadge v={j.status}/></td>
                  <td style={{ padding:"13px 14px" }}><PBadge v={j.payment}/></td>
                  <td style={{ padding:"13px 14px", fontSize:12, color:"#0f172a", fontWeight:600, whiteSpace:"nowrap" }}>{j.amount?sar(j.amount):"—"}</td>
                  <td style={{ padding:"13px 14px", fontSize:12, color:"#059669", fontWeight:600, whiteSpace:"nowrap" }}>{j.amountPaid?sar(j.amountPaid):"—"}</td>
                  <td style={{ padding:"13px 14px", minWidth:120 }}>
                    {j.amount ? <>
                      <p style={{ fontSize:12, fontWeight:700, color:jbl>0?"#d97706":"#059669", whiteSpace:"nowrap" }}>{jbl>0?sar(jbl):"✓ Paid"}</p>
                      <ProgressBar paid={j.amountPaid||0} total={j.amount}/>
                    </> : <span style={{ color:"#cbd5e1" }}>—</span>}
                  </td>
                  <td style={{ padding:"13px 14px" }}>
                    <button onClick={()=>openEdit(j)} style={{ padding:"6px 14px", background:"#eef2ff", border:"1px solid #c7d2fe", borderRadius:8, color:"#4f46e5", fontSize:12, fontWeight:600, whiteSpace:"nowrap" }}>
                      Update
                    </button>
                  </td>
                </tr>
              );
            })}
            {filtered.length===0 && <tr><td colSpan={9} style={{ padding:40, textAlign:"center", color:"#94a3b8", fontSize:13 }}>No requests found.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div style={{ display:"none" }} className="mobile-cards">
        {filtered.slice().reverse().map(j => {
          const u = users.find(x=>x.id===j.userId);
          const jbl = (j.amount||0)-(j.amountPaid||0);
          return (
            <div key={j.id} style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:16, marginBottom:10 }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:10 }}>
                <p style={{ fontSize:11, color:"#4f46e5", fontWeight:700 }}>{j.id}</p>
                <SBadge v={j.status}/>
              </div>
              <p onClick={()=>openEdit(j)} style={{ fontSize:14, fontWeight:700, color:"#1d4ed8", marginBottom:4, cursor:"pointer" }}>{j.title}</p>
              <p style={{ fontSize:12, color:"#64748b", marginBottom:8 }}>{u?.name} · {u?.company}</p>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <PBadge v={j.payment}/>
                {j.amount>0 && <p style={{ fontSize:13, fontWeight:700, color:jbl>0?"#d97706":"#059669" }}>{jbl>0?`Due ${sar(jbl)}`:"Paid"}</p>}
              </div>
              <button onClick={()=>openEdit(j)} style={{ width:"100%", marginTop:12, padding:"9px", background:"#eef2ff", border:"1px solid #c7d2fe", borderRadius:9, color:"#4f46e5", fontSize:13, fontWeight:600 }}>Update</button>
            </div>
          );
        })}
      </div>

      {/* Edit Modal */}
      {editJob && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.4)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, padding:16 }}>
          <div className="fade-up" style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:20, padding:"28px 24px", width:"100%", maxWidth:500, maxHeight:"94vh", overflowY:"auto", boxShadow:"0 24px 80px rgba(10,26,110,.12)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
              <h3 style={{ fontWeight:800, color:"#0f172a", fontSize:18 }}>Update Request</h3>
              <button onClick={()=>setEditJob(null)} style={{ background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:8, width:32, height:32, color:"#64748b", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
            <p style={{ color:"#94a3b8", fontSize:12, marginBottom:22 }}>{editJob.id} · {editJob.title}</p>

            <p style={{ fontSize:10, fontWeight:700, color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>Job Status</p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:20 }}>
              {Object.entries(S).map(([k,v]) => (
                <button key={k} onClick={()=>setEf({...ef,status:k})} style={{
                  padding:"8px 16px", borderRadius:10, border:`2px solid ${ef.status===k?v.color:"#e2e8f0"}`,
                  background: ef.status===k ? v.bg : "#fff", color: ef.status===k ? v.color : "#94a3b8",
                  fontSize:12, fontWeight:700, transition:"all .15s", cursor:"pointer"
                }}>{v.label}</button>
              ))}
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:10 }}>
              {[["Invoice Amount (SAR)","amount"],["Amount Paid (SAR)","amountPaid"]].map(([lbl,field]) => (
                <div key={field}>
                  <p style={{ fontSize:10, fontWeight:700, color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:7 }}>{lbl}</p>
                  <input type="number" value={ef[field]} onChange={e=>handleAmts(field,e.target.value)} min="0"
                    style={{ width:"100%", padding:"11px 13px", background:"#f8faff", border:"1.5px solid #e2e8f0", borderRadius:10, color:"#0f172a", fontSize:15, fontWeight:700 }}/>
                </div>
              ))}
            </div>

            {ef.amount > 0 && (
              <div style={{ background:"#f8faff", border:"1px solid #e2e8f0", borderRadius:12, padding:16, marginBottom:16 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", textAlign:"center" }}>
                  {[["Invoice",sar(ef.amount),"#0f172a"],["Paid",sar(ef.amountPaid||0),"#059669"],["Balance",sar(bl),bl>0?"#d97706":"#059669"]].map(([l,v,c],i) => (
                    <div key={l} style={{ padding:"8px", borderRight:i<2?"1px solid #e2e8f0":"none" }}>
                      <p style={{ fontSize:15, fontWeight:800, color:c }}>{v}</p>
                      <p style={{ fontSize:10, color:"#94a3b8", marginTop:3 }}>{l}</p>
                    </div>
                  ))}
                </div>
                <ProgressBar paid={ef.amountPaid||0} total={ef.amount}/>
                <div style={{ display:"flex", justifyContent:"space-between", marginTop:8 }}>
                  <p style={{ fontSize:10, color:"#94a3b8" }}>{pct(ef.amountPaid||0,ef.amount)}% collected</p>
                  <PBadge v={ef.payment}/>
                </div>
              </div>
            )}

            <p style={{ fontSize:10, fontWeight:700, color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>Override Payment Status</p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:7, marginBottom:18 }}>
              {Object.entries(P).map(([k,v]) => (
                <button key={k} onClick={()=>setEf({...ef,payment:k})} style={{
                  padding:"7px 14px", borderRadius:9, border:`2px solid ${ef.payment===k?v.color:"#e2e8f0"}`,
                  background:ef.payment===k?`${v.color}15`:"#fff", color:ef.payment===k?v.color:"#94a3b8",
                  fontSize:12, fontWeight:700, cursor:"pointer"
                }}>{v.label}</button>
              ))}
            </div>

            <p style={{ fontSize:10, fontWeight:700, color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:8 }}>Note to Client</p>
            <textarea value={ef.adminNote} onChange={e=>setEf({...ef,adminNote:e.target.value})} placeholder="Progress update visible to client..." rows={3}
              style={{ width:"100%", padding:"11px 13px", background:"#f8faff", border:"1.5px solid #e2e8f0", borderRadius:10, color:"#0f172a", fontSize:13, resize:"vertical", marginBottom:22 }}/>

            <div style={{ marginBottom:22 }}>
              <p style={{ fontSize:10, fontWeight:700, color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:10 }}>Comments & Attachments</p>
              <CommentThread jobId={editJob.id} userName="Admin" isNew={false}/>
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setEditJob(null)} style={{ flex:1, padding:"12px", background:"#f8faff", border:"1px solid #e2e8f0", borderRadius:11, color:"#64748b", fontSize:14, cursor:"pointer" }}>Cancel</button>
              <button onClick={()=>{onUpdate(editJob.id,{...ef,updatedAt:new Date().toISOString()});setEditJob(null);}} className="btn-primary" style={{ flex:2, padding:"12px", background:"linear-gradient(135deg,#0a1a6e,#2548e8)", border:"none", borderRadius:11, color:"#fff", fontSize:14, fontWeight:700 }}>Save Changes</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — CLIENTS
// ═══════════════════════════════════════════════════════════════════════════
const BLANK = { name:"", username:"", password:"", company:"", phone:"" };

function ClientsView({ jobs, users, onAddUser, onEditUser, onDeleteUser }) {
  const [sel, setSel]         = useState(null);
  const [modal, setModal]     = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm]       = useState(BLANK);
  const [showPw, setShowPw]   = useState(false);
  const [err, setErr]         = useState("");
  const [confirmDel, setConfirmDel] = useState(null);
  const [toast, setToast]     = useState("");

  function flash(m) { setToast(m); setTimeout(()=>setToast(""),3000); }
  function openCreate() { setEditing(null); setForm(BLANK); setErr(""); setShowPw(false); setModal(true); }
  function openEdit(u)  { setEditing(u); setForm({name:u.name,username:u.username,password:u.password,company:u.company||"",phone:u.phone||""}); setErr(""); setShowPw(false); setModal(true); }
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  function saveUser() {
    if (!form.name.trim())     return setErr("Full name is required.");
    if (!form.username.trim()) return setErr("Username is required.");
    if (!form.password.trim()) return setErr("Password is required.");
    if (form.password.length < 4) return setErr("Password must be at least 4 characters.");
    if (users.find(u=>u.username===form.username.trim()&&u.id!==editing?.id)) return setErr("Username already taken.");
    if (editing) { onEditUser(editing.id,{...form,name:form.name.trim(),username:form.username.trim()}); flash("Client updated."); }
    else { onAddUser({...form,name:form.name.trim(),username:form.username.trim(),id:uid()}); flash("New client created."); }
    setModal(false);
  }

  function doDelete() { onDeleteUser(confirmDel.id); if(sel===confirmDel.id) setSel(null); setConfirmDel(null); flash("Client removed."); }

  if (sel) {
    const u = users.find(x=>x.id===sel);
    if (!u) { setSel(null); return null; }
    const uJobs = jobs.filter(j=>j.userId===sel);
    const inv = uJobs.reduce((s,j)=>s+(j.amount||0),0);
    const col = uJobs.reduce((s,j)=>s+(j.amountPaid||0),0);
    return (
      <div>
        <Toast msg={toast}/>
        <button onClick={()=>setSel(null)} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:10, color:"#475569", fontSize:13, fontWeight:600, marginBottom:22 }}>← All Clients</button>
        <div style={{ display:"grid", gridTemplateColumns:"260px 1fr 1fr 1fr", gap:14, marginBottom:22 }} className="grid-1-mobile">
          <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:16, padding:20, boxShadow:"0 2px 10px rgba(10,26,110,.04)" }}>
            <div style={{ width:52,height:52,borderRadius:14,background:"linear-gradient(135deg,#0a1a6e,#2548e8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:800,color:"#fff",marginBottom:14 }}>{ini(u.name)}</div>
            <p style={{ fontSize:16, fontWeight:700, color:"#0f172a" }}>{u.name}</p>
            <p style={{ fontSize:12, color:"#64748b", marginTop:3 }}>{u.company}</p>
            <p style={{ fontSize:12, color:"#64748b", marginTop:3 }}>{u.phone}</p>
            <div style={{ marginTop:14, padding:"10px 12px", background:"#f0f4ff", border:"1px solid #c7d2fe", borderRadius:10 }}>
              <p style={{ fontSize:9, fontWeight:700, color:"#64748b", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:6 }}>Login</p>
              <p style={{ fontSize:12, color:"#4f46e5" }}>👤 {u.username}</p>
              <p style={{ fontSize:12, color:"#4f46e5", marginTop:3 }}>🔑 {u.password}</p>
            </div>
            <div style={{ display:"flex", gap:8, marginTop:12 }}>
              <button onClick={()=>openEdit(u)} style={{ flex:1, padding:"8px", background:"#eef2ff", border:"1px solid #c7d2fe", borderRadius:9, color:"#4f46e5", fontSize:12, fontWeight:600, cursor:"pointer" }}>✏ Edit</button>
              <button onClick={()=>setConfirmDel(u)} style={{ flex:1, padding:"8px", background:"#fff1f2", border:"1px solid #fecdd3", borderRadius:9, color:"#e11d48", fontSize:12, fontWeight:600, cursor:"pointer" }}>🗑</button>
            </div>
          </div>
          {[{l:"Total Jobs",v:uJobs.length,c:"#4f46e5"},{l:"Collected",v:sar(col),c:"#059669"},{l:"Balance",v:sar(inv-col),c:inv-col>0?"#d97706":"#059669"}].map(c=>(
            <div key={c.l} style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:16, padding:20, display:"flex", flexDirection:"column", justifyContent:"center", boxShadow:"0 2px 10px rgba(10,26,110,.04)" }}>
              <p style={{ fontSize:28, fontWeight:800, color:c.c, letterSpacing:"-0.02em" }}>{c.v}</p>
              <p style={{ fontSize:12, color:"#64748b", marginTop:6, fontWeight:600 }}>{c.l}</p>
            </div>
          ))}
        </div>
        <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:16, overflow:"auto", boxShadow:"0 2px 10px rgba(10,26,110,.04)" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth:600 }}>
            <thead><tr style={{ borderBottom:"1px solid #f1f5f9", background:"#f8faff" }}>
              {["ID","Title","Status","Invoice","Paid","Balance","Date"].map(h=><th key={h} style={{ padding:"13px 16px", textAlign:"left", fontSize:10, fontWeight:700, color:"#64748b", letterSpacing:"0.07em", textTransform:"uppercase", whiteSpace:"nowrap" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {uJobs.length===0 && <tr><td colSpan={7} style={{ padding:32, textAlign:"center", color:"#94a3b8", fontSize:13 }}>No requests yet.</td></tr>}
              {uJobs.slice().reverse().map(j=>{
                const jbl=(j.amount||0)-(j.amountPaid||0);
                return(
                  <tr key={j.id} style={{ borderBottom:"1px solid #f8faff" }}>
                    <td style={{ padding:"12px 16px", fontSize:11, color:"#4f46e5", fontWeight:700 }}>{j.id}</td>
                    <td style={{ padding:"12px 16px", fontSize:13, color:"#0f172a" }}>{j.title}</td>
                    <td style={{ padding:"12px 16px" }}><SBadge v={j.status}/></td>
                    <td style={{ padding:"12px 16px", fontSize:13, color:"#0f172a", fontWeight:600, whiteSpace:"nowrap" }}>{j.amount?sar(j.amount):"—"}</td>
                    <td style={{ padding:"12px 16px", fontSize:13, color:"#059669", fontWeight:600, whiteSpace:"nowrap" }}>{j.amountPaid?sar(j.amountPaid):"—"}</td>
                    <td style={{ padding:"12px 16px", minWidth:120 }}>{j.amount?<><p style={{ fontSize:12,fontWeight:700,color:jbl>0?"#d97706":"#059669",whiteSpace:"nowrap" }}>{jbl>0?sar(jbl):"✓ Paid"}</p><ProgressBar paid={j.amountPaid||0} total={j.amount}/></>:<span style={{color:"#cbd5e1"}}>—</span>}</td>
                    <td style={{ padding:"12px 16px", fontSize:11, color:"#94a3b8", whiteSpace:"nowrap" }}>{fmt(j.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {confirmDel&&<ConfirmDelete name={confirmDel.name} onConfirm={doDelete} onCancel={()=>setConfirmDel(null)}/>}
        {modal&&<UserModal editing={editing} form={form} f={f} showPw={showPw} setShowPw={setShowPw} err={err} onSave={saveUser} onClose={()=>setModal(false)}/>}
      </div>
    );
  }

  return (
    <div>
      <Toast msg={toast}/>
      <div className="fade-up" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ fontSize:22, fontWeight:800, color:"#0f172a", letterSpacing:"-0.02em" }}>Clients</h2>
          <p style={{ color:"#64748b", fontSize:13, marginTop:3 }}>{users.length} registered {users.length===1?"client":"clients"}</p>
        </div>
        <button onClick={openCreate} className="btn-primary" style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 20px", background:"linear-gradient(135deg,#0a1a6e,#2548e8)", border:"none", borderRadius:12, color:"#fff", fontSize:14, fontWeight:700 }}>+ Add Client</button>
      </div>

      {users.length===0 ? (
        <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:18, padding:60, textAlign:"center", boxShadow:"0 2px 12px rgba(10,26,110,.04)" }}>
          <p style={{ fontSize:48, marginBottom:16 }}>👥</p>
          <p style={{ color:"#0f172a", fontSize:16, fontWeight:700, marginBottom:6 }}>No clients yet</p>
          <p style={{ color:"#94a3b8", fontSize:13, marginBottom:20 }}>Add your first client to get started.</p>
          <button onClick={openCreate} className="btn-primary" style={{ padding:"11px 24px", background:"linear-gradient(135deg,#0a1a6e,#2548e8)", border:"none", borderRadius:11, color:"#fff", fontSize:14, fontWeight:700 }}>+ Add Client</button>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14 }} className="grid-2-mobile">
          {users.map((u,idx) => {
            const uJobs=jobs.filter(j=>j.userId===u.id);
            const inv=uJobs.reduce((s,j)=>s+(j.amount||0),0);
            const col=uJobs.reduce((s,j)=>s+(j.amountPaid||0),0);
            return (
              <div key={u.id} className={`card-hover fade-up fade-up-${(idx%4)+1}`}
                style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:16, padding:22, position:"relative", boxShadow:"0 2px 10px rgba(10,26,110,.04)" }}>
                <div style={{ position:"absolute", top:14, right:14, display:"flex", gap:6 }}>
                  <button onClick={e=>{e.stopPropagation();openEdit(u);}} style={{ width:28,height:28,borderRadius:7,background:"#f1f5f9",border:"1px solid #e2e8f0",color:"#64748b",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>✏</button>
                  <button onClick={e=>{e.stopPropagation();setConfirmDel(u);}} style={{ width:28,height:28,borderRadius:7,background:"#fff1f2",border:"1px solid #fecdd3",color:"#e11d48",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer" }}>🗑</button>
                </div>
                <div onClick={()=>setSel(u.id)} style={{ cursor:"pointer" }}>
                  <div style={{ width:46,height:46,borderRadius:13,background:"linear-gradient(135deg,#0a1a6e,#2548e8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#fff",marginBottom:14 }}>{ini(u.name)}</div>
                  <p style={{ fontSize:15, fontWeight:700, color:"#0f172a", marginBottom:2, paddingRight:68 }}>{u.name}</p>
                  <p style={{ fontSize:12, color:"#64748b", marginBottom:12 }}>{u.company||"—"}</p>
                  <div style={{ padding:"8px 10px", background:"#f0f4ff", borderRadius:9, border:"1px solid #c7d2fe", marginBottom:14 }}>
                    <span style={{ fontSize:11, color:"#64748b" }}>👤 <span style={{ color:"#4f46e5", fontWeight:600 }}>{u.username}</span></span>
                    <span style={{ fontSize:11, color:"#64748b", marginLeft:12 }}>🔑 <span style={{ color:"#4f46e5" }}>{u.password}</span></span>
                  </div>
                  <div style={{ borderTop:"1px solid #f1f5f9", paddingTop:12, display:"flex", justifyContent:"space-between", marginBottom:8 }}>
                    <div><p style={{ fontSize:22, fontWeight:800, color:"#4f46e5" }}>{uJobs.length}</p><p style={{ fontSize:10, color:"#94a3b8" }}>Jobs</p></div>
                    <div style={{ textAlign:"right" }}><p style={{ fontSize:14, fontWeight:700, color:inv-col>0?"#d97706":"#059669" }}>{sar(inv-col)}</p><p style={{ fontSize:10, color:"#94a3b8" }}>Balance</p></div>
                  </div>
                  <ProgressBar paid={col} total={inv}/>
                  <p style={{ fontSize:10, color:"#94a3b8", marginTop:5 }}>{pct(col,inv)}% of {sar(inv)} collected</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {confirmDel&&<ConfirmDelete name={confirmDel.name} onConfirm={doDelete} onCancel={()=>setConfirmDel(null)}/>}
      {modal&&<UserModal editing={editing} form={form} f={f} showPw={showPw} setShowPw={setShowPw} err={err} onSave={saveUser} onClose={()=>setModal(false)}/>}
    </div>
  );
}

function ConfirmDelete({ name, onConfirm, onCancel }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.4)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:400, padding:16 }}>
      <div className="fade-up" style={{ background:"#fff", border:"1px solid #fecdd3", borderRadius:18, padding:30, width:"100%", maxWidth:360, textAlign:"center", boxShadow:"0 24px 60px rgba(225,29,72,.10)" }}>
        <p style={{ fontSize:44, marginBottom:16 }}>⚠️</p>
        <h3 style={{ fontWeight:800, color:"#0f172a", fontSize:18, marginBottom:8 }}>Remove Client?</h3>
        <p style={{ fontSize:13, color:"#64748b", marginBottom:24, lineHeight:1.6 }}>Remove <strong style={{ color:"#0f172a" }}>{name}</strong>? Their job history stays but login access is removed.</p>
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onCancel} style={{ flex:1, padding:"12px", background:"#f8faff", border:"1px solid #e2e8f0", borderRadius:11, color:"#64748b", fontSize:14, cursor:"pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex:1, padding:"12px", background:"#ef4444", border:"none", borderRadius:11, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>Remove</button>
        </div>
      </div>
    </div>
  );
}

function UserModal({ editing, form, f, showPw, setShowPw, err, onSave, onClose }) {
  const isNew = !editing;
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.4)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:500, padding:16 }}>
      <div className="fade-up" style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:22, padding:"28px 24px", width:"100%", maxWidth:460, maxHeight:"94vh", overflowY:"auto", boxShadow:"0 24px 80px rgba(10,26,110,.12)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
          <h3 style={{ fontWeight:800, color:"#0f172a", fontSize:18 }}>{isNew?"Add New Client":"Edit Client"}</h3>
          <button onClick={onClose} style={{ background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:8, width:32, height:32, color:"#64748b", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>×</button>
        </div>
        <p style={{ color:"#94a3b8", fontSize:12, marginBottom:24 }}>{isNew?"Create a new client account":"Update client details and credentials"}</p>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }} className="grid-1-mobile">
          {[["Full Name *","name","e.g. Ahmed Al-Rashid"],["Company","company","e.g. Trading Co."]].map(([lbl,k,ph])=>(
            <div key={k} style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#475569", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:7 }}>{lbl}</label>
              <input value={form[k]} onChange={e=>f(k,e.target.value)} placeholder={ph}
                style={{ width:"100%", padding:"11px 13px", background:"#f8faff", border:"1.5px solid #e2e8f0", borderRadius:10, color:"#0f172a", fontSize:14 }}/>
            </div>
          ))}
        </div>

        <div style={{ marginBottom:14 }}>
          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#475569", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:7 }}>Phone</label>
          <input value={form.phone} onChange={e=>f("phone",e.target.value)} placeholder="+966 50 000 0000"
            style={{ width:"100%", padding:"11px 13px", background:"#f8faff", border:"1.5px solid #e2e8f0", borderRadius:10, color:"#0f172a", fontSize:14 }}/>
        </div>

        <div style={{ height:1, background:"#f1f5f9", margin:"16px 0", position:"relative" }}>
          <span style={{ position:"absolute", top:-8, left:10, background:"#fff", padding:"0 10px", fontSize:9, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase" }}>Login Credentials</span>
        </div>

        <div style={{ marginBottom:14 }}>
          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#475569", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:7 }}>Username *</label>
          <input value={form.username} onChange={e=>f("username",e.target.value.toLowerCase().replace(/\s/g,""))} placeholder="e.g. ahmed"
            style={{ width:"100%", padding:"11px 13px", background:"#f8faff", border:"1.5px solid #e2e8f0", borderRadius:10, color:"#0f172a", fontSize:14 }}/>
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={{ display:"block", fontSize:10, fontWeight:700, color:"#475569", letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:7 }}>Password *</label>
          <div style={{ position:"relative" }}>
            <input type={showPw?"text":"password"} value={form.password} onChange={e=>f("password",e.target.value)} placeholder="min 4 characters"
              style={{ width:"100%", padding:"11px 44px 11px 13px", background:"#f8faff", border:"1.5px solid #e2e8f0", borderRadius:10, color:"#0f172a", fontSize:14 }}/>
            <button onClick={()=>setShowPw(!showPw)} style={{ position:"absolute", right:13, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"#94a3b8", fontSize:16, padding:0, cursor:"pointer" }}>{showPw?"🙈":"👁"}</button>
          </div>
          {form.password && <p style={{ fontSize:11, marginTop:5, color:form.password.length>=8?"#059669":form.password.length>=4?"#d97706":"#ef4444", fontWeight:600 }}>
            Strength: {form.password.length>=8?"Strong":form.password.length>=4?"Good":"Too short"}
          </p>}
        </div>

        {(form.username||form.name) && (
          <div style={{ background:"#f0f4ff", border:"1px solid #c7d2fe", borderRadius:11, padding:"12px 14px", marginBottom:18 }}>
            <p style={{ fontSize:9, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase", marginBottom:8 }}>Preview</p>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:34,height:34,borderRadius:9,background:"linear-gradient(135deg,#0a1a6e,#2548e8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:"#fff",flexShrink:0 }}>{form.name?ini(form.name):"?"}</div>
              <div>
                <p style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{form.name||"—"}</p>
                <p style={{ fontSize:11, color:"#64748b" }}>{form.company||"No company"}</p>
              </div>
            </div>
            <div style={{ marginTop:8, display:"flex", gap:12 }}>
              <span style={{ fontSize:11, color:"#4f46e5" }}>👤 {form.username||"—"}</span>
              <span style={{ fontSize:11, color:"#4f46e5" }}>🔑 {"•".repeat(Math.min(form.password.length||0,10))||"—"}</span>
            </div>
          </div>
        )}

        {err && <div style={{ background:"#fff1f2", border:"1px solid #fecdd3", color:"#be123c", borderRadius:10, padding:"10px 13px", fontSize:13, marginBottom:16 }}>{err}</div>}

        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:"12px", background:"#f8faff", border:"1px solid #e2e8f0", borderRadius:11, color:"#64748b", fontSize:14, cursor:"pointer" }}>Cancel</button>
          <button onClick={onSave} className="btn-primary" style={{ flex:2, padding:"12px", background:"linear-gradient(135deg,#0a1a6e,#2548e8)", border:"none", borderRadius:11, color:"#fff", fontSize:14, fontWeight:700 }}>
            {isNew?"Create Account":"Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — SETUP (with RLS SQL fix)
// ═══════════════════════════════════════════════════════════════════════════
function SetupView() {
  const [copied, setCopied] = useState(false);
  const sql = `-- Run this in Supabase SQL Editor to set up tables + fix RLS warnings

-- 1. Drop existing tables (if resetting)
DROP TABLE IF EXISTS public.comments;
DROP TABLE IF EXISTS public.jobs;
DROP TABLE IF EXISTS public.users;

-- 2. Create tables
CREATE TABLE public.users (
  id        TEXT PRIMARY KEY,
  username  TEXT UNIQUE NOT NULL,
  password  TEXT NOT NULL,
  name      TEXT NOT NULL,
  company   TEXT DEFAULT '',
  phone     TEXT DEFAULT ''
);

CREATE TABLE public.jobs (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES public.users(id),
  title       TEXT NOT NULL DEFAULT '',
  category    TEXT DEFAULT '',
  description TEXT DEFAULT '',
  priority    TEXT DEFAULT 'medium',
  status      TEXT DEFAULT 'pending',
  payment     TEXT DEFAULT 'unpaid',
  amount      NUMERIC(12,2) DEFAULT 0,
  amount_paid NUMERIC(12,2) DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  admin_note  TEXT DEFAULT ''
);

CREATE TABLE public.comments (
  id         TEXT PRIMARY KEY,
  job_id     TEXT REFERENCES public.jobs(id),
  author     TEXT NOT NULL DEFAULT '',
  text       TEXT DEFAULT '',
  files      TEXT DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Enable RLS on all tables (fixes Supabase security warnings)
ALTER TABLE public.users    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- 4. Create permissive policies so the anon key can read/write
--    (for a private internal tool — tighten these later with auth)
CREATE POLICY "allow_all_users"    ON public.users    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_jobs"     ON public.jobs     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_comments" ON public.comments FOR ALL USING (true) WITH CHECK (true);

-- 5. Storage bucket for file uploads (run separately if needed)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('job-files', 'job-files', true)
-- ON CONFLICT DO NOTHING;`;

  function copy() { try{navigator.clipboard.writeText(sql);}catch(e){} setCopied(true); setTimeout(()=>setCopied(false),2500); }

  return (
    <div>
      <div className="fade-up" style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:22, fontWeight:800, color:"#0f172a", letterSpacing:"-0.02em" }}>Backend Setup</h2>
        <p style={{ color:"#64748b", fontSize:13, marginTop:3 }}>Connect Supabase — free tier, no credit card needed</p>
      </div>
      <div className="fade-up" style={{ background:"#fffbeb", border:"1px solid #fde68a", borderRadius:14, padding:"16px 20px", marginBottom:22, display:"flex", gap:14, alignItems:"center" }}>
        <span style={{ fontSize:24, flexShrink:0 }}>⚡</span>
        <div>
          <p style={{ fontSize:14, fontWeight:700, color:"#92400e", marginBottom:2 }}>Running in Demo Mode — data resets on refresh</p>
          <p style={{ fontSize:13, color:"#78350f" }}>Follow the steps below to enable live cloud storage.</p>
        </div>
      </div>

      {/* RLS notice */}
      <div className="fade-up" style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:14, padding:"16px 20px", marginBottom:22, display:"flex", gap:14, alignItems:"flex-start" }}>
        <span style={{ fontSize:24, flexShrink:0 }}>🔒</span>
        <div>
          <p style={{ fontSize:14, fontWeight:700, color:"#14532d", marginBottom:4 }}>RLS (Row Level Security) — Fixed in SQL below</p>
          <p style={{ fontSize:13, color:"#166534", lineHeight:1.6 }}>
            The SQL below enables RLS on all tables and creates permissive policies, which resolves the Supabase security warnings: <em>"RLS Disabled in Public"</em> and <em>"Sensitive Columns Exposed"</em>.
          </p>
        </div>
      </div>

      {[["1","Create Supabase project","supabase.com → sign up free → New project. Wait ~2 min."],
        ["2","Run the SQL","SQL Editor → New query → paste the SQL below → Run. This creates tables, enables RLS, and sets policies."],
        ["3","Copy API keys","Project Settings → API → copy Project URL and anon key."],
        ["4","Update env variables","Set REACT_APP_SUPABASE_URL and REACT_APP_SUPABASE_KEY in your .env file."],
        ["5","Deploy to Vercel","Connect GitHub repo to Vercel, add env vars, deploy. Free forever."]
      ].map(([n,t,b]) => (
        <div key={n} className={`fade-up fade-up-${n}`} style={{ display:"flex", gap:16, background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, padding:"16px 20px", marginBottom:10, boxShadow:"0 1px 6px rgba(10,26,110,.04)" }}>
          <div style={{ width:32,height:32,borderRadius:"50%",background:"linear-gradient(135deg,#0a1a6e,#2548e8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"#fff",flexShrink:0 }}>{n}</div>
          <div><p style={{ fontSize:14, fontWeight:700, color:"#0f172a", marginBottom:3 }}>{t}</p><p style={{ fontSize:12, color:"#64748b", lineHeight:1.65 }}>{b}</p></div>
        </div>
      ))}

      <div className="fade-up" style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:14, overflow:"hidden", marginTop:20, boxShadow:"0 2px 10px rgba(10,26,110,.04)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 18px", borderBottom:"1px solid #f1f5f9", background:"#f8faff" }}>
          <p style={{ fontSize:12, fontWeight:700, color:"#64748b" }}>SQL Schema + RLS Policies</p>
          <button onClick={copy} style={{ padding:"6px 16px", background:copied?"#f0fdf4":"#eef2ff", border:`1px solid ${copied?"#bbf7d0":"#c7d2fe"}`, borderRadius:8, color:copied?"#059669":"#4f46e5", fontSize:12, fontWeight:700, cursor:"pointer" }}>{copied?"✓ Copied!":"Copy SQL"}</button>
        </div>
        <pre style={{ padding:"20px 18px", fontSize:11, color:"#475569", lineHeight:1.8, overflowX:"auto", margin:0, fontFamily:"'Courier New',monospace", background:"#f8faff" }}>{sql}</pre>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN SIDE NAV BUTTON
// ═══════════════════════════════════════════════════════════════════════════
function SideNavBtn({ n, page, goPage, users, isMini }) {
  const active = page === n.id;
  const [hovered, setHovered] = React.useState(false);
  return (
    <div className={isMini?"nav-tip":""} style={{ position:"relative" }}>
      <button
        onClick={()=>goPage(n.id)}
        onMouseEnter={()=>setHovered(true)}
        onMouseLeave={()=>setHovered(false)}
        style={{
          width:"100%", display:"flex", alignItems:"center",
          gap: isMini?0:10, justifyContent:isMini?"center":"flex-start",
          padding: isMini?"13px 0":"11px 14px",
          borderRadius:12, border:"none", fontSize:13, fontWeight:600,
          marginBottom:3, cursor:"pointer",
          background: active ? "#eef2ff" : hovered ? "#f8faff" : "transparent",
          color: active ? "#4f46e5" : hovered ? "#475569" : "#94a3b8",
          borderLeft: (!isMini&&active) ? "3px solid #4f46e5" : "3px solid transparent",
          transition:"all .15s",
        }}>
        <span style={{ fontSize:isMini?20:16, flexShrink:0 }}>{n.icon}</span>
        {!isMini && <span style={{ flex:1 }}>{n.label}</span>}
        {!isMini && n.id==="clients" && (
          <span style={{ fontSize:10, background:"#eef2ff", color:"#4f46e5", padding:"2px 7px", borderRadius:99, fontWeight:700 }}>{users.length}</span>
        )}
        {!isMini && n.id==="setup" && !USE_BACKEND && (
          <span style={{ fontSize:9, background:"#f97316", color:"#fff", padding:"2px 6px", borderRadius:4, fontWeight:700 }}>!</span>
        )}
      </button>
      {isMini && <span className="tip-label">{n.label}{n.id==="clients"?" ("+users.length+")":""}</span>}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN SHELL (LIGHT THEME)
// ═══════════════════════════════════════════════════════════════════════════
function AdminShell({ jobs, users, onUpdate, onAddJob, onAddUser, onEditUser, onDeleteUser, onLogout }) {
  const [page, setPage]         = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = [
    { id:"dashboard", label:"Dashboard",    icon:"⊞" },
    { id:"jobs",      label:"Job Requests", icon:"📋" },
    { id:"clients",   label:"Clients",      icon:"👥" },
    { id:"setup",     label:"Setup",        icon:"⚙"  },
  ];

  function goPage(id) { setPage(id); setMobileOpen(false); }
  const mini = collapsed;

  const ADMIN_CSS = `
    .admin-wrap { display:flex; min-height:100vh; background:#f8faff; font-family:'Plus Jakarta Sans',sans-serif; }
    .desk-sidebar {
      background:#fff;
      border-right:1px solid #e2e8f0;
      display:flex; flex-direction:column;
      height:100vh; position:sticky; top:0;
      overflow:hidden; flex-shrink:0;
      transition:width .25s cubic-bezier(.4,0,.2,1);
      z-index:10;
      box-shadow:1px 0 8px rgba(10,26,110,.04);
    }
    .mob-topbar { display:none; }
    .mob-tabs   { display:none; }
    .nav-tip { position:relative; }
    .nav-tip .tip-label {
      display:none; position:absolute; left:calc(100% + 12px); top:50%; transform:translateY(-50%);
      background:#0f172a; color:#f1f5f9; padding:5px 10px; border-radius:8px;
      font-size:12px; font-weight:600; white-space:nowrap; box-shadow:0 4px 16px rgba(0,0,0,.2);
      pointer-events:none; z-index:999;
    }
    .nav-tip .tip-label::before {
      content:''; position:absolute; right:100%; top:50%; transform:translateY(-50%);
      border:5px solid transparent; border-right-color:#0f172a;
    }
    .nav-tip:hover .tip-label { display:block; }
    @keyframes slideInLeft { from{transform:translateX(-100%)} to{transform:translateX(0)} }
    @media (max-width:768px) {
      .desk-sidebar { display:none !important; }
      .mob-topbar   { display:flex !important; }
      .mob-tabs     { display:flex !important; }
      .admin-content{ padding:16px 14px 80px !important; }
      .hide-mobile  { display:none !important; }
    }
    @media (min-width:769px) {
      .desk-sidebar { display:flex !important; }
      .mobile-cards { display:none !important; }
    }
    @media (max-width:768px) {
      .mobile-cards { display:flex !important; flex-direction:column; }
    }
  `;

  return (
    <div className="admin-wrap">
      <style>{G + ADMIN_CSS}</style>

      {/* ── DESKTOP SIDEBAR ── */}
      <div className="desk-sidebar" style={{ width:mini?64:220 }}>
        <div style={{ padding:mini?"14px 0":"18px 14px 14px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"center", justifyContent:mini?"center":"space-between", position:"relative" }}>
          {!mini && <TaxitLogo scale={0.8}/>}
          {mini && <span style={{ fontSize:22 }}>🏷</span>}
          {!mini && (
            <button onClick={()=>setCollapsed(true)} title="Collapse" style={{ background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:8, width:26, height:26, color:"#94a3b8", fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>‹</button>
          )}
          {mini && (
            <button onClick={()=>setCollapsed(false)} title="Expand" style={{ position:"absolute", right:-1, top:"50%", transform:"translateY(-50%)", background:"#fff", border:"1px solid #e2e8f0", borderRadius:"0 8px 8px 0", width:14, height:28, color:"#94a3b8", fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>›</button>
          )}
        </div>

        {!mini && (
          <div style={{ padding:"8px 14px", borderBottom:"1px solid #f1f5f9" }}>
            <div style={{ display:"inline-flex", padding:"2px 9px", background:USE_BACKEND?"#f0fdf4":"#fffbeb", border:"1px solid "+(USE_BACKEND?"#bbf7d0":"#fde68a"), borderRadius:99 }}>
              <p style={{ fontSize:9, fontWeight:700, color:USE_BACKEND?"#059669":"#d97706", letterSpacing:"0.07em", textTransform:"uppercase" }}>{USE_BACKEND?"● Live":"● Demo"}</p>
            </div>
          </div>
        )}

        <nav style={{ flex:1, padding:mini?"10px 6px":"12px 10px", overflowY:"auto" }}>
          {nav.map(n => <SideNavBtn key={n.id} n={n} page={page} goPage={goPage} users={users} isMini={mini}/>)}
        </nav>

        <div style={{ padding:mini?"10px 6px":"12px 10px", borderTop:"1px solid #f1f5f9" }}>
          {!mini && (
            <div style={{ padding:"8px 14px", marginBottom:4 }}>
              <p style={{ fontSize:12, fontWeight:600, color:"#0f172a" }}>Administrator</p>
              <p style={{ fontSize:10, color:"#94a3b8" }}>taxit.com.sa</p>
            </div>
          )}
          <div className={mini?"nav-tip":""} style={{ position:"relative" }}>
            <button onClick={onLogout} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:mini?"center":"flex-start", gap:8, padding:mini?"13px 0":"9px 14px", borderRadius:10, border:"none", background:"none", color:"#94a3b8", fontSize:13, cursor:"pointer" }}>
              <span style={{ fontSize:mini?20:15 }}>↩</span>
              {!mini && "Sign out"}
            </button>
            {mini && <span className="tip-label">Sign out</span>}
          </div>
        </div>
      </div>

      {/* ── MOBILE OVERLAY ── */}
      {mobileOpen && <div onClick={()=>setMobileOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.3)", zIndex:299 }}/>}

      {/* ── MOBILE SLIDE-IN SIDEBAR ── */}
      {mobileOpen && (
        <div style={{ position:"fixed", left:0, top:0, bottom:0, width:240, background:"#fff", borderRight:"1px solid #e2e8f0", display:"flex", flexDirection:"column", zIndex:300, animation:"slideInLeft .25s cubic-bezier(.4,0,.2,1) both", boxShadow:"4px 0 20px rgba(10,26,110,.10)" }}>
          <div style={{ padding:"18px 16px 14px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <TaxitLogo scale={0.8}/>
            <button onClick={()=>setMobileOpen(false)} style={{ background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:8, width:32, height:32, color:"#94a3b8", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>×</button>
          </div>
          <nav style={{ flex:1, padding:"12px 10px", overflowY:"auto" }}>
            {nav.map(n => <SideNavBtn key={n.id} n={n} page={page} goPage={goPage} users={users} isMini={false}/>)}
          </nav>
          <div style={{ padding:"12px 10px", borderTop:"1px solid #f1f5f9" }}>
            <div style={{ padding:"8px 14px", marginBottom:4 }}>
              <p style={{ fontSize:12, fontWeight:600, color:"#0f172a" }}>Administrator</p>
              <p style={{ fontSize:10, color:"#94a3b8" }}>taxit.com.sa</p>
            </div>
            <button onClick={onLogout} style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"10px 14px", borderRadius:10, border:"none", background:"#fff1f2", color:"#e11d48", fontSize:13, fontWeight:600, cursor:"pointer" }}>↩ Sign out</button>
          </div>
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div style={{ flex:1, overflow:"auto", display:"flex", flexDirection:"column", minWidth:0 }}>
        {/* Mobile top bar */}
        <div className="mob-topbar" style={{ padding:"11px 16px", background:"#fff", borderBottom:"1px solid #e2e8f0", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50, boxShadow:"0 1px 8px rgba(10,26,110,.06)" }}>
          <TaxitLogo scale={0.75}/>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ padding:"2px 8px", background:USE_BACKEND?"#f0fdf4":"#fffbeb", border:"1px solid "+(USE_BACKEND?"#bbf7d0":"#fde68a"), borderRadius:99 }}>
              <p style={{ fontSize:9, fontWeight:700, color:USE_BACKEND?"#059669":"#d97706", letterSpacing:"0.06em", textTransform:"uppercase" }}>{USE_BACKEND?"● Live":"● Demo"}</p>
            </div>
            <button onClick={()=>setMobileOpen(true)} style={{ background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:9, width:36, height:36, color:"#475569", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer" }}>☰</button>
          </div>
        </div>

        {/* Page content */}
        <div className="admin-content" style={{ padding:"26px 22px", flex:1 }}>
          {page==="dashboard" && <DashView jobs={jobs} users={users}/>}
          {page==="jobs"      && <JobsView jobs={jobs} users={users} onUpdate={onUpdate} onAddJob={onAddJob}/>}
          {page==="clients"   && <ClientsView jobs={jobs} users={users} onAddUser={onAddUser} onEditUser={onEditUser} onDeleteUser={onDeleteUser}/>}
          {page==="setup"     && <SetupView/>}
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      <div className="mob-tabs" style={{ position:"fixed", bottom:0, left:0, right:0, height:62, background:"rgba(255,255,255,.97)", borderTop:"1px solid #e2e8f0", alignItems:"center", justifyContent:"space-around", zIndex:100, backdropFilter:"blur(16px)" }}>
        {nav.map(n => {
          const active = page === n.id;
          return (
            <button key={n.id} onClick={()=>goPage(n.id)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, flex:1, padding:"8px 4px", background:"none", border:"none", cursor:"pointer", color:active?"#4f46e5":"#94a3b8", transition:"color .15s", position:"relative" }}>
              {active && <span style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:28, height:2, background:"#4f46e5", borderRadius:99 }}/>}
              <span style={{ fontSize:19, lineHeight:1 }}>{n.icon}</span>
              <span style={{ fontSize:9, fontWeight:700, letterSpacing:"0.04em", textTransform:"uppercase" }}>
                {n.id==="dashboard"?"Dash":n.id==="jobs"?"Jobs":n.id==="clients"?"Clients":"Setup"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROOT — with session persistence
// ═══════════════════════════════════════════════════════════════════════════
async function loadAll(table) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers:{ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}` }
  });
  if (!r.ok) { const msg = await r.text(); throw new Error(msg); }
  const rows = await r.json();
  return rows.map(fromDb);
}

export default function App() {
  // ── 1. Session loaded from localStorage ──
  const [session, setSession] = useState(() => loadSession());
  const [jobs,    setJobs]    = useState(SEED_JOBS);
  const [users,   setUsers]   = useState(SEED_USERS);
  const [loading, setLoading] = useState(USE_BACKEND);

  // When session changes, persist it
  useEffect(() => {
    if (session) saveSession(session);
    else clearSession();
  }, [session]);

  // Load from Supabase on mount
  useEffect(() => {
    if (!USE_BACKEND) return;
    Promise.all([loadAll("users"), loadAll("jobs")])
      .then(([u, j]) => { if(u.length) setUsers(u); if(j.length) setJobs(j); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // If session is restored from localStorage, reload users to validate the user still exists
  useEffect(() => {
    if (!session || session.role === "admin" || !USE_BACKEND) return;
    loadAll("users").then(u => {
      setUsers(u);
      // Validate restored customer session
      const stillExists = u.find(x => x.id === session.user?.id);
      if (!stillExists) { clearSession(); setSession(null); }
    }).catch(() => {});
  }, []); // run once on mount

  const handleLogin = useCallback((s) => { setSession(s); }, []);
  const handleLogout = useCallback(() => { setSession(null); }, []);

  const addJob = useCallback(d => {
    const { initialComments, ...jobData } = d;
    const j = {
      id:jid(), ...jobData,
      status:"pending",
      payment: jobData.payment || "unpaid",
      amount: Number(jobData.amount)||0,
      amountPaid: Number(jobData.amountPaid)||0,
      createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), adminNote:""
    };
    if (USE_BACKEND) {
      db.insertJob(j).catch(e=>console.error("insertJob:",e.message));
      if (initialComments?.length) {
        initialComments.forEach(c => db.insertComment({...c,job_id:j.id}).catch(e=>console.error("insertComment:",e.message)));
      }
    }
    setJobs(p=>[...p,j]);
  }, []);

  const updateJob = useCallback((id, upd) => {
    const withTime = { ...upd, updatedAt:new Date().toISOString() };
    if (USE_BACKEND) db.updateJob(id, withTime).catch(e=>console.error("updateJob:",e.message));
    setJobs(p=>p.map(j=>j.id===id?{...j,...withTime}:j));
  }, []);

  const addUser = useCallback(u => {
    if (USE_BACKEND) db.insertUser(u).catch(e=>console.error("insertUser:",e.message));
    setUsers(p=>[...p,u]);
  }, []);

  const editUser = useCallback((id,upd) => {
    if (USE_BACKEND) db.updateUser(id,upd).catch(e=>console.error("updateUser:",e.message));
    setUsers(p=>p.map(u=>u.id===id?{...u,...upd}:u));
    // Update restored session if editing own user
    setSession(s => s?.user?.id === id ? { ...s, user:{ ...s.user, ...upd } } : s);
  }, []);

  const delUser = useCallback(id => {
    if (USE_BACKEND) db.deleteUser(id).catch(e=>console.error("deleteUser:",e.message));
    setUsers(p=>p.filter(u=>u.id!==id));
  }, []);

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#f8faff", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <style>{G}</style>
      <div style={{ textAlign:"center" }}>
        <TaxitLogo scale={1.2}/>
        <p style={{ color:"#94a3b8", fontSize:14, marginTop:16 }}>Connecting to database…</p>
      </div>
    </div>
  );

  if (!session) return <Login onLogin={handleLogin} users={users}/>;

  if (session.role==="admin") return (
    <AdminShell jobs={jobs} users={users} onUpdate={updateJob} onAddJob={addJob}
      onAddUser={addUser} onEditUser={editUser} onDeleteUser={delUser} onLogout={handleLogout}/>
  );

  return <CustomerPortal session={session} jobs={jobs} onNewJob={addJob} onLogout={handleLogout}/>;
}
