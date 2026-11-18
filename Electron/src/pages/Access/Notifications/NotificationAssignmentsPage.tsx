import { BellRing } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageShell, PageBody, PageFooter } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { SubjectList } from "./SubjectList";
import { KindTopicList } from "./KindTopicList";
import { PreferencePermissionToggle } from "./PreferencePermissionToggle";
import { DailySummaryTimeField } from "./DailySummaryTimeField";
import { NotificationSwitchCard } from "./NotificationSwitchCard";
import { useNotificationAssignments } from "./useNotificationAssignments";

/** Yetkilendirme › Bildirim Atamaları: solda kişi/şablon, sağda konu başlıklı tür listesi (`bildirim:yonet`). */
export function NotificationAssignmentsPage() {
  const m = useNotificationAssignments();
  const { subject, detail } = m;

  return (
    <PageShell>
      <PageHeader
        title="Bildirim Atamaları"
        description="Kim hangi bildirimi alır — kişiye ya da rol şablonuna atanır."
        actions={<DailySummaryTimeField />}
      />
      <PageBody className="flex min-h-0 flex-col gap-4 p-6">
        <NotificationSwitchCard />
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(240px,320px)_1fr] gap-6">
          <SubjectList
            users={m.users.data?.data.items}
            templates={m.templates.data?.data.items}
            loading={m.users.isLoading || m.templates.isLoading}
            selected={subject}
            onSelect={m.setSubject}
          />
          <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
            {!subject && (
              <EmptyState
                icon={BellRing}
                title="Soldan bir kişi ya da rol şablonu seçin"
                description="Seçtiğinizin alacağı bildirimler burada konu başlıklarıyla listelenir."
              />
            )}
            {subject && detail.isLoading && <Skeleton className="h-64 w-full" />}
            {subject && detail.data && (
              <>
                <h2 className="text-base font-semibold">{detail.data.title}</h2>
                {subject.type === "user" && m.userItem && !m.userItem.isSystemAccount && (
                  <PreferencePermissionToggle
                    userId={subject.id}
                    canChangePreference={detail.data.canChangePreference}
                    onChanged={m.refresh}
                  />
                )}
                <KindTopicList
                  sections={m.sections}
                  selected={m.selected}
                  disabled={m.save.isPending}
                  onToggleKind={m.onToggleKind}
                  onToggleTopic={m.onToggleTopic}
                />
              </>
            )}
          </div>
        </div>
      </PageBody>
      {subject && detail.data && (
        <PageFooter>
          <Button variant="outline" disabled={!m.dirty || m.save.isPending} onClick={m.reset}>
            Vazgeç
          </Button>
          <Button disabled={!m.dirty || m.save.isPending} onClick={() => m.save.mutate()}>
            Kaydet
          </Button>
        </PageFooter>
      )}
    </PageShell>
  );
}
