import { useMemo, useState } from "react";
import { Layers, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { foldedIncludes } from "@/lib/search-fold";
import { cn } from "@/lib/utils";
import type { NotificationTemplate, NotificationUser, Subject } from "./types";

interface Props {
  users: NotificationUser[] | undefined;
  templates: NotificationTemplate[] | undefined;
  loading: boolean;
  selected: Subject | null;
  onSelect: (s: Subject) => void;
}

type Mode = Subject["type"];

/** Sol sütun: kişi / şablon seçimi — doğrudan tıklanır liste (combobox yok). */
export function SubjectList({ users, templates, loading, selected, onSelect }: Props) {
  const [mode, setMode] = useState<Mode>("user");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const list =
      mode === "user"
        ? (users ?? []).map((u) => ({ id: u.id, title: u.fullName || u.username, sub: u.username, count: u.assignedCount, muted: false }))
        : (templates ?? []).map((t) => ({ id: t.id, title: t.name, sub: t.isActive ? "" : "Pasif", count: t.assignedCount, muted: !t.isActive }));
    return search ? list.filter((r) => foldedIncludes(r.title, search) || foldedIncludes(r.sub, search)) : list;
  }, [mode, users, templates, search]);

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="grid grid-cols-2 gap-1 rounded-md border p-1" role="tablist" aria-label="Seçim türü">
        {(["user", "template"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded px-2 py-1.5 text-sm",
              mode === m ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent/40",
            )}
          >
            {m === "user" ? <UserRound className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
            {m === "user" ? "Kişiler" : "Rol şablonları"}
          </button>
        ))}
      </div>
      <Input placeholder="Ara…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Listede ara" />
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
        {loading && Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-11 w-full" />)}
        {!loading && rows.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">Kayıt yok.</p>}
        {rows.map((r) => {
          const active = selected?.type === mode && selected.id === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onSelect({ type: mode, id: r.id })}
              aria-current={active ? "true" : undefined}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors",
                active ? "border-primary bg-primary/5" : "border-transparent hover:bg-accent/40",
                r.muted && "opacity-60",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{r.title}</span>
                {r.sub && <span className="block truncate text-xs text-muted-foreground">{r.sub}</span>}
              </span>
              <Badge variant="secondary" title="Atanmış bildirim sayısı">{r.count}</Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}
