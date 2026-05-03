import { useState, useCallback, useEffect } from "react";
import React from 'react';

// ─── CONFIG ────────────────────────────────────────────────────────────[...]
const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_KEY || "";
const USE_BACKEND  = SUPABASE_URL !== "" && SUPABASE_KEY !== "";
const ADMIN_USERNAME = process.env.REACT_APP_ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.REACT_APP_ADMIN_PASSWORD || "taxit2024";

// ─── STORAGE HELPERS ───────────────────────────────────────────────────
const Storage = {
  saveSession: (session) => {
    try {
      localStorage.setItem('taxit_session', JSON.stringify(session));
    } catch (e) {
      console.error("Failed to save session:", e);
    }
  },
  getSession: () => {
    try {
      const item = localStorage.getItem('taxit_session');
      return item ? JSON.parse(item) : null;
    } catch (e) {
      console.error("Failed to retrieve session:", e);
      return null;
    }
  },
  clearSession: () => {
    try {
      localStorage.removeItem('taxit_session');
    } catch (e) {
      console.error("Failed to clear session:", e);
    }
  }
};

// ─── SEED DATA ───────────────────────────────────────────────────────────[...]
const SEED_USERS = [];
const ADMIN_CRED = { username: ADMIN_USERNAME, password: ADMIN_PASSWORD };
const CATS = ["Iqama renewal","Exit-re entry","CR/Article services","Mudad Services","Misa Services","VAT/Tax Services","Accounting services","Other"];

const S = {
  pending:    { label:"Pending",     color:"#f59e0b", bg:"rgba(245,158,11,.13)", ring:"rgba(245,158,11,.35)" },
  inprogress: { label:"In Progress", color:"#3b82f6", bg:"rgba(59,130,246,.13)", ring:"rgba(59,130,246,.35)" },
  completed:  { label:"Completed",   color:"#10b981", bg:"rgba(16,185,129,.13)", ring:"rgba(16,185,129,.35)" },
  cancelled:  { label:"Cancelled",   color:"#ef4444", bg:"rgba(239,68,68,.13)",  ring:"rgba(239,68,68,.35)"  },
};
const P = {
  unpaid:  { label:"Unpaid",  color:"#ef4444" },
  partial: { label:"Partial", color:"#f59e0b" },
  paid:    { label:"Paid",    color:"#10b981" },
  waived:  { label:"Waived",  color:"#8b5cf6" },
};

const SEED_JOBS = [];

// ─── SUPABASE ───────────────────────────────────────────────────────────[...]
async function sbFetch(path, opts={}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts, headers:{ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, "Content-Type":"application/json", Prefer:"return=representation", ...(opts.headers||{}) }
  });
  if (!r.ok) {
    const msg = await r.text();
    console.error("Supabase error:", r.status, msg);
    throw new Error(msg);
  }
  return r.json();
}

// JS camelCase → DB snake_case (matches your existing Supabase columns)
function toDb(obj) {
  const map = {
    userId:     "user_id",
    amountPaid: "amount_paid",
    createdAt:  "created_at",
    updatedAt:  "updated_at",
    adminNote:  "admin_note"
  };
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[map[k] || k] = v;
  return out;
}

