"""
routes/upload.py
Handles file uploads for CDR, Tower Dump, IPDR.
Includes /load-demo endpoint that works on both local machine and Render.
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
import sys, os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from services.data_processor import processor

router = APIRouter()


# ── Helper: find the docs/ folder anywhere ────────────────────────────────

def find_docs_dir():
    """
    Searches multiple possible locations for the docs/ folder.
    Works on local Windows/Mac, Render, Railway, and any other host.
    Returns the first valid path found, or None.
    """
    this_file   = os.path.abspath(__file__)           # .../backend/routes/upload.py
    routes_dir  = os.path.dirname(this_file)          # .../backend/routes/
    backend_dir = os.path.dirname(routes_dir)         # .../backend/
    project_dir = os.path.dirname(backend_dir)        # .../forensic-ai-chat/

    candidates = [
        # Most common: backend/docs/
        os.path.join(backend_dir, "docs"),

        # Project root / docs/
        os.path.join(project_dir, "docs"),

        # Render default deploy paths
        "/opt/render/project/src/backend/docs",
        "/opt/render/project/src/docs",
        "/opt/render/project/repo/backend/docs",
        "/opt/render/project/repo/docs",

        # CWD-relative (depends on where uvicorn starts from)
        os.path.join(os.getcwd(), "docs"),
        os.path.join(os.getcwd(), "backend", "docs"),

        # Same folder as this file
        os.path.join(routes_dir, "docs"),
    ]

    for path in candidates:
        if (
            os.path.isdir(path)
            and os.path.exists(os.path.join(path, "cdr_data.xlsx"))
            and os.path.exists(os.path.join(path, "tower_dump.xlsx"))
            and os.path.exists(os.path.join(path, "ipdr_logs.xlsx"))
        ):
            return path

    return None


# ── Upload endpoints ──────────────────────────────────────────────────────

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
        return {"status": "processed", "summary": summary}
    except Exception as e:
        raise HTTPException(500, f"Processing error: {str(e)}")


@router.post("/load-demo")
async def load_demo_data():
    """
    Auto-loads cdr_data.xlsx, tower_dump.xlsx, ipdr_logs.xlsx
    from the backend/docs/ folder.
    Works on local machine AND Render deployment.
    """
    docs_dir = find_docs_dir()

    if docs_dir is None:
        this_file   = os.path.abspath(__file__)
        backend_dir = os.path.dirname(os.path.dirname(this_file))
        docs_check  = os.path.join(backend_dir, "docs")
        raise HTTPException(
            404,
            detail={
                "error": "Demo Excel files not found",
                "fix": "Make sure cdr_data.xlsx, tower_dump.xlsx, ipdr_logs.xlsx are inside backend/docs/ and committed to Git",
                "debug": {
                    "cwd":          os.getcwd(),
                    "backend_dir":  backend_dir,
                    "docs_checked": docs_check,
                    "docs_exists":  os.path.isdir(docs_check),
                    "docs_files":   os.listdir(docs_check)
                                    if os.path.isdir(docs_check)
                                    else "folder not found",
                }
            }
        )

    cdr_path   = os.path.join(docs_dir, "cdr_data.xlsx")
    tower_path = os.path.join(docs_dir, "tower_dump.xlsx")
    ipdr_path  = os.path.join(docs_dir, "ipdr_logs.xlsx")

    try:
        with open(cdr_path,   "rb") as f: cdr_rows   = processor.load_cdr(f.read())
        with open(tower_path, "rb") as f: tower_rows = processor.load_tower(f.read())
        with open(ipdr_path,  "rb") as f: ipdr_rows  = processor.load_ipdr(f.read())

        processor.merge_all()
        processor.apply_rules()
        summary = processor.get_summary()

        return {
            "status":  "demo_loaded",
            "message": "Test data loaded and analyzed successfully",
            "source":  docs_dir,
            "files": {
                "cdr_rows":   cdr_rows,
                "tower_rows": tower_rows,
                "ipdr_rows":  ipdr_rows,
            },
            "summary": summary,
        }

    except Exception as e:
        raise HTTPException(500, f"Demo load error: {str(e)}")


# ── Debug endpoint ────────────────────────────────────────────────────────
# Open in browser to diagnose path issues on Render:
# https://your-app.onrender.com/api/upload/debug-paths

@router.get("/debug-paths")
def debug_paths():
    this_file   = os.path.abspath(__file__)
    routes_dir  = os.path.dirname(this_file)
    backend_dir = os.path.dirname(routes_dir)
    project_dir = os.path.dirname(backend_dir)
    docs_dir    = os.path.join(backend_dir, "docs")
    found_dir   = find_docs_dir()

    return {
        "cwd":                  os.getcwd(),
        "this_file":            this_file,
        "backend_dir":          backend_dir,
        "project_dir":          project_dir,
        "docs_dir_checked":     docs_dir,
        "docs_dir_exists":      os.path.isdir(docs_dir),
        "docs_files":           os.listdir(docs_dir)
                                if os.path.isdir(docs_dir) else "not found",
        "found_docs_dir":       found_dir,
        "render_path":          "/opt/render/project/src/backend/docs",
        "render_path_exists":   os.path.isdir("/opt/render/project/src/backend/docs"),
        "render_files":         os.listdir("/opt/render/project/src/backend/docs")
                                if os.path.isdir("/opt/render/project/src/backend/docs")
                                else "not found",
    }


# ── Status endpoint ───────────────────────────────────────────────────────

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