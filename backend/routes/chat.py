"""
routes/chat.py
AI chat endpoint — retrieves data context and queries the AI model.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from services.data_processor import processor
from services.ai_service import get_ai_response

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    history: list = []   # [{role, content}, ...]


class ChatResponse(BaseModel):
    reply: str
    data_used: bool
    context_size: int


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not request.message.strip():
        raise HTTPException(400, "Message cannot be empty")

    data_context = ""
    data_used = False

    if processor.cdr_df is not None:
        data_context = processor.get_context_for_query(request.message)
        data_used = True
    else:
        data_context = "No forensic data has been uploaded yet. Please upload CDR, Tower Dump, and IPDR files first."

    try:
        reply = await get_ai_response(request.message, data_context)
    except Exception as e:
        raise HTTPException(500, f"AI error: {str(e)}")

    return ChatResponse(
        reply=reply,
        data_used=data_used,
        context_size=len(data_context),
    )