"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Field, NativeSelect } from "@/components/form-controls";
import { FitChip } from "@/components/chips";
import {
  BOARD_COLUMNS,
  CLOSED_STATUSES,
  GERMAN_REQ_META,
  SENIORITY,
  SOURCES,
  STATUS_META,
  WORK_MODES,
  type GermanReq,
} from "@/lib/constants";
import { SCOUT_EVENTS, type NewApplicationPrefill } from "@/lib/ui-events";
import { createApplication, loadApplication, updateApplication } from "@/lib/actions";
import type { ApplicationInput } from "@/lib/types";
import type { Application } from "@/lib/db/schema";

const EMPTY: ApplicationInput = {
  company: "",
  roleTitle: "",
  source: "scraper",
  status: "to_apply",
  fitScore: null,
  germanReq: "none",
  location: "",
  workMode: "remote",
  seniority: "",
  salaryRange: "",
  applyUrl: "",
  jdUrl: "",
  isKitReady: false,
  resumeVariant: "",
  coverPath: "",
  nextAction: "",
  nextActionDue: "",
  notes: "",
};

function appToInput(a: Application): ApplicationInput {
  return {
    company: a.company,
    roleTitle: a.roleTitle,
    source: a.source,
    status: a.status,
    fitScore: a.fitScore,
    germanReq: a.germanReq,
    location: a.location ?? "",
    workMode: a.workMode ?? "",
    seniority: a.seniority ?? "",
    salaryRange: a.salaryRange ?? "",
    applyUrl: a.applyUrl ?? "",
    jdUrl: a.jdUrl ?? "",
    isKitReady: a.isKitReady,
    resumeVariant: a.resumeVariant ?? "",
    coverPath: a.coverPath ?? "",
    nextAction: a.nextAction ?? "",
    nextActionDue: a.nextActionDue ? format(a.nextActionDue, "yyyy-MM-dd") : "",
    notes: a.notes ?? "",
  };
}

const STATUS_OPTIONS = [...BOARD_COLUMNS, ...CLOSED_STATUSES];

