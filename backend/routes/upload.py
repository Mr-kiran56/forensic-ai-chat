"""
routes/upload.py
Handles file uploads for CDR, Tower Dump, IPDR.
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from typing import Optional
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from services.data_processor import processor

router = APIRouter()


@router.post("/cdr")
async def upload_cdr(file: UploadFile = File(...)):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Only Excel files (.xlsx/.xls) accepted")
    content = await file.read()
    try:
        rows = processor.load_cdr(content)
        return {"status": "ok", "file": "CDR", "rows_loaded": rows}
    except Exception as e:
        raise HTTPException(500, f"CDR parse error: {str(e)}")


@router.post("/tower")
async def upload_tower(file: UploadFile = File(...)):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Only Excel files accepted")
    content = await file.read()
    try:
        rows = processor.load_tower(content)
        return {"status": "ok", "file": "Tower Dump", "rows_loaded": rows}
    except Exception as e:
        raise HTTPException(500, f"Tower parse error: {str(e)}")


@router.post("/ipdr")
async def upload_ipdr(file: UploadFile = File(...)):
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Only Excel files accepted")
    content = await file.read()
    try:
        rows = processor.load_ipdr(content)
        return {"status": "ok", "file": "IPDR", "rows_loaded": rows}
    except Exception as e:
        raise HTTPException(500, f"IPDR parse error: {str(e)}")


@router.post("/process")
async def process_all():
    """Merge all loaded files and run rule-based analysis."""
    if processor.cdr_df is None:
        raise HTTPException(400, "CDR data must be uploaded first")
    try:
        processor.merge_all()
        processor.apply_rules()
        summary = processor.get_summary()
        return {
            "status": "processed",
            "summary": summary,
        }
    except Exception as e:
        raise HTTPException(500, f"Processing error: {str(e)}")


@router.get("/status")
def upload_status():
    return {
        "cdr_loaded": processor.cdr_df is not None,
        "tower_loaded": processor.tower_df is not None,
        "ipdr_loaded": processor.ipdr_df is not None,
        "processed": processor.is_loaded,
        "cdr_rows": len(processor.cdr_df) if processor.cdr_df is not None else 0,
        "tower_rows": len(processor.tower_df) if processor.tower_df is not None else 0,
        "ipdr_rows": len(processor.ipdr_df) if processor.ipdr_df is not None else 0,
    }