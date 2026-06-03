import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Plus, Save } from "lucide-react";

import { ApiError, apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

type Kb = { id: string; name: string; description: string | null; createdAt: string; updatedAt: string };

export default function KbPage() {
  const navigate = useNavigate();
  const { user, accessToken, isHydrated, hydrate } = useAuthStore();

  const [kbs, setKbs] = useState<Kb[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const canCreate = useMemo(() => !!name.trim() && !!accessToken && !loading, [accessToken, loading, name]);

  useEffect(() => {
    if (!isHydrated) void hydrate();
  }, [hydrate, isHydrated]);

  useEffect(() => {
    if (isHydrated && (!accessToken || !user)) navigate("/login", { replace: true });
  }, [accessToken, isHydrated, navigate, user]);

  useEffect(() => {
    if (!isHydrated || !accessToken) return;
    void load(accessToken);
  }, [accessToken, isHydrated]);

  const load = async (token: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Kb[]>("/kbs", { headers: { Authorization: `Bearer ${token}` } });
      setKbs(data);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("加载失败");
    } finally {
      setLoading(false);
    }
  };

  const create = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      await apiFetch<Kb>("/kbs", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() ? desc.trim() : null }),
      });
      setName("");
      setDesc("");
      await load(accessToken);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("创建失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div className="container px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500 dark:text-slate-400">知识库</div>
            <div className="text-lg font-semibold tracking-tight">Knowledge Bases</div>
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

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
            <div className="text-sm font-medium">创建知识库</div>
            <div className="mt-4 space-y-3">
              <div>
                <div className="mb-1 text-sm text-slate-600 dark:text-slate-300">名称</div>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：产品手册"
                  className={cn(
                    "w-full rounded-md border bg-white px-3 py-2 text-sm outline-none",
                    "border-slate-200 focus:border-slate-400",
                    "dark:border-slate-800 dark:bg-slate-950 dark:focus:border-slate-600",
                  )}
                />
              </div>
              <div>
                <div className="mb-1 text-sm text-slate-600 dark:text-slate-300">描述</div>
                <textarea
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="可选"
                  rows={3}
                  className={cn(
                    "w-full resize-none rounded-md border bg-white px-3 py-2 text-sm outline-none",
                    "border-slate-200 focus:border-slate-400",
                    "dark:border-slate-800 dark:bg-slate-950 dark:focus:border-slate-600",
                  )}
                />
              </div>
              <button
                type="button"
                disabled={!canCreate}
                onClick={create}
                className={cn(
                  "inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium",
                  "bg-slate-900 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60",
                  "dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200",
                )}
              >
                <Plus className="h-4 w-4" />
                创建
              </button>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between border-b border-slate-200/60 px-5 py-4 dark:border-slate-800/60">
                <div className="text-sm font-medium">知识库列表</div>
                <button
                  type="button"
                  disabled={!accessToken || loading}
                  onClick={() => accessToken && void load(accessToken)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
                    "border-slate-200 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60",
                    "dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900",
                  )}
                >
                  <Save className="h-4 w-4" />
                  刷新
                </button>
              </div>
              <div className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                {kbs.length ? null : (
                  <div className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">
                    {loading ? "加载中…" : "暂无知识库"}
                  </div>
                )}
                {kbs.map((kb) => (
                  <div key={kb.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{kb.name}</div>
                        <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{kb.description ?? "—"}</div>
                      </div>
                      <div className="flex-none text-xs text-slate-500 dark:text-slate-400">
                        {new Date(kb.updatedAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

