// Çuvalın topları (ortak görünüm; Çuvallar ekranında ve sevkiyat ayrıntısında çuvala dokununca yerinde açılır).
// 2026-11-20 (kullanıcı: "çuvalın içeriği de filtrelenebilir ve aranabilir olsun"): liste TABLO oldu — ortak tablo
// parçaları (`TabloBasligi` · `TabloGovdesi` · `TabloSatiri`), her sütun sola dayalı, sığmazsa bütün sütunlar birlikte
// yana kayar (sabit sütun yok). Sütunlar: Top no (kırpılmaz) · işaret · Metre · Kumaş · Renk · Parti no (üretim partisi,
// fabrika 2.13.2+) · En · Kat · Kalite · Kg · Etiket · Not; verisi hiç olmayan sütun çizilmez (eski fabrikada Parti no
// gizli). Toplar `TOP_ARAC_ESIGI`nden çoksa üstte arama (top no, kumaş, renk, parti no, etiket) + ortak süzgeç sayfası
// (Kumaş · Renk · Parti no · Etiket müşterisi; çoklu seçim) + etkin süzgeç çipleri; seçim yalnız bu açılışta (kalıcı değil).
// İşaretler (ör. "Etiket farklı", "İade", "Çuvalda yok") fabrikanın top işaretlerinden çağıranın seçtiği rozetlerdir.
// Yüzlerce toplu çuval tek seferde çizilmez: ilk `TOP_SAYFA` top, "Daha fazla" her basışta bir o kadar açar.
import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { CuvalTopu } from "../../lib/cuval-deposu";
import { gorunenToplar, TOP_ARAC_ESIGI, topSuzgecGruplari } from "../../lib/cuval-toplari";
import { formatNumber } from "../../lib/format";
import { Rozet, type RozetTonu } from "../ortak";
import { qty } from "../pano/read";
import { SearchField } from "../siparis/parts";
import { etkinSuzgecSayisi, suzgecAta, type SutunTanimi } from "../tablo/model";
import { EtkinSuzgecler, SuzgecSayfasi } from "../tablo/Suzgec";
import { AracDugmesi, TabloBasligi, TabloGovdesi, TabloSatiri, toplamGenislik, useTabloOlcusu } from "../tablo/VeriTablosu";
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

const SIRASIZ: readonly string[] = [];
const bos = () => undefined;
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
  const [adet, setAdet] = useState(TOP_SAYFA);
  const [ara, setAra] = useState("");
  const [suzgec, setSuzgec] = useState<Readonly<Record<string, string>>>({});
  const [suzgecAcik, setSuzgecAcik] = useState(false);
  const araclar = p.toplar.length >= TOP_ARAC_ESIGI;
  const gruplar = useMemo(() => topSuzgecGruplari(p.toplar), [p.toplar]);
  const satirlar = useMemo(() => gorunenToplar(p.toplar, ara, suzgec), [p.toplar, ara, suzgec]);
  const { isaretler, ek, onEk } = p;
  const tanimlar = useMemo(() => topSutunlari(p.toplar, { onEk, isaretler, ek }), [p.toplar, onEk, isaretler, ek]);
  const gorunen = satirlar.slice(0, adet);
  const { sutunlar, yatay, onLayout } = useTabloOlcusu(tanimlar, gorunen);
  const kalan = satirlar.length - adet;
  const suzuldu = satirlar.length !== p.toplar.length;
  return (
    <View style={s.icerik} testID={`${p.onEk}-icerik-${p.id}`} onLayout={onLayout}>
      {p.baslik ? <Text style={s.icerikBas}>{p.baslik}</Text> : null}
      {p.toplar.length === 0 ? <Text style={s.not}>{p.bosMetin ?? "Çuval boş"}</Text> : null}
      {araclar ? (
        <>
          <View style={s.araclar}>
            <View style={s.aramaKutu}>
              <SearchField value={ara} onChangeText={setAra} placeholder="Top no, kumaş, renk, parti ara" testID={`${p.onEk}-top-ara-${p.id}`} />
            </View>
            {gruplar.length > 0 ? (
              <AracDugmesi icon="funnel-outline" label="Topları süz" rozet={etkinSuzgecSayisi(suzgec)} etkin={etkinSuzgecSayisi(suzgec) > 0} onPress={() => setSuzgecAcik(true)} testID={`${p.onEk}-top-suzgec-${p.id}`} />
            ) : null}
          </View>
          <EtkinSuzgecler gruplar={gruplar} secim={suzgec} onKaldir={(g) => setSuzgec((v) => suzgecAta(v, g, []))} onTemizle={() => setSuzgec({})} testID={`${p.onEk}-top-suzgec-${p.id}`} />
          {suzuldu ? <Text style={s.not} testID={`${p.onEk}-top-sayi-${p.id}`}>{`${formatNumber(satirlar.length, 0)} / ${formatNumber(p.toplar.length, 0)} top`}</Text> : null}
        </>
      ) : null}
      {p.toplar.length > 0 && satirlar.length === 0 ? <Text style={s.not} testID={`${p.onEk}-top-bos-${p.id}`}>Aramaya ya da süzgece uyan top yok</Text> : null}
      {gorunen.length > 0 ? (
        <>
          <TabloBasligi testID={`${p.onEk}-toplar-${p.id}`} sutunlar={sutunlar} siralama={null} siralanabilir={SIRASIZ} onSirala={bos} yatay={yatay ?? undefined} />
          <TabloGovdesi testID={`${p.onEk}-toplar-govde-${p.id}`} yatay={yatay ? { eksen: yatay, genislik: toplamGenislik(sutunlar) } : undefined}>
            {gorunen.map((x, i) => (
              <View key={x.id} style={p.vurgu?.(x) ? { backgroundColor: t.color.warning.bg } : undefined} testID={`${p.onEk}-top-${x.id}`}>
                <TabloSatiri yatay={!!yatay} sutunlar={sutunlar} kayit={x} ayrac={i > 0} testID={`${p.onEk}-topsatir-${x.id}`} />
              </View>
            ))}
          </TabloGovdesi>
        </>
      ) : null}
      {kalan > 0 ? (
        <Pressable onPress={() => setAdet((n) => n + TOP_SAYFA)} style={s.dahaFazla} accessibilityRole="button" testID={`${p.onEk}-top-daha-${p.id}`}>
          <Text style={[s.dahaYazi, { color: t.tint }]}>{`Daha fazla top (${kalan} kaldı)`}</Text>
        </Pressable>
      ) : null}
      {araclar && gruplar.length > 0 ? (
        <SuzgecSayfasi
          visible={suzgecAcik} testID={`${p.onEk}-top-suzgec-sayfa-${p.id}`} gruplar={gruplar} secim={suzgec}
          onUygula={(yeni) => setSuzgec(yeni)}
          sayac={(taslak) => gorunenToplar(p.toplar, ara, taslak).length}
          onClose={() => setSuzgecAcik(false)}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  icerik: { backgroundColor: t.surfaceAlt, paddingVertical: space.xs, paddingLeft: space.m, paddingRight: space.s },
  icerikBas: { ...typography.footnote, color: t.textSecondary, paddingVertical: space.xs },
  araclar: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, paddingBottom: space.xs },
  aramaKutu: { flex: 1, minWidth: 0 },
  not: { ...typography.footnote, color: t.textSecondary, paddingVertical: space.xs },
  dahaFazla: { minHeight: 44, alignItems: "center" as const, justifyContent: "center" as const },
  dahaYazi: { ...typography.callout, fontWeight: "600" as const },
}));
