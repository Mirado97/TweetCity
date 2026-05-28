import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ethers } from "ethers";
import {
  Shield, BarChart3, FileCode, Building2, Server,
  Loader2, AlertTriangle, CheckCircle2, RefreshCw, EyeOff, Eye, ExternalLink,
} from "lucide-react";
import { getContract, getGiftsContract, fetchConfig as fetchPublicConfig, GIFT_TYPES, LEVEL_NAMES } from "../lib/contract";
import {
  fetchOwner, fetchStats, fetchConfig as fetchAdminConfig,
  fetchCities, hideCity, unhideCity, triggerSweep,
} from "../lib/adminApi";

const TABS = [
  { id: "stats",     label: "Stats",     icon: BarChart3 },
  { id: "contracts", label: "Contracts", icon: FileCode },
  { id: "cities",    label: "Cities",    icon: Building2 },
  { id: "backend",   label: "Backend",   icon: Server },
];

function fmtMNT(wei) {
  try { return Number(ethers.formatEther(wei || "0")).toFixed(4); } catch { return "0"; }
}
function fmtAddr(a) { return a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "—"; }
function fmtSeconds(s) {
  const n = Number(s);
  if (n >= 3600) return `${(n / 3600).toFixed(1)}h`;
  if (n >= 60) return `${(n / 60).toFixed(0)}m`;
  return `${n}s`;
}

function StatCard({ label, value, hint }) {
  return (
    <div className="glass rounded-xl p-5 border border-[rgba(255,255,255,0.06)]">
      <div className="text-xs uppercase tracking-wider text-[#64748b] mb-1">{label}</div>
      <div className="text-2xl font-bold text-[#f1f5f9]">{value}</div>
      {hint && <div className="text-xs text-[#64748b] mt-1">{hint}</div>}
    </div>
  );
}

