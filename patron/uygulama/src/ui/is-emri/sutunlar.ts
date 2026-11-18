// İş emirleri tablosunun sütunları ve `tablo.is-emri` tercihinin TEK temizleyicisi (liste ve Üretim sekmesi aynı tercihi
// tutar: liste sütunları + Üretim'in `suzgec.uretimKartlar` / `suzgec.istasyonSutunlar` seçimi). 2026-11-17 eklenenler
// (en · plan başlangıç/bitiş · kapanış · bütün müşteriler) seçicide KAPALI; hepsi telin kendi alanı, hesap yok.
import type { ProjectionRecord } from "../../api/wire";
import { formatDate, formatNumber } from "../../lib/format";
import { AZAMI_SUTUN, tercihiTemizle, type SutunTanimi, type TabloTercihi } from "../tablo/model";
import { asamaMetni, fasonFirmCell, isEmriNo, kumasMetni, meterCell, metre, musteriMetni, progressCell, siparisNolari, statusLabelOf, topMetni, typeLabel, type Kayit } from "./gorunum";

const k = (r: ProjectionRecord): Kayit => (typeof r.kayit === "object" && r.kayit !== null ? (r.kayit as Kayit) : {});
const tarih = (v: unknown): string => (typeof v === "string" && v ? formatDate(v) : "—");
const adlar = (v: unknown): string => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "").join(", ") : "") || "—";

export const IS_EMRI_SUTUNLARI: readonly SutunTanimi<ProjectionRecord>[] = [
  { key: "musteri", baslik: "Müşteri", agirlik: 1.35, sirala: "musteriAdi", hucre: (r) => musteriMetni(k(r)) },
  { key: "kumas", baslik: "Kumaş", ad: "Kumaş / renk", agirlik: 1.45, sirala: "urunAdi", hucre: (r) => kumasMetni(k(r)) },
  { key: "top", baslik: "Top", agirlik: 0.55, sayi: true, sirala: "topSayisi", hucre: (r) => topMetni(k(r)) },
  { key: "asama", baslik: "Aşama", agirlik: 0.95, hucre: (r) => asamaMetni(k(r)) },
  { key: "no", baslik: "No", ad: "İş emri no", agirlik: 1.3, kirpilmaz: 12, sirala: "isEmriNo", hucre: (r) => isEmriNo(k(r)) },
  { key: "metre", baslik: "Metre", agirlik: 0.9, sayi: true, sirala: "metre", hucre: (r) => { const m = metre(k(r)); return m === null ? "—" : formatNumber(m, 0); } },
  { key: "siparis", baslik: "Sipariş", ad: "Sipariş no", agirlik: 1.3, kirpilmaz: 13, hucre: (r) => siparisNolari(k(r)).join(", ") || "—" },
  { key: "tarih", baslik: "Açılış", ad: "Açılış tarihi", agirlik: 0.9, sirala: "olusturulma", hucre: (r) => tarih(k(r).olusturulma) },
  // Panel eşliği (2026-11-16): panel sütunlarından buluta zaten gelenler; sıralama beyanı yok → sıralanmaz.
  { key: "fason", baslik: "Fason", ad: "Fason firması", agirlik: 1.3, hucre: (r) => fasonFirmCell(k(r)) },
  { key: "ilerleme", baslik: "Üretilen / giren", ad: "İlerleme (üretilen / giren m)", agirlik: 1.4, sayi: true, hucre: (r) => progressCell(k(r)) },
  { key: "siparisMetre", baslik: "Sipariş m", ad: "Sipariş metresi", agirlik: 0.9, sayi: true, hucre: (r) => meterCell(k(r).siparisMetre) },
  { key: "hedef", baslik: "Hedef m", ad: "Hedef metre", agirlik: 0.9, sayi: true, hucre: (r) => meterCell(k(r).hedefMiktar) },
  { key: "tur", baslik: "Tür", agirlik: 1.1, hucre: (r) => typeLabel(k(r)) },
  { key: "durum", baslik: "Durum", agirlik: 0.9, hucre: (r) => statusLabelOf(k(r)) },
  // 2026-11-17 eklenenler (KAPALI gelir).
  { key: "en", baslik: "En", ad: "En (cm)", agirlik: 0.6, sayi: true, hucre: (r) => meterCell(k(r).en) },
  { key: "planBaslangic", baslik: "Plan baş.", ad: "Plan başlangıç", agirlik: 0.9, hucre: (r) => tarih(k(r).planBaslangic) },
  { key: "planBitis", baslik: "Plan bitiş", agirlik: 0.9, hucre: (r) => tarih(k(r).planBitis) },
  { key: "kapanis", baslik: "Kapanış", ad: "Kapanış tarihi", agirlik: 0.9, hucre: (r) => tarih(k(r).kapanisTarihi) },
  { key: "musteriler", baslik: "Müşteriler", ad: "Bütün müşteriler", agirlik: 1.6, satir: 2, hucre: (r) => adlar(k(r).musteriAdlari) },
];

export const IS_EMRI_VARSAYILAN_SUTUN: readonly string[] = ["musteri", "kumas", "top", "asama"];

export const IS_EMRI_TABLO_AYARI = {
  projeksiyon: "is-emri",
  anahtar: "tablo.is-emri",
  sutunlar: IS_EMRI_SUTUNLARI,
  varsayilan: IS_EMRI_VARSAYILAN_SUTUN,
  aramaIpucu: "No, müşteri ya da sipariş",
  // Açık/kapanan sekmede seçilir; süzgeç sayfasında çizilmez.
  haricAlanlar: ["acik"],
  testID: "is-emri",
} as const;

const VARSAYILAN: TabloTercihi = { surum: 1, sutunlar: IS_EMRI_VARSAYILAN_SUTUN, siralama: null, suzgec: {} };
const ANAHTARLAR = IS_EMRI_SUTUNLARI.map((c) => c.key);
/** `useVeriTablosu`nun bu tablo için kurduğu temizleyiciyle AYNI (Üretim, liste sütunlarını bozmadan kendi alanını yazar). */
export const isEmriTemizle = (ham: unknown): TabloTercihi => tercihiTemizle(ham, { varsayilan: VARSAYILAN, sutunlar: ANAHTARLAR, azami: AZAMI_SUTUN });
