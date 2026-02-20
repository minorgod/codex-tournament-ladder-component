import type { AuditEntry } from "@/models";

export function sortAudit(entries: AuditEntry[]): AuditEntry[] {
  return [...entries].sort((a, b) => a.at.localeCompare(b.at));
}

export function summarizeAudit(entry: AuditEntry): string {
  const actor = entry.actor?.name ?? entry.actor?.id ?? "system";
  return `${entry.at} • ${actor} • ${entry.summary}`;
}