function Row({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[rgba(255,255,255,0.04)] last:border-0">
      <span className="text-sm text-[#94a3b8]">{label}</span>
      <span className={`text-sm text-[#f1f5f9] ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

function Btn({ children, onClick, disabled, variant = "primary", className = "" }) {
  const base = "px-3 py-1.5 rounded-lg text-xs font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed";
  const styles = {
    primary: "bg-gradient-to-r from-[#00d4ff] to-[#a855f7] text-white hover:shadow-lg hover:shadow-[#00d4ff]/25",
    ghost:   "bg-[#16161f] text-[#94a3b8] border border-[rgba(255,255,255,0.06)] hover:text-[#f1f5f9]",
    danger:  "bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20",
    success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20",
  };
  return (
    <button onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}

// ───────────────────── Tabs ─────────────────────

function StatsTab({ signer }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true); setErr("");
    try { setData(await fetchStats(signer)); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  if (loading) return <div className="flex items-center gap-2 text-[#94a3b8]"><Loader2 className="w-4 h-4 animate-spin" />Loading...</div>;
  if (err) return <ErrorBox msg={err} onRetry={reload} />;
  if (!data) return null;

  const tc = data.tweetCity;
  const g = data.gifts;
  const gs = data.giftsStats;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Cities" value={tc.totalSupply} />
        <StatCard label="Total Gifts"  value={gs.totalGifts} />
        <StatCard label="Verified" value={gs.verified} hint={`${fmtMNT(gs.volumeWei)} MNT volume`} />
        <StatCard label="Hidden" value={data.hiddenCount} hint="moderated cities" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Pending"  value={gs.pending} />
        <StatCard label="Accepted" value={gs.accepted} />
        <StatCard label="Verified" value={gs.verified} />
        <StatCard label="Rejected" value={gs.rejected} />
        <StatCard label="Expired"  value={gs.expired} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-5 border border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center gap-2 mb-3 text-[#00d4ff]"><FileCode className="w-4 h-4" /> TweetCity</div>
          <Row label="Address" value={fmtAddr(tc.address)} mono />
          <Row label="Owner" value={fmtAddr(tc.owner)} mono />
          <Row label="Oracle" value={fmtAddr(tc.oracle)} mono />
          <Row label="Agent Registry" value={fmtAddr(tc.agentIdentityRegistry)} mono />
        </div>
        {g && (
          <div className="glass rounded-xl p-5 border border-[rgba(255,255,255,0.06)]">
            <div className="flex items-center gap-2 mb-3 text-[#a855f7]"><FileCode className="w-4 h-4" /> CityGifts</div>
            <Row label="Address" value={fmtAddr(g.address)} mono />
            <Row label="Owner" value={fmtAddr(g.owner)} mono />
            <Row label="Oracle" value={fmtAddr(g.oracle)} mono />
            <Row label="Protocol Fee" value={`${(g.protocolFeeBps / 100).toFixed(2)}%`} />
            <Row label="Accept Window" value={fmtSeconds(g.acceptWindow)} />
          </div>
        )}
      </div>
      <Btn variant="ghost" onClick={reload}><RefreshCw className="w-3 h-3 inline mr-1" />Refresh</Btn>
    </div>
  );
}

function ContractsTab({ signer }) {
  const [tcOracle, setTcOracle] = useState("");
  const [giftsAddr, setGiftsAddr] = useState("");
  const [giftsState, setGiftsState] = useState(null);
  const [msg, setMsg] = useState({ text: "", kind: "" });
  const [busy, setBusy] = useState(false);

  // Form fields
  const [newTcOracle, setNewTcOracle] = useState("");
  const [newGiftsOracle, setNewGiftsOracle] = useState("");
  const [newFeeBps, setNewFeeBps] = useState("");
  const [newAcceptHours, setNewAcceptHours] = useState("");
  const [engageHours, setEngageHours] = useState(Array(6).fill(""));

  async function loadState() {
    setBusy(true); setMsg({ text: "", kind: "" });
    try {
      const tc = getContract(signer);
      const oracle = await tc.oracle();
      setTcOracle(oracle);

      const cfg = await fetchPublicConfig();
      setGiftsAddr(cfg.giftsContract);
      if (cfg.giftsContract) {
        const gc = getGiftsContract(cfg.giftsContract, signer);
        const [oracle, fee, acceptW, ew0, ew1, ew2, ew3, ew4, ew5] = await Promise.all([
          gc.oracle(), gc.protocolFeeBps(), gc.acceptWindow(),
          gc.engageWindows(0), gc.engageWindows(1), gc.engageWindows(2),
          gc.engageWindows(3), gc.engageWindows(4), gc.engageWindows(5),
        ]);
        setGiftsState({
          oracle, feeBps: Number(fee), acceptWindow: Number(acceptW),
          engageWindows: [ew0, ew1, ew2, ew3, ew4, ew5].map(Number),
        });
      }
    } catch (e) { setMsg({ text: e.message, kind: "err" }); }
    finally { setBusy(false); }
  }
  useEffect(() => { loadState(); }, []);

  async function send(label, txFn) {
    setBusy(true); setMsg({ text: `${label}: sending tx...`, kind: "" });
    try {
      const tx = await txFn();
      setMsg({ text: `${label}: waiting for receipt (${tx.hash.slice(0, 10)}...)`, kind: "" });
      await tx.wait();
      setMsg({ text: `${label}: confirmed`, kind: "ok" });
      await loadState();
    } catch (e) {
      setMsg({ text: `${label}: ${e.shortMessage || e.message}`, kind: "err" });
    } finally { setBusy(false); }
  }

  function isAddr(s) { try { return ethers.isAddress(s); } catch { return false; } }

  return (
    <div className="space-y-6">
      {msg.text && (
        <div className={`rounded-lg p-3 text-sm ${
          msg.kind === "err" ? "bg-rose-500/10 border border-rose-500/20 text-rose-300" :
          msg.kind === "ok"  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300" :
          "bg-[#16161f] border border-[rgba(255,255,255,0.06)] text-[#94a3b8]"
        }`}>{msg.text}</div>
      )}

      <div className="glass rounded-xl p-5 border border-[rgba(255,255,255,0.06)]">
        <div className="text-[#00d4ff] font-semibold mb-3 flex items-center gap-2"><FileCode className="w-4 h-4" /> TweetCity</div>
        <Row label="Current Oracle" value={fmtAddr(tcOracle)} mono />
        <div className="mt-4 flex gap-2">
          <input
            placeholder="New oracle address"
            value={newTcOracle}
            onChange={(e) => setNewTcOracle(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-[#0a0a0f] border border-[rgba(255,255,255,0.06)] text-sm text-[#f1f5f9] font-mono"
          />
          <Btn
            disabled={busy || !isAddr(newTcOracle)}
            onClick={() => send("setOracle (TweetCity)", () => getContract(signer).setOracle(newTcOracle))}
          >Set Oracle</Btn>
        </div>
      </div>

      {giftsState && (
        <div className="glass rounded-xl p-5 border border-[rgba(255,255,255,0.06)] space-y-5">
          <div className="text-[#a855f7] font-semibold flex items-center gap-2"><FileCode className="w-4 h-4" /> CityGifts</div>

          <div>
            <Row label="Current Oracle" value={fmtAddr(giftsState.oracle)} mono />
            <div className="mt-2 flex gap-2">
              <input
                placeholder="New oracle"
                value={newGiftsOracle}
                onChange={(e) => setNewGiftsOracle(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-[#0a0a0f] border border-[rgba(255,255,255,0.06)] text-sm text-[#f1f5f9] font-mono"
              />
              <Btn
                disabled={busy || !isAddr(newGiftsOracle)}
                onClick={() => send("setOracle (Gifts)", () => getGiftsContract(giftsAddr, signer).setOracle(newGiftsOracle))}
              >Set</Btn>
            </div>
          </div>

          <div>
            <Row label="Protocol Fee" value={`${(giftsState.feeBps / 100).toFixed(2)}%`} />
            <div className="mt-2 flex gap-2 items-center">
              <input
                type="number" min="0" max="2000" placeholder="bps (e.g. 1000 = 10%)"
                value={newFeeBps}
                onChange={(e) => setNewFeeBps(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-[#0a0a0f] border border-[rgba(255,255,255,0.06)] text-sm text-[#f1f5f9]"
              />
              <Btn
                disabled={busy || newFeeBps === "" || Number(newFeeBps) < 0 || Number(newFeeBps) > 2000}
                onClick={() => send("setProtocolFee", () => getGiftsContract(giftsAddr, signer).setProtocolFee(Number(newFeeBps)))}
              >Set Fee</Btn>
            </div>
          </div>

          <div>
            <Row label="Accept Window" value={fmtSeconds(giftsState.acceptWindow)} />
            <div className="mt-2 flex gap-2 items-center">
              <input
                type="number" min="1" placeholder="hours"
                value={newAcceptHours}
                onChange={(e) => setNewAcceptHours(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-[#0a0a0f] border border-[rgba(255,255,255,0.06)] text-sm text-[#f1f5f9]"
              />
              <Btn
                disabled={busy || !newAcceptHours || Number(newAcceptHours) <= 0}
                onClick={() => send("setAcceptWindow", () =>
                  getGiftsContract(giftsAddr, signer).setAcceptWindow(BigInt(Math.round(Number(newAcceptHours) * 3600)))
                )}
              >Set</Btn>
            </div>
          </div>

          <div>
            <div className="text-sm text-[#94a3b8] mb-2">Engage Windows (per gift type)</div>
            <div className="space-y-2">
              {giftsState.engageWindows.map((w, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-28 text-xs text-[#64748b]">{GIFT_TYPES[i].icon} {GIFT_TYPES[i].name}</span>
                  <span className="w-16 text-xs text-[#f1f5f9]">{fmtSeconds(w)}</span>
                  <input
                    type="number" min="1" placeholder="new hours"
                    value={engageHours[i]}
                    onChange={(e) => setEngageHours((arr) => arr.map((v, j) => j === i ? e.target.value : v))}
                    className="flex-1 px-2 py-1.5 rounded-lg bg-[#0a0a0f] border border-[rgba(255,255,255,0.06)] text-xs text-[#f1f5f9]"
                  />
                  <Btn
                    disabled={busy || !engageHours[i] || Number(engageHours[i]) <= 0}
                    onClick={() => send(`engageWindow[${i}]`, () =>
                      getGiftsContract(giftsAddr, signer).setEngageWindow(i, BigInt(Math.round(Number(engageHours[i]) * 3600)))
                    )}
                  >Set</Btn>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CitiesTab({ signer }) {
  const [list, setList] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [filter, setFilter] = useState("");

  async function reload() {
    setLoading(true); setErr("");
    try { setList(await fetchCities(signer)); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  async function toggle(c) {
    setBusyId(c.tokenId);
    try {
      if (c.hidden) await unhideCity(signer, c.tokenId);
      else {
        const reason = window.prompt("Reason for hiding (optional):", "") ?? "";
        await hideCity(signer, c.tokenId, reason);
      }
      await reload();
    } catch (e) { alert(e.message); }
    finally { setBusyId(null); }
  }

  if (loading) return <div className="flex items-center gap-2 text-[#94a3b8]"><Loader2 className="w-4 h-4 animate-spin" />Loading cities...</div>;
  if (err) return <ErrorBox msg={err} onRetry={reload} />;

  const filtered = filter
    ? list.filter((c) => c.twitterHandle?.toLowerCase().includes(filter.toLowerCase()) || String(c.tokenId).includes(filter))
    : list;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          placeholder="Filter by handle or tokenId..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg bg-[#0a0a0f] border border-[rgba(255,255,255,0.06)] text-sm text-[#f1f5f9]"
        />
        <Btn variant="ghost" onClick={reload}><RefreshCw className="w-3 h-3" /></Btn>
      </div>
      <div className="glass rounded-xl border border-[rgba(255,255,255,0.06)] divide-y divide-[rgba(255,255,255,0.04)]">
        {filtered.length === 0 && <div className="p-6 text-center text-[#64748b]">No cities</div>}
        {filtered.map((c) => (
          <div key={c.tokenId} className={`p-3 flex items-center gap-3 ${c.hidden ? "opacity-50" : ""}`}>
            <div className="w-12 text-center">
              <div className="text-xs text-[#64748b]">#</div>
              <div className="text-sm font-bold text-[#f1f5f9]">{c.tokenId}</div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#f1f5f9] truncate">@{c.twitterHandle || "—"}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#00d4ff]/10 text-[#00d4ff] font-bold">
                  {LEVEL_NAMES[c.level] || "—"}
                </span>
                {c.hidden && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 font-bold">HIDDEN</span>}
              </div>
              <div className="text-xs text-[#64748b]">
                {Number(c.followers).toLocaleString()} followers · {Number(c.tweetCount).toLocaleString()} tweets
              </div>
            </div>
            <a
              href={`/?city=${c.tokenId}`} target="_blank" rel="noreferrer"
              className="p-1.5 text-[#64748b] hover:text-[#f1f5f9]"
              title="Open city"
            ><ExternalLink className="w-3.5 h-3.5" /></a>
            <Btn
              variant={c.hidden ? "success" : "danger"}
              disabled={busyId === c.tokenId}
              onClick={() => toggle(c)}
            >
              {busyId === c.tokenId ? <Loader2 className="w-3 h-3 animate-spin" /> :
                c.hidden ? <><Eye className="w-3 h-3 inline mr-1" />Unhide</> :
                <><EyeOff className="w-3 h-3 inline mr-1" />Hide</>}
            </Btn>
          </div>
        ))}
      </div>
    </div>
  );
}

function BackendTab({ signer }) {
  const [cfg, setCfg] = useState(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [sweepResult, setSweepResult] = useState(null);
  const [sweeping, setSweeping] = useState(false);

  async function reload() {
    setLoading(true); setErr("");
    try { setCfg(await fetchAdminConfig(signer)); }
    catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { reload(); }, []);

  async function runSweep(dryRun) {
    setSweeping(true); setSweepResult(null);
    try { setSweepResult(await triggerSweep(signer, dryRun)); }
    catch (e) { setSweepResult({ error: e.message }); }
    finally { setSweeping(false); }
  }

  if (loading) return <div className="flex items-center gap-2 text-[#94a3b8]"><Loader2 className="w-4 h-4 animate-spin" />Loading config...</div>;
  if (err) return <ErrorBox msg={err} onRetry={reload} />;
  if (!cfg) return null;

  return (
    <div className="space-y-6">
      <div className="glass rounded-xl p-5 border border-[rgba(255,255,255,0.06)]">
        <div className="text-sm font-semibold text-[#f1f5f9] mb-3">Backend Configuration</div>
        <Row label="Twitter Provider" value={cfg.twitterProvider} />
        <Row label="Skip Tweet Verify" value={cfg.skipTweetVerify ? "yes" : "no"} />
        <Row label="Gift Oracle Disabled" value={cfg.disableGiftOracle ? "yes" : "no"} />
        <Row label="Sweep Interval" value={`${Math.round(cfg.giftOracleIntervalMs / 1000)}s`} />
        <Row label="Frontend URL" value={cfg.frontendUrl || "—"} mono />
        <Row label="Port" value={cfg.port} />
      </div>

      <div className="glass rounded-xl p-5 border border-[rgba(255,255,255,0.06)]">
        <div className="text-sm font-semibold text-[#f1f5f9] mb-3">Required Keys (presence only)</div>
        <div className="grid grid-cols-2 gap-x-6">
          {Object.entries(cfg.keys).map(([k, ok]) => (
            <div key={k} className="flex items-center justify-between py-1.5 border-b border-[rgba(255,255,255,0.04)]">
              <span className="text-xs font-mono text-[#94a3b8]">{k}</span>
              {ok
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                : <AlertTriangle className="w-4 h-4 text-amber-400" />}
            </div>
          ))}
        </div>
      </div>

      <div className="glass rounded-xl p-5 border border-[rgba(255,255,255,0.06)]">
        <div className="text-sm font-semibold text-[#f1f5f9] mb-3">Gift Oracle Sweep</div>
        <div className="text-xs text-[#64748b] mb-3">
          Sweeps all Accepted gifts and verifies engagements on Twitter. Auto-runs every {Math.round(cfg.giftOracleIntervalMs / 1000)}s.
        </div>
        <div className="flex gap-2">
          <Btn disabled={sweeping} onClick={() => runSweep(true)} variant="ghost">
            {sweeping ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
            Dry Run
          </Btn>
          <Btn disabled={sweeping} onClick={() => runSweep(false)}>
            {sweeping ? <Loader2 className="w-3 h-3 animate-spin inline mr-1" /> : null}
            Run Sweep
          </Btn>
        </div>
        {sweepResult && (
          <pre className="mt-3 p-3 bg-[#0a0a0f] rounded-lg text-xs text-[#94a3b8] overflow-auto max-h-64 border border-[rgba(255,255,255,0.04)]">
{JSON.stringify(sweepResult, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function ErrorBox({ msg, onRetry }) {
  return (
    <div className="rounded-lg p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-start gap-3">
      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <div className="flex-1">{msg}</div>
      {onRetry && <Btn variant="ghost" onClick={onRetry}>Retry</Btn>}
    </div>
  );
}

// ───────────────────── Page ─────────────────────

export default function AdminPage({ address, signer, onConnect }) {
  const [owner, setOwner] = useState(null);
  const [ownerErr, setOwnerErr] = useState("");
  const [tab, setTab] = useState("stats");

  useEffect(() => {
    fetchOwner().then(({ owner }) => setOwner(owner)).catch((e) => setOwnerErr(e.message));
  }, []);

  const isOwner = address && owner && address.toLowerCase() === owner.toLowerCase();

  return (
    <div className="w-full pt-20 md:pt-24 px-4 sm:px-6 lg:px-8 pb-20 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold mb-3">
          <Shield className="w-3.5 h-3.5" />
          Admin
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold mb-2">Control Panel</h1>
        <p className="text-[#94a3b8]">Owner-only operations for TweetCity & CityGifts contracts.</p>
      </motion.div>

      {ownerErr && <ErrorBox msg={`Could not load owner: ${ownerErr}`} />}

      {!address && (
        <div className="glass rounded-xl p-8 border border-[rgba(255,255,255,0.06)] text-center">
          <p className="text-[#94a3b8] mb-4">Connect the owner wallet to continue.</p>
          <Btn onClick={onConnect}>Connect Wallet</Btn>
        </div>
      )}

      {address && !isOwner && owner && (
        <div className="glass rounded-xl p-8 border border-rose-500/20 text-center">
          <AlertTriangle className="w-8 h-8 mx-auto mb-3 text-rose-400" />
          <p className="text-[#f1f5f9] font-semibold mb-1">Access denied</p>
          <p className="text-[#94a3b8] text-sm">
            Connected as <span className="font-mono">{fmtAddr(address)}</span> — not the contract owner (<span className="font-mono">{fmtAddr(owner)}</span>).
          </p>
        </div>
      )}

      {address && isOwner && (
        <>
          <div className="flex gap-1 mb-6 border-b border-[rgba(255,255,255,0.06)]">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
                  tab === t.id
                    ? "border-[#00d4ff] text-[#00d4ff]"
                    : "border-transparent text-[#64748b] hover:text-[#94a3b8]"
                }`}
              >
                <t.icon className="w-4 h-4" />
                {t.label}
              </button>
            ))}
          </div>
          <div>
            {tab === "stats"     && <StatsTab signer={signer} />}
            {tab === "contracts" && <ContractsTab signer={signer} />}
            {tab === "cities"    && <CitiesTab signer={signer} />}
            {tab === "backend"   && <BackendTab signer={signer} />}
          </div>
        </>
      )}
    </div>
  );
}
