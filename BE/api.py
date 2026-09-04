from openai import OpenAI
import json
import os
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from db import (
    add_message,
    chat_title,
    create_chat,
    get_chat,
    get_context,
    get_messages,
    init_db,
    list_chats,
)

load_dotenv()
init_db()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5000", "http://127.0.0.1:5000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1",
)


class CreateChatRequest(BaseModel):
    question: str


class ChatRequest(BaseModel):
    question: str
    chat_id: str | None = None


def _sse(payload) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def stream_llm(question: str, chat_id: str, created: dict | None):
    if created:
        yield _sse({"chat_id": created["id"], "title": created["title"]})

    history = get_context(chat_id)
    add_message(chat_id, "user", question)
    messages = [
        {"role": m["role"], "content": m["content"]}
        for m in history
        if m["role"] in ("user", "assistant") and m["content"]
    ]
    messages.append({"role": "user", "content": question})

    collected = []
    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=messages,
            temperature=1,
            max_completion_tokens=2048,
            top_p=1,
            reasoning_effort="medium",
            stream=True,
            stop=None,
        )

        for chunk in response:
            text = chunk.choices[0].delta.content
            if text:
                collected.append(text)
                yield _sse(text)
    except Exception as e:
        err = str(e)
        add_message(chat_id, "assistant", err)
        yield _sse({"error": err})
        return

    full = "".join(collected)
    if full:
        add_message(chat_id, "assistant", full)
    else:
        fallback = "Could not get a reply. The model returned no text."
        add_message(chat_id, "assistant", fallback)


@app.post("/chats")
def post_chat(body: CreateChatRequest):
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required")
    return create_chat(chat_title(question))


@app.get("/chats")
def get_chats():
    return list_chats()


@app.get("/chats/{chat_id}")
def get_chat_thread(chat_id: str):
    chat = get_chat(chat_id)
    if not chat:
        raise HTTPException(status_code=404, detail="Chat not found")
    return {**chat, "messages": get_messages(chat_id)}


@app.post("/chat/stream")
def chat_stream(body: ChatRequest):
    question = body.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="question is required")

    created = None
    if body.chat_id:
        if not get_chat(body.chat_id):
            raise HTTPException(status_code=404, detail="Chat not found")
        chat_id = body.chat_id
    else:
        created = create_chat(chat_title(question))
        chat_id = created["id"]

    return StreamingResponse(
        stream_llm(question, chat_id, created),
        media_type="text/event-stream",
    )
