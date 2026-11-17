import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { AutoLoadMore } from "@/components/data-table/AutoLoadMore";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
import { cn } from "@/lib/utils";
import { bodyWithoutAuthor, groupByDay } from "./inbox-model";
import type { InboxItem } from "./types";

interface Props {
  items: InboxItem[];
  hasMore: boolean;
  isFetchingMore: boolean;
  onLoadMore: () => void;
  onOpen: (item: InboxItem) => void;
}

/** Bildirim geçmişi: "Bugün / Daha önce" başlıkları, okunmamış nokta + vurgu, kaydırınca otomatik yükleme. */
export function InboxList({ items, hasMore, isFetchingMore, onLoadMore, onOpen }: Props) {
  const { rootRef, sentinelRef } = useInfiniteScroll({ hasMore, isLoading: isFetchingMore, onLoadMore, rootMargin: "120px" });
  const groups = groupByDay(items, new Date());

  return (
    <div ref={rootRef} className="max-h-[26rem] overflow-y-auto">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label}>
          <h3 className="sticky top-0 z-10 bg-popover/95 px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">
            {g.label}
          </h3>
          <ul className="divide-y divide-border/60">
            {g.items.map((it) => {
              const unread = it.readAt === null;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(it)}
                    data-unread={unread || undefined}
                    className={cn(
                      "flex w-full gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      unread && "bg-primary/5",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", unread ? "bg-primary" : "bg-transparent")}
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate text-sm", unread ? "font-semibold" : "font-medium text-foreground/90")}>
                        {it.title}
                      </span>
                      {/* `block` YOK: line-clamp kendi display'ini kurar; `block` onu ezip kırpmayı bozuyordu. */}
                      <span className="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground" title={it.body}>
                        {bodyWithoutAuthor(it.body, it.authorName)}
                      </span>
                      <span className="mt-1 block text-[11px] text-muted-foreground/80">
                        {it.authorName} · {formatDistanceToNow(new Date(it.createdAt), { addSuffix: true, locale: tr })}
                      </span>
                    </span>
                    {unread && <span className="sr-only">Okunmadı</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <AutoLoadMore ref={sentinelRef} hasMore={hasMore} isFetchingMore={isFetchingMore} count={items.length} className="py-2" />
    </div>
  );
}
