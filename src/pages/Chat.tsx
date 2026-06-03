import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, CornerDownLeft } from "lucide-react";

import { ApiError, apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

type ChatMessage = { role: "user" | "assistant" | "system"; content: string };

type ChatResponse = { answer: string };

export default function Chat() {
  const navigate = useNavigate();
  const { user, accessToken, isHydrated, hydrate } = useAuthStore();

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = useMemo(() => !!input.trim() && !submitting, [input, submitting]);

  useEffect(() => {
    if (!isHydrated) void hydrate();
  }, [hydrate, isHydrated]);

  useEffect(() => {
    if (isHydrated && (!accessToken || !user)) navigate("/login", { replace: true });
  }, [accessToken, isHydrated, navigate, user]);

  const send = async () => {
    const content = input.trim();
    if (!content || !accessToken) return;

    setSubmitting(true);
    setError(null);
    setInput("");

    setMessages((prev) => [...prev, { role: "user", content }, { role: "assistant", content: "" }]);

    try {
      const res = await apiFetch<ChatResponse>("/chat", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ messages: [...messages, { role: "user", content }] }),
      });

      setMessages((prev) => {
        if (!prev.length) return prev;
        const next = [...prev];
        const idx = next.length - 1;
        if (next[idx]?.role === "assistant") next[idx] = { role: "assistant", content: res.answer };
        return next;
      });
    } catch (e) {
      setMessages((prev) => prev.slice(0, -1));
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

        {error ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4" />
            <div className="leading-relaxed">{error}</div>
          </div>
        ) : null}

        <div className="mt-5 flex-1 space-y-4 overflow-auto pb-24">
          {messages.length ? null : (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              输入问题开始对话。当前为非流式版本（后续可升级 SSE）。
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
              </div>
            </div>
          ))}
        </div>

        <div className="fixed bottom-0 left-0 right-0 border-t border-slate-200/60 bg-white/95 backdrop-blur dark:border-slate-800/60 dark:bg-slate-950/90">
          <div className="container px-4 py-4">
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
        </div>
      </div>
    </div>
  );
}