// DB snake_case → JS camelCase (for reading rows back from Supabase)
function fromDb(row) {
  const map = {
    user_id:     "userId",
    amount_paid: "amountPaid",
    created_at:  "createdAt",
    updated_at:  "updatedAt",
    admin_note:  "adminNote"
  };
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
  // Comments
  getComments:   job_id => sbFetch(`comments?job_id=eq.${job_id}&order=created_at.asc`),
  insertComment: d      => sbFetch("comments", { method:"POST", body:JSON.stringify(d) }),
  // File upload to Supabase Storage
  uploadFile: async (jobId, file) => {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${jobId}/${Date.now()}-${safeName}`;
    // Try POST first, fallback to PUT (upsert)
    for (const method of ["POST", "PUT"]) {
      const r = await fetch(`${SUPABASE_URL}/storage/v1/object/job-files/${path}`, {
        method,
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "true",
        },
        body: file,
      });
      if (r.ok) return { path, name: file.name, size: file.size, type: file.type };
      const msg = await r.text();
      let parsed; try { parsed = JSON.parse(msg); } catch { parsed = { message: msg }; }
      // Bucket not found — tell user clearly
      if (parsed.error === "Bucket not found" || parsed.statusCode === "404") {
        throw new Error("Storage bucket not found. Please create a public bucket named 'job-files' in Supabase → Storage.");
      }
      if (method === "PUT") throw new Error(parsed.message || msg);
    }
  },
  getFileUrl: path => `${SUPABASE_URL}/storage/v1/object/public/job-files/${path}`,
};

// ─── UTILS ────────────────────────────────────────────────────────────[...]
const uid  = () => "u-" + Date.now() + Math.random().toString(36).slice(2,6);
// Use timestamp+random so ID is always unique across page reloads
const jid = () => "JR-" + Date.now() + "-" + Math.random().toString(36).slice(2,5).toUpperCase();
const fmt  = iso => new Date(iso).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
const sar  = n   => `SAR ${Number(n||0).toLocaleString()}`;
const pct  = (a,b) => b>0 ? Math.min(100,Math.round(a/b*100)) : 0;
const ini  = n   => n.split(" ").map(w=>w[0]).slice(0,2).join("").toUpperCase();

// ─── GLOBAL STYLES ─────────────────────────────────────────────────────────[...]
const G = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-text-size-adjust: 100%; }
  body { font-family: 'Plus Jakarta Sans', sans-serif; -webkit-font-smoothing: antialiased; }
  input, select, textarea, button { font-family: inherit; outline: none; }
  button { cursor: pointer; }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.12); border-radius: 99px; }

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
  .card-hover:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(10,17,114,.18) !important; }

  .btn-primary { transition: transform .15s, box-shadow .15s, opacity .15s; }
  .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(10,17,114,.35) !important; }
  .btn-primary:active { transform: scale(.98); }

  .nav-btn { transition: all .15s; }
  .nav-btn:hover { background: rgba(255,255,255,.06) !important; color: #e0e4ff !important; }

  input:focus, select:focus, textarea:focus {
    border-color: #3b5adb !important;
    box-shadow: 0 0 0 3px rgba(59,90,219,.15);
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

// ─── TAXIT LOGO (actual brand PNG) ──────────────────────────────────────────
const LOGO_DARK = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABkAAAAOECAYAAAD5Tf2iAAEAAElEQVR4nOz9248sa5rf9/2eNyIPVWutvXefD9O9u3uf1hoeRGIOHNL00CJlXggwqBsBhgAb8I1hX/jCgAH/CzZgaGD4wpBgiZIhCSBAiS[...]
const LOGO_LIGHT = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAABkAAAAOECAYAAAD5Tf2iAAEAAElEQVR4nOzd7XbbSJOu6TsiAVKS7ap6u3uvmfM/upm1Zu/ut8qWRAIZMT8yQYIUJcuWP2TruWq5KJEUCZAgCGRkRICIiIiIiIiIiIiIi[...]

function TaxitLogo({ scale=1, dark=false }) {
  const h = Math.round(56 * scale);
  return (
    <div style={{ display:"flex", alignItems:"center" }}>
      <img
        src={dark ? LOGO_DARK : LOGO_LIGHT}
        alt="Taxit"
        style={{ height: h, width: "auto", objectFit: "contain" }}
      />
    </div>
  );
}

// ─── SHARED COMPONENTS ───────────────────────────────────────────────────────
const SBadge = ({v}) => {
  const c = S[v]; if (!c) return null;
  return <span style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"4px 11px", borderRadius:99, fontSize:11, fontWeight:700, letterSpacing:"0.04em", background:c.bg, color:c.color[...]
    <span style={{ width:5, height:5, borderRadius:"50%", background:c.color, display:"inline-block", flexShrink:0 }}/>
    {c.label}
  </span>;
};

const PBadge = ({v}) => {
  const c = P[v]; if (!c) return null;
  return <span style={{ display:"inline-flex", padding:"4px 11px", borderRadius:99, fontSize:11, fontWeight:700, letterSpacing:"0.04em", color:c.color, border:`1.5px solid ${c.color}40`, backgrou[...]
};

const Dot = ({p}) => {
  const c = { urgent:"#ef4444", high:"#f97316", medium:"#f59e0b", low:"#94a3b8" };
  return <span style={{ width:8, height:8, borderRadius:"50%", background:c[p]||"#888", display:"inline-block", flexShrink:0 }} title={p}/>;
};

function ProgressBar({ paid, total, dark=false }) {
  const p = pct(paid, total);
  // The line below was causing the error because of the tags
  // const fill = p >= 100 ? "#10b981" : p > 0 ? "#f59e0b" : (dark ? "rgba(255,255,255,.1)" : "rgba(0,0,0,.06)"); 

  return (
    <div style={{ width:"100%", height:5, background: dark ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.06)", borderRadius:99, overflow:"hidden" }}>
      <div style={{ height:"100%", width:`${p}%`, background: p > 0 ? (p >= 100 ? "#10b981" : "#f59e0b") : "transparent", borderRadius:99, transition:"width .6s cubic-bezier(.22,1,.36,1)" }}/>
    </div>
  );
}
// ─── STAT CARD ───────────────────────────────────────────────────────────[...]
function StatCard({ label, value, sub, color, icon, delay=0 }) {
  return (
    <div className={`card-hover fade-up fade-up-${delay}`} style={{
      background:"#fff", borderRadius:16, padding:"20px 22px",
      border:"1px solid #edf0f7", boxShadow:"0 2px 12px rgba(10,26,110,.06)",
      display:"flex", flexDirection:"column", gap:8, minWidth:0
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
        <div style={{ width:38, height:38, borderRadius:11, background:`${color}14`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
          {icon}
        </div>
      </div>
      <div>
        <p style={{ fontSize:24, fontWeight:800, color:"#0f172a", lineHeight:1, fontFamily:"'Plus Jakarta Sans',sans-serif", letterSpacing:"-0.02em" }}>{value}</p>
        <p style={{ fontSize:12, fontWeight:600, color:"#64748b", marginTop:4 }}>{label}</p>
        {sub && <p style={{ fontSize:11, color:color, fontWeight:600, marginTop:2 }}>{sub}</p>}
      </div>
    </div>
  );
}

// Dark stat card for admin
function DarkStatCard({ label, value, sub, color, icon, delay=0 }) {
  return (
    <div className={`card-hover fade-up fade-up-${delay}`} style={{
      background:"rgba(255,255,255,.04)", borderRadius:16, padding:"20px 22px",
      border:"1px solid rgba(255,255,255,.07)",
      display:"flex", flexDirection:"column", gap:8, minWidth:0
    }}>
      <div style={{ width:38, height:38, borderRadius:11, background:`${color}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>
        {icon}
      </div>
      <p style={{ fontSize:24, fontWeight:800, color:"#f8fafc", lineHeight:1, fontFamily:"'Plus Jakarta Sans',sans-serif", letterSpacing:"-0.02em", marginTop:4 }}>{value}</p>
      <p style={{ fontSize:12, fontWeight:600, color:"#64748b" }}>{label}</p>
      {sub && <p style={{ fontSize:11, color, fontWeight:600 }}>{sub}</p>}
    </div>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ position:"fixed", bottom:24, left:"50%", transform:"translateX(-50%)", zIndex:9999,
      background:"linear-gradient(135deg,#0a1a6e,#1a35cc)", color:"#fff", padding:"12px 24px",
      borderRadius:14, fontSize:13, fontWeight:600, boxShadow:"0 8px 32px rgba(10,26,110,.35)",
      whiteSpace:"nowrap", animation:"fadeUp .3s both" }}>
      ✓ {msg}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════[...]
