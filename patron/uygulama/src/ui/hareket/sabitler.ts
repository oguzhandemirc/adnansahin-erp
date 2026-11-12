// Hareket sabitleri — uygulamadaki her süre/eğri/yay BURADAN okunur (başka dosyada sayı uydurulmaz).
// Kural: tek geçiş 150–250 ms (basma dahil), kademeli giriş dahil toplam ≤ 400 ms; "hareketi azalt" açıkken süre 0 (yalnız anlık
// durum değişimi) — karar tek yerde: `sure()`/`kademe()`.
import { Easing } from "react-native-reanimated";

/** Süreler (ms). `nabiz` yalnız sonsuz döngülerin yarım turu (iskelet parıltısı, eşitleme noktası). */
export const SURE = {
  /** Basma geri bildirimi, seçim. */
  anlik: 150,
  /** Küçük öğe girişi, opaklık. */
  kisa: 180,
  /** Sekme içerik solması, sayı geçişi. */
  orta: 200,
  /** Ekran/modal geçişi, tema rengi geçişi. */
  uzun: 250,
  /** Döngü yarım turu (1.2 sn tam tur). */
  nabiz: 600,
} as const;

/** Bir hareketin (gecikme dahil) aşamayacağı toplam süre. */
export const TOPLAM_UST = 400;

/** Material "standard" eğrisinin kontrol noktaları (reanimated ve gezgin aynı eğriyi kursun diye). */
export const STANDART_BEZIER = [0.2, 0, 0, 1] as const;

/** Eğriler (Material "standard" dili). */
export const EGRI = {
  standart: Easing.bezier(...STANDART_BEZIER),
  giris: Easing.out(Easing.cubic),
  cikis: Easing.in(Easing.cubic),
  gidisDonus: Easing.inOut(Easing.ease),
} as const;

/** Yaylar (withSpring): `basma` bırakınca geri tepme, `yumusak` yerleşme, `modal` alttan açılan sayfa. */
export const YAY = {
  basma: { mass: 0.5, damping: 18, stiffness: 320 },
  yumusak: { mass: 1, damping: 20, stiffness: 180 },
  modal: { mass: 0.9, damping: 22, stiffness: 220 },
} as const;

/** Basılabilir yüzeyin basılıyken ölçeği ve opaklığı. */
export const BASMA = { olcek: 0.97, opaklik: 0.85 } as const;

/** Kademeli giriş: öğe başına gecikme ve sınır (7. öğeden sonrası beklemez → 6×30 + 180 ≤ 400). */
export const KADEME = { adim: 30, enCokSira: 6, kayma: 8 } as const;

export type SureAdi = keyof typeof SURE;

/** Etkin süre: hareket azaltıldıysa 0 (döngüler de durur). */
export function sure(ad: SureAdi, azalt: boolean): number {
  return azalt ? 0 : SURE[ad];
}

/** `i`. öğenin giriş gecikmesi; azaltılmışta 0. */
export function kademe(i: number, azalt: boolean): number {
  if (azalt) return 0;
  return Math.min(Math.max(0, i), KADEME.enCokSira) * KADEME.adim;
}
