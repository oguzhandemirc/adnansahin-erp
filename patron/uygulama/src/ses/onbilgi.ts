// Mikrofon ön açıklaması (2026-11-18, mağaza kuralı): mikrofon izni İSTENMEDEN önce, mikrofona ("Sesle söyle") ilk dokunuşta bir
// kez kısa açıklama gösterilir. "Devam" denince bu cihazda bir daha gösterilmez (düz depo, cihaz kapsamlı — çıkışta
// silinmez); "Vazgeç"te bayrak yazılmaz, izin istenmez, bir sonraki dokunuşta yine gösterilir. İzin ancak "Devam"
// sonrası yerinde dinleme başlarken (`tanima.ts` `baslat`) istenir. Depo hatası yutulur → açıklama yeniden gösterilir.
import { plainStore, type KeyValue } from "../state/store";

export const ONBILGI_ANAHTARI = "ses-onbilgi-goruldu";

export const ONBILGI_METNI =
  "Konuşmanız telefonunuzun konuşma tanıma hizmetiyle (Android'de Google, iPhone'da Apple) yazıya çevrilir; ses bu hizmete gönderilebilir. Uygulama ses kaydı tutmaz.";

export async function onbilgiGoruldu(store: KeyValue = plainStore): Promise<boolean> {
  try {
    return (await store.get(ONBILGI_ANAHTARI)) === "1";
  } catch {
    return false;
  }
}

export function onbilgiIsaretle(store: KeyValue = plainStore): void {
  void store.set(ONBILGI_ANAHTARI, "1").catch(() => undefined);
}
