import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

function normalizeGrokMath(text) {
  const chunks = text.split(/(```[\s\S]*?```)/);
  return chunks
    .map((chunk) => {
      if (chunk.startsWith("```")) return chunk;
      return chunk
        .replace(/\\\[([\s\S]*?)\\\]/g, (_, body) => `\n$$\n${body.trim()}\n$$\n`)
        .replace(/\\\(([\s\S]*?)\\\)/g, (_, body) => `$${body}$`);
    })
    .join("");
}

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

function temporaryFromPath() {
  return window.location.pathname === "/temporary";
}

async function streamAnswer(question, chatId, onDelta, options = {}) {
  const body = { question };
  if (options.temporary) {
    body.temporary = true;
    body.history = options.history || [];
  } else if (chatId) {
    body.chat_id = chatId;
  }
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

function TempIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DotsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5.5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="18.5" r="1.6" />
    </svg>
  );
}

function ChatItem({
  chat,
  active,
  disabled,
  menuOpen,
  renaming,
  onOpen,
  onToggleMenu,
  onCommitRename,
  onCancelRename,
}) {
  const [draft, setDraft] = useState(chat.title);
  const inputRef = useRef(null);
  const skipBlur = useRef(false);

  useEffect(() => {
    if (!renaming) return;
    skipBlur.current = false;
    setDraft(chat.title);
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, [renaming, chat.title]);

  function commit() {
    const next = draft.trim();
    if (!next || next === chat.title) {
      onCancelRename();
      return;
    }
    onCommitRename(chat.id, next);
  }

  return (
    <div
      className={`chat-item-row${active ? " active" : ""}${menuOpen ? " menu-open" : ""}${renaming ? " renaming" : ""}`}
    >
      {renaming ? (
        <input
          ref={inputRef}
          className="chat-item-rename"
          value={draft}
          maxLength={48}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (skipBlur.current) return;
            commit();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              skipBlur.current = false;
              e.currentTarget.blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              skipBlur.current = true;
              onCancelRename();
            }
          }}
        />
      ) : (
        <>
          <button
            type="button"
            className="chat-item"
            onClick={() => onOpen(chat.id)}
            disabled={disabled}
          >
            {chat.title}
          </button>
          <button
            type="button"
            className="chat-item-menu-btn"
            aria-label="Chat actions"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={disabled}
            onClick={(e) => {
              e.stopPropagation();
              onToggleMenu(chat.id, e.currentTarget);
            }}
          >
            <DotsIcon />
          </button>
        </>
      )}
    </div>
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
  const [temporary, setTemporary] = useState(() => temporaryFromPath());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [streaming, setStreaming] = useState(false);
  const [menu, setMenu] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const threadRef = useRef(null);
  const streamingRef = useRef(false);
  const menuRef = useRef(null);

  useEffect(() => {
    streamingRef.current = streaming;
  }, [streaming]);

  useEffect(() => {
    if (!menu) return;
    function onDoc(e) {
      if (menuRef.current?.contains(e.target)) return;
      if (e.target.closest?.(".chat-item-menu-btn")) return;
      setMenu(null);
    }
    function onKey(e) {
      if (e.key === "Escape") setMenu(null);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

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
      const isTemp = temporaryFromPath();
      const id = chatIdFromPath();
      setTemporary(isTemp);
      setChatId(isTemp ? null : id);
      if (isTemp || !id) {
        setMessages([]);
        return;
      }
      const res = await fetch(`/chats/${id}`);
      if (!res.ok) {
        history.replaceState(null, "", "/");
        setChatId(null);
        setTemporary(false);
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
    setTemporary(false);
    setChatId(null);
    setMessages([]);
    setMenu(null);
    setRenamingId(null);
  }

  function handleTemporaryChat() {
    if (streamingRef.current) return;
    history.pushState(null, "", "/temporary");
    setTemporary(true);
    setChatId(null);
    setMessages([]);
  }

  async function openChat(id) {
    if (streamingRef.current || (!temporary && id === chatId)) return;
    setMenu(null);
    history.pushState(null, "", `/c/${id}`);
    setTemporary(false);
    setChatId(id);
    const res = await fetch(`/chats/${id}`);
    if (!res.ok) {
      history.replaceState(null, "", "/");
      setChatId(null);
      setTemporary(false);
      setMessages([]);
      return;
    }
    const data = await res.json();
    setMessages(data.messages || []);
  }

  function toggleChatMenu(id, btn) {
    if (streamingRef.current) return;
    setMenu((prev) => {
      if (prev?.id === id) return null;
      const r = btn.getBoundingClientRect();
      const width = 168;
      return {
        id,
        top: r.bottom + 4,
        left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)),
      };
    });
  }

  async function renameChat(id, title) {
    const res = await fetch(`/chats/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    if (res.ok) {
      const data = await res.json();
      setChats((prev) => prev.map((c) => (c.id === id ? { ...c, title: data.title } : c)));
    }
    setRenamingId(null);
  }

  async function deleteChat(id) {
    setMenu(null);
    const res = await fetch(`/chats/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setChats((prev) => prev.filter((c) => c.id !== id));
    if (renamingId === id) setRenamingId(null);
    if (!temporary && chatId === id) {
      history.pushState(null, "", "/");
      setChatId(null);
      setMessages([]);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const text = question.trim();
    if (!text || streaming) return;

    const currentId = chatId;
    const isTemp = temporary;
    const prior = messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && m.content)
      .map((m) => ({ role: m.role, content: m.content }));
    setQuestion("");
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      await streamAnswer(text, currentId, (delta) => {
        if (delta && typeof delta === "object") {
          if (delta.chat_id) {
            if (!isTemp) {
              setChatId(delta.chat_id);
              history.replaceState(null, "", `/c/${delta.chat_id}`);
              setChats((prev) => [
                { id: delta.chat_id, title: delta.title },
                ...prev.filter((c) => c.id !== delta.chat_id),
              ]);
            }
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
      }, { temporary: isTemp, history: prior });
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
          <div className="sidebar-actions">
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
              className="new-chat"
              onClick={handleTemporaryChat}
              disabled={streaming}
              aria-label="Temporary chat"
              aria-pressed={temporary}
            >
              <TempIcon />
              {sidebarOpen ? "Temporary chat" : null}
            </button>
          </div>
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
            {chats.length > 0 ? (
              <button
                type="button"
                className={`chat-history-heading${historyOpen ? " open" : ""}`}
                onClick={() => setHistoryOpen((open) => !open)}
                aria-expanded={historyOpen}
              >
                Chat history
                <ChevronIcon />
              </button>
            ) : null}
            {historyOpen ? (
              <div className="chat-list-items">
                {chats.map((chat) => (
                  <ChatItem
                    key={chat.id}
                    chat={chat}
                    active={!temporary && chat.id === chatId}
                    disabled={streaming}
                    menuOpen={menu?.id === chat.id}
                    renaming={renamingId === chat.id}
                    onOpen={openChat}
                    onToggleMenu={toggleChatMenu}
                    onCommitRename={renameChat}
                    onCancelRename={() => setRenamingId(null)}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>
      <div className={`main ${empty ? "landing" : "chat"}${temporary ? " temp-mode" : ""}`}>
        {temporary ? (
          <div className="temp-banner" role="status">
            Temporary chat — not saved, and it disappears on refresh
          </div>
        ) : null}
        {empty ? (
          <div className="hero">
            <h1>{temporary ? "This chat won't be saved" : "How can I help you?"}</h1>
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
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                        >
                          {normalizeGrokMath(text)}
                        </ReactMarkdown>
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
      {menu ? (
        <div
          ref={menuRef}
          className="chat-item-menu"
          role="menu"
          style={{ top: menu.top, left: menu.left }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setRenamingId(menu.id);
              setMenu(null);
            }}
          >
            Edit title
          </button>
          <button
            type="button"
            role="menuitem"
            className="danger"
            onClick={() => deleteChat(menu.id)}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
