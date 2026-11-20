// Sevkiyat satırının sütunları (2026-11-19; cari ayrıntısı Sevkiyatlar sekmesi + Özet'teki son sevkiyatlar). SAF tanım,
// ortak tablonun (`tablo/VeriTablosu`) `SutunTanimi`; her sütun SOLA dayalı (ortak varsayılan). Her değer `sevkiyat`
// kaydının kendi alanıdır (fabrika hesaplar; sevk BRÜT): `sevkNo` · `cikisTarihi` (yoksa `olusturulma`) · `topSayisi` ·
// `toplamMetre` · `toplamKg` · `cuvalSayisi` · `durum`. Durum rozeti tek kaynaktan (`./durum`).
// No sütunu belge numarasının tamamını taşıyacak genişlikte (1.5 × 80 = 120 pt ≥ "SVK1811260003"): numara KIRPILMAZ.
import type { ProjectionRecord } from "../../api/wire";
import { formatDate, formatNumber } from "../../lib/format";
import { SHIPMENT_DESTINATION, SHIPMENT_STATUS, UNIT } from "../../lib/labels/uretim";
import { Rozet } from "../ortak";
import { qty } from "../pano/read";
import { asObj, present, str } from "../siparis/OrderRow";
import type { SutunTanimi } from "../tablo/model";
import { sevkDurumu } from "./durum";

const k = (r: ProjectionRecord) => asObj(r.kayit);
const sayi = (v: unknown, birim = "") => (present(v) ? `${formatNumber(v, 0)}${birim}` : "—");

function DurumHucresi({ durum }: { durum: unknown }) {
  const d = sevkDurumu(durum);
  return <Rozet label={d.label} tone={d.ton} accessibilityLabel={`Durum: ${d.label}`} />;
}

export const SEVKIYAT_SUTUNLARI: readonly SutunTanimi<ProjectionRecord>[] = [
  { key: "no", baslik: "Sevk no", agirlik: 1.5, kirpilmaz: 13, sirala: "sevkNo", hucre: (r) => str(k(r).sevkNo) ?? "—" },
  { key: "tarih", baslik: "Tarih", ad: "Sevk tarihi", agirlik: 1.1, sirala: "cikisTarihi", hucre: (r) => formatDate(str(k(r).cikisTarihi) ?? str(k(r).olusturulma)) },
  // Müşteri adı kesilmez: geniş sütun + alt satıra kayar (sipariş listesiyle aynı).
  { key: "musteri", baslik: "Müşteri", agirlik: 1.6, satir: 2, sirala: "musteriAdi", hucre: (r) => str(k(r).musteriAdi) ?? "—" },
  { key: "yon", baslik: "Tür", ad: "Sevk türü (yurtiçi/ihracat)", agirlik: 0.9, sirala: "yon", hucre: (r) => SHIPMENT_DESTINATION[str(k(r).yon) ?? ""] ?? "—" },
  { key: "top", baslik: "Top", ad: "Top sayısı (brüt)", agirlik: 0.7, sayi: true, sirala: "topSayisi", hucre: (r) => sayi(k(r).topSayisi) },
  { key: "metre", baslik: "Metre", ad: "Sevk (m, brüt)", agirlik: 1.1, sayi: true, sirala: "toplamMetre", hucre: (r) => (present(k(r).toplamMetre) ? `${qty(k(r).toplamMetre)} ${UNIT.metre}` : "—") },
  { key: "kg", baslik: "Kg", ad: "Toplam kg", agirlik: 0.9, sayi: true, sirala: "toplamKg", hucre: (r) => sayi(k(r).toplamKg) },
  { key: "cuval", baslik: "Çuval", ad: "Çuval sayısı", agirlik: 0.8, sayi: true, sirala: "cuvalSayisi", hucre: (r) => sayi(k(r).cuvalSayisi) },
  { key: "durum", baslik: "Durum", agirlik: 1.3, sirala: "durum", hucre: (r) => sevkDurumu(k(r).durum).label, ogeler: (r) => <DurumHucresi durum={k(r).durum} />,
    rozet: { etiketler: Object.values(SHIPMENT_STATUS).map((x) => x.label), metin: (r) => sevkDurumu(k(r).durum).label } },
  // Sütun seçicide KAPALI gelen ekler (eski "Satırda göster" alanları): telin kendi alanları.
  { key: "fatura", baslik: "Fatura", ad: "Fatura no", agirlik: 1.1, sirala: "disFaturaNo", kirpilmaz: 16, hucre: (r) => str(k(r).disFaturaNo) ?? "—" },
  { key: "faturaTarihi", baslik: "Fatura tar.", ad: "Fatura tarihi", agirlik: 1.1, sirala: "faturalanma", hucre: (r) => formatDate(k(r).faturalanma) },
  { key: "kayit", baslik: "Kayıt", ad: "Kayıt tarihi", agirlik: 1, sirala: "olusturulma", hucre: (r) => formatDate(k(r).olusturulma) },
  { key: "iptal", baslik: "İptal", ad: "İptal tarihi", agirlik: 1, sirala: "iptalTarihi", hucre: (r) => formatDate(k(r).iptalTarihi) },
];

/** Cari ayrıntısındaki sevkiyat tablosu: sevkiyat kaydının taşıdığı her sayı alanı. */
export const CARI_SEVK_SUTUNLARI = ["no", "tarih", "top", "metre", "kg", "cuval", "durum"] as const;
/** Özet'teki kısa "son sevkiyatlar": tarih · no · top · metre (+ durum). */
export const OZET_SEVK_SUTUNLARI = ["tarih", "no", "top", "metre", "durum"] as const;
/** Sevkiyat ekranı tablosunun varsayılan sütunları (cari sekmesiyle aynı tanımlar + müşteri + tür). */
export const SEVK_LISTE_VARSAYILAN: readonly string[] = ["no", "tarih", "musteri", "yon", "top", "metre", "durum"];
