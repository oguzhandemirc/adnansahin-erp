// Çuvalın topları (ortak görünüm; Çuvallar ekranında ve sevkiyat ayrıntısında çuvala dokununca yerinde açılır).
// 2026-11-20 (kullanıcı: "çuvalın içeriği de filtrelenebilir ve aranabilir olsun"): liste TABLO oldu — ortak tablo
// parçaları (`TabloBasligi` · `TabloGovdesi` · `TabloSatiri`), her sütun sola dayalı, sığmazsa bütün sütunlar birlikte
// yana kayar (sabit sütun yok). Sütunlar: Top no (kırpılmaz) · işaret · Metre · Kumaş · Renk · Parti no (üretim partisi,
// fabrika 2.13.2+) · En · Kat · Kalite · Kg · Etiket · Not; verisi hiç olmayan sütun çizilmez (eski fabrikada Parti no
// gizli). Dört özellik ortak yerel tablodan (`useYerelTablo`, 2026-11-20): sütun seçimi + başlıktan sıralama cihazda
// (`tablo.cuval-toplari`), arama (top no, kumaş, renk, parti no, etiket) + süzgeç (Kumaş · Renk · Parti no · Etiket
// müşterisi; çoklu seçim) bu açılışta. `TOP_ARAC_ESIGI`nden az topta araçlar tek küçük simge satırıdır.
// İşaretler (ör. "Etiket farklı", "İade", "Çuvalda yok") fabrikanın top işaretlerinden çağıranın seçtiği rozetlerdir.
// Yüzlerce toplu çuval tek seferde çizilmez: ilk `TOP_SAYFA` top, "Daha fazla" her basışta bir o kadar açar.
import { useMemo } from "react";
import { Text, View } from "react-native";
import type { CuvalTopu } from "../../lib/cuval-deposu";
import { gorunenToplar, TOP_ARAC_ESIGI, topSuzgecGruplari } from "../../lib/cuval-toplari";
import { Rozet, type RozetTonu } from "../ortak";
import { qty } from "../pano/read";
import type { SutunTanimi } from "../tablo/model";
import { useYerelTablo, YerelTabloAlti, YerelTabloAraclari, YerelTabloBasligi, YerelTabloGovdesi } from "../tablo/useYerelTablo";
import { makeStyles, useTokens } from "../theme-context";
import { space, typography } from "../tokens";

/** Açılan çuvalda ilk çizilen top sayısı; "Daha fazla" her basışta bir o kadar açar. */
export const TOP_SAYFA = 50;

export interface TopIsareti {
  /** Test kimliği parçası: `<onEk>-top-<anahtar>-<topId>`. */
  readonly anahtar: string;
  readonly label: string;
  readonly tone: RozetTonu;
}

const enMetni = (en: number | null): string | null => (en === null ? null : `${Number.isInteger(en) ? en : en.toFixed(1)} cm`);

/** Sütun tanımları (SAF): verisi hiç olmayan sütun düşer; işaret ve not sütunu yalnız çağıran verirse ve bir satırda varsa. */
export function topSutunlari<T extends CuvalTopu>(
  toplar: readonly T[],
  o: { readonly onEk: string; readonly isaretler?: (t: T) => readonly TopIsareti[]; readonly ek?: (t: T) => string | null },
): SutunTanimi<T>[] {
  const isaretOf = (t: T) => o.isaretler?.(t) ?? [];
  const etiketler = [...new Set(toplar.flatMap((t) => isaretOf(t).map((r) => r.label)))];
  const out: SutunTanimi<T>[] = [{ key: "topNo", baslik: "Top no", agirlik: 1.4, kirpilmaz: 12, hucre: (t) => t.topNo ?? "—" }];
  if (etiketler.length > 0) {
    out.push({
      key: "isaret", baslik: "İşaret", agirlik: 1, hucre: (t) => isaretOf(t).map((r) => r.label).join(", ") || "—",
      rozet: { etiketler, metin: (t) => isaretOf(t)[0]?.label ?? "" },
      ogeler: (t) => {
        const rs = isaretOf(t);
        if (rs.length === 0) return null;
        return <View style={{ gap: 2 }}>{rs.map((r) => <Rozet key={r.anahtar} label={r.label} tone={r.tone} testID={`${o.onEk}-top-${r.anahtar}-${t.id}`} />)}</View>;
      },
    });
  }
  out.push({ key: "metre", baslik: "Metre", agirlik: 0.9, sayi: true, hucre: (t) => qty(t.metre) });
  const varsa = (key: string, baslik: string, agirlik: number, deger: (t: T) => string | null, ek: Partial<SutunTanimi<T>> = {}) => {
    if (toplar.some((t) => deger(t) !== null)) out.push({ key, baslik, agirlik, hucre: (t) => deger(t) ?? "—", ...ek });
  };
  varsa("urun", "Kumaş", 1.6, (t) => t.urun, { satir: 2 });
  varsa("renk", "Renk", 1.2, (t) => t.renk, { satir: 2 });
  varsa("parti", "Parti no", 0.9, (t) => t.parti);
  varsa("en", "En", 0.8, (t) => enMetni(t.en), { sayi: true });
  varsa("kat", "Kat", 0.8, (t) => t.kat);
  varsa("kalite", "Kalite", 0.8, (t) => t.kalite);
  varsa("kg", "Kg", 0.7, (t) => (t.kg === null ? null : qty(t.kg)), { sayi: true });
  out.push({ key: "etiket", baslik: "Etiket", ad: "Etiket müşterisi", agirlik: 1.4, satir: 2, hucre: (t) => t.etiketMusteri ?? "Stok etiketi" });
  if (o.ek) {
    const ek = o.ek;
    varsa("not", "Not", 1.6, (t) => ek(t), { satir: 2 });
  }
  return out;
}

