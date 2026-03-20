import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { FileText, Users, AlertTriangle, Moon, TrendingUp, Radio, Globe, Smartphone } from "lucide-react";
import {
  getState, subscribeState, checkStatus,
  getMetrics, getSuspiciousNumbers, getTopContacts,
} from "@/data/mockData";

function RiskBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-risk-high" : score >= 45 ? "bg-risk-medium" : "bg-risk-low";
  const textColor = score >= 70 ? "text-risk-high" : score >= 45 ? "text-risk-medium" : "text-risk-low";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score}%` }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
      <span className={`text-xs font-mono ${textColor}`}>{score}</span>
    </div>
  );
}

function FlagBadge({ flag }: { flag: string }) {
  const colorMap: Record<string, string> = {
    DARK_WEB_ACCESS: "text-risk-high border-risk-high/30 bg-risk-high/10",
    FRAUD_SITE_ACCESS: "text-risk-high border-risk-high/30 bg-risk-high/10",
    IMEI_SWAP_DETECTED: "text-risk-medium border-risk-medium/30 bg-risk-medium/10",
    LATE_NIGHT_ACTIVITY: "text-anomaly border-anomaly/30 bg-anomaly/10",
    HIGH_CALL_FREQUENCY: "text-anomaly border-anomaly/30 bg-anomaly/10",
    VPN_PROXY_USAGE: "text-risk-medium border-risk-medium/30 bg-risk-medium/10",
    HIGH_DATA_USAGE: "text-primary border-primary/30 bg-primary/10",
    WEAK_SIGNAL_ZONE: "text-muted-foreground border-border bg-secondary/50",
    LONG_CALL_DURATION: "text-primary border-primary/30 bg-primary/10",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${colorMap[flag] || "text-muted-foreground border-border bg-secondary/50"}`}>
      {flag.replace(/_/g, " ")}
    </span>
  );
}

export function InsightsPage() {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    checkStatus();
    return subscribeState(() => forceUpdate(n => n + 1));
  }, []);

  const state = getState();
  const liveMetrics = getMetrics();
  const suspiciousNumbers = getSuspiciousNumbers();
  const topContacts = getTopContacts();
  const summary = state.summary;
  const isLoaded = state.processed;

  const metricCards = [
    { label: "Total Records", value: liveMetrics.totalRecords.toLocaleString(), icon: FileText, color: "text-primary", sub: "CDR + Tower + IPDR" },
    { label: "Unique Numbers", value: liveMetrics.uniqueNumbers.toLocaleString(), icon: Users, color: "text-primary", sub: "Across all sources" },
    { label: "High Risk Flagged", value: liveMetrics.suspiciousCount.toLocaleString(), icon: AlertTriangle, color: "text-risk-high", sub: "Score ≥ 70/100" },
    { label: "Night Calls", value: liveMetrics.nightCalls.toLocaleString(), icon: Moon, color: "text-anomaly", sub: "00:00 – 05:00" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 overflow-y-auto h-full">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <h1 className="text-xl font-semibold text-foreground">Investigation Insights</h1>
        {isLoaded && (
          <div className="flex items-center gap-1.5 text-xs text-primary">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            Live data
          </div>
        )}
      </motion.div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {metricCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-card border border-border rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`h-4 w-4 ${card.color}`} />
              <span className="text-xs text-muted-foreground">{card.label}</span>
            </div>
            <p className="text-2xl font-semibold text-foreground tabular-nums">{card.value}</p>
            {card.sub && <p className="text-xs text-muted-foreground/60 mt-1">{card.sub}</p>}
          </motion.div>
        ))}
      </div>

      {/* Flag breakdown */}
      {summary?.flag_breakdown && Object.keys(summary.flag_breakdown).length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Rule Violations Breakdown</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(summary.flag_breakdown)
              .sort((a, b) => b[1] - a[1])
              .map(([flag, count], i) => (
                <motion.div
                  key={flag}
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + i * 0.04 }}
                  className="bg-card border border-border rounded-xl p-3 flex items-center justify-between"
                >
                  <FlagBadge flag={flag} />
                  <span className="text-sm font-semibold text-foreground tabular-nums ml-2">{count.toLocaleString()}</span>
                </motion.div>
              ))}
          </div>
        </motion.div>
      )}

      {/* Suspicious Numbers Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">
          {isLoaded ? `Suspicious Numbers (${suspiciousNumbers.length} flagged)` : "Suspicious Numbers"}
        </h2>
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Risk Score</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Level</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Violations</th>
              </tr>
            </thead>
            <tbody>
              {suspiciousNumbers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {isLoaded ? "No suspicious records found" : "Upload and analyze files to see suspicious numbers"}
                  </td>
                </tr>
              ) : (
                suspiciousNumbers.slice(0, 15).map((n, i) => (
                  <motion.tr
                    key={n.phone}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 + i * 0.03 }}
                    className="border-t border-border hover:bg-secondary/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs">{n.phone}</td>
                    <td className="px-4 py-3"><RiskBar score={n.riskScore} /></td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${n.riskLevel === "HIGH" ? "text-risk-high" : n.riskLevel === "MEDIUM" ? "text-risk-medium" : "text-risk-low"}`}>
                        {n.riskLevel}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {n.reason.split(" · ").slice(0, 2).map(f => (
                          <FlagBadge key={f} flag={f.trim()} />
                        ))}
                      </div>
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Top Towers */}
      {summary?.top_towers && summary.top_towers.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">Top Active Towers</h2>
          <div className="space-y-2.5">
            {summary.top_towers.slice(0, 6).map((t, i) => {
              const max = summary.top_towers[0].activity_count;
              return (
                <div key={t.tower_id} className="flex items-center gap-4">
                  <span className="text-xs font-mono text-muted-foreground w-28 shrink-0">{t.tower_id}</span>
                  <div className="flex-1 h-6 bg-secondary/50 rounded-md overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(t.activity_count / max) * 100}%` }}
                      transition={{ duration: 0.8, delay: 0.6 + i * 0.07 }}
                      className="h-full bg-anomaly/25 rounded-md flex items-center px-2"
                    >
                      <span className="text-xs font-medium text-anomaly">{t.activity_count}</span>
                    </motion.div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Top Contacts by Call Volume */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Top Callers by Volume</h2>
        {topContacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Upload and analyze files to see top callers.</p>
        ) : (
          <div className="space-y-3">
            {topContacts.map((c, i) => {
              const maxCalls = Math.max(...topContacts.map(t => t.calls));
              return (
                <div key={c.phone} className="flex items-center gap-4">
                  <span className="text-xs font-mono text-muted-foreground w-36 shrink-0 truncate">{c.phone}</span>
                  <div className="flex-1 h-6 bg-secondary/50 rounded-md overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(c.calls / maxCalls) * 100}%` }}
                      transition={{ duration: 0.8, delay: 0.7 + i * 0.1 }}
                      className="h-full bg-primary/25 rounded-md flex items-center px-2"
                    >
                      <span className="text-xs font-medium text-primary">{c.calls}</span>
                    </motion.div>
                  </div>
                  {c.label && (
                    <span className="text-xs px-2 py-0.5 rounded-full border border-primary/30 text-primary bg-primary/5 shrink-0">{c.label}</span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}