import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CornerDownLeft, Plus, Trash2 } from "lucide-react";

import { ApiError, apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

type Citation = { index: number; chunkId: string; documentId: string; filename: string; page: number | null; score: number };
type ChatMessage = { role: "user" | "assistant" | "system"; content: string; citations?: Citation[] };

type ChatListItem = { id: string; createdAt: string; lastMessage: string | null };
type ChatDetail = {
  id: string;
  createdAt: string;
  messages: Array<{ id: string; role: ChatMessage["role"]; content: string; citations: Citation[]; createdAt: string }>;
};

export default function Chat() {
  const navigate = useNavigate();
  const { user, accessToken, isHydrated, hydrate } = useAuthStore();

  const [chatId, setChatId] = useState<string | null>(null);
  const [chatList, setChatList] = useState<ChatListItem[]>([]);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const assistantIndexRef = useRef<number | null>(null);

  const canSend = useMemo(() => !!input.trim() && !submitting, [input, submitting]);

  useEffect(() => {
    if (!isHydrated) void hydrate();
  }, [hydrate, isHydrated]);

  useEffect(() => {
    if (isHydrated && (!accessToken || !user)) navigate("/login", { replace: true });
  }, [accessToken, isHydrated, navigate, user]);

  useEffect(() => {
    if (!isHydrated || !accessToken) return;
    void loadChatList(accessToken);
  }, [accessToken, isHydrated]);

  const loadChatList = async (token: string) => {
    try {
      const list = await apiFetch<ChatListItem[]>("/chats", { headers: { Authorization: `Bearer ${token}` } });
      setChatList(list);
    } catch {
      setChatList([]);
    }
  };

  const loadChatDetail = async (token: string, id: string) => {
    setSubmitting(false);
    setError(null);
    assistantIndexRef.current = null;
    const detail = await apiFetch<ChatDetail>(`/chats/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    setChatId(detail.id);
    setMessages(detail.messages.map((m) => ({ role: m.role, content: m.content, citations: m.citations })));
  };

  const deleteChat = async (token: string, id: string) => {
    await apiFetch(`/chats/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
    if (id === chatId) resetChat();
    await loadChatList(token);
  };

  const resetChat = () => {
    setChatId(null);
    setMessages([]);
    setError(null);
    assistantIndexRef.current = null;
  };

  const send = async () => {
    const content = input.trim();
    if (!content || !accessToken) return;

    setSubmitting(true);
    setError(null);
    setInput("");

    setMessages((prev) => {
      const next: ChatMessage[] = [...prev, { role: "user", content }, { role: "assistant", content: "" }];
      assistantIndexRef.current = next.length - 1;
      return next;
    });

    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ chatId, message: content }),
      });

      if (!res.ok || !res.body) {
        const text = await res.text();
        throw new ApiError("Request failed", res.status, text);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const applyToken = (token: string) => {
        const idx = assistantIndexRef.current;
        if (idx == null) return;
        setMessages((prev) => {
          if (idx >= prev.length) return prev;
          const next = [...prev];
          const cur = next[idx];
          if (!cur || cur.role !== "assistant") return prev;
          next[idx] = { ...cur, role: "assistant", content: cur.content + token };
          return next;
        });
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part
            .split("\n")
            .map((s) => s.trim())
            .find((s) => s.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice("data:".length).trim();
          if (!payload) continue;
          const event = JSON.parse(payload) as any;
          if (event.type === "meta") {
            if (typeof event.chatId === "string") setChatId(event.chatId);
            if (Array.isArray(event.citations)) {
              const idx = assistantIndexRef.current;
              if (idx != null) {
                setMessages((prev) => {
                  if (idx >= prev.length) return prev;
                  const next = [...prev];
                  const cur = next[idx];
                  if (!cur || cur.role !== "assistant") return prev;
                  next[idx] = { ...cur, citations: event.citations as Citation[] };
                  return next;
                });
              }
            }
          }
          if (event.type === "token" && typeof event.value === "string") applyToken(event.value);
          if (event.type === "error" && typeof event.message === "string") throw new ApiError(event.message, 502, event);
          if (event.type === "final") {
            if (typeof event.chatId === "string") setChatId(event.chatId);
            if (typeof event.answer === "string") {
              const idx = assistantIndexRef.current;
              if (idx != null) {
                setMessages((prev) => {
                  if (idx >= prev.length) return prev;
                  const next = [...prev];
                  const cur = next[idx];
                  if (!cur || cur.role !== "assistant") return prev;
                  next[idx] = { ...cur, role: "assistant", content: event.answer, citations: (event.citations as Citation[]) ?? cur.citations };
                  return next;
                });
              }
            }
          }
        }
      }

      void loadChatList(accessToken);
    } catch (e) {
      setMessages((prev) => prev.slice(0, assistantIndexRef.current == null ? prev.length : assistantIndexRef.current));
      assistantIndexRef.current = null;
      if (e instanceof ApiError) setError(e.message);
      else setError("请求失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div className="container flex min-h-screen flex-col px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500 dark:text-slate-400">对话</div>
            <div className="text-lg font-semibold tracking-tight">CitationChat</div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/", { replace: true })}
            className={cn(
              "rounded-md border px-3 py-1.5 text-sm",
              "border-slate-200 text-slate-700 hover:bg-slate-50",
              "dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900",
            )}
          >
            返回首页
          </button>
        </div>

        <div className="mt-5 flex flex-1 gap-4 overflow-hidden">
          <aside className="hidden w-64 flex-none flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 md:flex">
            <div className="flex items-center justify-between border-b border-slate-200/60 p-3 dark:border-slate-800/60">
              <div className="text-sm font-medium">历史会话</div>
              <button
                type="button"
                onClick={resetChat}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
                  "border-slate-200 text-slate-700 hover:bg-slate-50",
                  "dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900",
                )}
              >
                <Plus className="h-3.5 w-3.5" />
                新建
              </button>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {chatList.length ? null : (
                <div className="px-2 py-3 text-xs text-slate-500 dark:text-slate-400">暂无会话</div>
              )}
              {chatList.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "group relative w-full rounded-xl px-3 py-2 text-left text-sm transition",
                    c.id === chatId
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
                      : "hover:bg-slate-50 dark:hover:bg-slate-900",
                  )}
                >
                  <button type="button" onClick={() => accessToken && void loadChatDetail(accessToken, c.id)} className="block w-full">
                    <div
                      className={cn(
                        "truncate pr-7",
                        c.id === chatId ? "text-white dark:text-slate-950" : "text-slate-900 dark:text-slate-50",
                      )}
                    >
                      {c.lastMessage ?? "新会话"}
                    </div>
                    <div
                      className={cn(
                        "mt-1 text-xs",
                        c.id === chatId ? "text-white/80 dark:text-slate-950/70" : "text-slate-500 dark:text-slate-400",
                      )}
                    >
                      {new Date(c.createdAt).toLocaleString()}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (accessToken) void deleteChat(accessToken, c.id);
                    }}
                    className={cn(
                      "absolute right-2 top-2 hidden rounded-md p-1.5 group-hover:inline-flex",
                      c.id === chatId
                        ? "text-white/90 hover:bg-white/10 dark:text-slate-950/90 dark:hover:bg-slate-950/10"
                        : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-900",
                    )}
                    aria-label="Delete chat"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </aside>

          <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            {error ? (
              <div className="m-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <div className="leading-relaxed">{error}</div>
              </div>
            ) : null}

            <div className="flex-1 space-y-4 overflow-auto p-4">
              {messages.length ? null : (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  输入问题开始对话（SSE 流式返回）。
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed",
                      m.role === "user"
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
                        : "border border-slate-200 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50",
                    )}
                  >
                    {m.content || (m.role === "assistant" && submitting ? "…" : "")}
                    {m.role === "assistant" && m.citations?.length ? (
                      <div className="mt-3 space-y-1 border-t border-slate-200/60 pt-3 text-xs text-slate-600 dark:border-slate-800/60 dark:text-slate-300">
                        {m.citations.map((c) => (
                          <div key={c.index} className="truncate">
                            [{c.index}] {c.filename}
                            {c.page ? ` p.${c.page}` : ""}（score {c.score.toFixed(3)}）
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-200/60 p-4 dark:border-slate-800/60">
              <div className="flex items-end gap-3">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="输入你的问题…"
                  rows={2}
                  className={cn(
                    "min-h-[44px] flex-1 resize-none rounded-xl border bg-white px-4 py-3 text-sm outline-none",
                    "border-slate-200 focus:border-slate-400",
                    "dark:border-slate-800 dark:bg-slate-950 dark:focus:border-slate-600",
                  )}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (canSend) void send();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={send}
                  className={cn(
                    "inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium",
                    "bg-slate-900 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60",
                    "dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200",
                  )}
                >
                  发送
                  <CornerDownLeft className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">Enter 发送，Shift+Enter 换行</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
