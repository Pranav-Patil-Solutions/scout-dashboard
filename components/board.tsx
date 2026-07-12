"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Clock,
  Ellipsis,
  ExternalLink,
  GripVertical,
  Inbox,
  Layers,
  Pencil,
  Plus,
  Search,
  SquareCheckBig,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FitChip, GermanReqDot, SourceTag, StatusBadge } from "@/components/chips";
import {
  BOARD_COLUMNS,
  CLOSED_STATUSES,
  FIT_BAND_META,
  fitBandFor,
  GERMAN_REQ_META,
  SOURCES,
  statusMeta,
  WORK_MODES,
  type Status,
} from "@/lib/constants";
import { deleteApplication, moveApplication } from "@/lib/actions";
import { openEditApplication, openNewApplication } from "@/lib/ui-events";
import { daysAgo } from "@/lib/format";
import type { BoardApplication } from "@/lib/queries";

type Filters = { q: string; source: string; band: string; german: string; mode: string };
const EMPTY_FILTERS: Filters = { q: "", source: "", band: "", german: "", mode: "" };

function matches(a: BoardApplication, f: Filters): boolean {
  if (f.q) {
    const q = f.q.toLowerCase();
    if (!a.company.toLowerCase().includes(q) && !a.roleTitle.toLowerCase().includes(q))
      return false;
  }
  if (f.source && a.source !== f.source) return false;
  if (f.german && a.germanReq !== f.german) return false;
  if (f.mode && a.workMode !== f.mode) return false;
  if (f.band && fitBandFor(a.fitBand, a.fitScore) !== f.band) return false;
  return true;
}

