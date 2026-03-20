// ─── Real API client — replaces mockData with live backend calls ──────────────
// Drop this file into src/data/mockData.ts — all existing page imports stay the same.

export const API_BASE = "https://forensic-ai-chat-2.onrender.com/api";
// ─── Types (kept identical so pages compile without changes) ──────────────────
// export const API_BASE = "http://localhost:8000/api";

export interface SuspiciousNumber {
  phone: string;
  riskScore: number;
  riskLevel: "HIGH" | "MEDIUM" | "LOW";
  reason: string;
  totalCalls: number;
  nightCalls: number;
  uniqueContacts: number;
}

export interface CallRecord {
  from: string;
  to: string;
  duration: number;
  timestamp: string;
  tower: string;
  type: "voice" | "sms" | "data";
}

export interface TopContact {
  phone: string;
  calls: number;
  label?: string;
}

export interface ChatResponse {
  text: string;
  table?: { headers: string[]; rows: string[][] };
  badges?: { label: string; type: "high" | "medium" | "low" | "anomaly" }[];
}

// ─── API state (loaded once, cached in module scope) ─────────────────────────

export interface ForensicState {
  loaded: boolean;
  processed: boolean;
  summary: null | {
    total_records: number;
    unique_numbers: number;
    flagged_records: number;
    high_risk_records: number;
    cdr_rows: number;
    tower_rows: number;
    ipdr_rows: number;
    top_callers: { caller_number: string; call_count: number }[];
    suspicious_numbers: { caller_number: string; risk_score: number }[];
    top_towers: { tower_id: string; activity_count: number }[];
    flag_breakdown: Record<string, number>;
  };
  suspicious: SuspiciousRecord[];
  networkData: null | NetworkData;
}

export interface SuspiciousRecord {
  caller_number: string;
  receiver_number: string;
  call_start: string;
  call_duration: number;
  call_type: string;
  tower_id: string;
  location: string;
  risk_score: number;
  risk_flags: string;
}

export interface NetworkData {
  nodes: { id: string; label: string; type: string; source: string; risk_score: number; color: string; size: number; location: string }[];
  edges: { from: string; to: string; type: string; color: string; weight: number; duration: number }[];
  stats: Record<string, number>;
}

// Global reactive store
let _state: ForensicState = {
  loaded: false,
  processed: false,
  summary: null,
  suspicious: [],
  networkData: null,
};

const _listeners: Array<() => void> = [];

export function getState() { return _state; }

export function subscribeState(fn: () => void) {
  _listeners.push(fn);
  return () => { const i = _listeners.indexOf(fn); if (i > -1) _listeners.splice(i, 1); };
}

function setState(patch: Partial<ForensicState>) {
  _state = { ..._state, ...patch };
  _listeners.forEach(fn => fn());
}

// ─── API Calls ────────────────────────────────────────────────────────────────

