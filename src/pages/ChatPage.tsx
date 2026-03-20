import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, User, Sparkles, Database } from "lucide-react";
import { getAIResponse, getMockResponse, getState, subscribeState, checkStatus, type ChatResponse } from "@/data/mockData";

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

function RiskBadge({ label, type }: { label: string; type: string }) {
  const styles: Record<string, string> = {
    high: "bg-risk-high/15 text-risk-high border-risk-high/30",
    medium: "bg-risk-medium/15 text-risk-medium border-risk-medium/30",
    low: "bg-risk-low/15 text-risk-low border-risk-low/30",
    anomaly: "bg-anomaly/15 text-anomaly border-anomaly/30",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[type] || styles.medium}`}>
      {label}
    </span>
  );
}

function MarkdownText({ text }: { text: string }) {
  // Parse ## headers, **bold**, bullet lists, numbered lists
  const lines = text.split("\n");
  return (
    <div className="text-sm leading-relaxed space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <p key={i} className="text-xs font-semibold text-primary uppercase tracking-wider mt-3 mb-1">
              {line.replace(/^## /, "").replace(/^[🔍📊⚠️🗺️📋🧮]\s*/, "")}
            </p>
          );
        }
        if (line.startsWith("- ") || line.startsWith("• ")) {
          const content = line.replace(/^[-•]\s*/, "");
          return <p key={i} className="flex gap-2"><span className="text-primary mt-0.5 shrink-0">·</span><InlineMd text={content} /></p>;
        }
        if (/^\d+\.\s/.test(line)) {
          const [num, ...rest] = line.split(". ");
          return <p key={i} className="flex gap-2"><span className="text-muted-foreground shrink-0 w-4 text-right">{num}.</span><InlineMd text={rest.join(". ")} /></p>;
        }
        if (line === "---" || line === "") return <div key={i} className={line === "---" ? "border-t border-border my-2" : "h-1"} />;
        return <p key={i}><InlineMd text={line} /></p>;
      })}
    </div>
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

export function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Check backend status on mount + subscribe to state changes
  useEffect(() => {
    checkStatus();
    const unsub = subscribeState(() => {
      setDataLoaded(getState().processed);
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
      // Use real AI if data is processed, fallback to mock otherwise
      const response = dataLoaded
        ? await getAIResponse(text)
        : getMockResponse(text);

      const aiMsg: Message = {
        id: crypto.randomUUID(),
        role: "ai",
        content: response.text,
        response,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Data status banner */}
      {dataLoaded && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 px-4 py-2 bg-primary/5 border-b border-primary/15 text-xs text-primary"
        >
          <Database className="h-3 w-3" />
          <span>Forensic data loaded — AI is analyzing your real CDR, Tower &amp; IPDR records</span>
        </motion.div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center max-w-lg"
            >
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6 glow-primary">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h1 className="text-2xl font-semibold text-foreground mb-2">AI Forensic Assistant</h1>
              <p className="text-muted-foreground text-sm mb-2">
                Analyze telecom forensic data — CDR, Tower Dump, IPDR. Ask anything about your investigation.
              </p>
              {!dataLoaded && (
                <p className="text-xs text-muted-foreground/70 mb-6">
                  Upload your Excel files via <span className="text-primary">Upload Files</span> for AI-powered real analysis.
                </p>
              )}
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="px-4 py-2 rounded-lg border border-border bg-secondary/50 text-sm text-secondary-foreground hover:bg-secondary hover:border-primary/30 transition-all"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
                >
                  {msg.role === "ai" && (
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}

                  <div className={`max-w-[85%] ${msg.role === "user"
                    ? "bg-primary/10 border border-primary/20 rounded-2xl rounded-br-md px-4 py-3"
                    : "space-y-3"}`}
                  >
                    <MarkdownText text={msg.content} />

                    {msg.response?.badges && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {msg.response.badges.map((b, i) => (
                          <RiskBadge key={i} label={b.label} type={b.type} />
                        ))}
                      </div>
                    )}

                    {msg.response?.table && (
                      <div className="mt-3 border border-border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-secondary/50">
                              {msg.response.table.headers.map((h, i) => (
                                <th key={i} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                  {h}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {msg.response.table.rows.map((row, i) => (
                              <tr key={i} className="border-t border-border hover:bg-secondary/20">
                                {row.map((cell, j) => (
                                  <td key={j} className="px-3 py-2 text-sm font-mono text-xs">
                                    {typeof cell === "string" && /^\d+$/.test(cell) && parseInt(cell) >= 70 ? (
                                      <span className="text-risk-high font-semibold">{cell}</span>
                                    ) : (
                                      cell
                                    )}
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
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      className="w-2 h-2 rounded-full bg-primary/60"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-4">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(input); }}
            className="flex items-center gap-3 bg-secondary/50 border border-border rounded-xl px-4 py-2 focus-within:border-primary/50 transition-colors"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={dataLoaded ? "Ask about your forensic data…" : "Ask investigation queries…"}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <button
              type="submit"
              disabled={!input.trim() || isTyping}
              className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 transition-all"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}