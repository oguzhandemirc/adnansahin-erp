// Cari kartının görünür kart/blok seçimi (2026-11-17). SAF. Ortak model `tablo/kartSecimi`; seçim listeyle AYNI
// `tablo.cari-kart` tercihinin `suzgec.detayKartlar` alanında (bulut tercih anahtar listesi SABİT). Varsayılan = bugün
// çizilenler; yeni eklenenler (sipariş kalemi · sevk kg · son sipariş · son sevk · kayıt tarihi) KAPALI gelir. Hepsi
// kapatılabilir. Sayılar fabrikanın `cari-ozeti` anlığından aynen gelir; para alanı YOK.
import { gorunurKartlar, kartDegistir, kartlariSifirla, type KartSecimi } from "../tablo/kartSecimi";
import type { TabloTercihi } from "../tablo/model";

export const CARI_KARTLARI = [
  { key: "siparis", label: "Sipariş" },
  { key: "acik", label: "Açık (şu an)" },
  { key: "sevk", label: "Sevk (brüt)" },
  { key: "iade", label: "İade" },
  { key: "kalem", label: "Sipariş kalemi" },
  { key: "sevkKg", label: "Sevk (kg · çuval)" },
  { key: "sonSiparis", label: "Son sipariş tarihi" },
  { key: "sonSevk", label: "Son sevk tarihi" },
  { key: "acikSiparisler", label: "Açık siparişler listesi" },
  { key: "enCokUrun", label: "En çok alınan ürünler" },
  { key: "iadeler", label: "İadeler listesi" },
  { key: "sonSiparisler", label: "Son siparişler" },
  { key: "sonSevkiyatlar", label: "Son sevkiyatlar" },
  { key: "kayitTarihi", label: "Kayıt tarihi (Bilgi)" },
] as const;
export type CariKartKey = (typeof CARI_KARTLARI)[number]["key"];

/** Toplamlar ızgarasındaki kartlar (tanım sırası). */
export const TOPLAM_KARTLARI: readonly CariKartKey[] = ["siparis", "acik", "sevk", "iade", "kalem", "sevkKg", "sonSiparis", "sonSevk"];
/** Dönem (Tüm zamanlar | Son 12 ay) seçimine bağlı olanlar: biri görünürse dönem düğmesi çizilir. */
export const DONEMLI_KARTLAR: readonly CariKartKey[] = ["siparis", "sevk", "iade", "kalem", "sevkKg", "enCokUrun"];

export const CARI_KART_ALANI = "detayKartlar";
export const CARI_KART_SECIMI: KartSecimi<CariKartKey> = {
  kartlar: CARI_KARTLARI,
  varsayilan: ["siparis", "acik", "sevk", "iade", "acikSiparisler", "enCokUrun", "iadeler", "sonSiparisler", "sonSevkiyatlar"],
  alan: CARI_KART_ALANI,
};

export const cariKartlari = (t: TabloTercihi): CariKartKey[] => gorunurKartlar(CARI_KART_SECIMI, t);
export const cariKartDegistir = (t: TabloTercihi, key: CariKartKey): TabloTercihi => kartDegistir(CARI_KART_SECIMI, t, key);
export const cariKartSifirla = (t: TabloTercihi): TabloTercihi => kartlariSifirla(CARI_KART_SECIMI, t);
