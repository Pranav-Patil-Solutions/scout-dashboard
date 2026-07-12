"use client";

import { Pencil } from "lucide-react";
import { openEditApplication } from "@/lib/ui-events";

export function EditButton({ appId }: { appId: string }) {
  return (
    <button
      type="button"
      onClick={() => openEditApplication(appId)}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-hairline px-3 text-sm font-medium text-ink-2 transition-colors hover:border-white/15 hover:text-foreground"
    >
      <Pencil className="size-3.5" /> Edit
    </button>
  );
}
