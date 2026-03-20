"""
routes/upload.py
Handles file uploads for CDR, Tower Dump, IPDR.
Includes /load-demo endpoint to auto-load backend/docs/ Excel files.
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
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


@router.post("/load-demo")
async def load_demo_data():
    """
    Auto-loads the three demo Excel files from backend/docs/ folder.
    Called when user clicks 'Continue with Test Data' on the welcome screen.
    """
    # Resolve path to backend/docs/ regardless of where uvicorn is run from
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    docs_dir = os.path.join(base_dir, "docs")

    cdr_path   = os.path.join(docs_dir, "cdr_data.xlsx")
    tower_path = os.path.join(docs_dir, "tower_dump.xlsx")
    ipdr_path  = os.path.join(docs_dir, "ipdr_logs.xlsx")

    # Check all three files exist
    missing = []
    for label, path in [("cdr_data.xlsx", cdr_path), ("tower_dump.xlsx", tower_path), ("ipdr_logs.xlsx", ipdr_path)]:
        if not os.path.exists(path):
            missing.append(label)
    if missing:
        raise HTTPException(
            400,
            f"Demo files not found in backend/docs/: {', '.join(missing)}. "
            f"Make sure cdr_data.xlsx, tower_dump.xlsx and ipdr_logs.xlsx are inside backend/docs/"
        )

    try:
        # Load all three files
        with open(cdr_path,   "rb") as f: cdr_rows   = processor.load_cdr(f.read())
        with open(tower_path, "rb") as f: tower_rows = processor.load_tower(f.read())
        with open(ipdr_path,  "rb") as f: ipdr_rows  = processor.load_ipdr(f.read())

        # Merge and run rule engine
        processor.merge_all()
        processor.apply_rules()
        summary = processor.get_summary()

        return {
            "status": "demo_loaded",
            "message": "Test data loaded and analyzed successfully",
            "files": {
                "cdr_rows":   cdr_rows,
                "tower_rows": tower_rows,
                "ipdr_rows":  ipdr_rows,
            },
            "summary": summary,
        }
    except Exception as e:
        raise HTTPException(500, f"Demo load error: {str(e)}")


@router.get("/status")
def upload_status():
    return {
        "cdr_loaded":   processor.cdr_df   is not None,
        "tower_loaded": processor.tower_df  is not None,
        "ipdr_loaded":  processor.ipdr_df   is not None,
        "processed":    processor.is_loaded,
        "cdr_rows":   len(processor.cdr_df)   if processor.cdr_df   is not None else 0,
        "tower_rows": len(processor.tower_df)  if processor.tower_df is not None else 0,
        "ipdr_rows":  len(processor.ipdr_df)   if processor.ipdr_df  is not None else 0,
    }