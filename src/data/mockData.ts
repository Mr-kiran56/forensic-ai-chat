// Mock forensic telecom data

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

export const suspiciousNumbers: SuspiciousNumber[] = [
  { phone: "+91-98765-43210", riskScore: 94, riskLevel: "HIGH", reason: "Abnormal night activity, 47 calls between 1-4 AM", totalCalls: 312, nightCalls: 47, uniqueContacts: 89 },
  { phone: "+91-87654-32109", riskScore: 88, riskLevel: "HIGH", reason: "Rapid tower switching pattern detected", totalCalls: 256, nightCalls: 31, uniqueContacts: 12 },
  { phone: "+91-76543-21098", riskScore: 82, riskLevel: "HIGH", reason: "Communication with 3 known flagged numbers", totalCalls: 189, nightCalls: 22, uniqueContacts: 45 },
  { phone: "+91-65432-10987", riskScore: 71, riskLevel: "HIGH", reason: "Burst activity — 23 calls in 15 minutes", totalCalls: 145, nightCalls: 15, uniqueContacts: 67 },
  { phone: "+91-54321-09876", riskScore: 58, riskLevel: "MEDIUM", reason: "Frequent short-duration calls (avg 8s)", totalCalls: 423, nightCalls: 8, uniqueContacts: 34 },
  { phone: "+91-43210-98765", riskScore: 52, riskLevel: "MEDIUM", reason: "Multiple IMEI changes detected", totalCalls: 167, nightCalls: 5, uniqueContacts: 23 },
  { phone: "+91-32109-87654", riskScore: 45, riskLevel: "MEDIUM", reason: "Cross-state tower usage in short period", totalCalls: 98, nightCalls: 12, uniqueContacts: 56 },
  { phone: "+91-21098-76543", riskScore: 28, riskLevel: "LOW", reason: "Slightly elevated call frequency", totalCalls: 78, nightCalls: 3, uniqueContacts: 18 },
];

export const topContacts: TopContact[] = [
  { phone: "+91-98765-43210", calls: 312, label: "Primary Suspect" },
  { phone: "+91-54321-09876", calls: 423, label: "High Volume" },
  { phone: "+91-87654-32109", calls: 256 },
  { phone: "+91-76543-21098", calls: 189 },
  { phone: "+91-65432-10987", calls: 145 },
];

export const metrics = {
  totalRecords: 12847,
  uniqueNumbers: 1432,
  suspiciousCount: 8,
  nightCalls: 347,
};

export const networkNodes = [
  { id: "+91-98765-43210", risk: "HIGH" as const, calls: 312 },
  { id: "+91-87654-32109", risk: "HIGH" as const, calls: 256 },
  { id: "+91-76543-21098", risk: "HIGH" as const, calls: 189 },
  { id: "+91-65432-10987", risk: "HIGH" as const, calls: 145 },
  { id: "+91-54321-09876", risk: "MEDIUM" as const, calls: 423 },
  { id: "+91-43210-98765", risk: "MEDIUM" as const, calls: 167 },
  { id: "+91-32109-87654", risk: "MEDIUM" as const, calls: 98 },
  { id: "+91-21098-76543", risk: "LOW" as const, calls: 78 },
  { id: "+91-11111-22222", risk: "LOW" as const, calls: 45 },
  { id: "+91-33333-44444", risk: "LOW" as const, calls: 32 },
];

export const networkLinks = [
  { source: "+91-98765-43210", target: "+91-87654-32109", value: 45 },
  { source: "+91-98765-43210", target: "+91-76543-21098", value: 32 },
  { source: "+91-98765-43210", target: "+91-54321-09876", value: 28 },
  { source: "+91-98765-43210", target: "+91-65432-10987", value: 19 },
  { source: "+91-87654-32109", target: "+91-76543-21098", value: 15 },
  { source: "+91-87654-32109", target: "+91-43210-98765", value: 12 },
  { source: "+91-76543-21098", target: "+91-32109-87654", value: 22 },
  { source: "+91-65432-10987", target: "+91-54321-09876", value: 8 },
  { source: "+91-54321-09876", target: "+91-11111-22222", value: 14 },
  { source: "+91-43210-98765", target: "+91-33333-44444", value: 6 },
  { source: "+91-21098-76543", target: "+91-11111-22222", value: 9 },
  { source: "+91-32109-87654", target: "+91-33333-44444", value: 11 },
];

