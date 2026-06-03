import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

export default function Me() {
  const navigate = useNavigate();
  const { user, accessToken, isHydrated, hydrate, logout } = useAuthStore();

  useEffect(() => {
    if (!isHydrated) void hydrate();
  }, [hydrate, isHydrated]);

  useEffect(() => {
    if (isHydrated && (!accessToken || !user)) navigate("/login", { replace: true });
  }, [accessToken, isHydrated, navigate, user]);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div className="container px-4 py-12">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="text-sm text-slate-500 dark:text-slate-400">个人空间</div>
          <div className="mt-1 text-2xl font-semibold tracking-tight">{user.email}</div>
          <div className="mt-3 text-sm text-slate-600 dark:text-slate-300">角色：{user.role}</div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/", { replace: true })}
              className={cn(
                "rounded-md border px-4 py-2 text-sm font-medium",
                "border-slate-200 text-slate-700 hover:bg-slate-50",
                "dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900",
              )}
            >
              返回首页
            </button>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate("/", { replace: true });
              }}
              className={cn(
                "rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800",
                "dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200",
              )}
            >
              退出登录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

