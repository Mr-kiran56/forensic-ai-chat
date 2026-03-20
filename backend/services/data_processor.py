"""
services/data_processor.py
Merges CDR, Tower Dump, IPDR Excel files and preprocesses for forensic analysis.
"""
import pandas as pd
import numpy as np
from typing import Dict, Tuple, Optional
import io


# ─── Column Normalisation Maps ────────────────────────────────────────────────

CDR_COLS = {
    "CALLER NUMBER": "caller_number",
    "RECEIVER NUMBER": "receiver_number",
    "CALL START TIME": "call_start",
    "CALL END TIME": "call_end",
    "CALL DURATION": "call_duration",
    "CALL TYPE": "call_type",
    "IMEI": "imei",
    "IMSI": "imsi",
    "TOWER ID": "tower_id",
    "LOCATION": "location",
}

TOWER_COLS = {
    "PHONE NUMBER": "phone_number",
    "TOWER ID": "tower_id",
    "TIMESTAMP": "timestamp",
    "LATITUDE": "latitude",
    "LONGITUDE": "longitude",
    "AREA NAME": "area_name",
    "SIGNAL STRENGTH": "signal_strength",
    "DEVICE ID": "device_id",
}

IPDR_COLS = {
    "PHONE NUMBER": "phone_number",
    "IP ADDRESS": "ip_address",
    "TIMESTAMP": "timestamp",
    "DATA USAGE MB": "data_usage_mb",
    "WEBSITE ACCESSED": "website_accessed",
    "SESSION DURATION": "session_duration",
    "DEVICE TYPE": "device_type",
    "LOCATION": "location",
}