export async function uploadFile(endpoint: "cdr" | "tower" | "ipdr", file: File): Promise<{ rows_loaded: number }> {
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch(`${API_BASE}/upload/${endpoint}`, { method: "POST", body: fd });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function processData(): Promise<void> {
  const r = await fetch(`${API_BASE}/upload/process`, { method: "POST" });
  if (!r.ok) throw new Error(await r.text());
  const data = await r.json();

  // Fetch additional data
  const [susRes, netRes] = await Promise.all([
    fetch(`${API_BASE}/analysis/suspicious?min_score=40&limit=50`).then(r => r.json()),
    fetch(`${API_BASE}/network/graph`).then(r => r.json()),
  ]);

  setState({
    processed: true,
    summary: data.summary,
    suspicious: susRes.records || [],
    networkData: netRes,
  });
}

// Add this at the bottom of mockData.ts
// Keeps Render free tier awake by pinging every 10 minutes
function keepAlive() {
  setInterval(async () => {
    try {
      await fetch(`${API_BASE}/health`);
    } catch { /* ignore */ }
  }, 10 * 60 * 1000); // 10 minutes
}

// Start on page load
if (typeof window !== "undefined") {
  keepAlive();
}

export async function checkStatus(): Promise<void> {
  try {
    const r = await fetch(`${API_BASE}/upload/status`);
    const s = await r.json();
    setState({ loaded: s.cdr_loaded || s.tower_loaded || s.ipdr_loaded, processed: s.processed });
    if (s.processed) {
      // Reload summary
      const [sumRes, susRes, netRes] = await Promise.all([
        fetch(`${API_BASE}/analysis/summary`).then(r => r.json()).catch(() => null),
        fetch(`${API_BASE}/analysis/suspicious?min_score=40&limit=50`).then(r => r.json()).catch(() => ({ records: [] })),
        fetch(`${API_BASE}/network/graph`).then(r => r.json()).catch(() => null),
      ]);
      setState({ summary: sumRes, suspicious: susRes.records || [], networkData: netRes });
    }
  } catch { /* backend not running */ }
}

// ─── AI Chat ──────────────────────────────────────────────────────────────────

export async function getAIResponse(message: string): Promise<ChatResponse> {
  try {
    const r = await fetch(`${API_BASE}/chat/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, history: [] }),
    });
    if (!r.ok) throw new Error("API error");
    const data = await r.json();
    return parseAIReply(data.reply || "");
  } catch {
    return getMockResponse(message);
  }
}

function parseAIReply(text: string): ChatResponse {
  // Extract risk badges from text
  const badges: ChatResponse["badges"] = [];
  if (/CRITICAL|critical/i.test(text)) badges.push({ label: "CRITICAL RISK", type: "high" });
  else if (/HIGH.RISK|high.risk/i.test(text)) badges.push({ label: "HIGH RISK", type: "high" });
  if (/ANOMALY|anomaly/i.test(text)) badges.push({ label: "ANOMALY", type: "anomaly" });
  if (/VPN|vpn|dark.web|DARK/i.test(text)) badges.push({ label: "DARK WEB / VPN", type: "anomaly" });
  if (/FRAUD|fraud/i.test(text)) badges.push({ label: "FRAUD DETECTED", type: "high" });
  if (/MEDIUM|medium/i.test(text)) badges.push({ label: "MEDIUM RISK", type: "medium" });

  return { text, badges: badges.length ? badges : undefined };
}

// ─── Fallback mock responses (used when backend is offline) ──────────────────

export function getMockResponse(query: string): ChatResponse {
  const q = query.toLowerCase();

  if (q.includes("suspicious") || q.includes("risk")) {
    return {
      text: "Upload and process your CDR, Tower Dump, and IPDR files to get real AI-powered suspicious number analysis with risk scores, rule flags, and pattern detection.",
      badges: [{ label: "Upload Files First", type: "anomaly" }],
    };
  }
  if (q.includes("night") || q.includes("nocturnal")) {
    return {
      text: "Once data is uploaded, I'll detect all late-night call patterns (00:00–05:00) and score them with **LATE_NIGHT_ACTIVITY** rule flags.",
      badges: [{ label: "Upload to Analyze", type: "anomaly" }],
    };
  }
  if (q.includes("tower") || q.includes("location")) {
    return {
      text: "Tower analysis is available after uploading your Tower Dump Excel file. I'll map movement patterns, identify **WEAK_SIGNAL_ZONE** flags, and show geographic hotspots.",
      badges: [{ label: "Tower Dump Needed", type: "medium" }],
    };
  }
  if (q.includes("summary") || q.includes("overview")) {
    const s = _state.summary;
    if (s) {
      return {
        text: `**Investigation Summary:**\n\n• **${s.total_records.toLocaleString()}** total records across CDR, Tower & IPDR\n• **${s.unique_numbers}** unique phone numbers identified\n• **${s.high_risk_records}** high-risk records flagged\n• **${s.flagged_records}** total records with violations\n\nTop risk: ${s.suspicious_numbers[0]?.caller_number || "—"} with score ${s.suspicious_numbers[0]?.risk_score || "—"}/100`,
        badges: [
          { label: `${s.high_risk_records} High Risk`, type: "high" },
          { label: `${s.flagged_records} Flagged`, type: "anomaly" },
        ],
      };
    }
    return { text: "Upload and process your forensic files to get a full investigation summary." };
  }
  return {
    text: "I'm your **Forensic AI Assistant**. Upload your CDR, Tower Dump, and IPDR Excel files using the **Upload Files** button, then click **Analyze**. After that I can answer:\n\n• **Suspicious numbers** — risk scores and rule violations\n• **Night activity** — calls between 00:00–05:00\n• **Tower analysis** — movement and signal patterns\n• **IMEI swaps** — device fingerprinting anomalies\n• **Dark web / VPN** — internet session flags\n• **Investigation summary** — full case overview",
  };
}

// ─── Derived data helpers (used by InsightsPage / NetworkPage) ────────────────

export function getMetrics() {
  const s = _state.summary;
  return {
    totalRecords: s?.total_records ?? 0,
    uniqueNumbers: s?.unique_numbers ?? 0,
    suspiciousCount: s?.high_risk_records ?? 0,
    nightCalls: s?.flag_breakdown?.["LATE_NIGHT_ACTIVITY"] ?? 0,
  };
}

export function getSuspiciousNumbers(): SuspiciousNumber[] {
  return _state.suspicious.map(r => ({
    phone: r.caller_number,
    riskScore: r.risk_score,
    riskLevel: r.risk_score >= 70 ? "HIGH" : r.risk_score >= 40 ? "MEDIUM" : "LOW",
    reason: r.risk_flags?.split(",").map(f => f.trim()).filter(Boolean).join(" · ") || "Flagged",
    totalCalls: 0,
    nightCalls: 0,
    uniqueContacts: 0,
  }));
}

export function getTopContacts(): TopContact[] {
  const s = _state.summary;
  if (!s) return [];
  return s.top_callers.slice(0, 5).map((c, i) => ({
    phone: c.caller_number,
    calls: c.call_count,
    label: i === 0 ? "Top Caller" : s.suspicious_numbers.some(n => n.caller_number === c.caller_number) ? "Suspicious" : undefined,
  }));
}

export function getNetworkNodes() {
  const nd = _state.networkData;
  if (!nd) return networkNodesFallback;
  return nd.nodes
    .filter(n => n.type === "phone")
    .slice(0, 30)
    .map(n => ({
      id: n.id,
      risk: n.risk_score >= 70 ? "HIGH" as const : n.risk_score >= 40 ? "MEDIUM" as const : "LOW" as const,
      calls: n.size || 10,
    }));
}

export function getNetworkLinks() {
  const nd = _state.networkData;
  if (!nd) return networkLinksFallback;
  return nd.edges
    .filter(e => e.type === "call")
    .slice(0, 60)
    .map(e => ({
      source: e.from,
      target: e.to,
      value: e.weight || 1,
    }));
}

// Fallback static data (shown before upload)
const networkNodesFallback = [
  { id: "Upload CDR", risk: "LOW" as const, calls: 20 },
  { id: "Upload Tower", risk: "LOW" as const, calls: 15 },
  { id: "Upload IPDR", risk: "LOW" as const, calls: 10 },
];
const networkLinksFallback = [
  { source: "Upload CDR", target: "Upload Tower", value: 5 },
  { source: "Upload Tower", target: "Upload IPDR", value: 5 },
];

// Legacy exports so existing page imports compile
export const suspiciousNumbers: SuspiciousNumber[] = [];
export const topContacts: TopContact[] = [];
export const metrics = { totalRecords: 0, uniqueNumbers: 0, suspiciousCount: 0, nightCalls: 0 };
export const networkNodes = networkNodesFallback;
export const networkLinks = networkLinksFallback;