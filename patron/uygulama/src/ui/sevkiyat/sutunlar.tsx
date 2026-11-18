// Sevkiyat satırının sütunları (2026-11-19; cari ayrıntısı Sevkiyatlar sekmesi + Özet'teki son sevkiyatlar). SAF tanım,
// ortak tablonun (`tablo/VeriTablosu`) `SutunTanimi`; her sütun SOLA dayalı (ortak varsayılan). Her değer `sevkiyat`
// kaydının kendi alanıdır (fabrika hesaplar; sevk BRÜT): `sevkNo` · `cikisTarihi` (yoksa `olusturulma`) · `topSayisi` ·
// `toplamMetre` · `toplamKg` · `cuvalSayisi` · `durum`. Durum rozeti tek kaynaktan (`./durum`).
// No sütunu belge numarasının tamamını taşıyacak genişlikte (1.5 × 80 = 120 pt ≥ "SVK1811260003"): numara KIRPILMAZ.
import type { ProjectionRecord } from "../../api/wire";
import { formatDate, formatNumber } from "../../lib/format";
import { UNIT } from "../../lib/labels/uretim";
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
  { key: "no", baslik: "Sevk no", agirlik: 1.5, hucre: (r) => str(k(r).sevkNo) ?? "—" },
  { key: "tarih", baslik: "Tarih", ad: "Sevk tarihi", agirlik: 1.1, hucre: (r) => formatDate(str(k(r).cikisTarihi) ?? str(k(r).olusturulma)) },
  { key: "top", baslik: "Top", ad: "Top sayısı (brüt)", agirlik: 0.7, sayi: true, hucre: (r) => sayi(k(r).topSayisi) },
  { key: "metre", baslik: "Metre", ad: "Sevk (m, brüt)", agirlik: 1.1, sayi: true, hucre: (r) => (present(k(r).toplamMetre) ? `${qty(k(r).toplamMetre)} ${UNIT.metre}` : "—") },
  { key: "kg", baslik: "Kg", ad: "Toplam kg", agirlik: 0.9, sayi: true, hucre: (r) => sayi(k(r).toplamKg) },
  { key: "cuval", baslik: "Çuval", ad: "Çuval sayısı", agirlik: 0.8, sayi: true, hucre: (r) => sayi(k(r).cuvalSayisi) },
  { key: "durum", baslik: "Durum", agirlik: 1.3, hucre: (r) => sevkDurumu(k(r).durum).label, ogeler: (r) => <DurumHucresi durum={k(r).durum} /> },
];

/** Cari ayrıntısındaki sevkiyat tablosu: sevkiyat kaydının taşıdığı her sayı alanı. */
export const CARI_SEVK_SUTUNLARI = ["no", "tarih", "top", "metre", "kg", "cuval", "durum"] as const;
/** Özet'teki kısa "son sevkiyatlar": tarih · no · top · metre (+ durum). */
export const OZET_SEVK_SUTUNLARI = ["tarih", "no", "top", "metre", "durum"] as const;
