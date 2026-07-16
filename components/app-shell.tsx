"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  BarChart3,
  Columns3,
  Compass,
  LayoutDashboard,
  type LucideProps,
  MailCheck,
  Wand2,
  Menu,
  Plus,
  Radar,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ApplicationSheet } from "@/components/application-sheet";
import { openNewApplication, openSearch } from "@/lib/ui-events";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<LucideProps>;
  badgeKey?: keyof NavCounts;
  chord: string;
};

const NAV: NavItem[] = [
  { href: "/command", label: "Command", icon: LayoutDashboard, badgeKey: "actions", chord: "G C" },
  { href: "/pipeline", label: "Board", icon: Columns3, badgeKey: "active", chord: "G P" },
  { href: "/analytics", label: "Insights", icon: BarChart3, chord: "G A" },
  { href: "/triage", label: "Discover", icon: Compass, badgeKey: "triage", chord: "G I" },
  { href: "/inbox-sync", label: "Email Sync", icon: MailCheck, badgeKey: "proposals", chord: "G E" },
  { href: "/studio", label: "Kit Studio", icon: Wand2, chord: "G S" },
];

export type NavCounts = {
  actions: number;
  active: number;
  triage: number;
  proposals: number;
};

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

function NavLinks({
  counts,
  pathname,
  onNavigate,
}: {
  counts: NavCounts;
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        const badge = item.badgeKey ? counts[item.badgeKey] : 0;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-elevated text-foreground"
                : "text-ink-2 hover:bg-white/[0.03] hover:text-foreground",
            )}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
            )}
            <Icon
              className={cn(
                "size-[18px] shrink-0 transition-colors",
                active ? "text-accent-hi" : "text-ink-3 group-hover:text-ink-2",
              )}
            />
            <span className="flex-1 font-medium">{item.label}</span>
            <kbd className="hidden font-mono text-[10px] tracking-wide text-ink-3 opacity-0 transition-opacity group-hover:opacity-70 lg:inline">
              {item.chord}
            </kbd>
            {badge > 0 && (
              <span
                className={cn(
                  "tnum inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold",
                  item.badgeKey === "actions"
                    ? "bg-primary/15 text-accent-hi"
                    : "bg-white/[0.06] text-ink-2",
                )}
              >
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="relative grid size-8 place-items-center rounded-[10px] bg-[linear-gradient(135deg,#7c6bf5,#4e7df0)] shadow-[0_4px_16px_-4px_rgba(124,107,245,0.6)]">
        <Radar className="size-[18px] text-white" strokeWidth={2.25} />
      </span>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight text-foreground">
          Scout Control
        </div>
        <div className="text-[11px] font-medium text-ink-3">Job-search OS</div>
      </div>
    </div>
  );
}

function SearchTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => openSearch()}
      className={cn(
        "group flex h-9 items-center gap-2 rounded-lg border border-hairline bg-white/[0.02] px-3 text-sm text-ink-3 transition-colors hover:border-white/15 hover:text-ink-2",
        className,
      )}
    >
      <Search className="size-4" />
      <span className="hidden md:inline">Search applications…</span>
      <kbd className="ml-auto hidden rounded border border-hairline bg-white/[0.03] px-1.5 py-0.5 font-mono text-[11px] text-ink-3 md:inline">
        /
      </kbd>
    </button>
  );
}

function NewButton() {
  return (
    <Button
      onClick={() => openNewApplication()}
      className="h-9 gap-1.5 border-0 bg-[linear-gradient(135deg,#7c6bf5,#4e7df0)] px-3.5 font-semibold text-white shadow-[0_0_0_1px_rgba(155,140,255,0.35),0_8px_24px_-10px_rgba(124,107,245,0.7)] transition-[filter] hover:brightness-110"
    >
      <Plus className="size-4" strokeWidth={2.5} />
      <span className="hidden sm:inline">New</span>
      <kbd className="ml-0.5 hidden rounded bg-black/20 px-1.5 py-0.5 font-mono text-[11px] font-normal text-white/70 sm:inline">
        N
      </kbd>
    </Button>
  );
}

export function AppShell({
  counts,
  children,
}: {
  counts: NavCounts;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const chordArmedAt = useRef(0);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Keyboard: N = new application, / = search, G-chords navigate (Phase 6):
  // G C command · G P board · G A insights · G I scout inbox · G E email sync.
  useEffect(() => {
    const CHORD_WINDOW_MS = 1200;
    const chordTargets: Record<string, string> = { c: "/command", p: "/pipeline", a: "/analytics", i: "/triage", e: "/inbox-sync", s: "/studio" };
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (chordArmedAt.current && Date.now() - chordArmedAt.current < CHORD_WINDOW_MS) {
        chordArmedAt.current = 0;
        const target = chordTargets[key];
        if (target) {
          e.preventDefault();
          router.push(target);
          return;
        }
      }
      if (key === "g") {
        chordArmedAt.current = Date.now();
      } else if (key === "n") {
        e.preventDefault();
        openNewApplication();
      } else if (e.key === "/") {
        e.preventDefault();
        openSearch();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const section = NAV.find((n) => isActive(pathname, n.href))?.label ?? "Scout Control";

  return (
    <div className="relative flex min-h-dvh">
      {/* Ambient accent glow — Aurora Signal signature (§9). */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(720px 340px at 18% -6%, rgba(124,107,245,0.16), transparent 68%), radial-gradient(600px 300px at 96% 0%, rgba(78,125,240,0.08), transparent 70%)",
        }}
      />

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-hairline bg-sidebar/70 px-3 py-4 backdrop-blur-xl lg:flex">
        <div className="px-2 pb-6">
          <BrandMark />
        </div>
        <NavLinks counts={counts} pathname={pathname} />
        <div className="mt-auto px-2">
          <div className="flex items-center gap-2 rounded-lg border border-hairline bg-white/[0.02] px-3 py-2.5">
            <span
              className="size-1.5 shrink-0 rounded-full shadow-[0_0_8px_1px_var(--status-interview)]"
              style={{ background: "var(--status-interview)" }}
            />
            <span className="text-[11px] leading-tight text-ink-3">
              Local &amp; private — data never leaves this machine
            </span>
          </div>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-hairline bg-background/60 px-4 backdrop-blur-xl md:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="grid size-9 place-items-center rounded-lg border border-hairline text-ink-2 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-4.5" />
          </button>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              {section}
            </span>
          </div>
          <div className="lg:hidden">
            <BrandMark />
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            <SearchTrigger className="w-40 md:w-72" />
            <NewButton />
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <aside className="absolute left-0 top-0 flex h-full w-72 flex-col border-r border-hairline bg-sidebar px-3 py-4">
            <div className="flex items-center justify-between px-2 pb-6">
              <BrandMark />
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-ink-2 hover:bg-white/[0.05]"
                aria-label="Close"
              >
                <X className="size-4" />
              </button>
            </div>
            <NavLinks counts={counts} pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Global add/edit slide-over — reachable from anywhere (button, N key, card menu). */}
      <ApplicationSheet />
    </div>
  );
}
