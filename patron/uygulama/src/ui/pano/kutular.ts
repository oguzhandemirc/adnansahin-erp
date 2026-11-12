// Pano kutu kataloğu (şartname §4.1): YALNIZ bugün var olan anlıklardan; uydurma gösterge yok, termin/gecikme kutusu
// yok. Yeni kutu = buraya bir satır + `KutuCizici.tsx` `KUTU_CIZICI`ye bir çizici (anahtar tipi ikisini bağlar).
// `kaynak` kutunun okuduğu veridir: pano yalnız EKLİ ve İZİNLİ kutuların kaynaklarını ister.
import { can } from "../../lib/access";
import type { IconName } from "../icons";
import type { TileTone } from "../tokens";

export const KUTU_ANAHTARLARI = [
  "uretim",
  "sevk",
  "siparis",
  "stok",
  "fason",
  "alacak",
  "hizliIslemler",
  "uretimIstasyon",
  "uretimAkisi",
  "stokDagilim",
  "stokYas",
  "sonSevkler",
  "sonSiparisler",
  "makineDurus",
] as const;
export type KutuAnahtari = (typeof KUTU_ANAHTARLARI)[number];

/** `kpi` yarım genişlik (2 sütun; tek kalırsa tam genişliğe uzar); `orta`/`genis` tam genişlik. */
export type KutuBoyu = "kpi" | "orta" | "genis";
export type KutuGrubu = "Üretim" | "Satış ve sevk" | "Stok" | "Finans" | "Genel";
export const KUTU_GRUPLARI: readonly KutuGrubu[] = ["Üretim", "Satış ve sevk", "Stok", "Finans", "Genel"];

/** Kutunun veri kaynağı: anlık projeksiyonu ya da kayıt listesi (son 5). */
export type KutuKaynagi = { readonly tur: "anlik"; readonly ad: string } | { readonly tur: "liste"; readonly ad: string };

export interface KutuTanimi {
  readonly anahtar: KutuAnahtari;
  readonly baslik: string;
  readonly aciklama: string;
  readonly boy: KutuBoyu;
  readonly grup: KutuGrubu;
  readonly icon: IconName;
  readonly ton: TileTone;
  /** Kaynaksız kutu (hızlı işlemler) ağ isteği yapmaz; kendi isteğini atan kutu (makine duruşları) `null` + `kendiIster`. */
  readonly kaynak: KutuKaynagi | null;
  readonly kendiIster?: boolean;
  /** Bunların HEPSİ gerekir (sunucu kataloğuyla aynı küme); boş = her hesap. */
  readonly izin: readonly string[];
  readonly varsayilan: boolean;
  /** Dönem şeridine bağlı mı (sevk, fason). */
  readonly donemli?: boolean;
}

const OZET = "bulut:ozet:oku";

