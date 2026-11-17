import { useCallback, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTabsStore } from "@/store/tabs";
import { badgeText, panelRouteFor } from "./inbox-model";
import { InboxList } from "./InboxList";
import { notificationInboxService } from "./service";
import type { InboxItem } from "./types";
import { useDesktopNotices } from "./useDesktopNotices";
import { useNotificationInbox } from "./useNotificationInbox";

function EmptyState({ icon: Icon, text }: { icon: typeof Bell; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <Icon className="h-6 w-6 text-muted-foreground/60" aria-hidden />
      <p className="text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

/** Liste boşken hangi boş durum: atanmış türü olmayan kişi ile "henüz bildirim yok" ayrılır. */
function useNoAssignment(active: boolean): boolean {
  const { data } = useQuery({
    queryKey: ["bildirim-tercihlerim"],
    queryFn: () => notificationInboxService.preferences().then((r) => r.data),
    enabled: active,
    staleTime: 60_000,
  });
  return data !== undefined && data.items.length === 0;
}

type Inbox = ReturnType<typeof useNotificationInbox>;

/** Açılır panelin gövdesi: alınamıyor · yükleniyor · şalter kapalı · atamasız/boş · liste. */
function InboxBody({ inbox, showList, noAssignment, onOpen }: { inbox: Inbox; showList: boolean; noAssignment: boolean; onOpen: (item: InboxItem) => void }): ReactNode {
  if (inbox.unavailable) return <EmptyState icon={BellOff} text="Bildirimler şu an alınamıyor." />;
  if (!inbox.loaded) return <EmptyState icon={Bell} text="Yükleniyor…" />;
  if (!inbox.enabled) return <EmptyState icon={BellOff} text="Bildirimler şu an kapalı." />;
  if (!showList) {
    const text = noAssignment ? "Size atanmış bildirim yok. Yöneticiniz atadığında burada görünür." : "Henüz bildiriminiz yok.";
    return <EmptyState icon={Bell} text={text} />;
  }
  return (
    <InboxList items={inbox.items} hasMore={inbox.hasMore} isFetchingMore={inbox.isFetchingMore} onLoadMore={inbox.fetchMore} onOpen={onOpen} />
  );
}

/**
 * Topbar bildirim zili (2.13.0 D3): kişiye teslim edilen bildirimler. Rozet okunmamış sayısı;
 * satıra tıklayınca okundu + ilgili kayıt yeni sekmede/odakta açılır. Yeni gelenler işletim
 * sistemi köşesinde de gösterilir (`useDesktopNotices`). Herkese çizilir (uç yalnız oturum ister).
 */
export function NotificationInboxBell() {
  const inbox = useNotificationInbox();
  const openTab = useTabsStore((s) => s.openTab);
  const [open, setOpen] = useState(false);
  const { markRead, trimToFirstPage } = inbox;

  const openItem = useCallback(
    (item: InboxItem) => {
      if (item.readAt === null) markRead(item.id);
      const route = panelRouteFor(item.kind, item.entityId, item.route);
      setOpen(false);
      trimToFirstPage();
      if (route) openTab(route);
    },
    [markRead, openTab, trimToFirstPage],
  );

  useDesktopNotices({
    userId: inbox.userId,
    firstPageItems: inbox.firstPageItems,
    enabled: inbox.enabled,
    onOpenItem: openItem,
    onOpenSummary: () => setOpen(true),
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) trimToFirstPage();
  };

  const showList = inbox.enabled && inbox.items.length > 0;
  const noAssignment = useNoAssignment(open && inbox.loaded && inbox.enabled && inbox.items.length === 0);
  const badge = inbox.enabled ? badgeText(inbox.unreadCount) : null;

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={badge ? `Bildirimler, ${inbox.unreadCount} okunmamış` : "Bildirimler"}
          title="Bildirimler"
        >
          <Bell className="h-4 w-4" />
          {badge && (
            <span
              data-testid="bildirim-rozeti"
              className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground"
            >
              {badge}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex min-h-11 items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Bildirimler</p>
          {showList && inbox.unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={inbox.markingAll} onClick={inbox.markAllRead}>
              <CheckCheck className="h-3.5 w-3.5" /> Tümünü okundu işaretle
            </Button>
          )}
        </div>
        <InboxBody inbox={inbox} showList={showList} noAssignment={noAssignment} onOpen={openItem} />
      </PopoverContent>
    </Popover>
  );
}
