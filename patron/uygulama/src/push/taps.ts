// Bildirime dokununca ilgili ekran. iOS/Android'de dinleyici; web'de service worker pencereyi `?tesis=` ile açar,
// uygulama adresten okuyup aynı akıştan geçirir (`webTapFromUrl`). Yol bildirimin
// verisinden gelir ve `safeRoute`tan geçer: uygulamanın kendi ekranı değilse hiçbir yere gidilmez. Bulut tek tesislidir
// (tesis geçişi yok): bildirim başka tesise aitse (`data.tesisId` oturumunkinden farklı) yol AÇILMAZ.
// Telefonda dinleyici yalnız `NATIVE_PUSH` açıkken kurulur (`taps-native.ts`); kapalıyken native modüle dokunulmaz.
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { destekRozetiniTazele } from "../destek/gorunurluk";
import { isSupportRoute, safeRoute } from "../lib/notification-form";
import { okunduSonucu } from "../state/bildirim-okunmamis";
import { useSession } from "../state/session";
import { NATIVE_PUSH_ETKIN } from "./support";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const nativeTaps = (): typeof import("./taps-native") => require("./taps-native") as typeof import("./taps-native");

export interface TapDeps {
  readonly facilityId: string | null;
  push(route: string): void;
  /** Destek yanıtı bildirimi açıldı: rozet tazelenir (hata yutulur). */
  onSupport?(): void;
  /** Dokunulan bildirim okundu sayılır (yalnız kendi tesisi; hata yutulur). */
  onRead?(bildirimId: string): void;
}

/** Saf dokunuş akışı: güvenli yol → tesis aynı mı → yol. Açıldıysa true. */
export async function openNotification(data: unknown, d: TapDeps): Promise<boolean> {
  const v = (data ?? {}) as { rota?: unknown; tesisId?: unknown; bildirimId?: unknown };
  if (typeof v.tesisId === "string" && v.tesisId !== "" && v.tesisId !== d.facilityId) return false;
  if (typeof v.bildirimId === "string" && UUID.test(v.bildirimId)) d.onRead?.(v.bildirimId);
  const route = safeRoute(v.rota);
  if (!route) return false;
  d.push(route);
  if (isSupportRoute(route)) d.onSupport?.();
  return true;
}

/** Web: service worker'ın açtığı adresten dokunuş (`?tesis=` yoksa null). Yol `openNotification`da süzülür. */
export function webTapFromUrl(href: string): { rota: string; tesisId: string; bildirimId?: string } | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  const tesisId = u.searchParams.get("tesis");
  const bildirimId = u.searchParams.get("bildirim");
  if (!tesisId) return null;
  // `bildirim` kimliği okundu sayılır; biçimi `openNotification`da UUID ile süzülür.
  return bildirimId ? { rota: u.pathname, tesisId, bildirimId } : { rota: u.pathname, tesisId };
}

export function useNotificationTaps(enabled: boolean): void {
  const router = useRouter();
  const { facilityId, api } = useSession();
  // Oturum değişince dinleyici yeniden kurulmasın (son bildirim yeniden açılırdı): güncel değerler ref'te.
  const deps = useRef<TapDeps>({ facilityId, push: (r) => router.push(r as never), onSupport: () => void destekRozetiniTazele(api), onRead: (id) => void api.notificationRead(id).then(okunduSonucu, () => undefined) });
  deps.current = { facilityId, push: (r) => router.push(r as never), onSupport: () => void destekRozetiniTazele(api), onRead: (id) => void api.notificationRead(id).then(okunduSonucu, () => undefined) };
  useEffect(() => {
    if (!enabled || Platform.OS !== "web" || typeof window === "undefined") return;
    const tap = webTapFromUrl(window.location.href);
    if (!tap) return;
    window.history.replaceState(window.history.state, "", tap.rota);
    // Sayfa zaten o yolda: aynı yola `replace`; başka tesisin bildirimiyse panoya dönülür.
    const replace = (r: string) => router.replace(r as never);
    void openNotification(tap, { ...deps.current, push: replace }).then((ok) => {
      if (!ok) replace("/pano");
    });
  }, [enabled]);
  useEffect(() => {
    if (!enabled || Platform.OS === "web" || !NATIVE_PUSH_ETKIN) return;
    return nativeTaps().listenNativeTaps((data) => void openNotification(data, deps.current));
  }, [enabled]);
}