export const KUTULAR: readonly KutuTanimi[] = [
  { anahtar: "uretim", baslik: "Üretim", aciklama: "Bugün istasyonlarda biten top", boy: "kpi", grup: "Üretim", icon: "construct-outline", ton: "violet", kaynak: { tur: "anlik", ad: "ozet.uretim" }, izin: [OZET, "bulut:uretim:oku"], varsayilan: true },
  { anahtar: "sevk", baslik: "Sevk", aciklama: "Seçili dönemde sevk edilen metre (brüt)", boy: "kpi", grup: "Satış ve sevk", icon: "car-outline", ton: "green", kaynak: { tur: "anlik", ad: "ozet.sevkiyat" }, izin: [OZET, "bulut:sevkiyat:oku"], varsayilan: true, donemli: true },
  { anahtar: "siparis", baslik: "Açık sipariş", aciklama: "Açık kalem sayısı ve açık metre", boy: "kpi", grup: "Satış ve sevk", icon: "receipt-outline", ton: "blue", kaynak: { tur: "anlik", ad: "ozet.siparis" }, izin: [OZET, "bulut:siparis:oku"], varsayilan: true },
  { anahtar: "stok", baslik: "Serbest stok", aciklama: "Çuvala ve sevke girmemiş bitmiş metre, ölü stok", boy: "kpi", grup: "Stok", icon: "cube-outline", ton: "teal", kaynak: { tur: "anlik", ad: "ozet.stok" }, izin: [OZET, "bulut:stok:oku"], varsayilan: true },
  { anahtar: "fason", baslik: "Fasonda", aciklama: "Seçili dönemde fasonda açık metre", boy: "kpi", grup: "Üretim", icon: "swap-horizontal-outline", ton: "orange", kaynak: { tur: "anlik", ad: "ozet.fason" }, izin: [OZET, "bulut:uretim:oku"], varsayilan: false, donemli: true },
  { anahtar: "alacak", baslik: "Açık alacak", aciklama: "Para birimi başına açık alacak (toplanmaz)", boy: "kpi", grup: "Finans", icon: "wallet-outline", ton: "sky", kaynak: { tur: "anlik", ad: "ozet-finans" }, izin: ["bulut:cari-bakiye:oku"], varsayilan: false },
  { anahtar: "hizliIslemler", baslik: "Hızlı işlemler", aciklama: "Yeni sipariş, yeni müşteri, rapor iste, cari ara", boy: "orta", grup: "Genel", icon: "flash-outline", ton: "amber", kaynak: null, izin: [], varsayilan: true },
  { anahtar: "uretimIstasyon", baslik: "İstasyon bazında üretim", aciklama: "Bugün her istasyonda biten top", boy: "genis", grup: "Üretim", icon: "bar-chart-outline", ton: "violet", kaynak: { tur: "anlik", ad: "uretim-akisi" }, izin: ["bulut:uretim:oku"], varsayilan: true },
  { anahtar: "uretimAkisi", baslik: "Üretim akışı", aciklama: "Topların şu an hangi aşamada beklediği", boy: "genis", grup: "Üretim", icon: "git-network-outline", ton: "blue", kaynak: { tur: "anlik", ad: "uretim-akisi" }, izin: ["bulut:uretim:oku"], varsayilan: false },
  { anahtar: "stokDagilim", baslik: "Stok dağılımı", aciklama: "Ham, yarı mamul ve bitmiş stok (metre)", boy: "orta", grup: "Stok", icon: "pie-chart-outline", ton: "teal", kaynak: { tur: "anlik", ad: "stok-karnesi" }, izin: ["bulut:stok:oku"], varsayilan: true },
  { anahtar: "stokYas", baslik: "Stok yaşı", aciklama: "Bitmiş stokun yaş kovaları", boy: "orta", grup: "Stok", icon: "hourglass-outline", ton: "amber", kaynak: { tur: "anlik", ad: "stok-karnesi" }, izin: ["bulut:stok:oku"], varsayilan: false },
  { anahtar: "sonSevkler", baslik: "Son sevkler", aciklama: "En son beş sevkiyat", boy: "genis", grup: "Satış ve sevk", icon: "car-outline", ton: "green", kaynak: { tur: "liste", ad: "sevkiyat" }, izin: ["bulut:sevkiyat:oku"], varsayilan: true },
  { anahtar: "sonSiparisler", baslik: "Son siparişler", aciklama: "En son beş sipariş", boy: "genis", grup: "Satış ve sevk", icon: "receipt-outline", ton: "blue", kaynak: { tur: "liste", ad: "siparis" }, izin: ["bulut:siparis:oku"], varsayilan: true },
  { anahtar: "makineDurus", baslik: "Makine duruşları", aciklama: "Fabrikadan hazır rapor iste", boy: "orta", grup: "Üretim", icon: "pause-circle-outline", ton: "rose", kaynak: null, kendiIster: true, izin: ["bulut:rapor:oku"], varsayilan: false },
];

export function kutu(anahtar: KutuAnahtari): KutuTanimi {
  const k = KUTULAR.find((x) => x.anahtar === anahtar);
  if (!k) throw new Error(`Tanımsız kutu: ${anahtar}`);
  return k;
}

export function kutuIzinli(perms: readonly string[], k: KutuTanimi): boolean {
  return k.izin.every((p) => can(perms, p));
}

export function izinliKutular(perms: readonly string[]): KutuTanimi[] {
  return KUTULAR.filter((k) => kutuIzinli(perms, k));
}

export const VARSAYILAN_DUZEN: readonly KutuAnahtari[] = KUTULAR.filter((k) => k.varsayilan).map((k) => k.anahtar);

/** Ekli kutuların istediği kaynaklar (tekilleşmiş): aynı anlığı okuyan iki kutu tek istek atar. */
export function istenenKaynaklar(duzen: readonly KutuAnahtari[]): { anlik: Set<string>; liste: Set<string> } {
  const anlik = new Set<string>();
  const liste = new Set<string>();
  for (const a of duzen) {
    const k = kutu(a).kaynak;
    if (k) (k.tur === "anlik" ? anlik : liste).add(k.ad);
  }
  return { anlik, liste };
}

/** Çizim satırları: ardışık `kpi` kutular ikişer paketlenir (tek kalan tam genişliğe uzar); diğerleri tek satır. */
export function satirlar(duzen: readonly KutuAnahtari[]): KutuAnahtari[][] {
  const out: KutuAnahtari[][] = [];
  for (const a of duzen) {
    const son = out[out.length - 1];
    if (kutu(a).boy === "kpi" && son && son.length === 1 && kutu(son[0]!).boy === "kpi") son.push(a);
    else out.push([a]);
  }
  return out;
}
