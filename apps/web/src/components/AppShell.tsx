"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import {
  Activity,
  BarChart3,
  FileText,
  HeartPulse,
  LayoutDashboard,
  MessageCircle,
  NotebookPen,
  ScrollText,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  match?: (pathname: string) => boolean;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "总览", icon: LayoutDashboard, match: (path) => path === "/" },
  {
    href: "/documents",
    label: "单据",
    icon: FileText,
    match: (path) => path.startsWith("/documents"),
  },
  { href: "/trends", label: "趋势", icon: BarChart3 },
  { href: "/insights", label: "洞察", icon: Sparkles },
  { href: "/chat", label: "问答", icon: MessageCircle },
  { href: "/notes", label: "笔记", icon: NotebookPen },
  { href: "/logs", label: "日志", icon: ScrollText },
];

export const DESKTOP_SIDEBAR_CLASS =
  "hidden h-screen self-start sticky top-0 overflow-y-auto border-r border-[var(--hs-border)] bg-[var(--hs-sidebar)] px-3 py-5 lg:flex lg:flex-col";

function isActive(item: NavItem, pathname: string) {
  if (item.match) return item.match(pathname);
  return pathname === item.href;
}

function routeForSearch(query: string) {
  const text = query.trim().toLowerCase();
  if (!text) return null;
  if (text.includes("趋势") || text.includes("指标") || text.includes("marker")) return "/trends";
  if (text.includes("笔记") || text.includes("症状") || text.includes("note")) return "/notes";
  if (text.includes("问答") || text.includes("聊天") || text.includes("assistant") || text.includes("ai")) return "/chat";
  if (text.includes("洞察") || text.includes("报告") || text.includes("insight")) return "/insights";
  if (text.includes("日志") || text.includes("ocr") || text.includes("llm")) return "/logs";
  return "/documents";
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-3 px-2">
      <span className="flex size-9 items-center justify-center rounded-lg bg-[linear-gradient(150deg,#4E8E6A,#2D6045)] text-white shadow-[0_8px_20px_rgba(45,96,69,0.22)]">
        <HeartPulse className="size-5" aria-hidden="true" />
      </span>
      <span className="font-serif text-[1.35rem] font-semibold tracking-normal text-[var(--hs-text)]">
        health<span className="text-[var(--hs-primary)]">·</span>store
      </span>
    </Link>
  );
}

function NavList({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "flex gap-1",
        compact ? "overflow-x-auto px-3 pb-3" : "flex-col px-2",
      )}
      aria-label="主导航"
    >
      {NAV_ITEMS.map((item) => {
        const active = isActive(item, pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-10 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              active
                ? "bg-[var(--hs-primary-soft)] text-[var(--hs-primary-strong)]"
                : "text-[var(--hs-muted)] hover:bg-[var(--hs-hover)] hover:text-[var(--hs-text)]",
              compact && "h-9 gap-2 whitespace-nowrap",
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const route = routeForSearch(query);
    if (route) {
      router.push(route);
      setQuery("");
    }
  }

  return (
    <div className="min-h-screen bg-[var(--hs-bg)] text-[var(--hs-text)] lg:grid lg:grid-cols-[244px_minmax(0,1fr)]">
      <aside className={DESKTOP_SIDEBAR_CLASS}>
        <Brand />
        <div className="mt-8">
          <NavList />
        </div>
        <div className="mt-auto space-y-3 px-2">
          <div className="rounded-lg border border-[var(--hs-border)] bg-[var(--hs-bg-muted)] p-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--hs-primary-strong)]">
              <Activity className="size-3.5" aria-hidden="true" />
              个人健康档案
            </div>
            <p className="mt-2 text-xs leading-5 text-[var(--hs-muted)]">
              AI 内容仅供参考，不构成医疗诊断。
            </p>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--hs-border)] bg-[rgba(242,243,240,0.88)] backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <div className="lg:hidden">
              <Brand />
            </div>
            <form
              onSubmit={submitSearch}
              className="relative ml-auto hidden w-full max-w-md sm:block lg:ml-0"
            >
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--hs-muted)]" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索单据、指标、笔记..."
                className="h-10 w-full rounded-lg border border-[var(--hs-border)] bg-white pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-[var(--hs-muted)] focus:border-[var(--hs-primary)]"
              />
            </form>
            <Link
              href="/documents/upload"
              className="ml-auto inline-flex h-10 items-center gap-2 rounded-lg bg-[linear-gradient(150deg,#4E8E6A,#2D6045)] px-4 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(45,96,69,0.18)] transition-opacity hover:opacity-90 lg:ml-auto"
            >
              <Upload className="size-4" aria-hidden="true" />
              上传单据
            </Link>
          </div>
          <div className="lg:hidden">
            <NavList compact />
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
