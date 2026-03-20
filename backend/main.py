"""
Forensic AI Chat - Main FastAPI Backend
"""
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import uvicorn
import os

from routes.upload import router as upload_router
from routes.chat import router as chat_router
from routes.analysis import router as analysis_router
from routes.network import router as network_router

app = FastAPI(
    title="Forensic AI Chat API",
    description="AI-powered forensic analysis backend with CDR, Tower Dump, and IPDR processing",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router, prefix="/api/upload", tags=["Upload"])
app.include_router(chat_router, prefix="/api/chat", tags=["AI Chat"])
app.include_router(analysis_router, prefix="/api/analysis", tags=["Analysis"])
app.include_router(network_router, prefix="/api/network", tags=["Network Graph"])


@app.get("/")
def root():
    return {"status": "Forensic AI Chat API is running", "version": "1.0.0"}


@app.get("/api/health")
def health():
    return {"status": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)