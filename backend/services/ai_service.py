"""
services/ai_service.py
AI agent for forensic chat — supports Google Gemini OR Groq (Meta Llama).
Set API keys in .env:
  GOOGLE_API_KEY=...        (for Gemini)
  GROQ_API_KEY=...          (for Llama via Groq)
  AI_PROVIDER=gemini        (or "groq")
"""
import os
import httpx
from typing import Optional
from dotenv import load_dotenv

load_dotenv()

AI_PROVIDER = os.getenv("AI_PROVIDER", "gemini").lower()
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")

FORENSIC_SYSTEM_PROMPT = """You are ForensicAI, an expert digital forensics analyst assistant integrated into a law enforcement investigation platform.

You have access to combined CDR (Call Detail Records), Tower Dump, and IPDR (Internet Protocol Detail Records) data.

RESPONSE FORMAT — always follow this exact structure:

## 🔍 Analysis
[2-3 sentence direct answer to the query with specific data points]

## 📊 Key Findings
- **Finding 1**: [specific insight with numbers/names/times]
- **Finding 2**: [specific insight]
- **Finding 3**: [specific insight]

## ⚠️ Risk Assessment
[Describe threat level: CRITICAL/HIGH/MEDIUM/LOW with justification using actual data]

## 🗺️ Location Intelligence
[Tower locations, movement patterns, geographic hotspots]

## 📋 Recommendations
1. [actionable step for investigator]
2. [actionable step]

## 🧮 Rule Violations Triggered
[List which forensic rules fired: LATE_NIGHT_ACTIVITY, HIGH_DATA_USAGE, etc.]

---
Always be specific. Never give generic answers. Reference actual phone numbers, tower IDs, timestamps from the context data provided.
If data is insufficient, clearly state what's missing and what to collect next."""


async def query_gemini(user_message: str, data_context: str) -> str:
    """Query Google Gemini 1.5 Flash."""
    if not GOOGLE_API_KEY:
        return "❌ Google API key not configured. Set GOOGLE_API_KEY in your .env file."

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GOOGLE_API_KEY}"

    payload = {
        "system_instruction": {
            "parts": [{"text": FORENSIC_SYSTEM_PROMPT}]
        },
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": f"DATA CONTEXT:\n{data_context}\n\nQUERY: {user_message}"}
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 2048,
        }
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


async def query_groq_llama(user_message: str, data_context: str) -> str:
    """Query Meta Llama 3 via Groq API (free tier available)."""
    if not GROQ_API_KEY:
        return "❌ Groq API key not configured. Set GROQ_API_KEY in your .env file."

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": "llama-3.3-70b-versatile",
        "messages": [
            {"role": "system", "content": FORENSIC_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"DATA CONTEXT:\n{data_context}\n\nQUERY: {user_message}"
            }
        ],
        "temperature": 0.3,
        "max_tokens": 2048,
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["choices"][0]["message"]["content"]


async def get_ai_response(user_message: str, data_context: str) -> str:
    """Route to the configured AI provider."""
    try:
        if AI_PROVIDER == "groq":
            return await query_groq_llama(user_message, data_context)
        else:
            return await query_gemini(user_message, data_context)
    except httpx.HTTPStatusError as e:
        return f"❌ AI API error ({e.response.status_code}): {e.response.text[:200]}"
    except Exception as e:
        return f"❌ AI service error: {str(e)}"