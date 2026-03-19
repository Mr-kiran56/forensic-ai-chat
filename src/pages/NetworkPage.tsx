import { useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { networkNodes, networkLinks } from "@/data/mockData";

const RISK_COLORS: Record<string, string> = {
  HIGH: "#ef4444",
  MEDIUM: "#f59e0b",
  LOW: "#22c55e",
};

export function NetworkPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<{ id: string; x: number; y: number; vx: number; vy: number; risk: string; calls: number; radius: number }[]>([]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const nodes = nodesRef.current;
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));

    // Draw links
    for (const link of networkLinks) {
      const s = nodeMap.get(link.source);
      const t = nodeMap.get(link.target);
      if (!s || !t) continue;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.08 + link.value * 0.005})`;
      ctx.lineWidth = 1 + link.value * 0.04;
      ctx.stroke();
    }

    // Draw nodes
    for (const node of nodes) {
      const color = RISK_COLORS[node.risk] || RISK_COLORS.LOW;

      // Glow
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 8, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(node.x, node.y, node.radius, node.x, node.y, node.radius + 8);
      grad.addColorStop(0, color + "40");
      grad.addColorStop(1, color + "00");
      ctx.fillStyle = grad;
      ctx.fill();

      // Node
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = color + "cc";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Label
      ctx.fillStyle = "#94a3b8";
      ctx.font = "10px monospace";
      ctx.textAlign = "center";
      ctx.fillText(node.id.slice(-5), node.x, node.y + node.radius + 16);
    }

    // Simple force
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < 120) {
          const f = (120 - dist) * 0.01;
          nodes[i].vx -= (dx / dist) * f;
          nodes[i].vy -= (dy / dist) * f;
          nodes[j].vx += (dx / dist) * f;
          nodes[j].vy += (dy / dist) * f;
        }
      }
      // Center gravity
      nodes[i].vx += (w / 2 - nodes[i].x) * 0.001;
      nodes[i].vy += (h / 2 - nodes[i].y) * 0.001;

      nodes[i].vx *= 0.9;
      nodes[i].vy *= 0.9;
      nodes[i].x += nodes[i].vx;
      nodes[i].y += nodes[i].vy;
      nodes[i].x = Math.max(30, Math.min(w - 30, nodes[i].x));
      nodes[i].y = Math.max(30, Math.min(h - 30, nodes[i].y));
    }

    // Links as springs
    for (const link of networkLinks) {
      const s = nodeMap.get(link.source);
      const t = nodeMap.get(link.target);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const target = 140;
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
    };
    resize();
    window.addEventListener("resize", resize);

    // Init nodes
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    nodesRef.current = networkNodes.map((n, i) => ({
      id: n.id,
      x: cx + Math.cos((i / networkNodes.length) * Math.PI * 2) * 150 + (Math.random() - 0.5) * 60,
      y: cy + Math.sin((i / networkNodes.length) * Math.PI * 2) * 150 + (Math.random() - 0.5) * 60,
      vx: 0,
      vy: 0,
      risk: n.risk,
      calls: n.calls,
      radius: 6 + (n.calls / 50),
    }));

    animRef.current = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", resize);
      cancelAnimationFrame(animRef.current);
    };
  }, [draw]);

  return (
    <div className="flex flex-col h-full p-6">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-4"
      >
        <h1 className="text-xl font-semibold text-foreground">Network Graph</h1>
        <div className="flex items-center gap-4 text-xs">
          {Object.entries(RISK_COLORS).map(([level, color]) => (
            <div key={level} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-muted-foreground">{level}</span>
            </div>
          ))}
        </div>
      </motion.div>
      <div className="flex-1 border border-border rounded-xl overflow-hidden bg-card/50 relative">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>
    </div>
  );
}