export function ApplicationSheet() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"new" | "edit">("new");
  const [editId, setEditId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<ApplicationInput>(EMPTY);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onNew(e: Event) {
      const prefill = (e as CustomEvent<NewApplicationPrefill>).detail ?? {};
      setMode("new");
      setEditId(null);
      setForm({ ...EMPTY, ...cleanPrefill(prefill) });
      setLoading(false);
      setOpen(true);
    }
    async function onEdit(e: Event) {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      setMode("edit");
      setEditId(id);
      setLoading(true);
      setOpen(true);
      const app = await loadApplication(id);
      if (app) setForm(appToInput(app));
      else toast.error("Application not found.");
      setLoading(false);
    }
    window.addEventListener(SCOUT_EVENTS.newApplication, onNew);
    window.addEventListener(SCOUT_EVENTS.editApplication, onEdit);
    return () => {
      window.removeEventListener(SCOUT_EVENTS.newApplication, onNew);
      window.removeEventListener(SCOUT_EVENTS.editApplication, onEdit);
    };
  }, []);

  function set<K extends keyof ApplicationInput>(key: K, value: ApplicationInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit() {
    if (!form.company.trim() || !form.roleTitle.trim()) {
      toast.error("Company and role are required.");
      return;
    }
    startTransition(async () => {
      try {
        if (mode === "edit" && editId) {
          await updateApplication(editId, form);
          toast.success(`Updated ${form.company}`);
        } else {
          await createApplication(form);
          toast.success(`Added ${form.company}`);
        }
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  const busy = pending || loading;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        showCloseButton={!busy}
        className="w-full gap-0 p-0 sm:max-w-md md:max-w-lg"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      >
        <SheetHeader className="border-b border-hairline px-5 py-4">
          <SheetTitle className="text-base">
            {mode === "edit" ? "Edit application" : "New application"}
          </SheetTitle>
          <SheetDescription className="text-xs text-ink-3">
            {mode === "edit"
              ? "Update the details and log the change."
              : "Company and role are all you need — the rest is optional."}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center text-ink-3">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            <Field label="Company" required>
              <Input
                value={form.company}
                onChange={(e) => set("company", e.target.value)}
                placeholder="e.g. WeFlow"
                autoFocus
              />
            </Field>
            <Field label="Role title" required>
              <Input
                value={form.roleTitle}
                onChange={(e) => set("roleTitle", e.target.value)}
                placeholder="e.g. Founder's Associate"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Source">
                <NativeSelect value={form.source} onChange={(v) => set("source", v)}>
                  {SOURCES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Status">
                <NativeSelect value={form.status} onChange={(v) => set("status", v)}>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Fit score" hint="0–100 · band auto-derived">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={form.fitScore ?? ""}
                    onChange={(e) =>
                      set("fitScore", e.target.value === "" ? null : Number(e.target.value))
                    }
                    placeholder="—"
                  />
                  <FitChip score={form.fitScore} />
                </div>
              </Field>
              <Field label="German">
                <NativeSelect value={form.germanReq} onChange={(v) => set("germanReq", v)}>
                  {(Object.keys(GERMAN_REQ_META) as GermanReq[]).map((k) => (
                    <option key={k} value={k}>
                      {GERMAN_REQ_META[k].label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Location">
                <Input
                  value={form.location ?? ""}
                  onChange={(e) => set("location", e.target.value)}
                  placeholder="Berlin / Remote"
                />
              </Field>
              <Field label="Work mode">
                <NativeSelect
                  value={form.workMode ?? ""}
                  onChange={(v) => set("workMode", v)}
                >
                  <option value="">—</option>
                  {WORK_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m[0].toUpperCase() + m.slice(1)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Seniority">
                <NativeSelect
                  value={form.seniority ?? ""}
                  onChange={(v) => set("seniority", v)}
                >
                  <option value="">—</option>
                  {SENIORITY.map((s) => (
                    <option key={s} value={s}>
                      {s[0].toUpperCase() + s.slice(1)}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Salary range">
                <Input
                  value={form.salaryRange ?? ""}
                  onChange={(e) => set("salaryRange", e.target.value)}
                  placeholder="€55–70k"
                />
              </Field>
            </div>

            <Field label="Apply URL">
              <Input
                value={form.applyUrl ?? ""}
                onChange={(e) => set("applyUrl", e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <Field label="Job description URL">
              <Input
                value={form.jdUrl ?? ""}
                onChange={(e) => set("jdUrl", e.target.value)}
                placeholder="https://…"
              />
            </Field>

            <div className="rounded-xl border border-hairline bg-white/[0.02] p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[13px] font-medium text-foreground">Kit ready</div>
                  <div className="text-[11px] text-ink-3">Cover + resume prepared, not yet sent</div>
                </div>
                <Switch
                  checked={form.isKitReady}
                  onCheckedChange={(c) => set("isKitReady", c)}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Resume variant">
                  <Input
                    list="resume-variants"
                    value={form.resumeVariant ?? ""}
                    onChange={(e) => set("resumeVariant", e.target.value)}
                    placeholder="AI-forward"
                  />
                  <datalist id="resume-variants">
                    <option value="AI-forward" />
                    <option value="EU-generalist" />
                  </datalist>
                </Field>
                <Field label="Cover used">
                  <Input
                    value={form.coverPath ?? ""}
                    onChange={(e) => set("coverPath", e.target.value)}
                    placeholder="covers/weflow.md"
                  />
                </Field>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Next action">
                <Input
                  value={form.nextAction ?? ""}
                  onChange={(e) => set("nextAction", e.target.value)}
                  placeholder="Submit application"
                />
              </Field>
              <Field label="Due">
                <Input
                  type="date"
                  value={form.nextActionDue ?? ""}
                  onChange={(e) => set("nextActionDue", e.target.value)}
                />
              </Field>
            </div>

            <Field label="Notes">
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => set("notes", e.target.value)}
                placeholder="Context, contacts, why this one matters…"
                rows={3}
              />
            </Field>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-hairline px-5 py-3.5">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy}
            className="gap-1.5 border-0 bg-[linear-gradient(135deg,#7c6bf5,#4e7df0)] font-semibold text-white shadow-[0_0_0_1px_rgba(155,140,255,0.35)] hover:brightness-110"
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            {mode === "edit" ? "Save changes" : "Add application"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function cleanPrefill(p: NewApplicationPrefill): Partial<ApplicationInput> {
  const out: Partial<ApplicationInput> = {};
  if (p.company) out.company = p.company;
  if (p.roleTitle) out.roleTitle = p.roleTitle;
  if (p.source) out.source = p.source;
  if (typeof p.fitScore === "number") out.fitScore = p.fitScore;
  if (p.germanReq) out.germanReq = p.germanReq;
  if (p.jdUrl) out.jdUrl = p.jdUrl;
  if (p.applyUrl) out.applyUrl = p.applyUrl;
  if (p.notes) out.notes = p.notes;
  if (p.status) out.status = p.status;
  if (p.scoutJobId) out.scoutJobId = p.scoutJobId;
  return out;
}
