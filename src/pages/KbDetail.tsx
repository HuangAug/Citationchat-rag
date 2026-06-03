import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Upload } from "lucide-react";

import { ApiError, apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

type Doc = { id: string; kbId: string; filename: string; status: string; errorMessage: string | null; createdAt: string };

export default function KbDetail() {
  const navigate = useNavigate();
  const { kbId } = useParams<{ kbId: string }>();
  const { user, accessToken, isHydrated, hydrate } = useAuthStore();

  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const canUpload = useMemo(() => !!accessToken && !!kbId && !!file && !loading, [accessToken, file, kbId, loading]);

  useEffect(() => {
    if (!isHydrated) void hydrate();
  }, [hydrate, isHydrated]);

  useEffect(() => {
    if (isHydrated && (!accessToken || !user)) navigate("/login", { replace: true });
  }, [accessToken, isHydrated, navigate, user]);

  useEffect(() => {
    if (!isHydrated || !accessToken || !kbId) return;
    void load(accessToken, kbId);
  }, [accessToken, isHydrated, kbId]);

  const load = async (token: string, id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<Doc[]>(`/kbs/${id}/documents`, { headers: { Authorization: `Bearer ${token}` } });
      setDocs(data);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("加载失败");
    } finally {
      setLoading(false);
    }
  };

  const upload = async () => {
    if (!accessToken || !kbId || !file) return;
    setLoading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/kbs/${kbId}/documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      if (!res.ok) {
        const contentType = res.headers.get("content-type") ?? "";
        const body = contentType.includes("application/json") ? await res.json() : await res.text();
        throw new ApiError("上传失败", res.status, body);
      }
      setFile(null);
      await load(accessToken, kbId);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("上传失败");
    } finally {
      setLoading(false);
    }
  };

  if (!kbId) return null;

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div className="container px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-slate-500 dark:text-slate-400">文档</div>
            <div className="text-lg font-semibold tracking-tight">KB: {kbId}</div>
          </div>
          <button
            type="button"
            onClick={() => navigate("/kb", { replace: true })}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
              "border-slate-200 text-slate-700 hover:bg-slate-50",
              "dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900",
            )}
          >
            <ArrowLeft className="h-4 w-4" />
            返回列表
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
            <div className="text-sm font-medium">上传文档</div>
            <div className="mt-4 space-y-3">
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className={cn(
                  "block w-full rounded-md border bg-white px-3 py-2 text-sm",
                  "border-slate-200",
                  "dark:border-slate-800 dark:bg-slate-950",
                )}
              />
              <button
                type="button"
                disabled={!canUpload}
                onClick={upload}
                className={cn(
                  "inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium",
                  "bg-slate-900 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60",
                  "dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200",
                )}
              >
                <Upload className="h-4 w-4" />
                上传
              </button>
              <div className="text-xs text-slate-500 dark:text-slate-400">当前仅记录上传状态，解析/索引将在下一步实现。</div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
              <div className="border-b border-slate-200/60 px-5 py-4 text-sm font-medium dark:border-slate-800/60">文档列表</div>
              <div className="divide-y divide-slate-200/60 dark:divide-slate-800/60">
                {docs.length ? null : (
                  <div className="px-5 py-6 text-sm text-slate-500 dark:text-slate-400">{loading ? "加载中…" : "暂无文档"}</div>
                )}
                {docs.map((d) => (
                  <div key={d.id} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{d.filename}</div>
                        <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                          状态：{d.status}
                          {d.errorMessage ? `（${d.errorMessage}）` : ""}
                        </div>
                      </div>
                      <div className="flex-none text-xs text-slate-500 dark:text-slate-400">
                        {new Date(d.createdAt).toLocaleString()}
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

