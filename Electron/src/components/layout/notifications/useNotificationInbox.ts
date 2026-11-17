import { useCallback } from "react";
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { useAuthStore } from "@/store/auth";
import { notificationInboxService } from "./service";
import type { InboxItem, InboxPage } from "./types";

export const INBOX_QUERY_KEY = "bildirim-gelen-kutusu";
/** Yoklama aralığı (plan: 15 sn). Pencere odakta değilken de sürer — köşe bildirimi bunun için var. */
export const INBOX_POLL_MS = 15_000;

type InboxData = InfiniteData<InboxPage, string | null>;

/** Uç bu sunucuda yok (2.13.0 öncesi backend) → yoklama durur, zil sessiz kalır. */
export function isMissingEndpoint(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 404;
}

function patchItems(data: InboxData | undefined, fn: (it: InboxItem) => InboxItem, unread: (n: number) => number): InboxData | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((p) => ({ ...p, unreadCount: Math.max(0, unread(p.unreadCount)), items: p.items.map(fn) })),
  };
}

/**
 * Kişinin gelen kutusu: ilk sayfa 15 sn'de bir yoklanır (rozet + köşe bildirimi), sonraki sayfalar
 * liste kaydırıldıkça çekilir. Okundu işaretleri önbelleği hemen günceller (rozet beklemeden düşer).
 */
export function useNotificationInbox() {
  const userId = useAuthStore((s) => s.user?.userId ?? null);
  const qc = useQueryClient();
  const key = [INBOX_QUERY_KEY, userId] as const;

  const query = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => notificationInboxService.list(pageParam).then((r) => r.data),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasMore && last.nextCursor ? last.nextCursor : undefined),
    enabled: userId !== null,
    refetchInterval: (q) => (isMissingEndpoint(q.state.error) ? false : INBOX_POLL_MS),
    refetchIntervalInBackground: true,
    retry: false,
    staleTime: 10_000,
  });

  const firstPage = query.data?.pages[0];
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  const markRead = useMutation({
    mutationFn: (id: string) => notificationInboxService.markRead(id),
    onMutate: (id) => {
      const now = new Date().toISOString();
      const wasUnread = items.some((it) => it.id === id && it.readAt === null);
      qc.setQueryData<InboxData>(key, (d) =>
        patchItems(d, (it) => (it.id === id && it.readAt === null ? { ...it, readAt: now } : it), (n) => (wasUnread ? n - 1 : n)),
      );
    },
    onSuccess: (res) => qc.setQueryData<InboxData>(key, (d) => patchItems(d, (it) => it, () => res.data.unreadCount)),
    // onError YOK: apiClient hatayı zaten toast'lar; sonraki yoklama gerçeği getirir.
  });

  const markAllRead = useMutation({
    mutationFn: () => notificationInboxService.markAllRead(),
    onSuccess: () => {
      const now = new Date().toISOString();
      qc.setQueryData<InboxData>(key, (d) => patchItems(d, (it) => (it.readAt ? it : { ...it, readAt: now }), () => 0));
    },
    // onError YOK: apiClient hatayı zaten toast'lar.
  });

  /** Liste kapanınca yalnız ilk sayfa kalır: yoklama her seferinde bütün sayfaları yeniden çekmesin. */
  const trimToFirstPage = useCallback(() => {
    qc.setQueryData<InboxData>([INBOX_QUERY_KEY, userId], (d) =>
      d && d.pages.length > 1 ? { pages: d.pages.slice(0, 1), pageParams: d.pageParams.slice(0, 1) } : d,
    );
  }, [qc, userId]);

  return {
    userId,
    items,
    firstPageItems: firstPage?.items ?? null,
    unreadCount: firstPage?.unreadCount ?? 0,
    enabled: firstPage?.enabled ?? false,
    loaded: firstPage !== undefined,
    unavailable: isMissingEndpoint(query.error) || (query.isError && !firstPage),
    isLoading: query.isLoading,
    hasMore: query.hasNextPage,
    isFetchingMore: query.isFetchingNextPage,
    fetchMore: () => void query.fetchNextPage(),
    markRead: (id: string) => markRead.mutate(id),
    markAllRead: () => markAllRead.mutate(),
    markingAll: markAllRead.isPending,
    trimToFirstPage,
  };
}
