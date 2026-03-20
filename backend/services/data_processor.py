"""
services/data_processor.py
Merges CDR, Tower Dump, IPDR Excel files and preprocesses for forensic analysis.
Optimised: loads max 1000 rows per file + vectorized rule engine (no row-by-row apply).
"""
import pandas as pd
import numpy as np
from typing import Dict, Optional
import io

# ─── How many rows to load from each Excel file ──────────────────────────────
MAX_ROWS = 1000

# ─── Column Normalisation Maps ───────────────────────────────────────────────

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
        self.cdr_df:    Optional[pd.DataFrame] = None
        self.tower_df:  Optional[pd.DataFrame] = None
        self.ipdr_df:   Optional[pd.DataFrame] = None
        self.merged_df: Optional[pd.DataFrame] = None
        self.is_loaded  = False
        self._summary_cache: Optional[Dict] = None

    # ─── Loaders ─────────────────────────────────────────────────────────────

    def load_cdr(self, file_bytes: bytes) -> int:
        # Only load first MAX_ROWS rows
        df = pd.read_excel(io.BytesIO(file_bytes), nrows=MAX_ROWS)
        df.columns = [c.strip().upper() for c in df.columns]
        df.rename(columns=CDR_COLS, inplace=True)
        df["call_start"]    = pd.to_datetime(df["call_start"], errors="coerce")
        df["call_end"]      = pd.to_datetime(df["call_end"],   errors="coerce")
        df["call_duration"] = pd.to_numeric(df["call_duration"], errors="coerce")
        df["caller_number"]   = df["caller_number"].astype(str).str.strip()
        df["receiver_number"] = df["receiver_number"].astype(str).str.strip()
        df["_source"] = "CDR"
        self.cdr_df = df
        return len(df)

    def load_tower(self, file_bytes: bytes) -> int:
        df = pd.read_excel(io.BytesIO(file_bytes), nrows=MAX_ROWS)
        df.columns = [c.strip().upper() for c in df.columns]
        df.rename(columns=TOWER_COLS, inplace=True)
        df["timestamp"]       = pd.to_datetime(df["timestamp"], errors="coerce")
        df["signal_strength"] = pd.to_numeric(df["signal_strength"], errors="coerce")
        df["phone_number"]    = df["phone_number"].astype(str).str.strip()
        df["_source"] = "TOWER"
        self.tower_df = df
        return len(df)

    def load_ipdr(self, file_bytes: bytes) -> int:
        df = pd.read_excel(io.BytesIO(file_bytes), nrows=MAX_ROWS)
        df.columns = [c.strip().upper() for c in df.columns]
        df.rename(columns=IPDR_COLS, inplace=True)
        df["timestamp"]        = pd.to_datetime(df["timestamp"], errors="coerce")
        df["data_usage_mb"]    = pd.to_numeric(df["data_usage_mb"],   errors="coerce")
        df["session_duration"] = pd.to_numeric(df["session_duration"], errors="coerce")
        df["phone_number"]     = df["phone_number"].astype(str).str.strip()
        df["_source"] = "IPDR"
        self.ipdr_df = df
        return len(df)

    # ─── Merge ───────────────────────────────────────────────────────────────

    def merge_all(self) -> pd.DataFrame:
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
        self._summary_cache = None
        return cdr

    # ─── Rule Engine — fully vectorized, no row-by-row apply ─────────────────

    def apply_rules(self) -> pd.DataFrame:
        """
        Vectorized rule engine — evaluates all 9 rules using pandas column
        operations instead of df.apply(). ~50x faster than row-by-row.
        """
        df = (self.merged_df if self.merged_df is not None
              else self.cdr_df).copy()

        # ── Pre-compute helper columns ────────────────────────────────────────

        # Call hour
        df["_hour"] = pd.to_datetime(
            df.get("call_start"), errors="coerce"
        ).dt.hour.fillna(-1).astype(int)

        # Signal strength (default 0 if missing)
        sig = df.get("signal_strength", pd.Series(0, index=df.index))
        df["_signal"] = pd.to_numeric(sig, errors="coerce").fillna(0)

        # Website accessed (lowercase string)
        site_col = df.get(
            "website_accessed",
            pd.Series("", index=df.index)
        ).fillna("").astype(str).str.lower()

        # Data usage
        data_col = pd.to_numeric(
            df.get("data_usage_mb", pd.Series(0, index=df.index)),
            errors="coerce"
        ).fillna(0)

        # Call duration
        dur_col = pd.to_numeric(
            df.get("call_duration", pd.Series(0, index=df.index)),
            errors="coerce"
        ).fillna(0)

        # ── IMEI swap: number uses 2+ unique IMEIs ────────────────────────────
        if "imei" in df.columns:
            imei_counts = df.groupby("caller_number")["imei"].transform("nunique")
            multi_imei  = imei_counts > 1
        else:
            multi_imei = pd.Series(False, index=df.index)

        # ── High call frequency: > 20 calls from same number ─────────────────
        call_counts  = df.groupby("caller_number")["caller_number"].transform("count")
        high_freq    = call_counts > 20

        # ── Website keyword masks ─────────────────────────────────────────────
        DARK_WEB  = ["onion", "tor", "darkweb", "silkroad"]
        FRAUD     = ["westernunion", "moneygram", "coinbase",
                     "localbitcoin", "hawala", "transferwise_fraud"]
        VPN       = ["vpn", "proxy", "tunnelbear", "nordvpn",
                     "expressvpn", "hide.me"]

        dark_mask  = site_col.str.contains("|".join(DARK_WEB),  na=False)
        fraud_mask = site_col.str.contains("|".join(FRAUD),     na=False)
        vpn_mask   = site_col.str.contains("|".join(VPN),       na=False)

        # ── Score computation (fully vectorized) ──────────────────────────────
        score = pd.Series(0, index=df.index, dtype=int)

        score += ((dur_col > 3600).astype(int)              * 20)  # LONG_CALL_DURATION
        score += (df["_hour"].between(0, 5).astype(int)     * 15)  # LATE_NIGHT_ACTIVITY
        score += ((df["_signal"] < -100).astype(int)        * 10)  # WEAK_SIGNAL_ZONE
        score += (dark_mask.astype(int)                     * 40)  # DARK_WEB_ACCESS
        score += (fraud_mask.astype(int)                    * 35)  # FRAUD_SITE_ACCESS
        score += (vpn_mask.astype(int)                      * 20)  # VPN_PROXY_USAGE
        score += ((data_col > 500).astype(int)              * 15)  # HIGH_DATA_USAGE
        score += (multi_imei.astype(int)                    * 30)  # IMEI_SWAP_DETECTED
        score += (high_freq.astype(int)                     * 25)  # HIGH_CALL_FREQUENCY

        df["risk_score"] = score.clip(upper=100)

        # ── Flag strings (vectorized build) ──────────────────────────────────
        def build_flags(row_idx):
            flags = []
            i = row_idx
            if dur_col.iloc[i]        > 3600:  flags.append("LONG_CALL_DURATION")
            if df["_hour"].iloc[i]    in range(0, 6): flags.append("LATE_NIGHT_ACTIVITY")
            if df["_signal"].iloc[i]  < -100:  flags.append("WEAK_SIGNAL_ZONE")
            if dark_mask.iloc[i]:              flags.append("DARK_WEB_ACCESS")
            if fraud_mask.iloc[i]:             flags.append("FRAUD_SITE_ACCESS")
            if vpn_mask.iloc[i]:               flags.append("VPN_PROXY_USAGE")
            if data_col.iloc[i]       > 500:   flags.append("HIGH_DATA_USAGE")
            if multi_imei.iloc[i]:             flags.append("IMEI_SWAP_DETECTED")
            if high_freq.iloc[i]:              flags.append("HIGH_CALL_FREQUENCY")
            return ", ".join(flags) if flags else "CLEAN"

        # Build flag strings — still a loop but only for string building,
        # all heavy numeric work is already done vectorized above
        df["risk_flags"] = [build_flags(i) for i in range(len(df))]

        # Drop helper columns
        df.drop(columns=["_hour", "_signal"], inplace=True, errors="ignore")

        self.merged_df = df
        return df

    # ─── Summary Statistics ───────────────────────────────────────────────────

    def get_summary(self) -> Dict:
        if self._summary_cache:
            return self._summary_cache

        df = self.merged_df if self.merged_df is not None else self.cdr_df

        total_records = len(df)
        flagged   = df[df["risk_score"] > 0]  if "risk_score" in df.columns else pd.DataFrame()
        high_risk = df[df["risk_score"] >= 50] if "risk_score" in df.columns else pd.DataFrame()

        unique_numbers: set = set()
        if "caller_number"   in df.columns: unique_numbers.update(df["caller_number"].unique())
        if "receiver_number" in df.columns: unique_numbers.update(df["receiver_number"].unique())

        top_callers = []
        if "caller_number" in df.columns:
            top_callers = (
                df.groupby("caller_number").size()
                .sort_values(ascending=False).head(10)
                .reset_index().rename(columns={0: "call_count"})
                .to_dict(orient="records")
            )

        suspicious_numbers = []
        if "risk_score" in df.columns and "caller_number" in df.columns:
            suspicious_numbers = (
                df[df["risk_score"] >= 50]
                .groupby("caller_number")["risk_score"].max()
                .sort_values(ascending=False).head(10)
                .reset_index().to_dict(orient="records")
            )

        top_towers = []
        if "tower_id" in df.columns:
            top_towers = (
                df.groupby("tower_id").size()
                .sort_values(ascending=False).head(10)
                .reset_index().rename(columns={0: "activity_count"})
                .to_dict(orient="records")
            )

        flag_breakdown: Dict = {}
        if "risk_flags" in df.columns:
            from collections import Counter
            all_flags = []
            for f in df["risk_flags"].dropna():
                all_flags.extend(
                    [x.strip() for x in f.split(",") if x.strip() != "CLEAN"]
                )
            flag_breakdown = dict(Counter(all_flags).most_common(15))

        summary = {
            "total_records":    int(total_records),
            "unique_numbers":   int(len(unique_numbers)),
            "flagged_records":  int(len(flagged)),
            "high_risk_records":int(len(high_risk)),
            "sources_loaded": {
                "cdr":   self.cdr_df   is not None,
                "tower": self.tower_df is not None,
                "ipdr":  self.ipdr_df  is not None,
            },
            "cdr_rows":   int(len(self.cdr_df))   if self.cdr_df   is not None else 0,
            "tower_rows": int(len(self.tower_df))  if self.tower_df is not None else 0,
            "ipdr_rows":  int(len(self.ipdr_df))   if self.ipdr_df  is not None else 0,
            "top_callers":        top_callers,
            "suspicious_numbers": suspicious_numbers,
            "top_towers":         top_towers,
            "flag_breakdown":     flag_breakdown,
        }
        self._summary_cache = summary
        return summary

    # ─── Query Helper (for AI context) ───────────────────────────────────────

    def get_context_for_query(self, query: str, max_rows: int = 30) -> str:
        df = self.merged_df if self.merged_df is not None else self.cdr_df
        if df is None:
            return "No data loaded yet."

        q = query.lower()
        context_parts = [f"Dataset: {len(df)} total records loaded.\n"]

        import re
        numbers = re.findall(r"\d{10,15}", query)
        if numbers:
            for num in numbers:
                subset = df[df.apply(
                    lambda r: any(str(num) in str(v) for v in r.values), axis=1
                )].head(10)
                if not subset.empty:
                    context_parts.append(
                        f"Records for {num}:\n{subset.to_string(index=False)}\n"
                    )

        if any(k in q for k in ["suspicious", "risk", "high risk", "flagged", "danger"]):
            if "risk_score" in df.columns:
                risky = (df[df["risk_score"] >= 40]
                         .sort_values("risk_score", ascending=False)
                         .head(max_rows))
                cols = [c for c in ["caller_number","risk_score","risk_flags","location"]
                        if c in risky.columns]
                context_parts.append(
                    f"High-risk records (top {len(risky)}):\n{risky[cols].to_string(index=False)}\n"
                )

        if any(k in q for k in ["tower", "location", "area", "place"]):
            if "tower_id" in df.columns:
                loc_col = "location" if "location" in df.columns else "area_name"
                if loc_col in df.columns:
                    tower_summary = (
                        df.groupby(["tower_id", loc_col]).size()
                        .reset_index(name="count")
                        .sort_values("count", ascending=False).head(15)
                    )
                    context_parts.append(
                        f"Tower activity:\n{tower_summary.to_string(index=False)}\n"
                    )

        if any(k in q for k in ["call", "duration", "frequency", "late night"]):
            if "call_duration" in df.columns:
                long_calls = (df[df["call_duration"] > 1800]
                              .sort_values("call_duration", ascending=False)
                              .head(10))
                cols = [c for c in ["caller_number","receiver_number",
                                    "call_duration","call_start","location"]
                        if c in long_calls.columns]
                context_parts.append(
                    f"Long calls (>30 min):\n{long_calls[cols].to_string(index=False)}\n"
                )

        if any(k in q for k in ["internet","website","ip","data usage","vpn","dark"]):
            if self.ipdr_df is not None:
                context_parts.append(
                    f"IPDR Sample:\n{self.ipdr_df.head(15).to_string(index=False)}\n"
                )

        context_parts.append(f"\nSummary:\n{str(self.get_summary())}")
        return "\n".join(context_parts)[:8000]


# Global singleton
processor = ForensicDataProcessor()