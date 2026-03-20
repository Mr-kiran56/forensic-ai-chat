import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, User, Sparkles, Database, Upload, Loader2, CheckCircle2, Wifi } from "lucide-react";
import {
  getAIResponse,
  getMockResponse,
  getState,
  subscribeState,
  checkStatus,
  processData,
  type ChatResponse,
} from "@/data/mockData";

// ── API Base ──────────────────────────────────────────────────────────────
export const API_BASE = "https://forensic-ai-chat-2.onrender.com/api";

// ── Keep Render free tier awake — ping every 10 minutes ───────────────────
if (typeof window !== "undefined") {
  setInterval(() => {
    fetch(`${API_BASE}/health`).catch(() => {});
  }, 10 * 60 * 1000);
}

// ── Types ─────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  response?: ChatResponse;
  timestamp: Date;
}

const suggestedPrompts = [
  "Give me an investigation summary",
  "Show suspicious numbers",
  "Find high-risk call patterns",
  "Analyze night call activity",
  "Show IMEI swap detections",
  "Any dark web or VPN access?",
];

// Cycles on button while waiting for Render to wake + process
const LOAD_STEPS = [
  "Waking up server…",
  "Connecting to backend…",
  "Loading CDR, Tower & IPDR files…",
  "Merging 6,000 records…",
  "Running 9 forensic rules…",
  "Building risk scores…",
  "Preparing network graph…",
  "Almost ready…",
];

// ── Shared sub-components ─────────────────────────────────────────────────

