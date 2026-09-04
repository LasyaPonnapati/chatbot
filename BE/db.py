import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "chatbot.db"
TITLE_MAX = 48


def _now():
    return datetime.now(timezone.utc).isoformat()


def chat_title(question: str) -> str:
    text = question.strip()
    if len(text) <= TITLE_MAX:
        return text
    return text[: TITLE_MAX - 1] + "…"


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    conn = get_conn()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS chats (
              id         TEXT PRIMARY KEY,
              title      TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS messages (
              id         INTEGER PRIMARY KEY AUTOINCREMENT,
              chat_id    TEXT NOT NULL REFERENCES chats(id),
              role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
              content    TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON messages(chat_id, id);
            """
        )
        conn.commit()
    finally:
        conn.close()


def _row_chat(row):
    return {
        "id": row["id"],
        "title": row["title"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def create_chat(title: str) -> dict:
    chat_id = str(uuid.uuid4())
    now = _now()
    conn = get_conn()
    try:
        conn.execute(
            "INSERT INTO chats (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
            (chat_id, title, now, now),
        )
        conn.commit()
    finally:
        conn.close()
    return {"id": chat_id, "title": title, "created_at": now, "updated_at": now}


def get_chat(chat_id: str) -> dict | None:
    conn = get_conn()
    try:
        row = conn.execute("SELECT * FROM chats WHERE id = ?", (chat_id,)).fetchone()
        return _row_chat(row) if row else None
    finally:
        conn.close()


def list_chats() -> list[dict]:
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT id, title, created_at, updated_at FROM chats ORDER BY updated_at DESC"
        ).fetchall()
        return [_row_chat(r) for r in rows]
    finally:
        conn.close()


def get_messages(chat_id: str) -> list[dict]:
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT role, content FROM messages WHERE chat_id = ? ORDER BY id ASC",
            (chat_id,),
        ).fetchall()
        return [{"role": r["role"], "content": r["content"]} for r in rows]
    finally:
        conn.close()


def get_context(chat_id: str, max_turns: int = 5) -> list[dict]:
    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT role, content FROM messages
            WHERE chat_id = ? AND role IN ('user', 'assistant') AND content != ''
            ORDER BY id DESC
            LIMIT ?
            """,
            (chat_id, max_turns * 2),
        ).fetchall()
        messages = [{"role": r["role"], "content": r["content"]} for r in rows]
        messages.reverse()
        return messages
    finally:
        conn.close()


def add_message(chat_id: str, role: str, content: str) -> None:
    now = _now()
    conn = get_conn()
    try:
        conn.execute(
            "INSERT INTO messages (chat_id, role, content, created_at) VALUES (?, ?, ?, ?)",
            (chat_id, role, content, now),
        )
        conn.execute("UPDATE chats SET updated_at = ? WHERE id = ?", (now, chat_id))
        conn.commit()
    finally:
        conn.close()