export function CuvalToplari<T extends CuvalTopu>(p: {
  readonly toplar: readonly T[];
  /** Test kimliği öneki (`<onEk>-icerik-<id>`, `<onEk>-top-<topId>`). */
  readonly onEk: string;
  /** İçerik kabının kimliği (çuval kimliği ya da "cuvalsiz"). */
  readonly id: string;
  /** Üstteki tek satır (çuvalın kendi bilgisi); verilmezse çizilmez. */
  readonly baslik?: string;
  readonly isaretler?: (t: T) => readonly TopIsareti[];
  /** Satır sarı zeminle vurgulanır mı (ör. etiketi başka müşteriye basılmış, çuvalda olmayan top). */
  readonly vurgu?: (t: T) => boolean;
  /** "Not" sütununa yazılacak kısa not (ör. iade sebebi). */
  readonly ek?: (t: T) => string | null;
  readonly bosMetin?: string;
}) {
  const s = useStyles();
  const t = useTokens();
  const { isaretler, ek, onEk, toplar } = p;
  const tanimlar = useMemo(() => topSutunlari(toplar, { onEk, isaretler, ek }), [toplar, onEk, isaretler, ek]);
  const gruplar = useMemo(() => topSuzgecGruplari(toplar), [toplar]);
  const ozel = useMemo(() => ({ gruplar, suz: (xs: readonly T[], ara: string, secim: Readonly<Record<string, string>>) => gorunenToplar(xs, ara, secim) }), [gruplar]);
  // Sütun seçimi + sıralama cihazda (Çuvallar ve sevkiyat ayrıntısı aynı sütunlar → tek anahtar); arama + süzgeç bu açılışta.
  const tablo = useYerelTablo<T>(
    {
      anahtar: "tablo.cuval-toplari", sutunlar: tanimlar, aramaIpucu: "Top no, kumaş, renk, parti ara", testID: `${onEk}-toplar-${p.id}`,
      ozel, sayfa: TOP_SAYFA, birim: "top", kompakt: toplar.length < TOP_ARAC_ESIGI, anahtarOf: (x) => x.id,
    },
    toplar,
  );
  return (
    <View style={s.icerik} testID={`${onEk}-icerik-${p.id}`} onLayout={tablo.onLayout}>
      {p.baslik ? <Text style={s.icerikBas}>{p.baslik}</Text> : null}
      {toplar.length === 0 ? <Text style={s.not}>{p.bosMetin ?? "Çuval boş"}</Text> : (
        <>
          <YerelTabloAraclari tablo={tablo} />
          {tablo.gorunen.length > 0 ? <YerelTabloBasligi tablo={tablo} /> : null}
          <YerelTabloGovdesi
            tablo={tablo}
            sarmal={(x) => ({ style: p.vurgu?.(x) ? { backgroundColor: t.color.warning.bg } : undefined, testID: `${onEk}-top-${x.id}` })}
            satirTestID={(x) => `${onEk}-topsatir-${x.id}`}
          />
          <YerelTabloAlti tablo={tablo} bosArama="Aramaya uyan top yok" />
        </>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  icerik: { backgroundColor: t.surfaceAlt, paddingVertical: space.xs, paddingLeft: space.m, paddingRight: space.s },
  icerikBas: { ...typography.footnote, color: t.textSecondary, paddingVertical: space.xs },
  not: { ...typography.footnote, color: t.textSecondary, paddingVertical: space.xs },
}));
