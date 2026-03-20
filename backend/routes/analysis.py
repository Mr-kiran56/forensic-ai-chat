"""
routes/analysis.py
Rule-based forensic analysis endpoints.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from services.data_processor import processor
import pandas as pd

router = APIRouter()


@router.get("/summary")
def get_summary():
    if not processor.is_loaded:
        raise HTTPException(400, "Data not processed. Upload files and call /api/upload/process first.")
    return processor.get_summary()


@router.get("/suspicious")
def get_suspicious(
    min_score: int = Query(40, description="Minimum risk score"),
    limit: int = Query(50)
):
    df = processor.merged_df
    if df is None:
        raise HTTPException(400, "No processed data available")

    if "risk_score" not in df.columns:
        raise HTTPException(400, "Run /api/upload/process first")

    result = (
        df[df["risk_score"] >= min_score]
        .sort_values("risk_score", ascending=False)
        .head(limit)
    )

    cols = ["caller_number", "receiver_number", "call_start", "call_duration",
            "call_type", "tower_id", "location", "risk_score", "risk_flags"]
    available = [c for c in cols if c in result.columns]

    return {
        "count": len(result),
        "records": result[available].fillna("").to_dict(orient="records")
    }


@router.get("/phone/{number}")
def phone_profile(number: str):
    """Full profile for a phone number across CDR, Tower, IPDR."""
    profile = {}

    if processor.cdr_df is not None:
        cdr = processor.cdr_df
        as_caller = cdr[cdr["caller_number"].astype(str).str.contains(number)]
        as_receiver = cdr[cdr["receiver_number"].astype(str).str.contains(number)]
        profile["cdr"] = {
            "as_caller": as_caller.fillna("").to_dict(orient="records"),
            "as_receiver": as_receiver.fillna("").to_dict(orient="records"),
            "call_count": len(as_caller),
            "received_count": len(as_receiver),
            "imei_list": as_caller["imei"].unique().tolist() if "imei" in as_caller.columns else [],
            "towers_used": as_caller["tower_id"].unique().tolist() if "tower_id" in as_caller.columns else [],
        }

    if processor.tower_df is not None:
        tower = processor.tower_df
        presence = tower[tower["phone_number"].astype(str).str.contains(number)]
        profile["tower"] = {
            "locations_seen": presence["area_name"].unique().tolist() if "area_name" in presence.columns else [],
            "total_pings": len(presence),
            "records": presence.fillna("").to_dict(orient="records"),
        }

    if processor.ipdr_df is not None:
        ipdr = processor.ipdr_df
        sessions = ipdr[ipdr["phone_number"].astype(str).str.contains(number)]
        profile["ipdr"] = {
            "total_sessions": len(sessions),
            "sites_visited": sessions["website_accessed"].unique().tolist() if "website_accessed" in sessions.columns else [],
            "total_data_mb": float(sessions["data_usage_mb"].sum()) if "data_usage_mb" in sessions.columns else 0,
            "records": sessions.fillna("").to_dict(orient="records"),
        }

    if processor.merged_df is not None and "risk_score" in processor.merged_df.columns:
        mdf = processor.merged_df
        match = mdf[mdf["caller_number"].astype(str).str.contains(number)]
        profile["risk"] = {
            "max_score": int(match["risk_score"].max()) if not match.empty else 0,
            "flags": match["risk_flags"].unique().tolist() if "risk_flags" in match.columns else [],
        }

    if not profile:
        raise HTTPException(404, f"No data found for number {number}")

    return profile


@router.get("/patterns/call-frequency")
def call_frequency(top_n: int = Query(20)):
    if processor.cdr_df is None:
        raise HTTPException(400, "CDR not loaded")
    df = processor.cdr_df
    freq = df.groupby("caller_number").size().sort_values(ascending=False).head(top_n)
    return {"data": freq.reset_index().rename(columns={0: "call_count"}).to_dict(orient="records")}


@router.get("/patterns/late-night")
def late_night_activity():
    if processor.cdr_df is None:
        raise HTTPException(400, "CDR not loaded")
    df = processor.cdr_df.copy()
    df["hour"] = pd.to_datetime(df["call_start"]).dt.hour
    late = df[df["hour"].between(0, 5)]
    return {
        "total_late_calls": len(late),
        "numbers_involved": late["caller_number"].unique().tolist(),
        "records": late.fillna("").head(50).to_dict(orient="records")
    }


@router.get("/patterns/imei-swap")
def imei_swaps():
    if processor.cdr_df is None:
        raise HTTPException(400, "CDR not loaded")
    df = processor.cdr_df
    imei_counts = df.groupby("caller_number")["imei"].nunique()
    swappers = imei_counts[imei_counts > 1].reset_index().rename(columns={"imei": "imei_count"})
    return {
        "total_swappers": len(swappers),
        "records": swappers.to_dict(orient="records")
    }


@router.get("/patterns/high-data")
def high_data_usage(threshold_mb: float = Query(500)):
    if processor.ipdr_df is None:
        raise HTTPException(400, "IPDR not loaded")
    df = processor.ipdr_df
    high = df[df["data_usage_mb"] >= threshold_mb].sort_values("data_usage_mb", ascending=False)
    return {
        "count": len(high),
        "threshold_mb": threshold_mb,
        "records": high.fillna("").head(50).to_dict(orient="records")
    }


@router.get("/patterns/suspicious-sites")
def suspicious_sites():
    if processor.ipdr_df is None:
        raise HTTPException(400, "IPDR not loaded")

    FLAGGED_KEYWORDS = [
        "onion", "tor", "darkweb", "vpn", "proxy", "nordvpn", "expressvpn",
        "tunnelbear", "westernunion", "moneygram", "coinbase", "localbitcoin",
        "hawala", "telegram", "wickr", "signal", "briar"
    ]

    df = processor.ipdr_df.copy()
    df["website_lower"] = df["website_accessed"].astype(str).str.lower()

    mask = df["website_lower"].apply(lambda s: any(kw in s for kw in FLAGGED_KEYWORDS))
    flagged = df[mask]

    return {
        "count": len(flagged),
        "records": flagged.drop(columns=["website_lower"]).fillna("").to_dict(orient="records")
    }