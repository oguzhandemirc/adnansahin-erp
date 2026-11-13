// "Mal şu an nerede?" satırları: fabrikanın `uretim-akisi` kolonları (anahtar, adet) → kısa ad + birim + hedef ekran.
// Sayı fabrikanındır; birim kolonun ölçtüğü şeydir: Kurşun/Tambur kolonu topu değil, topu bekleyen iş emri ADIMINI sayar.
// Sevk kolonu (planlı sevkiyat) burada yok — Sevkiyat ekranının sorusu. Tanınmayan kolon fabrikanın etiketiyle çizilir.
import type { IconName } from "../icons";
import type { IconTileTone } from "../ortak";
import { arr, num, qty, str } from "../pano/read";

export interface NeredeSatiri {
  readonly anahtar: string;
  readonly etiket: string;
  readonly deger: string;
  readonly icon: IconName;
  readonly ton: IconTileTone;
  readonly git: string | null;
}

interface KolonTanimi {
  readonly etiket: string;
  readonly birim: string;
  readonly icon: IconName;
  readonly ton: IconTileTone;
  readonly git: string | null;
  /** Sıfırken satır çizilmez (ör. yarı mamul kullanmayan fabrika). */
  readonly sifirdaGizle?: boolean;
}

export const NEREDE_KOLONLARI: Readonly<Record<string, KolonTanimi>> = {
  hamStok: { etiket: "Ham stok", birim: "top", icon: "layers-outline", ton: "teal", git: "/stok" },
  yariMamul: { etiket: "Yarı mamul", birim: "top", icon: "sync-outline", ton: "blue", git: "/stok", sifirdaGizle: true },
  fason: { etiket: "Fasonda", birim: "top", icon: "color-fill-outline", ton: "orange", git: "/fason" },
  kursun: { etiket: "Kurşun + KK2", birim: "iş emri", icon: "scan-outline", ton: "violet", git: "/is-emirleri?asama=KURSUN" },
  tambur: { etiket: "Tambur", birim: "iş emri", icon: "disc-outline", ton: "rose", git: "/is-emirleri?asama=TAMBUR" },
  depo: { etiket: "Depo", birim: "top", icon: "cube-outline", ton: "green", git: "/stok" },
};

const GIZLI = new Set(["sevk"]);

export function neredeSatirlari(veri: unknown): NeredeSatiri[] {
  const kolonlar = arr((veri as { kolonlar?: unknown } | null)?.kolonlar);
  return kolonlar.flatMap((k) => {
    const anahtar = str(k.anahtar);
    if (!anahtar || GIZLI.has(anahtar)) return [];
    const tanim = NEREDE_KOLONLARI[anahtar];
    const adet = num(k.adet);
    if (tanim?.sifirdaGizle && !adet) return [];
    return [{
      anahtar,
      etiket: tanim?.etiket ?? str(k.etiket) ?? anahtar,
      deger: `${qty(adet)} ${tanim?.birim ?? "top"}`,
      icon: tanim?.icon ?? "ellipse-outline",
      ton: tanim?.ton ?? "sky",
      git: tanim?.git ?? null,
    }];
  });
}
