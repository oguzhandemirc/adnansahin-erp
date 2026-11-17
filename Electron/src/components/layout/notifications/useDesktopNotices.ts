import { useEffect, useRef } from "react";
import { deliveryIdFromTag, desktopTag, pickDesktopNotices } from "./inbox-model";
import type { InboxItem } from "./types";

interface Options {
  userId: string | null;
  /** Yoklanan ilk sayfa; null = henüz yüklenmedi. */
  firstPageItems: readonly InboxItem[] | null;
  /** Üretim şalteri; kapalıyken köşe bildirimi yok. */
  enabled: boolean;
  /** Tek bildirimin köşe bildirimine tıklandı. */
  onOpenItem: (item: InboxItem) => void;
  /** Özet köşe bildirimine tıklandı. */
  onOpenSummary: () => void;
}

function desktopApi() {
  return typeof window !== "undefined" ? window.api?.desktopNotification : undefined;
}

/**
 * Yeni gelen bildirimleri işletim sistemi köşesinde gösterir (yalnız masaüstü uygulaması; web
 * panelinde `window.api` yok → hiçbir şey yapmaz). Karar `pickDesktopNotices`te: ilk yükleme
 * yağmursuz, her teslim bir kez, kalabalıkta tek özet. Tıklanınca main pencereyi öne getirir.
 */
export function useDesktopNotices({ userId, firstPageItems, enabled, onOpenItem, onOpenSummary }: Options): void {
  const seenRef = useRef<Set<string> | null>(null);
  const shownRef = useRef(new Map<string, InboxItem>());
  const handlersRef = useRef({ onOpenItem, onOpenSummary });
  handlersRef.current = { onOpenItem, onOpenSummary };

  // Oturum değişince görülenler sıfırlanır: yeni kişinin ilk yüklemesi yine yağmursuzdur.
  useEffect(() => {
    seenRef.current = null;
    shownRef.current.clear();
  }, [userId]);

  useEffect(() => {
    if (!firstPageItems) return;
    const { notices, seen } = pickDesktopNotices(seenRef.current, firstPageItems, enabled);
    seenRef.current = seen;
    const api = desktopApi();
    if (!api) return;
    for (const n of notices) {
      if (n.type === "single") shownRef.current.set(n.item.id, n.item);
      const opts =
        n.type === "single"
          ? { title: n.item.title, body: n.item.body, tag: desktopTag(n) }
          : { title: `${n.count} yeni bildirim`, body: "Görmek için tıklayın.", tag: desktopTag(n) };
      void api.show(opts).catch(() => undefined);
    }
  }, [firstPageItems, enabled]);

  useEffect(() => {
    const api = desktopApi();
    if (!api) return;
    return api.onClicked((tag) => {
      const id = deliveryIdFromTag(tag);
      const item = id ? shownRef.current.get(id) : undefined;
      if (item) handlersRef.current.onOpenItem(item);
      else handlersRef.current.onOpenSummary();
    });
  }, []);
}
