// Gönderdiklerim satırı (tek satır ListeSatiri): içerik özeti · tür + yaş (+ gönderen). Kayıt onay beklemez: işlenen
// kayıtta rozet YOK; yalnız hata alan kayıt "Hata" rozeti ve ikincil satırda ret nedeniyle öne çıkar.
import type { InboxItem } from "../../api/wire";
import { formatAgo } from "../../lib/format";
import { resultText } from "../../lib/inbox";
import { inboxKind } from "../../lib/labels/diger";
import { ListeSatiri, Rozet } from "../ortak";
import { DOMAIN_TONE } from "../tokens";
import { inboxOverdue, inboxPending, inboxSummary } from "./inbox-format";

export function inboxRowText(m: InboxItem, showAuthor = false) {
  const kind = inboxKind(m.tur);
  const red = m.durum === "REDDEDILDI";
  const neden = red ? (resultText(m.sonuc) ?? "Fabrika bu kaydı kabul etmedi") : null;
  const ikincil = neden ?? [kind.ad, showAuthor ? m.hesapAdi : null, formatAgo(m.olusturulma)].filter(Boolean).join(" · ");
  const rozet = red ? { label: "Hata", tone: "danger" as const }
    : m.durum === "IPTAL" ? { label: "İptal", tone: "soft" as const }
    : inboxPending(m.durum) ? { label: "Sırada", tone: inboxOverdue(m) ? ("warning" as const) : ("soft" as const) }
    : null;
  return { kind, birincil: inboxSummary(m), ikincil, rozet, neden };
}

export function InboxRow({ m, onPress, showAuthor, ayrac, okunmamis = false }: { readonly m: InboxItem; readonly onPress: () => void; readonly showAuthor?: boolean; readonly ayrac?: boolean; readonly okunmamis?: boolean }) {
  const x = inboxRowText(m, showAuthor);
  // Açılmamış ret "Yeni hata" der (okunmamış rozetinin kaynağı); açılınca "Hata"ya döner.
  const rozet = x.rozet && okunmamis ? { ...x.rozet, label: "Yeni hata" } : x.rozet;
  return (
    <ListeSatiri
      birincil={x.birincil}
      ikincil={x.ikincil}
      icon={x.kind.icon}
      ton={x.neden ? "danger" : DOMAIN_TONE[x.kind.domain]}
      rozet={rozet ? <Rozet label={rozet.label} tone={rozet.tone} testID={okunmamis ? `mesaj-yeni-${m.mesajId}` : undefined} /> : undefined}
      ayrac={ayrac}
      onPress={onPress}
      testID={`mesaj-${m.mesajId}`}
      accessibilityLabel={[x.kind.ad, x.birincil, rozet?.label, x.neden ? `Neden: ${x.neden}` : null, formatAgo(m.olusturulma)].filter(Boolean).join(", ")}
    />
  );
}
