// Fabrika kaynaklı bildirim tercihi (D5): telefondaki değişiklik ANINDA `POST /bildirim/fabrika-tercih` olur (Kaydet
// beklemez). İstek yoldayken satır istenen değeri "kaydediliyor" gösterir; bulut kabul edince yanıttaki görünüm alınır
// (`bekliyor: true`), fabrika işleyene dek ~10 sn'de bir ayar yeniden okunur. Ret iki yoldan eski hâle döner: bulut
// reddederse (403/409/ağ) bindirme kalkar; fabrika reddederse gerçek aynayı yeniden yollar ve satır onu gösterir.
// Son söz fabrikadadır; uygulama hiçbir durumu kendisi kesinleştirmez.
import { useCallback, useEffect, useRef, useState } from "react";
import type { FactoryNotificationPrefs, FactoryPreferenceChange, NotificationSettingsView } from "../api/wire";
import { withPending } from "../lib/notification-topics";
import { useSession } from "../state/session";
import { useWrite } from "./useWrite";

export const FACTORY_PREF_POLL_MS = 10_000;

export function useFactoryPrefs(view: NotificationSettingsView | null, adopt: (v: NotificationSettingsView) => void, reload: () => void) {
  const { api } = useSession();
  const changes = useRef<readonly FactoryPreferenceChange[]>([]);
  const [pending, setPending] = useState<Readonly<Record<string, boolean>>>({});
  const write = useWrite(useCallback(() => api.notificationFactoryPrefs(changes.current), [api]));
  const change = useCallback(
    async (list: FactoryPreferenceChange[]) => {
      if (list.length === 0) return;
      changes.current = list;
      setPending(Object.fromEntries(list.map((c) => [c.tur, c.kapali])));
      const v = await write.run(JSON.stringify(list));
      setPending({});
      if (v) adopt(v);
    },
    [write, adopt],
  );
  const waiting = view?.fabrika?.turler.some((t) => t.bekliyor) === true;
  useEffect(() => {
    if (!waiting) return;
    const id = setInterval(reload, FACTORY_PREF_POLL_MS);
    return () => clearInterval(id);
  }, [waiting, reload]);
  const factory: FactoryNotificationPrefs | null = withPending(view?.fabrika, pending);
  return { factory, change, busy: write.busy, error: write.error };
}