class ForensicDataProcessor:
    def __init__(self):
        self.cdr_df: Optional[pd.DataFrame] = None
        self.tower_df: Optional[pd.DataFrame] = None
        self.ipdr_df: Optional[pd.DataFrame] = None
        self.merged_df: Optional[pd.DataFrame] = None
        self.is_loaded = False
        self._summary_cache: Optional[Dict] = None

    # ─── Loaders ─────────────────────────────────────────────────────────────

    def load_cdr(self, file_bytes: bytes) -> int:
        df = pd.read_excel(io.BytesIO(file_bytes))
        df.columns = [c.strip().upper() for c in df.columns]
        df.rename(columns=CDR_COLS, inplace=True)
        df["call_start"] = pd.to_datetime(df["call_start"], errors="coerce")
        df["call_end"] = pd.to_datetime(df["call_end"], errors="coerce")
        df["call_duration"] = pd.to_numeric(df["call_duration"], errors="coerce")
        df["caller_number"] = df["caller_number"].astype(str).str.strip()
        df["receiver_number"] = df["receiver_number"].astype(str).str.strip()
        df["_source"] = "CDR"
        self.cdr_df = df
        return len(df)

    def load_tower(self, file_bytes: bytes) -> int:
        df = pd.read_excel(io.BytesIO(file_bytes))
        df.columns = [c.strip().upper() for c in df.columns]
        df.rename(columns=TOWER_COLS, inplace=True)
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
        df["signal_strength"] = pd.to_numeric(df["signal_strength"], errors="coerce")
        df["phone_number"] = df["phone_number"].astype(str).str.strip()
        df["_source"] = "TOWER"
        self.tower_df = df
        return len(df)

    def load_ipdr(self, file_bytes: bytes) -> int:
        df = pd.read_excel(io.BytesIO(file_bytes))
        df.columns = [c.strip().upper() for c in df.columns]
        df.rename(columns=IPDR_COLS, inplace=True)
        df["timestamp"] = pd.to_datetime(df["timestamp"], errors="coerce")
        df["data_usage_mb"] = pd.to_numeric(df["data_usage_mb"], errors="coerce")
        df["session_duration"] = pd.to_numeric(df["session_duration"], errors="coerce")
        df["phone_number"] = df["phone_number"].astype(str).str.strip()
        df["_source"] = "IPDR"
        self.ipdr_df = df
        return len(df)

    # ─── Merge ────────────────────────────────────────────────────────────────

    def merge_all(self) -> pd.DataFrame:
        """
        Strategy:
        1. CDR is the spine — each call row is the base record.
        2. Tower dump is joined on (caller_number ↔ phone_number, tower_id).
        3. IPDR is joined on (caller_number ↔ phone_number, approximate timestamp).
        """
        if self.cdr_df is None:
            raise ValueError("CDR data not loaded")

        cdr = self.cdr_df.copy()

        if self.tower_df is not None:
            tower_sub = self.tower_df[
                ["phone_number", "tower_id", "latitude", "longitude",
                 "area_name", "signal_strength", "device_id"]
            ].drop_duplicates(subset=["phone_number", "tower_id"])

            cdr = cdr.merge(
                tower_sub,
                left_on=["caller_number", "tower_id"],
                right_on=["phone_number", "tower_id"],
                how="left",
                suffixes=("", "_tower"),
            )

        if self.ipdr_df is not None:
            # Most recent IPDR session per phone number
            ipdr_latest = (
                self.ipdr_df.sort_values("timestamp", ascending=False)
                .drop_duplicates(subset=["phone_number"])
            )[["phone_number", "ip_address", "data_usage_mb",
               "website_accessed", "session_duration", "device_type"]]

            cdr = cdr.merge(
                ipdr_latest,
                left_on="caller_number",
                right_on="phone_number",
                how="left",
                suffixes=("", "_ipdr"),
            )

        self.merged_df = cdr
        self.is_loaded = True
        self._summary_cache = None  # reset cache
        return cdr

    # ─── Rule-Based Pattern Detection ─────────────────────────────────────────

    def apply_rules(self) -> pd.DataFrame:
        """
        Applies forensic rule-based flags to the merged dataframe.
        Returns a DataFrame with risk flags and scores.
        """
        df = self.merged_df.copy() if self.merged_df is not None else self.cdr_df.copy()

        risk_flags = []
        risk_scores = []

        # ── Suspicious websites from IPDR ──
        DARK_WEB_KEYWORDS = ["onion", "tor", "darkweb", "silkroad"]
        FRAUD_SITES = ["westernunion", "moneygram", "coinbase", "localbitcoin",
                       "hawala", "transferwise_fraud"]
        VPN_PROXIES = ["vpn", "proxy", "tunnelbear", "nordvpn", "expressvpn", "hide.me"]

        def get_flags(row):
            flags = []
            score = 0

            # RULE 1: Abnormally long call duration (> 1 hour = 3600s)
            dur = row.get("call_duration", 0) or 0
            if dur > 3600:
                flags.append("LONG_CALL_DURATION")
                score += 20

            # RULE 2: Late night calls (00:00 – 05:00)
            ts = row.get("call_start")
            if pd.notna(ts):
                hour = pd.to_datetime(ts).hour
                if 0 <= hour <= 5:
                    flags.append("LATE_NIGHT_ACTIVITY")
                    score += 15

            # RULE 3: Weak signal (possible IMSI catcher area / border)
            sig = row.get("signal_strength", 0) or 0
            if sig < -100:
                flags.append("WEAK_SIGNAL_ZONE")
                score += 10

            # RULE 4: Suspicious website access
            site = str(row.get("website_accessed", "") or "").lower()
            if any(kw in site for kw in DARK_WEB_KEYWORDS):
                flags.append("DARK_WEB_ACCESS")
                score += 40
            if any(kw in site for kw in FRAUD_SITES):
                flags.append("FRAUD_SITE_ACCESS")
                score += 35
            if any(kw in site for kw in VPN_PROXIES):
                flags.append("VPN_PROXY_USAGE")
                score += 20

            # RULE 5: Extremely high data usage in one session (> 500 MB)
            usage = row.get("data_usage_mb", 0) or 0
            if usage > 500:
                flags.append("HIGH_DATA_USAGE")
                score += 15

            # RULE 6: Multiple IMEI changes per number (detected at merge time, pre-flagged)
            if row.get("_multi_imei"):
                flags.append("IMEI_SWAP_DETECTED")
                score += 30

            # RULE 7: High call frequency (pre-computed column)
            if row.get("_high_call_freq"):
                flags.append("HIGH_CALL_FREQUENCY")
                score += 25

            risk_flags.append(", ".join(flags) if flags else "CLEAN")
            risk_scores.append(min(score, 100))

        # Pre-compute: IMEI swaps per caller
        if "imei" in df.columns:
            imei_counts = df.groupby("caller_number")["imei"].nunique()
            df["_multi_imei"] = df["caller_number"].map(imei_counts) > 1

        # Pre-compute: call frequency per number (> 20 calls = high)
        call_counts = df.groupby("caller_number").size()
        df["_high_call_freq"] = df["caller_number"].map(call_counts) > 20

        df.apply(get_flags, axis=1)
        df["risk_flags"] = risk_flags
        df["risk_score"] = risk_scores

        self.merged_df = df
        return df

    # ─── Summary Statistics ───────────────────────────────────────────────────

    def get_summary(self) -> Dict:
        if self._summary_cache:
            return self._summary_cache

        df = self.merged_df if self.merged_df is not None else self.cdr_df

        total_records = len(df)
        flagged = df[df["risk_score"] > 0] if "risk_score" in df.columns else pd.DataFrame()
        high_risk = df[df["risk_score"] >= 50] if "risk_score" in df.columns else pd.DataFrame()

        unique_numbers = set()
        if "caller_number" in df.columns:
            unique_numbers.update(df["caller_number"].unique())
        if "receiver_number" in df.columns:
            unique_numbers.update(df["receiver_number"].unique())

        top_callers = []
        if "caller_number" in df.columns:
            top_callers = (
                df.groupby("caller_number").size()
                .sort_values(ascending=False)
                .head(10)
                .reset_index()
                .rename(columns={0: "call_count"})
                .to_dict(orient="records")
            )

        suspicious_numbers = []
        if "risk_score" in df.columns and "caller_number" in df.columns:
            suspicious_numbers = (
                df[df["risk_score"] >= 50]
                .groupby("caller_number")["risk_score"]
                .max()
                .sort_values(ascending=False)
                .head(10)
                .reset_index()
                .to_dict(orient="records")
            )

        # Top towers by activity
        top_towers = []
        if "tower_id" in df.columns:
            top_towers = (
                df.groupby("tower_id").size()
                .sort_values(ascending=False)
                .head(10)
                .reset_index()
                .rename(columns={0: "activity_count"})
                .to_dict(orient="records")
            )

        # Flag breakdown
        flag_breakdown = {}
        if "risk_flags" in df.columns:
            all_flags = []
            for f in df["risk_flags"].dropna():
                all_flags.extend([x.strip() for x in f.split(",") if x.strip() != "CLEAN"])
            from collections import Counter
            flag_breakdown = dict(Counter(all_flags).most_common(15))

        summary = {
            "total_records": int(total_records),
            "unique_numbers": int(len(unique_numbers)),
            "flagged_records": int(len(flagged)),
            "high_risk_records": int(len(high_risk)),
            "sources_loaded": {
                "cdr": self.cdr_df is not None,
                "tower": self.tower_df is not None,
                "ipdr": self.ipdr_df is not None,
            },
            "cdr_rows": int(len(self.cdr_df)) if self.cdr_df is not None else 0,
            "tower_rows": int(len(self.tower_df)) if self.tower_df is not None else 0,
            "ipdr_rows": int(len(self.ipdr_df)) if self.ipdr_df is not None else 0,
            "top_callers": top_callers,
            "suspicious_numbers": suspicious_numbers,
            "top_towers": top_towers,
            "flag_breakdown": flag_breakdown,
        }
        self._summary_cache = summary
        return summary

    # ─── Query Helper (for AI context) ───────────────────────────────────────

    def get_context_for_query(self, query: str, max_rows: int = 30) -> str:
        """Returns a text-format data context relevant to the user query for AI augmentation."""
        df = self.merged_df if self.merged_df is not None else self.cdr_df
        if df is None:
            return "No data loaded yet."

        q = query.lower()
        context_parts = [f"Dataset: {len(df)} total records loaded.\n"]

        # Phone number lookup
        import re
        numbers = re.findall(r"\d{10,15}", query)
        if numbers:
            for num in numbers:
                subset = df[df.apply(
                    lambda r: any(str(num) in str(v) for v in r.values), axis=1
                )].head(10)
                if not subset.empty:
                    context_parts.append(f"Records for {num}:\n{subset.to_string(index=False)}\n")

        # Suspicious / risk keywords
        if any(k in q for k in ["suspicious", "risk", "high risk", "flagged", "danger"]):
            if "risk_score" in df.columns:
                risky = df[df["risk_score"] >= 40].sort_values("risk_score", ascending=False).head(max_rows)
                context_parts.append(f"High-risk records (top {len(risky)}):\n{risky[['caller_number','risk_score','risk_flags','location']].to_string(index=False)}\n")

        # Tower / location queries
        if any(k in q for k in ["tower", "location", "area", "place"]):
            if "tower_id" in df.columns:
                tower_summary = df.groupby(["tower_id", "location" if "location" in df.columns else "area_name"]).size().reset_index(name="count").sort_values("count", ascending=False).head(15)
                context_parts.append(f"Tower activity:\n{tower_summary.to_string(index=False)}\n")

        # Call patterns
        if any(k in q for k in ["call", "duration", "frequency", "late night"]):
            if "call_duration" in df.columns:
                long_calls = df[df["call_duration"] > 1800].sort_values("call_duration", ascending=False).head(10)
                context_parts.append(f"Long calls (>30 min):\n{long_calls[['caller_number','receiver_number','call_duration','call_start','location']].to_string(index=False)}\n")

        # IPDR / internet queries
        if any(k in q for k in ["internet", "website", "ip", "data usage", "vpn", "dark"]):
            if self.ipdr_df is not None:
                context_parts.append(f"IPDR Sample:\n{self.ipdr_df.head(15).to_string(index=False)}\n")

        # Summary fallback
        context_parts.append(f"\nSummary:\n{str(self.get_summary())}")

        return "\n".join(context_parts)[:8000]  # Cap tokens


# Global singleton
processor = ForensicDataProcessor()