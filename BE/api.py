from google import genai
import json
import os
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://127.0.0.1:5000"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

client = genai.Client(api_key=os.getenv("gemini_api_key"))

class ChatRequest(BaseModel):
    question: str

def _delta_text(event) -> str | None:
    # Live stream shape: thought_signature deltas have no text;
    # the reply is only on step.delta + TextDelta(type="text").
    if getattr(event, "event_type", None) != "step.delta":
        return None
    delta = getattr(event, "delta", None)
    if getattr(delta, "type", None) != "text":
        return None
    return getattr(delta, "text", None) or None

def stream_llm(question: str):
    stream = client.interactions.create(
        model="gemini-3.7-flash",
        input=question,
        generation_config={"thinking_level": "low"},
        stream=True,
    )
    for event in stream:
        text = _delta_text(event)
        if text:
            yield f"data: {json.dumps(text, ensure_ascii=False)}\n\n"

@app.post("/chat/stream")
def chat_stream(body: ChatRequest):
    return StreamingResponse(
        stream_llm(body.question),
        media_type="text/event-stream; charset=utf-8",
    )
