/**
 * Tiny client event bus for global UI actions (the add/edit sheet, command menu).
 * The AddSheet (Phase 2) and CommandMenu (Phase 6) subscribe; buttons + keyboard
 * shortcuts dispatch. Keeps the shell decoupled from feature components.
 */

export type NewApplicationPrefill = {
  company?: string;
  roleTitle?: string;
  source?: string;
  fitScore?: number;
  germanReq?: string;
  jdUrl?: string;
  applyUrl?: string;
  notes?: string;
  status?: string;
  scoutJobId?: string;
};

export const SCOUT_EVENTS = {
  newApplication: "scout:new-application",
  editApplication: "scout:edit-application",
  openSearch: "scout:open-search",
} as const;

export function openNewApplication(prefill?: NewApplicationPrefill) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SCOUT_EVENTS.newApplication, { detail: prefill ?? {} }),
  );
}

export function openEditApplication(id: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SCOUT_EVENTS.editApplication, { detail: { id } }),
  );
}

export function openSearch() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SCOUT_EVENTS.openSearch));
}
