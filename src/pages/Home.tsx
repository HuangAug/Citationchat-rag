import type { ReactNode } from "react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, MessageSquare, ShieldCheck, TestTubeDiagonal } from "lucide-react";

import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";

export default function Home() {
  const { isDark, toggleTheme } = useTheme();
  const { user, logout, hydrate, isHydrated } = useAuthStore();

  useEffect(() => {
    if (!isHydrated) void hydrate();
  }, [hydrate, isHydrated]);

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <header className="border-b border-slate-200/60 dark:border-slate-800/60">
        <div className="container flex h-14 items-center justify-between px-4">
          <Link to="/" className="font-semibold tracking-tight">
            CitationChat
          </Link>
          <div className="flex items-center gap-2">
            <nav className="hidden items-center gap-4 text-sm text-slate-600 dark:text-slate-300 md:flex">
              <Link to="/chat" className="hover:text-slate-900 dark:hover:text-white">
                对话
              </Link>
              <Link to="/kb" className="hover:text-slate-900 dark:hover:text-white">
                知识库
              </Link>
              <Link to="/eval" className="hover:text-slate-900 dark:hover:text-white">
                评测
              </Link>
            </nav>
            <button
              type="button"
              onClick={toggleTheme}
              className={cn(
                "rounded-md border px-3 py-1.5 text-sm",
                "border-slate-200 text-slate-700 hover:bg-slate-50",
                "dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900",
              )}
            >
              {isDark ? "浅色" : "深色"}
            </button>
            {user ? (
              <div className="group relative">
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold",
                    "bg-slate-900 text-white",
                    "dark:bg-white dark:text-slate-950",
                  )}
                  aria-label="User menu"
                >
                  {user.email.slice(0, 1).toUpperCase()}
                </button>
                <div
                  className={cn(
                    "absolute right-0 top-full hidden w-44 pt-2 group-hover:block",
                    "group-focus-within:block",
                  )}
                >
                  <div className="rounded-xl border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                    <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{user.email}</div>
                    <Link
                      to="/me"
                      className="block rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                      个人空间
                    </Link>
                    <button
                      type="button"
                      onClick={logout}
                      className="w-full rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
                    >
                      退出登录
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <Link
                to="/login"
                className={cn(
                  "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800",
                  "dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200",
                )}
              >
                登录
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="container px-4 py-16">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
              <ShieldCheck className="h-4 w-4" />
              可追溯引用 · 企业知识库 RAG 助手
            </div>
            <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight md:text-5xl">
              把企业内部资料变成可引用、可验证的答案
            </h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600 dark:text-slate-300 md:text-lg">
              支持文档导入与索引、检索增强生成、引用证据展示、反馈闭环与评测，让每一次回答都有依据。
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/chat"
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800",
                  "dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200",
                )}
              >
                进入对话
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="http://localhost:8000/docs"
                target="_blank"
                rel="noreferrer"
                className={cn(
                  "inline-flex items-center justify-center gap-2 rounded-md border px-5 py-2.5 text-sm font-medium",
                  "border-slate-200 text-slate-700 hover:bg-slate-50",
                  "dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900",
                )}
              >
                查看 API 文档
              </a>
            </div>
          </div>
        </section>

        <section className="container px-4 pb-16">
          <div className="grid gap-4 md:grid-cols-3">
            <FeatureCard
              icon={<BookOpen className="h-5 w-5" />}
              title="知识库管理"
              desc="按知识库组织文档，掌握索引与状态，支持持续迭代。"
              to="/kb"
            />
            <FeatureCard
              icon={<MessageSquare className="h-5 w-5" />}
              title="引用式问答"
              desc="回答与证据同步返回，支持 TopK 引用与可视化展示。"
              to="/chat"
            />
            <FeatureCard
              icon={<TestTubeDiagonal className="h-5 w-5" />}
              title="评测与调参"
              desc="导入评测集，运行自动评测，迭代检索与生成策略。"
              to="/eval"
            />
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/60 py-8 text-center text-sm text-slate-500 dark:border-slate-800/60 dark:text-slate-400">
        <div className="container px-4">CitationChat · 企业知识库 RAG 助手</div>
      </footer>
    </div>
  );
}

function FeatureCard(props: { icon: ReactNode; title: string; desc: string; to: string }) {
  return (
    <Link
      to={props.to}
      className={cn(
        "group rounded-xl border p-5 transition",
        "border-slate-200 hover:bg-slate-50",
        "dark:border-slate-800 dark:hover:bg-slate-900",
      )}
    >
      <div className="flex items-center gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-2 text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200">
          {props.icon}
        </div>
        <div className="font-medium">{props.title}</div>
      </div>
      <div className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{props.desc}</div>
      <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-slate-700 group-hover:text-slate-900 dark:text-slate-200 dark:group-hover:text-white">
        打开
        <ArrowRight className="h-4 w-4" />
      </div>
    </Link>
  );
}