// LOGIN PAGE
// ═════════════════════════════════════════════════════════════════[...]
function Login({ onLogin, users }) {
  const [mode, setMode] = useState("customer");
  const [un, setUn]     = useState("");
  const [pw, setPw]     = useState("");
  const [showPw, setShowPw] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [err, setErr]   = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    setErr(""); setBusy(true);
    try {
      if (mode === "admin") {
        if (un.trim() === ADMIN_CRED.username && pw.trim() === ADMIN_CRED.password) {
          const session = { role:"admin" };
          if (rememberMe) Storage.saveSession(session);
          onLogin(session);
        }
        else setErr("Invalid admin credentials.");
      } else {
        const u = users.find(x => x.username === un.trim() && x.password === pw.trim());
        if (u) {
          const session = { role:"customer", user:u };
          if (rememberMe) Storage.saveSession(session);
          onLogin(session);
        } else setErr("Invalid username or password.");
      }
    } catch(e) { setErr("Connection error. Please try again."); }
    setBusy(false);
  }

  return (
    <div style={{ minHeight:"100vh", background:"#f1f4fd", display:"flex", position:"relative", overflow:"hidden" }}>
      <style>{G}</style>

      {/* Left decorative panel */}
      <div className="hide-mobile" style={{
        width:"42%", background:"linear-gradient(145deg, #0a1a6e 0%, #1a35cc 60%, #2548e8 100%)",
        display:"flex", flexDirection:"column", justifyContent:"space-between", padding:"48px 52px",
        position:"relative", overflow:"hidden"
      }}>
        {/* Decorative circles */}
        <div style={{ position:"absolute", top:-80, right:-80, width:320, height:320, borderRadius:"50%", border:"1px solid rgba(255,255,255,.06)" }}/>
        <div style={{ position:"absolute", top:60, right:-120, width:400, height:400, borderRadius:"50%", border:"1px solid rgba(255,255,255,.04)" }}/>
        <div style={{ position:"absolute", bottom:-100, left:-60, width:280, height:280, borderRadius:"50%", background:"rgba(255,255,255,.03)" }}/>
        <div style={{ position:"absolute", bottom:100, right:-40, width:180, height:180, borderRadius:"50%", background:"rgba(255,215,0,.06)" }}/>

        <div style={{ position:"relative", zIndex:1 }}>
          <TaxitLogo scale={2.0} dark/>
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
      <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", padding:"24px 20px" }}>
        <div style={{ width:"100%", maxWidth:400 }} className="fade-up">

          {/* Mobile logo */}
          <div className="hide-mobile" style={{ display:"none" }}/>
          <div style={{ display:"flex", justifyContent:"center", marginBottom:36 }}>
            <div className="hide-mobile" style={{ display:"none" }}/>
            <div style={{ display:"block" }}>
              <TaxitLogo scale={1.3}/>
            </div>
          </div>

          <h1 style={{ fontSize:26, fontWeight:800, color:"#0f172a", marginBottom:6, letterSpacing:"-0.02em" }}>Welcome back</h1>
          <p style={{ fontSize:14, color:"#94a3b8", marginBottom:28 }}>Sign in to your account to continue</p>

          {/* Tab */}
          <div style={{ display:"flex", background:"#eef1fa", borderRadius:12, padding:4, marginBottom:24, gap:2 }}>
            {[["customer","Client Portal","👤"],["admin","Admin Panel","⚙"]].map(([m,l,ic]) => (
              <button key={m} onClick={()=>{setMode(m);setErr("");setUn("");setPw("");}} style={{
                flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:6,
                padding:"9px 0", borderRadius:9, border:"none", fontSize:13, fontWeight:600,
                background: mode===m ? "#fff" : "transparent",
                color: mode===m ? "#0a1a6e" : "#94a3b8",
                boxShadow: mode===m ? "0 1px 8px rgba(10,26,110,.12)" : "none",
                transition:"all .2s"
              }}><span>{ic}</span>{l}</button>
            ))}
          </div>

          {/* Fields */}
          {[["Username","text",un,setUn,mode==="admin"?"admin":"your username"],
            ["Password",showPw?"text":"password",pw,setPw,"••••••••"]].map(([lbl,type,val,set,ph],i) => (
            <div key={lbl} style={{ marginBottom:14, position:"relative" }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:7 }}>{lbl}</label>
              <input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph}
                onKeyDown={e=>e.key==="Enter"&&go()}
                style={{ width:"100%", padding: i===1?"12px 44px 12px 14px":"12px 14px", background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:11, color:"#0f172a", fontSize:14, transition[...]
              {i===1 && <button onClick={()=>setShowPw(!showPw)} style={{ position:"absolute", right:14, top:34, background:"none", border:"none", color:"#94a3b8", fontSize:16, padding:0, lineHei[...]
                {showPw?"🙈":"👁"}
              </button>}
            </div>
          ))}

          {/* Remember Me Checkbox */}
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
            <input 
              type="checkbox" 
              id="rememberMe"
              checked={rememberMe}
              onChange={e => setRememberMe(e.target.checked)}
              style={{ width:18, height:18, cursor:"pointer", accentColor:"#0a1a6e" }}
            />
            <label htmlFor="rememberMe" style={{ fontSize:13, color:"#64748b", cursor:"pointer", userSelect:"none" }}>
              Remember me on this device
            </label>
          </div>

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


// ════════════════════════════════════════════════════════════════[...]
// COMMENT THREAD — used in both new job form and job cards
// ════════════════════════════════════════════════════════════════[...]
function CommentThread({ jobId, userName, isNew = false, initialComments = [] }) {
  const [comments, setComments] = useState(initialComments);
  const [text, setText]         = useState("");
  const [files, setFiles]       = useState([]); // [{name,size,type,file,url,path}]
  const [sending, setSending]   = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = React.useRef();

  // Load comments from DB if we have a real jobId
  React.useEffect(() => {
    if (!jobId || isNew || !USE_BACKEND) return;
    db.getComments(jobId)
      .then(rows => setComments(rows || []))
      .catch(e => console.error("getComments failed:", e.message));
  }, [jobId, isNew]);

  function handleFiles(fileList) {
    const arr = Array.from(fileList).map(f => ({
      name: f.name, size: f.size, type: f.type, file: f,
      url: URL.createObjectURL(f), path: null,
    }));
    setFiles(p => [...p, ...arr]);
  }

  function removeFile(i) { setFiles(p => p.filter((_,idx) => idx !== i)); }

  async function send() {
    if (!text.trim() && files.length === 0) return;
    setSending(true);
    try {
      // Upload files first
      const uploaded = await Promise.all(files.map(async f => {
        if (!USE_BACKEND || !jobId) return { name: f.name, size: f.size, type: f.type, url: f.url, path: null };
        const info = await db.uploadFile(jobId, f.file);
        return { ...info, url: db.getFileUrl(info.path) };
      }));

      const comment = {
        id:         "c-" + Date.now(),
        job_id:     jobId || null,
        author:     userName,
        text:       text.trim(),
        files:      JSON.stringify(uploaded),
        created_at: new Date().toISOString(),
      };

      if (USE_BACKEND && jobId && !isNew) {
        await db.insertComment(comment);
      }

      setComments(p => [...p, { ...comment, files: uploaded }]);
      setText(""); setFiles([]);
    } catch(e) {
      console.error("send comment failed:", e.message);
      alert("Failed to send: " + e.message);
    } finally {
      setSending(false);
    }
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + " KB";
    return (bytes/(1024*1024)).toFixed(1) + " MB";
  }

  function fileIcon(type="") {
    if (type.startsWith("image/")) return "🖼️";
    if (type.includes("pdf"))       return "📄";
    if (type.includes("word") || type.includes("doc")) return "📝";
    if (type.includes("sheet") || type.includes("excel") || type.includes("csv")) return "📊";
    if (type.includes("zip") || type.includes("rar"))  return "🗜️";
    return "📎";
  }

  // Parse files field (may be string or array)
  function parseFiles(f) {
    if (!f) return [];
    if (Array.isArray(f)) return f;
    try { return JSON.parse(f); } catch { return []; }
  }

  return (
    <div style={{ marginTop: isNew ? 0 : 0 }}>
      {/* Existing comments */}
      {comments.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
          {comments.map((c, i) => {
            const cFiles = parseFiles(c.files);
            return (
              <div key={c.id || i} style={{ background:"#f8faff", borderRadius:12, padding:"12px 14px", border:"1px solid #edf0f7" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                  <div style={{ width:26, height:26, borderRadius:"50%", background:"linear-gradient(135deg,#0a1a6e,#2548e8)", display:"flex", alignItems:"center", justifyContent:"center" }}>
                    <span style={{ fontSize:11, color:"#fff", fontWeight:700 }}>{(c.author||"?")[0].toUpperCase()}</span>
                  </div>
                  <span style={{ fontSize:12, fontWeight:700, color:"#0f172a" }}>{c.author}</span>
                  <span style={{ fontSize:11, color:"#94a3b8", marginLeft:"auto" }}>{c.created_at ? new Date(c.created_at).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",h[...]
                </div>
                {c.text && <p style={{ fontSize:13, color:"#334155", lineHeight:1.6, marginBottom: cFiles.length ? 8 : 0 }}>{c.text}</p>}
                {cFiles.length > 0 && (
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:6 }}>
                    {cFiles.map((f,fi) => (
                      <a key={fi} href={f.url} target="_blank" rel="noreferrer"
                        style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", background:"#fff", border:"1px solid #e2e8f0", borderRadius:8, textDecoration:"none", fontSize:12,[...]
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

      {/* Input area */}
      <div style={{ border:"1.5px solid #e2e8f0", borderRadius:12, background:"#fafbff", overflow:"hidden" }}
        onDragOver={e=>{e.preventDefault();setDragOver(true);}}
        onDragLeave={()=>setDragOver(false)}
        onDrop={e=>{e.preventDefault();setDragOver(false);handleFiles(e.dataTransfer.files);}}>
        <textarea
          value={text} onChange={e=>setText(e.target.value)}
          placeholder="Add a comment or update..."
          rows={3}
          style={{ width:"100%", padding:"11px 14px", border:"none", background:"transparent", fontSize:13, color:"#0f172a", resize:"none", outline:"none", display:"block" }}
        />

        {/* Staged files */}
        {files.length > 0 && (
          <div style={{ padding:"8px 12px", borderTop:"1px solid #f1f4fd", display:"flex", flexWrap:"wrap", gap:6 }}>
            {files.map((f,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 8px", background:"#eef2ff", border:"1px solid #c7d2fe", borderRadius:7, fontSize:12, color:"#3730a3" }[...]
                <span>{fileIcon(f.type)}</span>
                <span style={{ maxWidth:130, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</span>
                <span style={{ color:"#6366f1" }}>{formatSize(f.size)}</span>
                <button onClick={()=>removeFile(i)} style={{ background:"none", border:"none", cursor:"pointer", color:"#6366f1", fontSize:14, lineHeight:1, padding:0 }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", borderTop:"1px solid #f1f4fd", background: dragOver ? "#eef2ff" : "transparent" }}>
          <button onClick={()=>fileRef.current.click()}
            style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", background:"#f1f4fd", border:"1px solid #e2e8f0", borderRadius:8, fontSize:12, fontWeight:600, color:"#475569"[...]
            📎 Attach File
          </button>
          <input ref={fileRef} type="file" multiple style={{ display:"none" }} onChange={e=>handleFiles(e.target.files)}/>
          <button onClick={send} disabled={sending || (!text.trim() && files.length===0)}
            style={{ padding:"7px 16px", background: (text.trim()||files.length) ? "linear-gradient(135deg,#0a1a6e,#2548e8)" : "#e2e8f0", border:"none", borderRadius:8, color: (text.trim()||files[...]
            {sending ? "Sending…" : "Send →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════[...]
// CUSTOMER PORTAL
// ════════════════════════════════════════════════════════════════[...]
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
    onNewJob({ ...form, userId:session.user.id, initialComments: formComments });
    setForm({ title:"", category:CATS[0], description:"", priority:"medium" });
    setFormComments([]);
    setShowForm(false); setOk(true); setTimeout(()=>setOk(false),4000);
  }

  const stats = [
    { label:"Total Requests", value:mine.length,  color:"#0a1a6e", icon:"📋", sub: mine.length===0?"No requests yet":`${mine.filter(j=>j.status==="pending").length} pending` },
    { label:"In Progress",    value:mine.filter(j=>j.status==="inprogress").length, color:"#2563eb", icon:"⚡", sub:"Active assignments" },
    { label:"Completed",      value:mine.filter(j=>j.status==="completed").length,  color:"#059669", icon:"✅", sub:"Delivered" },
    { label:"Balance Due",    value:sar(invoiced-paid), color:invoiced-paid>0?"#dc2626":"#059669", icon:"💳", sub:invoiced>0?`of ${sar(invoiced)} invoiced`:"No invoices yet" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#f8faff" }}>
      <style>{G}</style>

      {/* Header */}
      <header style={{ background:"#fff", borderBottom:"1px solid #edf0f7", padding:"0 24px", height:64, display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", to[...]
        <TaxitLogo scale={0.75}/>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div className="hide-mobile" style={{ textAlign:"right" }}>
            <p style={{ fontSize:13, fontWeight:700, color:"#0f172a" }}>{session.user.name}</p>
            <p style={{ fontSize:11, color:"#94a3b8" }}>{session.user.company}</p>
          </div>
          <button onClick={onLogout} style={{ padding:"8px 14px", background:"#f1f4fd", border:"1px solid #e2e8f0", borderRadius:9, color:"#0a1a6e", fontSize:12, fontWeight:600 }}>Sign out</butto[...]
        </div>
      </header>

      <div style={{ maxWidth:960, margin:"0 auto", padding:"28px 16px" }}>

        {/* Welcome bar */}
        <div className="fade-up" style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexWrap:"wrap", gap:12, marginBottom:24 }}>
          <div>
            <h2 style={{ fontSize:22, fontWeight:800, color:"#0f172a", letterSpacing:"-0.02em" }}>
              Good day, {session.user.name.split(" ")[0]} 👋
            </h2>
            <p style={{ color:"#94a3b8", fontSize:13, marginTop:3 }}>Track your compliance requests and payments</p>
          </div>
          <button onClick={()=>setShowForm(true)} className="btn-primary mobile-full" style={{
            display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"11px 20px",
            background:"linear-gradient(135deg,#0a1a6e,#2548e8)", border:"none", borderRadius:12,
            color:"#fff", fontSize:14, fontWeight:700
          }}>
            <span style={{ fontSize:18, lineHeight:1 }}>+</span> New Request
          </button>
        </div>

        {ok && <div className="fade-up" style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", color:"#15803d", borderRadius:12, padding:"12px 16px", marginBottom:20, fontSize:13, fontWeight:[...]
          ✓ Request submitted! Our team will be in touch soon.
        </div>}

        {/* Stats grid */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:14, marginBottom:28 }} className="grid-2-mobile">
          {stats.map((s,i) => <StatCard key={s.label} {...s} delay={i+1}/>)}
        </div>

        {/* Jobs list */}
        <div className="fade-up fade-up-4">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
            <h3 style={{ fontSize:15, fontWeight:800, color:"#0f172a" }}>My Requests</h3>
            <span style={{ fontSize:12, color:"#94a3b8" }}>{mine.length} total</span>
          </div>

          {mine.length === 0 ? (
            <div style={{ background:"#fff", borderRadius:16, border:"1px solid #edf0f7", padding:"52px 24px", textAlign:"center", boxShadow:"0 2px 12px rgba(10,26,110,.05)" }}>
              <p style={{ fontSize:44, marginBottom:14 }}>📋</p>
              <p style={{ fontSize:16, fontWeight:700, color:"#0f172a", marginBottom:6 }}>No requests yet</p>
              <p style={{ color:"#94a3b8", fontSize:13, marginBottom:20 }}>Submit your first compliance request to get started.</p>
              <button onClick={()=>setShowForm(true)} className="btn-primary" style={{ padding:"10px 22px", background:"linear-gradient(135deg,#0a1a6e,#2548e8)", border:"none", borderRadius:10, c[...]
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {mine.slice().reverse().map((j,i) => {
                const bl = (j.amount||0)-(j.amountPaid||0);
                return (
                  <div key={j.id} className="card-hover" style={{ background:"#fff", borderRadius:16, border:"1px solid #edf0f7", padding:"18px 20px", boxShadow:"0 2px 10px rgba(10,26,110,.05)", [...]
                    <div style={{ display:"flex", gap:14, justifyContent:"space-between", flexWrap:"wrap" }}>
                      <div style={{ flex:1, minWidth:200 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                          <Dot p={j.priority}/>
                          <span style={{ fontSize:11, color:"#94a3b8", fontWeight:600 }}>{j.id}</span>
                          <span style={{ color:"#e2e8f0" }}>·</span>
                          <span style={{ fontSize:11, color:"#94a3b8" }}>{j.category}</span>
                        </div>
                        <p style={{ fontSize:15, fontWeight:700, color:"#0f172a", marginBottom:5, lineHeight:1.3 }}>{j.title}</p>
                        <p style={{ fontSize:13, color:"#64748b", lineHeight:1.6, marginBottom: j.adminNote ? 12 : 0 }}>{j.description}</p>
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
                              {bl > 0
                                ? <span style={{ fontSize:10, color:"#ef4444", fontWeight:600 }}>Due {sar(bl)}</span>
                                : <span style={{ fontSize:10, color:"#10b981", fontWeight:600 }}>✓ Settled</span>}
                            </div>
                          </div>
                        )}
                        <p style={{ fontSize:10, color:"#cbd5e1" }}>{fmt(j.createdAt)}</p>
                      </div>
                    </div>
                    {/* Comments toggle */}
                    <div style={{ marginTop:12, paddingTop:12, borderTop:"1px solid #f1f4fd" }}>
                      <button onClick={()=>setExpandedJob(expandedJob===j.id ? null : j.id)}
                        style={{ background:"none", border:"none", cursor:"pointer", fontSize:12, color:"#6366f1", fontWeight:600, padding:0, display:"flex", alignItems:"center", gap:6 }}>
                        💬 {expandedJob===j.id ? "Hide" : "Comments & Files"}
                        <span style={{ fontSize:10, color:"#94a3b8" }}>{expandedJob===j.id ? "▲" : "▼"}</span>
                      </button>
                      {expandedJob===j.id && (
                        <div style={{ marginTop:12 }}>
                          <CommentThread jobId={j.id} userName={session.user.name} isNew={false} />
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
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,.5)", backdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200, padding:16 }[...]
          <div className="fade-up" style={{ background:"#fff", borderRadius:20, padding:"28px 24px", width:"100%", maxWidth:500, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 24px 80px rgba(10[...]
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h3 style={{ fontSize:19, fontWeight:800, color:"#0f172a" }}>New Compliance Request</h3>
              <button onClick={()=>setShowForm(false)} style={{ background:"#f8faff", border:"1px solid #e2e8f0", borderRadius:8, width:32, height:32, color:"#64748b", fontSize:18, display:"flex"[...]
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>Title *</label>
              <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Iqama renewal for Ahmed "
                style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #e2e8f0", borderRadius:11, fontSize:14, color:"#0f172a", background:"#fafbff" }}/>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:14 }}>
              {[["Category",form.category,v=>setForm({...form,category:v}),CATS.map(c=>({k:c,v:c}))],
                ["Priority",form.priority,v=>setForm({...form,priority:v}),[{k:"low",v:"Low"},{k:"medium",v:"Medium"},{k:"high",v:"High"},{k:"urgent",v:"Urgent"}]]
              ].map(([lbl,val,set,opts])=>(
                <div key={lbl}>
                  <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>{lbl}</label>
                  <select value={val} onChange={e=>set(e.target.value)} style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #e2e8f0", borderRadius:11, fontSize:13, color:"#0f172a", ba[...]
                    {opts.map(o=><option key={o.k} value={o.k}>{o.v}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div style={{ marginBottom:22 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:7 }}>Description *</label>
              <textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Describe your compliance need in detail..." rows={4}
                style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #e2e8f0", borderRadius:11, fontSize:13, color:"#0f172a", resize:"vertical", background:"#fafbff" }}/>
            </div>
            <div style={{ marginBottom:18 }}>
              <label style={{ display:"block", fontSize:11, fontWeight:700, color:"#475569", textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Comments & Attachments</label>
              <CommentThread jobId={null} userName={session.user.name} isNew={true} initialComments={formComments} />
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>{ setShowForm(false); setFormComments([]); }} style={{ flex:1, padding:"12px", background:"#f8faff", border:"1px solid #e2e8f0", borderRadius:11, fontSize:14, f[...]
              <button onClick={submit} className="btn-primary" style={{ flex:2, padding:"12px", background:"linear-gradient(135deg,#0a1a6e,#2548e8)", border:"none", borderRadius:11, color:"#fff",[...]
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════[...]
// ADMIN — DASHBOARD
// ════════════════════════════════════════════════════════════════[...]
function DashView({ jobs, users }) {
  const invoiced  = jobs.reduce((s,j)=>s+(j.amount||0),0);
  const collected = jobs.reduce((s,j)=>s+(j.amountPaid||0),0);
  const recent    = jobs.slice().sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt)).slice(0,6);

  const cards = [
    { label:"Total Jobs",      value:jobs.length,   color:"#818cf8", icon:"📋", sub:`${jobs.filter(j=>j.status==="pending").length} pending` },
    { label:"In Progress",     value:jobs.filter(j=>j.status==="inprogress").length, color:"#60a5fa", icon:"⚡", sub:"Active" },
    { label:"Completed",       value:jobs.filter(j=>j.status==="completed").length,  color:"#34d399", icon:"✅", sub:"Delivered" },
    { label:"Total Clients",   value:users.length,  color:"#c084fc", icon:"👥", sub:"Registered" },
    { label:"Collected",       value:sar(collected), color:"#34d399", icon:"💰", sub:`${pct(collected,invoiced)}% of ${sar(invoiced)}` },
    { label:"Outstanding",     value:sar(invoiced-collected), color:"#fb923c", icon:"⏳", sub:"Pending settlement" },
  ];

  return (
    <div>
      <div className="fade-up" style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:22, fontWeight:800, color:"#f8fafc", letterSpacing:"-0.02em" }}>Dashboard</h2>
        <p style={{ color:"#475569", fontSize:13, marginTop:3 }}>Platform overview and financial summary</p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:14, marginBottom:24 }} className="grid-2-mobile">
        {cards.map((c,i) => <DarkStatCard key={c.label} {...c} delay={(i%4)+1}/>)}
      </div>

      {/* Payment breakdown */}
      <div className="fade-up" style={{ background:"rgba(255,255,255,.04)", border:"1px solid rgba(255,255,255,.07)", borderRadius:16, padding:22, marginBottom:20 }}>
        <p style={{ fontSize:12, fontWeight:700, color:"#475569", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:18 }}>Payment Breakdown</p>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12 }} className="grid-2-mobile">
          {Object.entries(P).map(([k,v]) => {
            const g = jobs.filter(j=>j.payment===k);
            return (
              <div key={k} style={{ background:"rgba(255,255,255,.03)", borderRadius:12, padding:"14px 16px", border:`1px solid ${v.color}20` }}>
                <PBadge v={k}/>
                <p style={{ fontSize:22, fontWeight:800, color:"#f8fafc", marginTop:10, fontFamily:"'Plus Jakarta Sans',sans-serif" }}>{g.length}</p>
                <p style={{ fontSize:11, color:"#475569", marginTop:3 }}>{sar(g.reduce((s,j)=>s+(j.amountPaid||0),0))}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent activity */}
      <div className="fade-up" style={{ background:"rgba(255,255,255,.03)", border:"1px solid rgba(255,255,255,.07)", borderRadius:16, overflow:"hidden" }}>
        <div style={{ padding:"16px 22px", borderBottom:"1px solid rgba(255,255,255,.06)" }}>
          <p style={{ fontSize:12, fontWeight:700, color:"#475569", letterSpacing:"0.07em", textTransform:"uppercase" }}>Recent Activity</p>
        </div>
        {recent.map((j,i) => {
          const u = users.find(x=>x.id===j.userId);
          const bl = (j.amount||0)-(j.amountPaid||0);
          return (
            <div key={j.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 22px", borderBottom:i<recent.length-1?"1px solid rgba(255,255,255,.04)":"no[...]
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <Dot p={j.priority}/>
                <div>
                  <p style={{ fontSize:13, color:"#e2e8f0", fontWeight:600 }}>{j.title}</p>
                  <p style={{ fontSize:11, color:"#475569" }}>{u?.name} · {fmt(j.updatedAt)}</p>
                </div>
              </div>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                {j.amount>0 && <span style={{ fontSize:12, fontWeight:700, color:bl>0?"#fb923c":"#34d399" }}>{bl>0?`Due ${sar(bl)}`:"Paid"}</span>}
                <SBadge v={j.status}/>
                <PBadge v={j.payment}/>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Remaining component code continues with JobsView, ClientsView, SetupView, AdminShell, etc.
// (The rest of the components remain unchanged - only showing the first major portions)

// ════════════════════════════════════════════════════════════════[...]
// ROOT
// ════════════════════════════════════════════════════════════════[...]
// ─── SUPABASE DATA HELPERS ───────────────────────────────────────────────────
async function loadAll(table) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
    headers:{ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}` }
  });
  if (!r.ok) {
    const msg = await r.text();
    console.error(`loadAll(${table}) failed:`, r.status, msg);
    throw new Error(msg);
  }
  const rows = await r.json();
  return rows.map(fromDb);
}

export default function App() {
  const [session, setSession] = useState(() => Storage.getSession());
  const [jobs,    setJobs]    = useState(SEED_JOBS);
  const [users,   setUsers]   = useState(SEED_USERS);
  const [loading, setLoading] = useState(USE_BACKEND);

  // On mount, if Supabase is configured, pull live data
  useEffect(() => {
    if (!USE_BACKEND) return;
    Promise.all([loadAll("users"), loadAll("jobs")])
      .then(([u, j]) => { if(u.length) setUsers(u); if(j.length) setJobs(j); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    Storage.clearSession();
    setSession(null);
  };

  const addJob = useCallback(d => {
    // Strip UI-only fields before saving to DB
    const { initialComments, ...jobData } = d;
    const j = {
      id: jid(), ...jobData,
      status: "pending", payment: "unpaid",
      amount: 0, amountPaid: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      adminNote: ""
    };
    if (USE_BACKEND) {
      db.insertJob(j)
        .then(() => {
          console.log("✅ Job saved to DB:", j.id);
          // Save any initial comments too
          if (initialComments && initialComments.length > 0) {
            initialComments.forEach(c => {
              db.insertComment({ ...c, job_id: j.id }).catch(e => console.error("❌ insertComment failed:", e.message));
            });
          }
        })
        .catch(e => console.error("❌ insertJob failed:", e.message));
    }
    setJobs(p => [...p, j]);
  }, []);
  const updateJob = useCallback((id, upd) => {
    const withTime = { ...upd, updatedAt: new Date().toISOString() };
    if (USE_BACKEND) {
      db.updateJob(id, withTime)
        .then(() => console.log("✅ Job updated in DB:", id))
        .catch(e  => console.error("❌ updateJob failed:", e.message));
    }
    setJobs(p => p.map(j => j.id === id ? { ...j, ...withTime } : j));
  }, []);
  const addUser  = useCallback(u     => { if(USE_BACKEND)db.insertUser(u).catch(e=>console.error("❌ insertUser:",e.message)); setUsers(p=>[...p,u]); }, []);
  const editUser = useCallback((id,upd) => { if(USE_BACKEND)db.updateUser(id,upd).catch(e=>console.error("❌ updateUser:",e.message)); setUsers(p=>p.map(u=>u.id===id?{...u,...upd}:u)); }, []);
  const delUser  = useCallback(id    => { if(USE_BACKEND)db.deleteUser(id).catch(e=>console.error("❌ deleteUser:",e.message)); setUsers(p=>p.filter(u=>u.id!==id)); }, []);

  if (loading) return (
    <div style={{ minHeight:"100vh", background:"#f1f4fd", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <p style={{ fontFamily:"'Plus Jakarta Sans',sans-serif", color:"#64748b", fontSize:15 }}>Connecting to database…</p>
    </div>
  );

  if (!session) return <Login onLogin={setSession} users={users}/>;
  if (session.role==="admin") return <AdminShell jobs={jobs} users={users} onUpdate={updateJob} onAddJob={addJob} onAddUser={addUser} onEditUser={editUser} onDeleteUser={delUser} onLogout={handleLogout}/>;
  return <CustomerPortal session={session} jobs={jobs} onNewJob={addJob} onLogout={handleLogout}/>;
}
