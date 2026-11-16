import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { safeFormat } from "@/lib/format";
import { toastServerSuccess } from "@/lib/serverNotes";
import { workOrderService } from "../service";

/** Backend `WORK_ORDER_NOTE_MAX` aynası. */
const PLANNING_NOTE_MAX = 2000;

/**
 * "Planlama Notu" — planlamacının iş emrine kendi için düştüğü not (`GET/PUT /:id/note`).
 * Yalnız panelde görünür: istasyon, refakat kartı, etiket, tablet ve patron görmez
 * (ayrı tablo + ayrı uç). Yazma `workorder:write`; yoksa salt okunur. Kayıt yalnız
 * "Kaydet" ile gider — açılışta otomatik yazım yok.
 */
export function PlanningNoteCard({ workOrderId }: { workOrderId: string }) {
  const qc = useQueryClient();
  const { hasPermission } = useRoleAccess();
  const canWrite = hasPermission("workorder:write");
  const queryKey = ["work-order-note", workOrderId];
  const note = useQuery({ queryKey, queryFn: () => workOrderService.getNote(workOrderId), staleTime: 60_000 });
  const server = note.data?.data;
  const serverBody = server?.body ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? serverBody;
  const dirty = draft !== null && draft !== serverBody;
  const tooLong = text.length > PLANNING_NOTE_MAX;
  // v3 `.btn` kalıbında disabled görünümü yok — kapalı düğme etkin gibi durmasın.
  const saveDisabled = !dirty || tooLong;

  // Başka iş emrine geçilince taslak sıfırlanır.
  useEffect(() => setDraft(null), [workOrderId]);

  const save = useMutation({
    mutationFn: () => workOrderService.saveNote(workOrderId, text.trim() === "" ? null : text),
    onSuccess: (res) => {
      toastServerSuccess(res, "Planlama notu kaydedildi");
      qc.setQueryData(queryKey, res);
      setDraft(null);
    },
    // onError YOK: apiClient hatayı (2000 aşımı 400 dahil) zaten basar.
  });

  return (
    <div className="card" style={{ padding: "12px 14px" }} data-testid="planning-note">
      {note.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </div>
      ) : canWrite ? (
        <>
          <Textarea
            aria-label="Planlama notu"
            rows={4}
            maxLength={PLANNING_NOTE_MAX}
            placeholder="Kendiniz için not (ör. hangi siparişe öncelik, müşteriyle konuşulanlar)…"
            value={text}
            onChange={(e) => setDraft(e.target.value)}
            className="resize-y"
          />
          <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <span
              className="num"
              style={{ fontSize: "12px", color: tooLong ? "var(--bad)" : "var(--muted)" }}
              data-testid="planning-note-count"
            >
              {text.length}/{PLANNING_NOTE_MAX}
            </span>
            <span style={{ flex: 1 }} />
            {dirty && (
              <button type="button" className="btn sm" onClick={() => setDraft(null)} disabled={save.isPending}>
                Vazgeç
              </button>
            )}
            <button
              type="button"
              className="btn sm primary"
              disabled={saveDisabled || save.isPending}
              style={saveDisabled ? { opacity: 0.45, cursor: "not-allowed" } : undefined}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </>
      ) : (
        <div style={{ whiteSpace: "pre-wrap", fontSize: "13.5px", color: serverBody ? "var(--ink)" : "var(--muted)" }}>
          {serverBody || "Not yok."}
        </div>
      )}
      <NoteFooter updatedAt={server?.updatedAt ?? null} updatedBy={server?.updatedBy?.fullName ?? null} />
    </div>
  );
}

function NoteFooter({ updatedAt, updatedBy }: { updatedAt: string | null; updatedBy: string | null }) {
  return (
    <div style={{ marginTop: "8px", fontSize: "11.5px", color: "var(--muted)", lineHeight: 1.5 }}>
      {updatedAt && updatedBy && (
        <div data-testid="planning-note-meta">
          Son düzenleyen: {updatedBy} · {safeFormat(updatedAt, "dd.MM.yyyy HH:mm")}
        </div>
      )}
      <div>Bu not yalnız panelde görünür; istasyonlara, karta ve etikete çıkmaz.</div>
    </div>
  );
}
