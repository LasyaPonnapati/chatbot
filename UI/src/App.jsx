import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function consumeSse(buffer, onDelta) {
  let sep;
  while ((sep = buffer.indexOf("\n\n")) !== -1) {
    const event = buffer.slice(0, sep);
    buffer = buffer.slice(sep + 2);
    for (const line of event.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      onDelta(JSON.parse(payload));
    }
  }
  return buffer;
}

function chatIdFromPath() {
  const match = window.location.pathname.match(/^\/c\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function streamAnswer(question, chatId, onDelta) {
  const body = { question };
  if (chatId) body.chat_id = chatId;
  const res = await fetch("/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = consumeSse(buffer, onDelta);
  }
  buffer += decoder.decode();
  consumeSse(buffer, onDelta);
}

function PanelIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9.5 4.5v15" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M9 4.5a3 3 0 0 0-3 3v.2A3.5 3.5 0 0 0 4 11v2.5A3.5 3.5 0 0 0 7.5 17H8v1.5a2.5 2.5 0 0 0 5 0V17h.5A3.5 3.5 0 0 0 17 13.5V11a3.5 3.5 0 0 0-2-3.3V7.5a3 3 0 0 0-3-3h-.2A3 3 0 0 0 9 4.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M9.5 8.5v6M12 7.5v9M14.5 9v4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3.5" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path d="M7 11a5 5 0 0 0 10 0M12 16.5V20.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function WaveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="4" y="9" width="2.2" height="6" rx="1" />
      <rect x="8.2" y="5" width="2.2" height="14" rx="1" />
      <rect x="12.4" y="7.5" width="2.2" height="9" rx="1" />
      <rect x="16.6" y="4" width="2.2" height="16" rx="1" />
    </svg>
  );
}

function Composer({ value, onChange, onSubmit, disabled, autoFocus }) {
  return (
    <form className="composer" onSubmit={onSubmit}>
      <button type="button" className="icon-btn" tabIndex={-1} aria-hidden="true">
        <PlusIcon />
      </button>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Ask anything"
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete="off"
      />
      <button type="button" className="think" tabIndex={-1} aria-hidden="true">
        <BrainIcon />
        Think
      </button>
      <button type="button" className="icon-btn muted" tabIndex={-1} aria-hidden="true">
        <MicIcon />
      </button>
      <button type="submit" className="send" disabled={disabled || !value.trim()} aria-label="Send">
        <WaveIcon />
      </button>
    </form>
  );
}

export default function App() {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [chatId, setChatId] = useState(() => chatIdFromPath());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const threadRef = useRef(null);
  const streamingRef = useRef(false);

  useEffect(() => {
    streamingRef.current = streaming;
  }, [streaming]);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  useEffect(() => {
    fetch("/chats")
      .then((res) => (res.ok ? res.json() : []))
      .then(setChats)
      .catch(() => setChats([]));
  }, []);

  useEffect(() => {
    async function loadFromPath() {
      const id = chatIdFromPath();
      setChatId(id);
      if (!id) {
        setMessages([]);
        return;
      }
      const res = await fetch(`/chats/${id}`);
      if (!res.ok) {
        history.replaceState(null, "", "/");
        setChatId(null);
        setMessages([]);
        return;
      }
      const data = await res.json();
      setMessages(data.messages || []);
    }

    loadFromPath();
    window.addEventListener("popstate", loadFromPath);
    return () => window.removeEventListener("popstate", loadFromPath);
  }, []);

  function handleNewChat() {
    if (streamingRef.current) return;
    history.pushState(null, "", "/");
    setChatId(null);
    setMessages([]);
  }

  async function openChat(id) {
    if (streamingRef.current || id === chatId) return;
    history.pushState(null, "", `/c/${id}`);
    setChatId(id);
    const res = await fetch(`/chats/${id}`);
    if (!res.ok) {
      history.replaceState(null, "", "/");
      setChatId(null);
      setMessages([]);
      return;
    }
    const data = await res.json();
    setMessages(data.messages || []);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const text = question.trim();
    if (!text || streaming) return;

    const currentId = chatId;
    setQuestion("");
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      await streamAnswer(text, currentId, (delta) => {
        if (delta && typeof delta === "object") {
          if (delta.chat_id) {
            setChatId(delta.chat_id);
            history.replaceState(null, "", `/c/${delta.chat_id}`);
            setChats((prev) => [
              { id: delta.chat_id, title: delta.title },
              ...prev.filter((c) => c.id !== delta.chat_id),
            ]);
            return;
          }
          if (delta.error) {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              next[next.length - 1] = { ...last, error: true, content: delta.error };
              return next;
            });
            return;
          }
        }
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + delta };
          return next;
        });
      });
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant" && !last.content) {
          next[next.length - 1] = {
            ...last,
            error: true,
            content: "Could not get a reply. The model returned no text.",
          };
        }
        return next;
      });
    } catch (err) {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = {
          ...last,
          error: true,
          content: last.content || `Could not get a reply. ${err.message}`,
        };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }

  const empty = messages.length === 0;

  return (
    <div className="app">
      <aside className={`sidebar${sidebarOpen ? "" : " collapsed"}`}>
        <div className="sidebar-top">
          <button
            type="button"
            className="new-chat"
            onClick={handleNewChat}
            disabled={streaming}
            aria-label="New chat"
          >
            <PlusIcon />
            {sidebarOpen ? "New chat" : null}
          </button>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            <PanelIcon />
          </button>
        </div>
        {sidebarOpen ? (
          <div className="chat-list">
            {chats.map((chat) => (
              <button
                key={chat.id}
                type="button"
                className={`chat-item${chat.id === chatId ? " active" : ""}`}
                onClick={() => openChat(chat.id)}
                disabled={streaming}
              >
                {chat.title}
              </button>
            ))}
          </div>
        ) : null}
      </aside>
      <div className={`main ${empty ? "landing" : "chat"}`}>
        {empty ? (
          <div className="hero">
            <h1>How can I help you?</h1>
            <Composer
              value={question}
              onChange={setQuestion}
              onSubmit={handleSubmit}
              disabled={streaming}
              autoFocus
            />
          </div>
        ) : (
          <div className="thread" ref={threadRef}>
            <div className="thread-inner">
              {messages.map((msg, i) => {
                const text = msg.content || (streaming && i === messages.length - 1 ? "…" : "");
                return (
                  <div key={i} className={`msg ${msg.role}`}>
                    <div className={`bubble${msg.error ? " error" : ""}`}>
                      {msg.role === "assistant" && !msg.error && text && text !== "…" ? (
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                      ) : (
                        text
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="dock">
              <Composer
                value={question}
                onChange={setQuestion}
                onSubmit={handleSubmit}
                disabled={streaming}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
