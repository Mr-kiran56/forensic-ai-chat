"""
services/network_builder.py
Builds a call/communication network graph from merged forensic data.
Returns nodes and edges with risk metadata for frontend visualization.
"""
import pandas as pd
import networkx as nx
from typing import Dict, List, Optional
from collections import defaultdict


# Color/risk tier mapping
def risk_color(score: int) -> str:
    if score >= 70:
        return "#ef4444"   # red
    elif score >= 40:
        return "#f97316"   # orange
    elif score >= 20:
        return "#eab308"   # yellow
    else:
        return "#22c55e"   # green


def source_color(source: str) -> str:
    return {
        "CDR": "#3b82f6",
        "TOWER": "#8b5cf6",
        "IPDR": "#06b6d4",
    }.get(source, "#94a3b8")


class NetworkBuilder:

    def build_graph(self, merged_df: pd.DataFrame, cdr_df: pd.DataFrame,
                    tower_df: Optional[pd.DataFrame], ipdr_df: Optional[pd.DataFrame]) -> Dict:
        """
        Nodes:  phone numbers + towers
        Edges:  calls (CDR), tower presence (Tower Dump), internet sessions (IPDR)
        """
        G = nx.MultiDiGraph()

        has_risk = "risk_score" in merged_df.columns

        # ── Add CDR edges (call relationships) ────────────────────────────────
        for _, row in cdr_df.iterrows():
            caller = str(row.get("caller_number", ""))
            receiver = str(row.get("receiver_number", ""))
            if not caller or not receiver:
                continue

            # Node for caller
            caller_score = int(merged_df[merged_df["caller_number"] == caller]["risk_score"].max()) \
                if has_risk and caller in merged_df["caller_number"].values else 0
            if not G.has_node(caller):
                G.add_node(caller, label=caller[-10:], type="phone",
                           source="CDR", risk_score=caller_score,
                           color=risk_color(caller_score),
                           size=20 + caller_score // 5)

            # Node for receiver
            if not G.has_node(receiver):
                G.add_node(receiver, label=receiver[-10:], type="phone",
                           source="CDR", risk_score=0,
                           color=risk_color(0), size=15)

            # Tower node (if present)
            tower_id = str(row.get("tower_id", "")) if "tower_id" in row else ""
            location = str(row.get("location", row.get("area_name", "")))

            if tower_id and tower_id not in ("nan", ""):
                if not G.has_node(tower_id):
                    G.add_node(tower_id, label=tower_id, type="tower",
                               source="TOWER", location=location,
                               color="#8b5cf6", size=25, shape="square")
                # phone → tower edge
                G.add_edge(caller, tower_id, type="tower_connection",
                           color="#8b5cf680", label="tower", weight=1)

            # Call edge
            G.add_edge(caller, receiver,
                       type="call",
                       call_type=str(row.get("call_type", "")),
                       duration=int(row.get("call_duration", 0) or 0),
                       timestamp=str(row.get("call_start", "")),
                       location=location,
                       color="#3b82f6",
                       label="call",
                       weight=2)

        # ── Add IPDR nodes (internet sessions) ────────────────────────────────
        if ipdr_df is not None:
            for _, row in ipdr_df.iterrows():
                phone = str(row.get("phone_number", ""))
                ip = str(row.get("ip_address", ""))
                site = str(row.get("website_accessed", ""))

                if phone and not G.has_node(phone):
                    G.add_node(phone, label=phone[-10:], type="phone",
                               source="IPDR", risk_score=0,
                               color=risk_color(0), size=15)

                if ip and ip not in ("nan", ""):
                    node_id = f"IP:{ip}"
                    if not G.has_node(node_id):
                        G.add_node(node_id, label=ip, type="ip_address",
                                   source="IPDR", website=site,
                                   color="#06b6d4", size=12)
                    if phone:
                        G.add_edge(phone, node_id, type="internet",
                                   website=site,
                                   data_mb=float(row.get("data_usage_mb", 0) or 0),
                                   color="#06b6d480",
                                   label="internet")

        # ── Convert to serialisable format ────────────────────────────────────
        nodes = []
        for node_id, attrs in G.nodes(data=True):
            nodes.append({
                "id": node_id,
                "label": attrs.get("label", node_id),
                "type": attrs.get("type", "phone"),
                "source": attrs.get("source", "CDR"),
                "risk_score": attrs.get("risk_score", 0),
                "color": attrs.get("color", "#94a3b8"),
                "size": attrs.get("size", 15),
                "location": attrs.get("location", attrs.get("area_name", "")),
                "shape": attrs.get("shape", "dot"),
                "website": attrs.get("website", ""),
            })

        edges = []
        for u, v, attrs in G.edges(data=True):
            edges.append({
                "from": u,
                "to": v,
                "type": attrs.get("type", "call"),
                "label": attrs.get("label", ""),
                "color": attrs.get("color", "#94a3b8"),
                "weight": attrs.get("weight", 1),
                "duration": attrs.get("duration", 0),
                "timestamp": attrs.get("timestamp", ""),
                "location": attrs.get("location", ""),
                "website": attrs.get("website", ""),
                "data_mb": attrs.get("data_mb", 0),
            })

        # ── Cluster / community detection ─────────────────────────────────────
        undirected = G.to_undirected()
        communities = []
        try:
            comms = list(nx.community.greedy_modularity_communities(undirected))
            for i, comm in enumerate(comms[:20]):
                communities.append({"id": i, "members": list(comm)})
        except Exception:
            pass

        # ── Risk hotspot towers ───────────────────────────────────────────────
        high_risk_towers = []
        if tower_df is not None and "tower_id" in merged_df.columns and has_risk:
            tower_risk = (
                merged_df.groupby("tower_id")["risk_score"]
                .max()
                .sort_values(ascending=False)
                .head(10)
                .reset_index()
                .to_dict(orient="records")
            )
            high_risk_towers = tower_risk

        return {
            "nodes": nodes,
            "edges": edges,
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "communities": communities,
            "high_risk_towers": high_risk_towers,
            "stats": {
                "phone_nodes": sum(1 for n in nodes if n["type"] == "phone"),
                "tower_nodes": sum(1 for n in nodes if n["type"] == "tower"),
                "ip_nodes": sum(1 for n in nodes if n["type"] == "ip_address"),
                "call_edges": sum(1 for e in edges if e["type"] == "call"),
                "tower_edges": sum(1 for e in edges if e["type"] == "tower_connection"),
                "internet_edges": sum(1 for e in edges if e["type"] == "internet"),
            }
        }


network_builder = NetworkBuilder()