function RiskBadge({ label, type }: { label: string; type: string }) {
  const styles: Record<string, string> = {
    high:    "bg-risk-high/15 text-risk-high border-risk-high/30",
    medium:  "bg-risk-medium/15 text-risk-medium border-risk-medium/30",
    low:     "bg-risk-low/15 text-risk-low border-risk-low/30",
    anomaly: "bg-anomaly/15 text-anomaly border-anomaly/30",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[type] || styles.medium}`}>
      {label}
    </span>
  );
}

function InlineMd({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**")
          ? <strong key={i} className="text-foreground font-semibold">{part.slice(2, -2)}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  );
}

function MarkdownText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <div className="text-sm leading-relaxed space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("## "))
          return (
            <p key={i} className="text-xs font-semibold text-primary uppercase tracking-wider mt-3 mb-1">
              {line.replace(/^## /, "").replace(/^[🔍📊⚠️🗺️📋🧮]\s*/, "")}
            </p>
          );
        if (line.startsWith("- ") || line.startsWith("• ")) {
          const content = line.replace(/^[-•]\s*/, "");
          return (
            <p key={i} className="flex gap-2">
              <span className="text-primary mt-0.5 shrink-0">·</span>
              <InlineMd text={content} />
            </p>
          );
        }
        if (/^\d+\.\s/.test(line)) {
          const [num, ...rest] = line.split(". ");
          return (
            <p key={i} className="flex gap-2">
              <span className="text-muted-foreground shrink-0 w-4 text-right">{num}.</span>
              <InlineMd text={rest.join(". ")} />
            </p>
          );
        }
        if (line === "---" || line === "")
          return <div key={i} className={line === "---" ? "border-t border-border my-2" : "h-1"} />;
        return <p key={i}><InlineMd text={line} /></p>;
      })}
    </div>
  );
}

// ── Welcome Screen ────────────────────────────────────────────────────────

function WelcomeScreen({ onDemoLoaded, onSkip }: { onDemoLoaded: () => void; onSkip: () => void }) {
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoLoaded,  setDemoLoaded]  = useState(false);
  const [demoStats,   setDemoStats]   = useState<null | { cdr: number; tower: number; ipdr: number }>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState("");
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const startStepCycle = () => {
    let i = 0;
    setLoadingStep(LOAD_STEPS[0]);
    stepTimer.current = setInterval(() => {
      i = (i + 1) % LOAD_STEPS.length;
      setLoadingStep(LOAD_STEPS[i]);
    }, 3000);
  };

  const stopStepCycle = (finalMsg = "") => {
    if (stepTimer.current) { clearInterval(stepTimer.current); stepTimer.current = null; }
    setLoadingStep(finalMsg);
  };

  useEffect(() => () => stopStepCycle(), []);

  const handleLoadDemo = async () => {
    setDemoLoading(true);
    setError(null);
    startStepCycle();

    try {
      // Silent ping to wake Render — ignore if it fails
      try {
        await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(8000) });
      } catch { /* still asleep — main call will wait */ }

      // Main load — 2 minute timeout covers Render cold start
      const res = await fetch(`${API_BASE}/upload/load-demo`, {
        method: "POST",
        signal: AbortSignal.timeout(120_000),
      });

      if (!res.ok) {
        let msg = `Server error ${res.status}`;
        try {
          const err = await res.json();
          msg = typeof err.detail === "string" ? err.detail : err.detail?.error || msg;
        } catch { /* not JSON */ }
        throw new Error(msg);
      }

      const data = await res.json();

      stopStepCycle("Syncing dashboard…");
      await processData();

      setDemoStats({
        cdr:   data.files.cdr_rows,
        tower: data.files.tower_rows,
        ipdr:  data.files.ipdr_rows,
      });
      setDemoLoaded(true);
      stopStepCycle("");
      setTimeout(() => onDemoLoaded(), 1400);

    } catch (e: any) {
      stopStepCycle("");
      const msg = e?.message || "";
      if (msg.includes("timeout") || msg.includes("abort") || msg.toLowerCase().includes("aborterror")) {
        setError("Server is taking too long. Render free tier starts in 30–60 seconds. Please wait a moment and try again.");
      } else if (msg.includes("fetch") || msg.includes("Failed to fetch") || msg.includes("network")) {
        setError("Cannot reach backend. The server may be starting up — wait 30 seconds and try again.");
      } else {
        setError(msg || "Something went wrong. Please try again.");
      }
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-8">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="w-full max-w-xl"
      >
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 glow-primary">
            <Sparkles className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground text-center">AI Forensic Assistant</h1>
          <p className="text-muted-foreground text-sm text-center mt-2 max-w-sm leading-relaxed">
            Analyze CDR, Tower Dump and IPDR data through conversational AI.
            Load the test dataset to explore the full system instantly — or upload your own files.
          </p>
        </div>

        {/* Card 1 — Test Data */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className={`border rounded-xl p-5 mb-3 transition-all duration-300 ${
            demoLoaded  ? "border-primary/50 bg-primary/5" :
            demoLoading ? "border-primary/30 bg-card" :
                          "border-border bg-card hover:border-primary/25"
          }`}
        >
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
              demoLoaded  ? "bg-primary/15" :
              demoLoading ? "bg-primary/10" : "bg-secondary"
            }`}>
              {demoLoaded
                ? <CheckCircle2 className="h-5 w-5 text-primary" />
                : demoLoading
                ? <Wifi className="h-5 w-5 text-primary animate-pulse" />
                : <Database className="h-5 w-5 text-muted-foreground" />
              }
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="text-sm font-semibold text-foreground">Continue with Test Data</p>
                {demoLoaded && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-medium">
                    Loaded ✓
                  </span>
                )}
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                Instantly load a pre-built forensic dataset — 2,000 CDR records,
                2,000 Tower Dump logs and 2,000 IPDR sessions across 70 phone numbers
                and 17 towers in Bangalore, Chennai and Hyderabad. All 9 forensic rules run automatically.
              </p>

              {/* Progress bar while loading */}
              {demoLoading && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mb-3"
                >
                  <div className="w-full h-1 bg-secondary rounded-full overflow-hidden mb-2">
                    <motion.div
                      className="h-full bg-primary rounded-full"
                      animate={{ width: ["0%", "88%"] }}
                      transition={{ duration: 50, ease: "easeOut" }}
                    />
                  </div>
                  <p className="text-xs text-primary font-medium">{loadingStep || "Processing…"}</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    First load may take 30–60 seconds on free tier — please keep this tab open
                  </p>
                </motion.div>
              )}

              {/* Stats after load */}
              {demoStats && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="flex gap-5 mb-3"
                >
                  {([
                    ["CDR",   demoStats.cdr,   "#3b82f6"],
                    ["Tower", demoStats.tower,  "#8b5cf6"],
                    ["IPDR",  demoStats.ipdr,   "#06b6d4"],
                  ] as [string, number, string][]).map(([label, count, color]) => (
                    <div key={label} className="text-center">
                      <p className="text-sm font-bold" style={{ color }}>{count.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{label} rows</p>
                    </div>
                  ))}
                  <div className="text-center">
                    <p className="text-sm font-bold text-risk-high">1,960</p>
                    <p className="text-xs text-muted-foreground">CRITICAL</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-bold text-foreground">10</p>
                    <p className="text-xs text-muted-foreground">Communities</p>
                  </div>
                </motion.div>
              )}

              {/* Pills before load */}
              {!demoStats && !demoLoading && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {["2,000 CDR records", "2,000 Tower pings", "2,000 IPDR sessions",
                    "70 phone numbers", "17 towers", "9 forensic rules"].map(tag => (
                    <span key={tag} className="text-xs px-2 py-0.5 rounded-full border border-border text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Error */}
              {error && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-xs text-destructive mb-3 bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2 leading-relaxed"
                >
                  ⚠ {error}
                </motion.p>
              )}

              {/* Action button */}
              <button
                onClick={handleLoadDemo}
                disabled={demoLoading || demoLoaded}
                className="px-5 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 disabled:cursor-not-allowed"
                style={{
                  background: demoLoaded  ? "hsl(var(--primary) / 0.15)" : "hsl(var(--primary))",
                  color:      demoLoaded  ? "hsl(var(--primary))"        : "hsl(var(--primary-foreground))",
                  opacity:    demoLoading ? 0.85 : 1,
                }}
              >
                {demoLoading ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" />{loadingStep || "Loading…"}</>
                ) : demoLoaded ? (
                  <><CheckCircle2 className="h-3.5 w-3.5" />Analysis complete — starting chat</>
                ) : (
                  <><Sparkles className="h-3.5 w-3.5" />Continue with Test Data</>
                )}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Card 2 — Upload own files */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="border border-border rounded-xl p-5 bg-card hover:border-primary/20 transition-all"
        >
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-0.5">
              <Upload className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground mb-1">Upload Your Own Files</p>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                Upload your own CDR, Tower Dump and IPDR Excel files for a real investigation.
                Use the <span className="text-primary font-medium">Upload Files</span> button in the sidebar.
              </p>
              <button
                onClick={onSkip}
                className="px-5 py-2 rounded-lg border border-border text-sm font-medium
                           text-muted-foreground hover:border-primary/30 hover:text-foreground transition-all"
              >
                Skip to Chat →
              </button>
            </div>
          </div>
        </motion.div>

        <p className="text-center text-xs text-muted-foreground/50 mt-5">
          Bangalore · Chennai · Hyderabad · 70 numbers · 17 towers · 9 forensic rules · LLaMA 3 AI
        </p>
      </motion.div>
    </div>
  );
}

