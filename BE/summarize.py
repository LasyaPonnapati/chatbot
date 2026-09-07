from db import get_chat, get_messages, update_chat_summary

SUMMARIZE_PROMPT = (
    "You maintain a running summary of a conversation. "
    "Merge the new turns into the existing summary. "
    "Keep facts, decisions, names, and constraints. "
    "Do not add a preamble. Do not invent details. "
    "Reply with the updated summary only."
)


def pair_turns(messages: list[dict]) -> list[tuple[dict, dict]]:
    turns = []
    i = 0
    n = len(messages)
    while i < n:
        msg = messages[i]
        if msg["role"] not in ("user", "assistant") or not msg["content"]:
            i += 1
            continue
        if msg["role"] != "user":
            i += 1
            continue
        j = i + 1
        while j < n and (
            messages[j]["role"] not in ("user", "assistant") or not messages[j]["content"]
        ):
            j += 1
        if j < n and messages[j]["role"] == "assistant":
            turns.append((msg, messages[j]))
            i = j + 1
        else:
            i += 1
    return turns


def flatten_turns(turns: list[tuple[dict, dict]]) -> list[dict]:
    out = []
    for user, assistant in turns:
        out.append({"role": "user", "content": user["content"]})
        out.append({"role": "assistant", "content": assistant["content"]})
    return out


def summarize_turns(client, prev_summary: str, turns: list[tuple[dict, dict]]) -> str:
    parts = []
    if prev_summary:
        parts.append("Existing summary:\n" + prev_summary)
    lines = []
    for user, assistant in turns:
        lines.append(f"User: {user['content']}\nAssistant: {assistant['content']}")
    parts.append("New turns:\n" + "\n\n".join(lines))
    response = client.chat.completions.create(
        model="openai/gpt-oss-20b",
        messages=[
            {"role": "system", "content": SUMMARIZE_PROMPT},
            {"role": "user", "content": "\n\n".join(parts)},
        ],
        temperature=1,
        max_completion_tokens=1024,
        top_p=1,
        reasoning_effort="medium",
        stream=False,
        stop=None,
    )
    text = (response.choices[0].message.content or "").strip()
    if not text:
        raise ValueError("empty summary")
    return text


def _summary_message(summary: str) -> dict:
    return {
        "role": "system",
        "content": "Earlier conversation summary:\n" + summary,
    }


def build_llm_messages(client, chat_id: str, question: str, system_prompt: str) -> list[dict]:
    pairs = pair_turns(get_messages(chat_id))
    n = len(pairs)
    chat = get_chat(chat_id) or {}
    prev_summary = (chat.get("summary") or "").strip()
    summary_turn_count = int(chat.get("summary_turn_count") or 0)
    target = max(0, n - 2)

    if n < 3:
        history = flatten_turns(pairs)
    else:
        summary_text = prev_summary
        if summary_turn_count < target:
            try:
                summary_text = summarize_turns(
                    client, prev_summary, pairs[summary_turn_count:target]
                )
                update_chat_summary(chat_id, summary_text, target)
                raw_tail = pairs[-2:]
            except Exception:
                summary_text = prev_summary
                raw_tail = pairs[summary_turn_count:]
        else:
            raw_tail = pairs[-2:]
        history = []
        if summary_text:
            history.append(_summary_message(summary_text))
        history.extend(flatten_turns(raw_tail))

    return (
        [{"role": "system", "content": system_prompt}]
        + history
        + [{"role": "user", "content": question}]
    )
