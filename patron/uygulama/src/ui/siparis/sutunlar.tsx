// Siparişler listesinin sütunları (ekrandan taşındı 2026-11-18; test edilebilsin diye SAF tanım). Kullanıcı kararı
// 2026-11-18: listede HER sütun (başlık + hücre) sola dayalı; sayı sütunları tabular rakamla kalır. Durum hücresi
// tek kaynaktan (`./durum`) tonlu rozet. Her değer telin kendi alanıdır; burada hesap yok.
import type { ProjectionRecord } from "../../api/wire";
import { formatDate, formatNumber, kisaBelgeNo } from "../../lib/format";
import { Rozet } from "../ortak";
import type { SutunTanimi } from "../tablo/model";
import { siparisDurumu } from "./durum";
import { asObj, present, str, uretimMetni } from "./OrderRow";

const k = (r: ProjectionRecord) => asObj(r.kayit);
const sayi = (v: unknown, birim = "") => (present(v) ? `${formatNumber(v, 0)}${birim}` : "—");
const YON: Readonly<Record<string, string>> = { DOMESTIC: "Yurtiçi", EXPORT: "İhracat" };

/** Durum hücresi: kısa etiketli hafif zeminli rozet (tam ad erişilebilirlik etiketinde); dar sütunda yazı kesilir. */
function DurumHucresi({ durum }: { durum: unknown }) {
  const d = siparisDurumu(durum);
  return <Rozet label={d.kisa} tone={d.ton} accessibilityLabel={`Durum: ${d.label}`} />;
}

const TANIM: readonly SutunTanimi<ProjectionRecord>[] = [
  { key: "no", baslik: "No", ad: "Sipariş no", agirlik: 1.15, sirala: "siparisNo", hucre: (r) => kisaBelgeNo(str(k(r).siparisNo)) ?? "—" },
  // Müşteri adı kesilmez: geniş sütun + alt satıra kayar (en çok 3 satır).
  { key: "musteri", baslik: "Müşteri", agirlik: 1.5, satir: 3, sirala: "musteriAdi", hucre: (r) => str(k(r).musteriAdi) ?? "—" },
  { key: "tarih", baslik: "Tarih", ad: "Sipariş tarihi", agirlik: 1, sirala: "siparisTarihi", hucre: (r) => (str(k(r).siparisTarihi) ? formatDate(k(r).siparisTarihi) : "—") },
  // Sevk edilen / sipariş toplamı (m, brüt). Toplamı fabrika hesaplar (`toplamMiktar`); gelmiyorsa (eski fabrika) "—".
  {
    key: "sevkToplam", baslik: "Sevk / Toplam", ad: "Sevk / Toplam (m)", agirlik: 1.5, sayi: true, sirala: "sevkMiktari",
    hucre: (r) => (present(k(r).toplamMiktar) ? `${sayi(k(r).sevkMiktari)} / ${sayi(k(r).toplamMiktar)}` : "—"),
  },
  // Üretimde nerede (fabrika cümlesi; "Fasonda – <firma> · +1 yerde daha" uzun olabilir → 2 satır). Eski fabrika "—".
  { key: "uretim", baslik: "Üretim", ad: "Üretim durumu", agirlik: 1.6, satir: 2, hucre: (r) => uretimMetni(k(r)) },
  { key: "kalem", baslik: "Kalem", ad: "Kalem sayısı", agirlik: 0.7, sayi: true, sirala: "kalemSayisi", hucre: (r) => sayi(k(r).kalemSayisi) },
  { key: "yon", baslik: "Yön", agirlik: 0.9, hucre: (r) => YON[str(k(r).yon) ?? ""] ?? "—" },
  {
    key: "durum", baslik: "Durum", agirlik: 1.35, hucre: (r) => siparisDurumu(k(r).durum).label,
    ogeler: (r) => <DurumHucresi durum={k(r).durum} />,
  },
  // 2026-11-17 ek sütunlar (seçicide KAPALI): telin kendi alanları, biçimlenir — hesap yok. Sevk BRÜT (fabrika).
  { key: "acik", baslik: "Açık m", ad: "Açık miktar (m)", agirlik: 1.1, sayi: true, sirala: "acikMiktar", hucre: (r) => sayi(k(r).acikMiktar) },
  { key: "sevk", baslik: "Sevk m", ad: "Sevk edilen (m, brüt)", agirlik: 1.1, sayi: true, sirala: "sevkMiktari", hucre: (r) => sayi(k(r).sevkMiktari) },
  { key: "toplam", baslik: "Toplam m", ad: "Sipariş toplamı (m)", agirlik: 1.1, sayi: true, hucre: (r) => sayi(k(r).toplamMiktar) },
  // Termin düz tarih: gecikme vurgusu/rozeti YOK (kullanıcı kararı sürer).
  { key: "termin", baslik: "Termin", agirlik: 1, hucre: (r) => formatDate(k(r).termin) },
  { key: "tamam", baslik: "Tamamlanma", ad: "Tamamlanma tarihi", agirlik: 1.1, hucre: (r) => formatDate(k(r).tamamlanma) },
  { key: "iptal", baslik: "İptal", ad: "İptal tarihi", agirlik: 1, hucre: (r) => formatDate(k(r).iptalTarihi) },
  { key: "kayit", baslik: "Kayıt", ad: "Kayıt tarihi", agirlik: 1, hucre: (r) => formatDate(k(r).olusturulma) },
];

/** Hepsi sola dayalı: hiza burada TEK yerden verilir (yeni sütun da sola gelir). */
export const SIPARIS_SUTUNLARI: readonly SutunTanimi<ProjectionRecord>[] = TANIM.map((c) => ({ ...c, hiza: "sol" as const }));