// ── Main ChatPage ─────────────────────────────────────────────────────────

export function ChatPage() {
  const [messages,    setMessages]    = useState<Message[]>([]);
  const [input,       setInput]       = useState("");
  const [isTyping,    setIsTyping]    = useState(false);
  const [dataLoaded,  setDataLoaded]  = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  checkStatus();

  // Only update dataLoaded — DO NOT hide welcome here
  const cur = getState();
  if (cur.processed) {
    setDataLoaded(true);
    // ❌ DO NOT setShowWelcome(false) here
  }

  const unsub = subscribeState(() => {
    const processed = getState().processed;
    setDataLoaded(processed);

    // ✅ Only hide welcome AFTER user action (demo load / upload)
    if (processed) {
      setShowWelcome(false);
    }
  });

  return unsub;
}, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isTyping) return;
    const userMsg: Message = { id: crypto.randomUUID(), role: "user", content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);
    try {
      const response = dataLoaded ? await getAIResponse(text) : getMockResponse(text);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: "ai",
        content: response.text, response, timestamp: new Date(),
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full">

      {dataLoaded && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b border-primary/15 text-xs text-primary shrink-0"
        >
          <Database className="h-3 w-3" />
          <span>Forensic data loaded — AI is analyzing your real CDR, Tower &amp; IPDR records</span>
        </motion.div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">

        {showWelcome && isEmpty && (
          <WelcomeScreen
            onDemoLoaded={() => { setShowWelcome(false); setDataLoaded(true); }}
            onSkip={() => setShowWelcome(false)}
          />
        )}

        {!showWelcome && isEmpty && (
          <div className="flex flex-col items-center justify-center h-full px-4">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-lg">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6 glow-primary">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-semibold text-foreground mb-2">AI Forensic Assistant</h1>
              <p className="text-muted-foreground text-sm mb-2">
                Analyze telecom forensic data — CDR, Tower Dump, IPDR. Ask anything about your investigation.
              </p>
              {!dataLoaded && (
                <p className="text-xs text-muted-foreground/70 mb-4">
                  Upload your Excel files via <span className="text-primary">Upload Files</span> in the sidebar.
                </p>
              )}
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {suggestedPrompts.map(prompt => (
                  <button key={prompt} onClick={() => sendMessage(prompt)}
                    className="px-4 py-2 rounded-lg border border-border bg-secondary/50 text-sm
                               text-secondary-foreground hover:bg-secondary hover:border-primary/30 transition-all">
                    {prompt}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {!isEmpty && (
          <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
            <AnimatePresence initial={false}>
              {messages.map(msg => (
                <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                  {msg.role === "ai" && (
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div className={`max-w-[85%] ${msg.role === "user"
                    ? "bg-primary/10 border border-primary/20 rounded-2xl rounded-br-md px-4 py-3"
                    : "space-y-3"}`}>
                    <MarkdownText text={msg.content} />
                    {msg.response?.badges && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {msg.response.badges.map((b, i) => <RiskBadge key={i} label={b.label} type={b.type} />)}
                      </div>
                    )}
                    {msg.response?.table && (
                      <div className="mt-3 border border-border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-secondary/50">
                              {msg.response.table.headers.map((h, i) => (
                                <th key={i} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {msg.response.table.rows.map((row, i) => (
                              <tr key={i} className="border-t border-border hover:bg-secondary/20">
                                {row.map((cell, j) => (
                                  <td key={j} className="px-3 py-2 text-sm font-mono text-xs">
                                    {typeof cell === "string" && /^\d+$/.test(cell) && parseInt(cell) >= 70
                                      ? <span className="text-risk-high font-semibold">{cell}</span>
                                      : cell}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground/50 mt-1">
                      {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                      <User className="h-4 w-4 text-secondary-foreground" />
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {isTyping && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="flex items-center gap-1 px-4 py-3">
                  {[0, 1, 2].map(i => (
                    <motion.div key={i} className="w-2 h-2 rounded-full bg-primary/60"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-border p-4 shrink-0">
        <div className="max-w-3xl mx-auto">
          <form onSubmit={e => { e.preventDefault(); sendMessage(input); }}
            className="flex items-center gap-3 bg-secondary/50 border border-border
                       rounded-xl px-4 py-2 focus-within:border-primary/50 transition-colors">
            <input value={input} onChange={e => setInput(e.target.value)}
              placeholder={dataLoaded ? "Ask about your forensic data…" : "Ask investigation queries…"}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none" />
            <button type="submit" disabled={!input.trim() || isTyping}
              className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all">
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}