// Chatbot mock responses
export interface ChatResponse {
  text: string;
  table?: { headers: string[]; rows: string[][] };
  badges?: { label: string; type: "high" | "medium" | "low" | "anomaly" }[];
}

export function getMockResponse(query: string): ChatResponse {
  const q = query.toLowerCase();

  if (q.includes("suspicious") || q.includes("high-risk") || q.includes("risk")) {
    return {
      text: "AI detected **4 high-risk numbers** based on abnormal night activity, rapid tower switching, and communication with flagged numbers.",
      badges: [
        { label: "HIGH RISK", type: "high" },
        { label: "4 Numbers Flagged", type: "anomaly" },
      ],
      table: {
        headers: ["Phone Number", "Risk Score", "Reason"],
        rows: suspiciousNumbers
          .filter((n) => n.riskLevel === "HIGH")
          .map((n) => [n.phone, `${n.riskScore}%`, n.reason]),
      },
    };
  }

  if (q.includes("night") || q.includes("nocturnal")) {
    return {
      text: "Analysis found **347 night-time calls** (12 AM – 5 AM) across 12,847 records. The number **+91-98765-43210** has the highest night activity with 47 calls during these hours.",
      badges: [
        { label: "347 Night Calls", type: "anomaly" },
        { label: "HIGH RISK", type: "high" },
      ],
      table: {
        headers: ["Phone Number", "Night Calls", "Risk Level"],
        rows: suspiciousNumbers
          .filter((n) => n.nightCalls > 10)
          .map((n) => [n.phone, `${n.nightCalls}`, n.riskLevel]),
      },
    };
  }

  if (q.includes("analyze") || q.includes("number")) {
    return {
      text: "Detailed analysis of **+91-98765-43210**: This number shows multiple anomaly indicators — high night activity (47 calls between 1–4 AM), communication with 89 unique contacts, and connection to 3 flagged numbers in the database.",
      badges: [
        { label: "HIGH RISK", type: "high" },
        { label: "ANOMALY", type: "anomaly" },
        { label: "89 Contacts", type: "medium" },
      ],
    };
  }

  if (q.includes("tower") || q.includes("location")) {
    return {
      text: "Tower analysis reveals **+91-87654-32109** exhibited rapid tower switching — connecting to 12 different towers within a 2-hour window, suggesting vehicular movement or deliberate evasion.",
      badges: [
        { label: "TOWER ANOMALY", type: "anomaly" },
        { label: "HIGH RISK", type: "high" },
      ],
    };
  }

  if (q.includes("summary") || q.includes("overview") || q.includes("report")) {
    return {
      text: `**Investigation Summary:**\n\n• **12,847** total records analyzed across CDR, Tower Dump, and IPDR data\n• **1,432** unique numbers identified\n• **8** suspicious numbers flagged (4 high-risk)\n• **347** night-time calls detected\n\nTop concern: **+91-98765-43210** with risk score 94% — recommend immediate deep analysis.`,
      badges: [
        { label: "8 Suspicious", type: "high" },
        { label: "347 Night Calls", type: "anomaly" },
      ],
    };
  }

  return {
    text: "I've analyzed the available forensic data. Could you be more specific? Try asking about:\n\n• **Suspicious numbers** — flagged numbers with risk scores\n• **Night activity** — calls during unusual hours\n• **Tower analysis** — location and movement patterns\n• **Number analysis** — deep dive into a specific number\n• **Investigation summary** — overview of all findings",
  };
}
