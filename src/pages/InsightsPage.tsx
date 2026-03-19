import { motion } from "framer-motion";
import { FileText, Users, AlertTriangle, Moon } from "lucide-react";
import { metrics, suspiciousNumbers, topContacts } from "@/data/mockData";

const cards = [
  { label: "Total Records", value: metrics.totalRecords.toLocaleString(), icon: FileText, color: "text-primary" },
  { label: "Unique Numbers", value: metrics.uniqueNumbers.toLocaleString(), icon: Users, color: "text-primary" },
  { label: "Suspicious Numbers", value: metrics.suspiciousCount.toString(), icon: AlertTriangle, color: "text-risk-high" },
  { label: "Night Calls", value: metrics.nightCalls.toString(), icon: Moon, color: "text-anomaly" },
];

function RiskBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-risk-high" : score >= 45 ? "bg-risk-medium" : "bg-risk-low";
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
      <span className={`text-xs font-mono ${score >= 70 ? "text-risk-high" : score >= 45 ? "text-risk-medium" : "text-risk-low"}`}>
        {score}%
      </span>
    </div>
  );
}

export function InsightsPage() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <motion.h1
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-xl font-semibold text-foreground"
      >
        Investigation Insights
      </motion.h1>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="bg-card border border-border rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`h-4 w-4 ${card.color}`} />
              <span className="text-xs text-muted-foreground">{card.label}</span>
            </div>
            <p className="text-2xl font-semibold text-foreground">{card.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Suspicious Numbers Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Suspicious Numbers</h2>
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-secondary/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Phone</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Risk</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase hidden md:table-cell">Reason</th>
              </tr>
            </thead>
            <tbody>
              {suspiciousNumbers.map((n, i) => (
                <motion.tr
                  key={n.phone}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 + i * 0.05 }}
                  className="border-t border-border hover:bg-secondary/30 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs">{n.phone}</td>
                  <td className="px-4 py-3"><RiskBar score={n.riskScore} /></td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden md:table-cell">{n.reason}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Top Contacts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Top Contacts by Call Volume</h2>
        <div className="space-y-3">
          {topContacts.map((c, i) => {
            const maxCalls = Math.max(...topContacts.map((t) => t.calls));
            return (
              <div key={c.phone} className="flex items-center gap-4">
                <span className="text-xs font-mono text-muted-foreground w-36 shrink-0">{c.phone}</span>
                <div className="flex-1 h-6 bg-secondary/50 rounded-md overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${(c.calls / maxCalls) * 100}%` }}
                    transition={{ duration: 0.8, delay: 0.7 + i * 0.1 }}
                    className="h-full bg-primary/30 rounded-md flex items-center px-2"
                  >
                    <span className="text-xs font-medium text-primary">{c.calls}</span>
                  </motion.div>
                </div>
                {c.label && (
                  <span className="text-xs px-2 py-0.5 rounded-full border border-primary/30 text-primary bg-primary/5">{c.label}</span>
                )}
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
