import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, Pencil, Plus, Save, Trash2, X } from "lucide-react";

import { ApiError, apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

type Kb = { id: string; name: string; description: string | null; isDefault: boolean; createdAt: string; updatedAt: string };
type CreateKbWithDocsResponse = {
  id: string;
  name: string;
  description: string | null;
  documentIds: string[];
  createdAt: string;
  updatedAt: string;
};

export default function KbPage() {
  const navigate = useNavigate();
  const { user, accessToken, isHydrated, hydrate } = useAuthStore();

  const [kbs, setKbs] = useState<Kb[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [defaultDeleteId, setDefaultDeleteId] = useState<string | null>(null);
  const [newDefaultId, setNewDefaultId] = useState<string>("");

  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [createFiles, setCreateFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canCreate = useMemo(() => !!name.trim() && !!accessToken && !loading, [accessToken, loading, name]);
  const canSaveEdit = useMemo(() => !!editingId && !!editName.trim() && !!accessToken && !loading, [accessToken, editName, editingId, loading]);

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
      if (createFiles.length) {
        const form = new FormData();
        form.append("name", name.trim());
        if (desc.trim()) form.append("description", desc.trim());
        for (const f of createFiles) form.append("files", f);
        const res = await fetch("/api/kbs/with-documents", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}` },
          body: form,
        });
        if (!res.ok) {
          const contentType = res.headers.get("content-type") ?? "";
          const body = contentType.includes("application/json") ? await res.json() : await res.text();
          throw new ApiError("创建失败", res.status, body);
        }
        const kb = (await res.json()) as CreateKbWithDocsResponse;
        setName("");
        setDesc("");
        setCreateFiles([]);
        if (fileRef.current) fileRef.current.value = "";
        navigate(`/kb/${kb.id}`, { replace: true });
        return;
      }

      await apiFetch<Kb>("/kbs", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() ? desc.trim() : null }),
      });
      setName("");
      setDesc("");
      setCreateFiles([]);
      if (fileRef.current) fileRef.current.value = "";
      await load(accessToken);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("创建失败");
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (kb: Kb) => {
    setEditingId(kb.id);
    setEditName(kb.name);
    setEditDesc(kb.description ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditDesc("");
  };

  const saveEdit = async () => {
    if (!accessToken || !editingId) return;
    setLoading(true);
    setError(null);
    try {
      await apiFetch<Kb>(`/kbs/${editingId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() ? editDesc.trim() : null }),
      });
      cancelEdit();
      await load(accessToken);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("保存失败");
    } finally {
      setLoading(false);
    }
  };

  const requestDelete = async (kb: Kb) => {
    if (!accessToken) return;
    if (kbs.length <= 1) return;
    if (kb.isDefault) {
      setDefaultDeleteId(kb.id);
      const fallback = kbs.find((x) => x.id !== kb.id);
      setNewDefaultId(fallback?.id ?? "");
      return;
    }

    const ok = window.confirm(`确认删除知识库：${kb.name}？`);
    if (!ok) return;
    setDeletingId(kb.id);
    setError(null);
    try {
      const res = await fetch(`/api/kbs/${kb.id}`, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
      if (!res.ok) {
        const contentType = res.headers.get("content-type") ?? "";
        const body = contentType.includes("application/json") ? await res.json() : await res.text();
        throw new ApiError("删除失败", res.status, body);
      }
      await load(accessToken);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("删除失败");
    } finally {
      setDeletingId(null);
    }
  };

  const confirmDeleteDefault = async () => {
    if (!accessToken || !defaultDeleteId) return;
    if (!newDefaultId) {
      setError("请选择新的默认知识库");
      return;
    }
    const kb = kbs.find((x) => x.id === defaultDeleteId);
    const ok = window.confirm(`将默认知识库切换为选中项，并删除：${kb?.name ?? "默认知识库"}？`);
    if (!ok) return;
    setDeletingId(defaultDeleteId);
    setError(null);
    try {
      const qs = new URLSearchParams({ newDefaultKbId: newDefaultId }).toString();
      const res = await fetch(`/api/kbs/${defaultDeleteId}?${qs}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const contentType = res.headers.get("content-type") ?? "";
        const body = contentType.includes("application/json") ? await res.json() : await res.text();
        throw new ApiError("删除失败", res.status, body);
      }
      setDefaultDeleteId(null);
      await load(accessToken);
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("删除失败");
    } finally {
      setDeletingId(null);
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
              <div>
                <div className="mb-1 text-sm text-slate-600 dark:text-slate-300">文件（可选）</div>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  onChange={(e) => setCreateFiles(Array.from(e.target.files ?? []))}
                  className={cn(
                    "block w-full rounded-md border bg-white px-3 py-2 text-sm",
                    "border-slate-200",
                    "dark:border-slate-800 dark:bg-slate-950",
                  )}
                />
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  支持：.pdf / .docx / .txt / .md；.doc 请先转换为 .docx 或 .pdf
                </div>
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
                        {editingId === kb.id ? (
                          <div className="space-y-2">
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className={cn(
                                "w-full rounded-md border bg-white px-3 py-2 text-sm outline-none",
                                "border-slate-200 focus:border-slate-400",
                                "dark:border-slate-800 dark:bg-slate-950 dark:focus:border-slate-600",
                              )}
                            />
                            <textarea
                              value={editDesc}
                              onChange={(e) => setEditDesc(e.target.value)}
                              rows={2}
                              className={cn(
                                "w-full resize-none rounded-md border bg-white px-3 py-2 text-sm outline-none",
                                "border-slate-200 focus:border-slate-400",
                                "dark:border-slate-800 dark:bg-slate-950 dark:focus:border-slate-600",
                              )}
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={!canSaveEdit}
                                onClick={saveEdit}
                                className={cn(
                                  "inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800",
                                  "disabled:cursor-not-allowed disabled:opacity-60",
                                  "dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200",
                                )}
                              >
                                <Save className="h-4 w-4" />
                                保存
                              </button>
                              <button
                                type="button"
                                disabled={loading}
                                onClick={cancelEdit}
                                className={cn(
                                  "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
                                  "border-slate-200 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60",
                                  "dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900",
                                )}
                              >
                                <X className="h-4 w-4" />
                                取消
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-medium">{kb.name}</div>
                              {kb.isDefault ? (
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-xs font-medium",
                                    "bg-amber-100 text-amber-800",
                                    "dark:bg-amber-950/40 dark:text-amber-200",
                                  )}
                                >
                                  默认
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{kb.description ?? "—"}</div>
                            <div className="mt-2">
                              <Link
                                to={`/kb/${kb.id}`}
                                className="text-sm text-slate-700 hover:text-slate-900 dark:text-slate-200 dark:hover:text-white"
                              >
                                管理文档
                              </Link>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex flex-none items-start gap-2">
                        <div className="pt-1 text-xs text-slate-500 dark:text-slate-400">{new Date(kb.updatedAt).toLocaleString()}</div>
                        {editingId === kb.id ? null : (
                          <button
                            type="button"
                            disabled={!accessToken || loading}
                            onClick={() => startEdit(kb)}
                            className={cn(
                              "inline-flex items-center justify-center rounded-md border p-2",
                              "border-slate-200 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60",
                              "dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900",
                            )}
                            aria-label="Edit KB"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {editingId === kb.id ? null : (
                          <button
                            type="button"
                            disabled={!accessToken || loading || deletingId === kb.id || kbs.length <= 1}
                            onClick={() => void requestDelete(kb)}
                            className={cn(
                              "inline-flex items-center justify-center rounded-md border p-2",
                              "border-slate-200 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60",
                              "dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900",
                            )}
                            aria-label="Delete KB"
                            title={kbs.length <= 1 ? "仅剩一个知识库时不可删除" : "删除"}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {defaultDeleteId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-lg dark:border-slate-800 dark:bg-slate-950">
            <div className="text-sm font-medium">删除默认知识库</div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              删除默认知识库前，需要先指定一个新的默认知识库。
            </div>
            <div className="mt-4 space-y-2">
              <div className="text-sm text-slate-600 dark:text-slate-300">新的默认知识库</div>
              <select
                value={newDefaultId}
                onChange={(e) => setNewDefaultId(e.target.value)}
                className={cn(
                  "w-full rounded-md border bg-white px-3 py-2 text-sm outline-none",
                  "border-slate-200 focus:border-slate-400",
                  "dark:border-slate-800 dark:bg-slate-950 dark:focus:border-slate-600",
                )}
              >
                {kbs
                  .filter((k) => k.id !== defaultDeleteId)
                  .map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={deletingId === defaultDeleteId}
                onClick={() => setDefaultDeleteId(null)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
                  "border-slate-200 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60",
                  "dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900",
                )}
              >
                取消
              </button>
              <button
                type="button"
                disabled={deletingId === defaultDeleteId || !newDefaultId}
                onClick={() => void confirmDeleteDefault()}
                className={cn(
                  "inline-flex items-center gap-2 rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  "dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200",
                )}
              >
                {deletingId === defaultDeleteId ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
