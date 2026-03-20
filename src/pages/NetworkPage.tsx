import { useEffect, useRef, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { getState, subscribeState, checkStatus, getNetworkNodes, getNetworkLinks } from "@/data/mockData";

const RISK_COLORS: Record<string, string> = {
  HIGH: "#ef4444",
  MEDIUM: "#f59e0b",
  LOW: "#22c55e",
};

const SOURCE_COLORS: Record<string, string> = {
  CDR: "#38bdf8",
  TOWER: "#a78bfa",
  IPDR: "#34d399",
  phone: "#38bdf8",
  tower: "#a78bfa",
  ip_address: "#34d399",
};

const SOURCE_LABELS: Record<string, string> = {
  CDR: "Phone (CDR)",
  TOWER: "Tower",
  IPDR: "IP / Internet",
  phone: "Phone (CDR)",
  tower: "Tower",
  ip_address: "IP (IPDR)",
};

interface CanvasNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  risk: "HIGH" | "MEDIUM" | "LOW";
  type: string;
  source: string;
  calls: number;
  radius: number;
  color: string;
}

interface TooltipInfo {
  id: string;
  risk: string;
  type: string;
  source: string;
  calls: number;
  x: number;
  y: number;
}

export function NetworkPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<CanvasNode[]>([]);
  const linksRef = useRef<{ source: string; target: string; value: number }[]>([]);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [stats, setStats] = useState({ phones: 0, towers: 0, ips: 0, edges: 0 });
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    checkStatus();
    return subscribeState(() => forceUpdate(n => n + 1));
  }, []);

  const buildNodes = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    const state = getState();
    const nd = state.networkData;

    let rawNodes: { id: string; risk: "HIGH" | "MEDIUM" | "LOW"; type: string; source: string; calls: number }[] = [];
    let rawLinks: { source: string; target: string; value: number }[] = [];

    if (nd && nd.nodes.length > 0) {
      // Use real network data, focus on phone + tower nodes (cap IPs for perf)
      const phoneNodes = nd.nodes.filter(n => n.type === "phone").slice(0, 40);
      const towerNodes = nd.nodes.filter(n => n.type === "tower").slice(0, 20);
      const ipNodes = nd.nodes.filter(n => n.type === "ip_address").slice(0, 15);
      const visibleNodes = [...phoneNodes, ...towerNodes, ...ipNodes];
      const visibleIds = new Set(visibleNodes.map(n => n.id));

      rawNodes = visibleNodes.map(n => ({
        id: n.id,
        risk: n.risk_score >= 70 ? "HIGH" : n.risk_score >= 40 ? "MEDIUM" : "LOW",
        type: n.type,
        source: n.source || n.type,
        calls: n.size || 10,
      }));
      rawLinks = nd.edges
        .filter(e => visibleIds.has(e.from) && visibleIds.has(e.to))
        .slice(0, 120)
        .map(e => ({ source: e.from, target: e.to, value: e.weight || 1 }));

      setStats({
        phones: phoneNodes.length,
        towers: towerNodes.length,
        ips: ipNodes.length,
        edges: rawLinks.length,
      });
    } else {
      // Fallback mock nodes
      rawNodes = getNetworkNodes().map(n => ({ ...n, type: "phone", source: "CDR" }));
      rawLinks = getNetworkLinks();
      setStats({ phones: rawNodes.length, towers: 0, ips: 0, edges: rawLinks.length });
    }

    nodesRef.current = rawNodes.map((n, i) => {
      const angle = (i / rawNodes.length) * Math.PI * 2;
      const spread = n.type === "tower" ? 180 : n.type === "ip_address" ? 240 : 130;
      const color = n.type === "tower"
        ? SOURCE_COLORS.tower
        : n.type === "ip_address"
        ? SOURCE_COLORS.ip_address
        : RISK_COLORS[n.risk];
      return {
        id: n.id,
        x: cx + Math.cos(angle) * spread + (Math.random() - 0.5) * 50,
        y: cy + Math.sin(angle) * spread + (Math.random() - 0.5) * 50,
        vx: 0, vy: 0,
        risk: n.risk,
        type: n.type,
        source: n.source,
        calls: n.calls,
        radius: n.type === "tower" ? 10 : n.type === "ip_address" ? 5 : Math.min(6 + n.calls / 60, 18),
        color,
      };
    });
    linksRef.current = rawLinks;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const nodes = nodesRef.current;
    const links = linksRef.current;
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Draw links
    for (const link of links) {
      const s = nodeMap.get(link.source);
      const t = nodeMap.get(link.target);
      if (!s || !t) continue;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      const alpha = Math.min(0.05 + link.value * 0.01, 0.25);
      ctx.strokeStyle = `rgba(56,189,248,${alpha})`;
      ctx.lineWidth = Math.min(1 + link.value * 0.03, 2.5);
      ctx.stroke();
    }

    // Draw nodes
    for (const node of nodes) {
      // Outer glow
      const grad = ctx.createRadialGradient(node.x, node.y, node.radius, node.x, node.y, node.radius + 10);
      grad.addColorStop(0, node.color + "50");
      grad.addColorStop(1, node.color + "00");
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 10, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Node body
      if (node.type === "tower") {
        // Square for towers
        ctx.beginPath();
        ctx.rect(node.x - node.radius, node.y - node.radius, node.radius * 2, node.radius * 2);
      } else {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      }
      ctx.fillStyle = node.color + "cc";
      ctx.fill();
      ctx.strokeStyle = node.color;
      ctx.lineWidth = node.risk === "HIGH" ? 2 : 1.5;
      ctx.stroke();

      // Label
      const labelId = node.id.length > 12 ? node.id.slice(-8) : node.id;
      ctx.fillStyle = "#94a3b8";
      ctx.font = node.type === "tower" ? "bold 9px monospace" : "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText(labelId, node.x, node.y + node.radius + 14);

      // Source tag for towers
      if (node.type === "tower") {
        ctx.fillStyle = SOURCE_COLORS.tower + "cc";
        ctx.font = "8px sans-serif";
        ctx.fillText("TOWER", node.x, node.y + node.radius + 23);
      }
    }

    // Force simulation
    for (let i = 0; i < nodes.length; i++) {
      // Repulsion
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const minDist = nodes[i].radius + nodes[j].radius + 30;
        if (dist < minDist) {
          const f = (minDist - dist) * 0.012;
          nodes[i].vx -= (dx / dist) * f;
          nodes[i].vy -= (dy / dist) * f;
          nodes[j].vx += (dx / dist) * f;
          nodes[j].vy += (dy / dist) * f;
        }
      }
      // Gravity
      nodes[i].vx += (w / 2 - nodes[i].x) * 0.001;
      nodes[i].vy += (h / 2 - nodes[i].y) * 0.001;
      // Damping
      nodes[i].vx *= 0.88;
      nodes[i].vy *= 0.88;
      nodes[i].x = Math.max(30, Math.min(w - 30, nodes[i].x + nodes[i].vx));
      nodes[i].y = Math.max(30, Math.min(h - 30, nodes[i].y + nodes[i].vy));
    }

    // Spring forces from links
    for (const link of links) {
      const s = nodeMap.get(link.source);
      const t = nodeMap.get(link.target);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const target = 130 + link.value * 2;
      const f = (dist - target) * 0.003;
      s.vx += (dx / dist) * f;
      s.vy += (dy / dist) * f;
      t.vx -= (dx / dist) * f;
      t.vy -= (dy / dist) * f;
    }

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
      buildNodes();
    };
    resize();
    window.addEventListener("resize", resize);
    animRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, [draw, buildNodes]);

  // Rebuild nodes when data changes
  useEffect(() => {
    buildNodes();
  }, [getState().processed, buildNodes]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);

    for (const node of nodesRef.current) {
      const dx = mx - node.x;
      const dy = my - node.y;
      if (Math.sqrt(dx * dx + dy * dy) < node.radius + 8) {
        setTooltip({
          id: node.id,
          risk: node.risk,
          type: node.type,
          source: node.source,
          calls: node.calls,
          x: e.clientX,
          y: e.clientY,
        });
        return;
      }
    }
    setTooltip(null);
  }, []);

  const legendItems = [
    { label: "Phone (CDR)", color: "#38bdf8", shape: "circle" },
    { label: "Tower (TOWER)", color: "#a78bfa", shape: "square" },
    { label: "IP (IPDR)", color: "#34d399", shape: "circle" },
    { label: "High Risk", color: RISK_COLORS.HIGH, shape: "circle" },
    { label: "Medium Risk", color: RISK_COLORS.MEDIUM, shape: "circle" },
    { label: "Low Risk", color: RISK_COLORS.LOW, shape: "circle" },
  ];

  return (
    <div className="flex flex-col h-full p-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-4"
      >
        <div>
          <h1 className="text-xl font-semibold text-foreground">Network Graph</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {getState().processed
              ? `${stats.phones} phones · ${stats.towers} towers · ${stats.ips} IPs · ${stats.edges} connections`
              : "Upload and process files to see real communication network"}
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs flex-wrap justify-end">
          {legendItems.map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
              {item.shape === "square" ? (
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: item.color }} />
              ) : (
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
              )}
              <span className="text-muted-foreground">{item.label}</span>
            </div>
          ))}
        </div>
      </motion.div>

      <div className="flex-1 border border-border rounded-xl overflow-hidden bg-card/50 relative">
        <canvas
          ref={canvasRef}
          className="w-full h-full"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setTooltip(null)}
          style={{ cursor: tooltip ? "pointer" : "default" }}
        />

        {/* Tooltip */}
        {tooltip && (
          <div
            className="fixed z-50 bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-xl pointer-events-none"
            style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
          >
            <p className="font-mono font-medium text-foreground mb-1">{tooltip.id}</p>
            <p className="text-muted-foreground">
              Type: <span className="text-foreground">{SOURCE_LABELS[tooltip.type] || tooltip.type}</span>
            </p>
            <p className="text-muted-foreground">
              Source: <span style={{ color: SOURCE_COLORS[tooltip.source] || "#94a3b8" }}>{tooltip.source}</span>
            </p>
            {tooltip.type === "phone" && (
              <p className="text-muted-foreground">
                Risk: <span style={{ color: RISK_COLORS[tooltip.risk] }}>{tooltip.risk}</span>
              </p>
            )}
          </div>
        )}

        {!getState().processed && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <p className="text-muted-foreground text-sm">No data loaded</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Upload CDR, Tower &amp; IPDR files to see the network</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}