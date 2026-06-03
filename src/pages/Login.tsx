import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight, Lock, Mail } from "lucide-react";

import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

type Mode = "login" | "register";

export default function Login() {
  const navigate = useNavigate();
  const { accessToken, user, hydrate, isHydrated, login, register } = useAuthStore();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => (mode === "login" ? "登录" : "注册"), [mode]);

  useEffect(() => {
    if (!isHydrated) void hydrate();
  }, [hydrate, isHydrated]);

  useEffect(() => {
    if (accessToken && user) navigate("/", { replace: true });
  }, [accessToken, navigate, user]);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      if (mode === "login") await login(email.trim(), password);
      else await register(email.trim(), password);
      navigate("/", { replace: true });
    } catch (e) {
      if (e instanceof ApiError) setError(e.message);
      else setError("操作失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div className="container px-4 py-12">
        <div className="mx-auto max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm text-slate-500 dark:text-slate-400">CitationChat</div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 p-1 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm",
                    mode === "login"
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white",
                  )}
                >
                  登录
                </button>
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm",
                    mode === "register"
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white",
                  )}
                >
                  注册
                </button>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <Field
                label="邮箱"
                icon={<Mail className="h-4 w-4" />}
                input={
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={cn(
                      "w-full rounded-md border bg-white px-3 py-2 text-sm outline-none",
                      "border-slate-200 focus:border-slate-400",
                      "dark:border-slate-800 dark:bg-slate-950 dark:focus:border-slate-600",
                    )}
                    autoComplete="email"
                  />
                }
              />
              <Field
                label="密码"
                icon={<Lock className="h-4 w-4" />}
                input={
                  <input
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    type="password"
                    className={cn(
                      "w-full rounded-md border bg-white px-3 py-2 text-sm outline-none",
                      "border-slate-200 focus:border-slate-400",
                      "dark:border-slate-800 dark:bg-slate-950 dark:focus:border-slate-600",
                    )}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                  />
                }
              />

              {error ? (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4" />
                  <div className="leading-relaxed">{error}</div>
                </div>
              ) : null}

              <button
                type="button"
                disabled={submitting || !email.trim() || !password}
                onClick={submit}
                className={cn(
                  "inline-flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium",
                  "bg-slate-900 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60",
                  "dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200",
                )}
              >
                {mode === "login" ? "登录" : "注册并登录"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field(props: { label: string; icon: ReactNode; input: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-sm text-slate-600 dark:text-slate-300">{props.label}</div>
      <div className="flex items-center gap-2">
        <div className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-300">
          {props.icon}
        </div>
        <div className="flex-1">{props.input}</div>
      </div>
    </div>
  );
}