export function Board({ initial }: { initial: BoardApplication[] }) {
  const router = useRouter();
  const [apps, setApps] = useState(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => setApps(initial), [initial]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const filtered = useMemo(() => apps.filter((a) => matches(a, filters)), [apps, filters]);
  const closed = filtered.filter((a) => CLOSED_STATUSES.includes(a.status as Status));
  const activeApp = apps.find((a) => a.id === activeId) ?? null;
  const filterActive = Object.values(filters).some(Boolean);

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const to = String(over.id);
    if (!(BOARD_COLUMNS as string[]).includes(to)) return;
    const id = String(active.id);
    const app = apps.find((a) => a.id === id);
    if (!app || app.status === to) return;

    const prev = apps;
    setApps((list) =>
      list.map((a) => (a.id === id ? { ...a, status: to, stageEnteredAt: new Date() } : a)),
    );
    moveApplication(id, to)
      .then(() => router.refresh())
      .catch((err) => {
        setApps(prev);
        toast.error(err instanceof Error ? err.message : "Couldn't move that.");
      });
  }

  function onMove(id: string, to: string) {
    const prev = apps;
    setApps((list) =>
      list.map((a) => (a.id === id ? { ...a, status: to, stageEnteredAt: new Date() } : a)),
    );
    moveApplication(id, to)
      .then(() => {
        router.refresh();
        toast.success(`Moved to ${statusMeta(to).label}`);
      })
      .catch((err) => {
        setApps(prev);
        toast.error(err instanceof Error ? err.message : "Couldn't update.");
      });
  }

  function onDelete(id: string) {
    const prev = apps;
    setApps((list) => list.filter((a) => a.id !== id));
    deleteApplication(id)
      .then(() => router.refresh())
      .catch(() => {
        setApps(prev);
        toast.error("Couldn't delete.");
      });
  }

  if (apps.length === 0) return <EmptyBoard />;

  return (
    <div className="flex h-full flex-col">
      <FilterBar
        filters={filters}
        setFilters={setFilters}
        count={filtered.length - closed.length}
        onClear={() => setFilters(EMPTY_FILTERS)}
        active={filterActive}
      />

      <DndContext
        id="board-dnd"
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-4 md:px-6">
          {BOARD_COLUMNS.map((status) => (
            <Column
              key={status}
              status={status}
              cards={filtered.filter((a) => a.status === status)}
              activeId={activeId}
              onMove={onMove}
              onDelete={onDelete}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2,0,0,1)" }}>
          {activeApp ? <CardInner app={activeApp} dragging /> : null}
        </DragOverlay>
      </DndContext>

      <ClosedTray
        closed={closed}
        open={showClosed}
        toggle={() => setShowClosed((v) => !v)}
        onMove={onMove}
        onDelete={onDelete}
      />
    </div>
  );
}

function EmptyBoard() {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-[460px] flex-col items-center justify-center px-6 text-center">
      <span className="relative grid size-14 place-items-center rounded-2xl border border-hairline bg-card">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl opacity-70 blur-xl"
          style={{ background: "radial-gradient(circle, rgba(124,107,245,0.25), transparent 70%)" }}
        />
        <Layers className="relative size-6 text-accent-hi" />
      </span>
      <h2 className="mt-5 text-lg font-semibold tracking-tight text-foreground">
        No live applications yet
      </h2>
      <p className="mt-2 text-sm text-ink-2">
        Import a job from your scout, or add one by hand to start the pipeline.
      </p>
      <div className="mt-5 flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => openNewApplication()}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border-0 bg-[linear-gradient(135deg,#7c6bf5,#4e7df0)] px-3.5 text-sm font-semibold text-white shadow-[0_0_0_1px_rgba(155,140,255,0.35)] hover:brightness-110"
        >
          <Plus className="size-4" /> Add application
        </button>
        <Link
          href="/triage"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline px-3.5 text-sm font-medium text-ink-2 hover:text-foreground"
        >
          <Inbox className="size-4" /> Import from scout
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ column */

function Column({
  status,
  cards,
  activeId,
  onMove,
  onDelete,
}: {
  status: Status;
  cards: BoardApplication[];
  activeId: string | null;
  onMove: (id: string, to: string) => void;
  onDelete: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = statusMeta(status);

  return (
    <div className="flex w-[288px] shrink-0 flex-col">
      <div className="mb-2.5 flex items-center gap-2 px-1">
        <span className="size-2 rounded-full" style={{ background: meta.color }} />
        <span className="text-[13px] font-semibold text-foreground">{meta.label}</span>
        <span className="tnum ml-auto rounded-full bg-white/[0.05] px-1.5 text-[11px] font-medium text-ink-3">
          {cards.length}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-[160px] flex-1 flex-col gap-2.5 rounded-2xl border border-transparent p-1.5 transition-colors",
          isOver && "border-dashed border-primary/40 bg-primary/[0.04]",
        )}
      >
        {cards.map((app) => (
          <DraggableCard
            key={app.id}
            app={app}
            dimmed={activeId === app.id}
            onMove={onMove}
            onDelete={onDelete}
          />
        ))}
        {cards.length === 0 && (
          <div className="grid h-28 place-items-center rounded-xl border border-dashed border-hairline/70 text-center">
            <span className="px-4 text-[12px] text-ink-3">
              {status === "to_apply" ? "Nothing queued to send" : "Empty"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- card */

function DraggableCard({
  app,
  dimmed,
  onMove,
  onDelete,
}: {
  app: BoardApplication;
  dimmed: boolean;
  onMove: (id: string, to: string) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: app.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn("touch-none", dimmed && "opacity-40")}
    >
      <CardInner app={app} onMove={onMove} onDelete={onDelete} />
    </div>
  );
}

function CardInner({
  app,
  dragging = false,
  onMove,
  onDelete,
}: {
  app: BoardApplication;
  dragging?: boolean;
  onMove?: (id: string, to: string) => void;
  onDelete?: (id: string) => void;
}) {
  const days = daysAgo(app.stageEnteredAt);
  const kit = app.isKitReady && !CLOSED_STATUSES.includes(app.status as Status);
  const stop = (e: React.PointerEvent) => e.stopPropagation();

  return (
    <div
      className={cn(
        "group/card cursor-grab rounded-xl border border-hairline bg-card p-3 transition-colors active:cursor-grabbing",
        dragging
          ? "rotate-[1.5deg] cursor-grabbing shadow-[0_18px_40px_-12px_rgba(0,0,0,0.7)] ring-1 ring-primary/40"
          : "hover:border-white/12 hover:bg-elevated",
      )}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 size-3.5 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover/card:opacity-100" />
        <div className="min-w-0 flex-1">
          <Link
            href={`/a/${app.id}`}
            onPointerDown={stop}
            className="block truncate text-[13px] font-semibold text-foreground hover:text-accent-hi"
          >
            {app.company}
          </Link>
          <p className="mt-0.5 truncate text-[12px] text-ink-2">{app.roleTitle}</p>
        </div>
        <FitChip score={app.fitScore} band={app.fitBand} />
        {!dragging && (
          <DropdownMenu>
            <DropdownMenuTrigger
              onPointerDown={stop}
              aria-label="Card actions"
              className="grid size-6 shrink-0 place-items-center rounded-md text-ink-3 opacity-0 outline-none transition-opacity hover:bg-white/[0.06] hover:text-foreground focus-visible:opacity-100 group-hover/card:opacity-100 data-[popup-open]:opacity-100"
            >
              <Ellipsis className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem render={<Link href={`/a/${app.id}`} />}>
                <ExternalLink className="size-4" /> Open
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openEditApplication(app.id)}>
                <Pencil className="size-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {app.status === "to_apply" && (
                <DropdownMenuItem onClick={() => onMove?.(app.id, "applied")}>
                  <SquareCheckBig className="size-4" /> Mark applied
                </DropdownMenuItem>
              )}
              {!CLOSED_STATUSES.includes(app.status as Status) ? (
                <>
                  <DropdownMenuItem onClick={() => onMove?.(app.id, "rejected")}>
                    <Ban className="size-4" /> Mark rejected
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onMove?.(app.id, "withdrawn")}>
                    <CircleSlash className="size-4" /> Withdraw
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onClick={() => onMove?.(app.id, "applied")}>
                  <Undo2 className="size-4" /> Reopen
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => onDelete?.(app.id)}>
                <Trash2 className="size-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <SourceTag source={app.source} />
        <GermanReqDot req={app.germanReq} />
        {kit && (
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-hi">
            KIT
          </span>
        )}
        <span className="ml-auto flex items-center">
          {/* §Phase-6 board arrows — keyboardable alternative to drag */}
          {!dragging && onMove && BOARD_COLUMNS.indexOf(app.status as Status) > 0 && (
            <button
              type="button"
              onPointerDown={stop}
              onClick={() =>
                onMove(app.id, BOARD_COLUMNS[BOARD_COLUMNS.indexOf(app.status as Status) - 1])
              }
              aria-label={`Move back to ${statusMeta(BOARD_COLUMNS[BOARD_COLUMNS.indexOf(app.status as Status) - 1]).label}`}
              className="grid size-6 place-items-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-white/[0.06] hover:text-foreground focus-visible:opacity-100 group-hover/card:opacity-100"
            >
              <ChevronLeft className="size-3.5" />
            </button>
          )}
          {!dragging &&
            onMove &&
            BOARD_COLUMNS.includes(app.status as Status) &&
            BOARD_COLUMNS.indexOf(app.status as Status) < BOARD_COLUMNS.length - 1 && (
              <button
                type="button"
                onPointerDown={stop}
                onClick={() =>
                  onMove(app.id, BOARD_COLUMNS[BOARD_COLUMNS.indexOf(app.status as Status) + 1])
                }
                aria-label={`Advance to ${statusMeta(BOARD_COLUMNS[BOARD_COLUMNS.indexOf(app.status as Status) + 1]).label}`}
                className="grid size-6 place-items-center rounded-md text-ink-3 opacity-0 transition-opacity hover:bg-white/[0.06] hover:text-foreground focus-visible:opacity-100 group-hover/card:opacity-100"
              >
                <ChevronRight className="size-3.5" />
              </button>
            )}
          <span className="tnum ml-1 inline-flex items-center gap-1 text-[11px] text-ink-3">
            <Clock className="size-3" />
            {days === null ? "—" : days === 0 ? "today" : `${days}d`}
          </span>
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- closed tray */

function ClosedTray({
  closed,
  open,
  toggle,
  onMove,
  onDelete,
}: {
  closed: BoardApplication[];
  open: boolean;
  toggle: () => void;
  onMove: (id: string, to: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="border-t border-hairline bg-background/40 px-4 py-3 md:px-6">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 text-[13px] font-medium text-ink-2 transition-colors hover:text-foreground"
      >
        <ChevronRight className={cn("size-4 transition-transform", open && "rotate-90")} />
        <Layers className="size-4 text-ink-3" />
        Closed
        <span className="tnum rounded-full bg-white/[0.05] px-1.5 text-[11px] text-ink-3">
          {closed.length}
        </span>
      </button>
      {open && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {closed.length === 0 && (
            <p className="text-[12px] text-ink-3">Nothing closed yet.</p>
          )}
          {closed.map((app) => (
            <div
              key={app.id}
              className="flex items-center gap-3 rounded-xl border border-hairline bg-card px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/a/${app.id}`}
                  className="block truncate text-[13px] font-medium text-foreground hover:text-accent-hi"
                >
                  {app.company}
                </Link>
                <p className="truncate text-[11px] text-ink-3">{app.roleTitle}</p>
              </div>
              <StatusBadge status={app.status} size="sm" />
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Actions"
                  className="grid size-6 shrink-0 place-items-center rounded-md text-ink-3 hover:bg-white/[0.06] hover:text-foreground"
                >
                  <Ellipsis className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => onMove(app.id, "applied")}>
                    <Undo2 className="size-4" /> Reopen
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(app.id)}>
                    <Trash2 className="size-4" /> Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- filter bar */

function FilterBar({
  filters,
  setFilters,
  count,
  onClear,
  active,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  count: number;
  onClear: () => void;
  active: boolean;
}) {
  const sel =
    "h-8 appearance-none rounded-lg border border-input bg-white/[0.02] pl-2.5 pr-7 text-[12px] text-ink-2 outline-none transition-colors hover:border-white/15 focus-visible:border-ring";
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-4 md:px-6">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-3" />
        <input
          value={filters.q}
          onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          placeholder="Search…"
          className="h-8 w-44 rounded-lg border border-input bg-white/[0.02] pl-8 pr-2.5 text-[12px] text-foreground outline-none transition-colors placeholder:text-ink-3 hover:border-white/15 focus-visible:border-ring"
        />
      </div>
      <SelectWrap className={sel} value={filters.source} onChange={(v) => setFilters({ ...filters, source: v })} placeholder="Source">
        {SOURCES.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </SelectWrap>
      <SelectWrap className={sel} value={filters.band} onChange={(v) => setFilters({ ...filters, band: v })} placeholder="Fit">
        {(["strong", "stretch", "skip"] as const).map((b) => (
          <option key={b} value={b}>
            {FIT_BAND_META[b].label}
          </option>
        ))}
      </SelectWrap>
      <SelectWrap className={sel} value={filters.german} onChange={(v) => setFilters({ ...filters, german: v })} placeholder="Language">
        {Object.entries(GERMAN_REQ_META).map(([k, m]) => (
          <option key={k} value={k}>
            {m.label}
          </option>
        ))}
      </SelectWrap>
      <SelectWrap className={sel} value={filters.mode} onChange={(v) => setFilters({ ...filters, mode: v })} placeholder="Mode">
        {WORK_MODES.map((m) => (
          <option key={m} value={m}>
            {m[0].toUpperCase() + m.slice(1)}
          </option>
        ))}
      </SelectWrap>

      {active && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-[12px] text-ink-3 hover:text-foreground"
        >
          <X className="size-3.5" /> Clear
        </button>
      )}
      <span className="tnum ml-auto text-[12px] text-ink-3">{count} in pipeline</span>
    </div>
  );
}

function SelectWrap({
  value,
  onChange,
  children,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  placeholder: string;
  className: string;
}) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={className}>
        <option value="">{placeholder}</option>
        {children}
      </select>
      <ChevronRight className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 rotate-90 text-ink-3" />
    </div>
  );
}
