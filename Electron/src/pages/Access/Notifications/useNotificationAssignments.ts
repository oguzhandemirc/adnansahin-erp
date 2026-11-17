import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { notificationAssignmentService as svc } from "./service";
import { groupByTopic, initialSelection, isDirty, payloadKinds, toggleKind, toggleTopic, type TopicSection } from "./model";
import type { AssignmentKindRow, Subject } from "./types";

export const NOTIFICATION_ASSIGNMENTS_QK = "notification-assignments";
const QK = NOTIFICATION_ASSIGNMENTS_QK;

/** Bildirim Atamaları sayfasının veri + seçim durumu (sayfa yalnız yerleşim çizer). */
export function useNotificationAssignments() {
  const qc = useQueryClient();
  const [subject, setSubject] = useState<Subject | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const catalog = useQuery({ queryKey: [QK, "catalog"], queryFn: svc.catalog, staleTime: 5 * 60 * 1000 });
  const users = useQuery({ queryKey: [QK, "users"], queryFn: svc.users });
  const templates = useQuery({ queryKey: [QK, "templates"], queryFn: svc.templates });
  const detail = useQuery({
    queryKey: [QK, "detail", subject?.type, subject?.id],
    enabled: !!subject,
    queryFn: async () => {
      if (!subject) return null;
      if (subject.type === "user") {
        const r = await svc.userAssignments(subject.id);
        return { title: r.data.user.fullName || r.data.user.username, rows: r.data.kinds, canChangePreference: r.data.canChangePreference };
      }
      const r = await svc.templateAssignments(subject.id);
      return { title: r.data.template.name, rows: r.data.kinds, canChangePreference: false };
    },
  });
  const rows: AssignmentKindRow[] = useMemo(() => detail.data?.rows ?? [], [detail.data]);
  useEffect(() => setSelected(initialSelection(rows)), [rows]);
  const sections = useMemo(() => groupByTopic(catalog.data?.data.topics ?? [], rows), [catalog.data, rows]);
  const userItem = subject?.type === "user" ? users.data?.data.items.find((u) => u.id === subject.id) : undefined;

  const save = useMutation({
    mutationFn: async () => {
      if (!subject) return;
      const kinds = payloadKinds(rows, selected);
      if (subject.type === "user") await svc.setUserAssignments(subject.id, kinds);
      else await svc.setTemplateAssignments(subject.id, kinds);
    },
    onSuccess: () => {
      if (subject?.type === "template") {
        toast.success("Şablonun bildirimleri kaydedildi.", { description: "Mevcut kişiler etkilenmez; şablon kişiye uygulandığında kopyalanır." });
      } else {
        toast.success("Bildirim atamaları kaydedildi.");
      }
      void qc.invalidateQueries({ queryKey: [QK] });
    },
  });

  return {
    subject,
    setSubject,
    selected,
    users,
    templates,
    detail,
    sections,
    userItem,
    save,
    dirty: isDirty(rows, selected),
    refresh: () => void qc.invalidateQueries({ queryKey: [QK] }),
    reset: () => setSelected(initialSelection(rows)),
    onToggleKind: (kind: string, on: boolean) => {
      const row = rows.find((r) => r.kind === kind);
      if (row) setSelected((s) => toggleKind(s, row, on));
    },
    onToggleTopic: (section: TopicSection, on: boolean) => setSelected((s) => toggleTopic(s, section, on)),
  };
}
