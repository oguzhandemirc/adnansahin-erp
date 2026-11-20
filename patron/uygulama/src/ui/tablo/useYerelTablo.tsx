// Yerel veri tablosu kancası + çizimi (2026-11-20, kullanıcı kuralı: her veri tablosunda sütun özelleştirme + arama +
// süzgeç + sütun başlığından sıralama). Bir tabloya dört özelliği bağlamak TEK kancadır:
//   const tablo = useYerelTablo({ anahtar: "tablo.<ad>", sutunlar, aramaIpucu, testID }, satirlar);
//   <YerelTablo tablo={tablo} onPress={…} />
// Veri telefonda TAM küme olmalıdır (anlık belge, kaydın içeriği, tamamı yüklenmiş liste ya da ekranın tanımlı penceresi
// — ör. "son 5 sevkiyat"); sunucu sayfalı liste `useVeriTablosu` ile sunucuda süzülür/sıralanır (yarım küme yerelde
// sıralanmaz). Sütun seçimi ve sıralama YALNIZ CİHAZDA (`useCihazTercihi`; bulut tercih anahtar listesi sabit) — mevcut
// bir seçimi korumak için `sutunDeposu` verilir (ör. Stok ürün tablosu `tablo.stok`). Süzgeç ve arama ekran durumudur
// (kalıcı değil). Az satırlı tabloda (`kompakt`) araçlar tek küçük simge satırıdır (arama simgesi kutuyu açar).
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { formatNumber } from "../../lib/format";
import { SearchField } from "../siparis/parts";
import { makeStyles, useTokens } from "../theme-context";
import { space, typography } from "../tokens";
import { etkinSuzgecSayisi, gecerliSecim, sonrakiSiralama, sutunDegistir, sutunTasi, suzgecAta, tercihiTemizle, AZAMI_SUTUN, type Siralama, type SuzgecGrubu, type TabloTercihi } from "./model";
import { SutunSecici } from "./Seciciler";
import { EtkinSuzgecler, SuzgecBos, SuzgecSayfasi } from "./Suzgec";
import { useCihazTercihi } from "./useCihazTercihi";
import { AracDugmesi, TabloAraclari, TabloBasligi, TabloGovdesi, TabloSatiri, toplamGenislik, useTabloOlcusu, type YatayEksen } from "./VeriTablosu";
import { gorunurAnahtarlar, sutunGruplari, yerelSiralanabilir, yerelSirala, yerelSuz, type YerelSutun } from "./yerelTablo";

/** Bu kadar satırdan azsa araçlar tek küçük simge satırıdır (kısa tablo boğulmasın). */
export const YEREL_ARAC_ESIGI = 8;

export interface YerelTabloAyari<R> {
  /** Cihaz tercihi anahtarı (`tablo.<ad>`): sütun seçimi + sıralama. */
  readonly anahtar: string;
  readonly sutunlar: readonly YerelSutun<R>[];
  /** Varsayılan görünür sütunlar (yoksa hepsi) — bugünkü görünüm. */
  readonly varsayilan?: readonly string[];
  readonly aramaIpucu: string;
  readonly testID: string;
  /** Satır anahtarı (yoksa `id`). */
  readonly anahtarOf?: (r: R) => string;
  /** Sütun dışında aranacak metin (ör. çuvalın top numaraları). */
  readonly ekMetin?: (r: R) => string;
  /** Alana özel süzgeç: gruplar + süzme (arama dahil) çağırandan; verilince sütun süzgeçleri kullanılmaz. */
  readonly ozel?: { readonly gruplar: readonly SuzgecGrubu[]; readonly suz: (satirlar: readonly R[], ara: string, secim: Readonly<Record<string, string>>) => R[] };
  /** Bir seferde çizilen satır (yoksa hepsi); "Daha fazla" bir o kadar açar. */
  readonly sayfa?: number;
  /** `oto` (varsayılan): toplam satır `YEREL_ARAC_ESIGI`nden azsa kompakt. */
  readonly kompakt?: boolean | "oto";
  /** Simgeler çağıranın blok başlığında (`YerelTabloSimgeleri`); `YerelTabloAraclari` kompakt simge satırı çizmez. */
  readonly simgeDisarida?: boolean;
  /** Mevcut (profil) sütun seçimini korur: okuma + yazma çağırandan. */
  readonly sutunDeposu?: { readonly sutunlar: readonly string[]; readonly yaz: (f: (s: readonly string[]) => readonly string[]) => void };
  /** Süzülünce gösterilen kapsam notu (ör. "Gösterilen son 5 sipariş içinde"). */
  readonly pencereNotu?: string;
  /** Satırın adı (ör. "top", "çuval"): "3 / 6 top", "Daha fazla top (N kaldı)"; yoksa "satır" / "Daha fazla göster". */
  readonly birim?: string;
}

export interface YerelTablo<R> {
  readonly ayar: YerelTabloAyari<R>;
  /** Bütün tanımlar (sıralanabilenlerde `sirala` = sütun anahtarı). */
  readonly tanimlar: readonly YerelSutun<R>[];
  /** Görünür ve ölçülmüş sütunlar. */
  readonly gorunur: readonly YerelSutun<R>[];
  readonly sutunAnahtarlari: readonly string[];
  readonly varsayilanSutunlar: readonly string[];
  /** Süzülmüş + sıralanmış bütün satırlar. */
  readonly satirlar: readonly R[];
  /** Çizilen (sayfalı) satırlar. */
  readonly gorunen: readonly R[];
  readonly kalan: number;
  dahaFazla(): void;
  readonly toplamSayi: number;
  readonly ara: string;
  setAra(v: string): void;
  readonly aramaAcik: boolean;
  setAramaAcik(v: boolean): void;
  readonly gruplar: readonly SuzgecGrubu[];
  readonly secim: Readonly<Record<string, string>>;
  setSecim(v: Readonly<Record<string, string>>): void;
  /** Taslak seçimin sonuç sayısı (küme tam ⇒ kesin). */
  sayac(taslak: Readonly<Record<string, string>>): number;
  readonly suzgecEtkin: boolean;
  readonly suzuldu: boolean;
  readonly siralama: Siralama | null;
  readonly siralanabilir: readonly string[];
  sirala(alan: string): void;
  sutunDegistir(k: string): void;
  sutunTasi(k: string, yon: -1 | 1): void;
  sutunVarsayilan(): void;
  readonly kompakt: boolean;
  readonly yatay: YatayEksen | null;
  readonly onLayout: ReturnType<typeof useTabloOlcusu>["onLayout"];
  readonly anahtarOf: (r: R) => string;
}

const idOf = (r: unknown): string => String((r as { id?: unknown }).id);

export function useYerelTablo<R>(ayar: YerelTabloAyari<R>, kaynak: readonly R[]): YerelTablo<R> {
  const anahtarlar = useMemo(() => ayar.sutunlar.map((c) => c.key), [ayar.sutunlar]);
  const varsayilanSutunlar = useMemo(() => (ayar.varsayilan ?? anahtarlar).filter((k) => anahtarlar.includes(k)), [ayar.varsayilan, anahtarlar]);
  const temizle = useMemo(() => {
    const varsayilan: TabloTercihi = { surum: 1, sutunlar: varsayilanSutunlar, siralama: null, suzgec: {} };
    return (ham: unknown) => tercihiTemizle(ham, { varsayilan, sutunlar: anahtarlar, azami: AZAMI_SUTUN });
  }, [varsayilanSutunlar, anahtarlar]);
  const pref = useCihazTercihi(ayar.anahtar, temizle);
  const depo = ayar.sutunDeposu;
  const sakli = depo ? depo.sutunlar : pref.tercih.sutunlar;
  const sutunAnahtarlari = useMemo(() => gorunurAnahtarlar(sakli, anahtarlar, varsayilanSutunlar), [sakli, anahtarlar, varsayilanSutunlar]);
  const siralanabilir = useMemo(() => yerelSiralanabilir(ayar.sutunlar), [ayar.sutunlar]);
  const tanimlar = useMemo(() => ayar.sutunlar.map((c) => ({ ...c, sirala: siralanabilir.includes(c.key) ? c.key : undefined })), [ayar.sutunlar, siralanabilir]);
  const siralama = pref.tercih.siralama && siralanabilir.includes(pref.tercih.siralama.alan) ? pref.tercih.siralama : null;

  const [ara, setAraHam] = useState("");
  const [aramaAcik, setAramaAcik] = useState(false);
  const [secim, setSecimHam] = useState<Readonly<Record<string, string>>>({});
  const sayfa = ayar.sayfa ?? Number.POSITIVE_INFINITY;
  const [adet, setAdet] = useState(sayfa);
  const setAra = (v: string) => { setAraHam(v); setAdet(sayfa); };
  const setSecim = (v: Readonly<Record<string, string>>) => { setSecimHam(v); setAdet(sayfa); };

  const { ozel, ekMetin } = ayar;
  const gruplar = useMemo(() => (ozel ? ozel.gruplar : sutunGruplari(ayar.sutunlar, kaynak, secim)), [ozel, ayar.sutunlar, kaynak, secim]);
  const suz = (taslak: Readonly<Record<string, string>>) => (ozel ? ozel.suz(kaynak, ara, taslak) : yerelSuz(kaynak, ayar.sutunlar, gruplar, taslak, ara, ekMetin));
  const suzulen = useMemo(() => suz(secim), [kaynak, ara, secim, gruplar, ozel, ekMetin]); // eslint-disable-line react-hooks/exhaustive-deps
  const satirlar = useMemo(() => yerelSirala(suzulen, ayar.sutunlar, siralama), [suzulen, ayar.sutunlar, siralama]);
  const gorunen = useMemo(() => (Number.isFinite(adet) ? satirlar.slice(0, adet) : satirlar), [satirlar, adet]);
  const secili = useMemo(() => sutunAnahtarlari.flatMap((k) => tanimlar.filter((c) => c.key === k)), [sutunAnahtarlari, tanimlar]);
  const olcu = useTabloOlcusu(secili, gorunen, siralama?.alan);
  const suzgecEtkin = Object.keys(gecerliSecim(gruplar, secim)).length > 0;
  const kompakt = ayar.kompakt === true || ((ayar.kompakt ?? "oto") === "oto" && kaynak.length < YEREL_ARAC_ESIGI);
  // Arama kutusu kompakt kipte açıksa ve terim boşaldıysa açık kalır (kullanıcı kapatana dek).
  useEffect(() => {
    if (!kompakt) setAramaAcik(false);
  }, [kompakt]);

  const sutunYaz = (f: (s: readonly string[]) => readonly string[]) => {
    if (depo) depo.yaz(f);
    else pref.degistir((t) => ({ ...t, sutunlar: f(gorunurAnahtarlar(t.sutunlar, anahtarlar, varsayilanSutunlar)) }));
  };
  return {
    ayar, tanimlar, gorunur: olcu.sutunlar as readonly YerelSutun<R>[], sutunAnahtarlari, varsayilanSutunlar,
    satirlar, gorunen, kalan: Math.max(0, satirlar.length - gorunen.length), dahaFazla: () => setAdet((n) => n + sayfa),
    toplamSayi: kaynak.length, ara, setAra, aramaAcik, setAramaAcik, gruplar, secim, setSecim, sayac: (taslak) => suz(taslak).length,
    suzgecEtkin, suzuldu: suzgecEtkin || ara.trim() !== "", siralama, siralanabilir,
    sirala: (alan) => pref.degistir((t) => ({ ...t, siralama: sonrakiSiralama(t.siralama && siralanabilir.includes(t.siralama.alan) ? t.siralama : null, alan) })),
    sutunDegistir: (k) => sutunYaz((s) => sutunDegistir(s, k)),
    sutunTasi: (k, yon) => sutunYaz((s) => sutunTasi(s, k, yon)),
    sutunVarsayilan: () => sutunYaz(() => varsayilanSutunlar),
    kompakt, yatay: olcu.yatay, onLayout: olcu.onLayout, anahtarOf: ayar.anahtarOf ?? idOf,
  };
}

/** Küçük simge satırı: arama (kutuyu açar/kapatır) · süzgeç · sütunlar. Blok başlığının sağına da konabilir. */
export function YerelTabloSimgeleri<R>({ tablo }: { readonly tablo: YerelTablo<R> }) {
  const s = useStyles();
  const { testID } = tablo.ayar;
  const [sutunAcik, setSutunAcik] = useState(false);
  const [suzgecAcik, setSuzgecAcik] = useState(false);
  const suzgecSayisi = etkinSuzgecSayisi(gecerliSecim(tablo.gruplar, tablo.secim));
  return (
    <View style={s.simgeler} testID={`${testID}-simgeler`}>
      {tablo.kompakt ? (
        <AracDugmesi
          kucuk icon="search-outline" label={tablo.aramaAcik ? "Aramayı kapat" : "Ara"} etkin={tablo.aramaAcik || tablo.ara.trim() !== ""}
          onPress={() => { if (tablo.aramaAcik) tablo.setAra(""); tablo.setAramaAcik(!tablo.aramaAcik); }} testID={`${testID}-ara-ac`}
        />
      ) : null}
      {tablo.gruplar.length > 0 ? <AracDugmesi kucuk icon="funnel-outline" label="Süzgeç" rozet={suzgecSayisi} etkin={suzgecSayisi > 0} onPress={() => setSuzgecAcik(true)} testID={`${testID}-suzgec`} /> : null}
      <AracDugmesi kucuk icon="grid-outline" label="Sütunlar" onPress={() => setSutunAcik(true)} testID={`${testID}-sutunlar`} />
      <YerelSayfalar tablo={tablo} sutunAcik={sutunAcik} suzgecAcik={suzgecAcik} onSutunKapat={() => setSutunAcik(false)} onSuzgecKapat={() => setSuzgecAcik(false)} />
    </View>
  );
}

function YerelSayfalar<R>(p: { readonly tablo: YerelTablo<R>; readonly sutunAcik: boolean; readonly suzgecAcik: boolean; readonly onSutunKapat: () => void; readonly onSuzgecKapat: () => void }) {
  const { tablo } = p;
  const { testID } = tablo.ayar;
  // Alt sayfalar yalnız açıkken bağlanır: bir ekranda çok sayıda kısa tablo (her çuvalın topları) gizli Modal taşımaz.
  return (
    <>
      {p.sutunAcik ? (
        <SutunSecici
          visible testID={`${testID}-sutun-secici`} sutunlar={tablo.tanimlar} gorunur={tablo.sutunAnahtarlari} azami={AZAMI_SUTUN}
          onDegistir={tablo.sutunDegistir} onTasi={tablo.sutunTasi} onVarsayilan={tablo.sutunVarsayilan} onClose={p.onSutunKapat}
        />
      ) : null}
      {p.suzgecAcik && tablo.gruplar.length > 0 ? (
        // Küme tam ⇒ taslağın sonuç sayısı kesin ("Sonuçları göster (N)").
        <SuzgecSayfasi visible testID={`${testID}-suzgec-secici`} gruplar={tablo.gruplar} secim={tablo.secim} onUygula={tablo.setSecim} sayac={tablo.sayac} onClose={p.onSuzgecKapat} />
      ) : null}
    </>
  );
}

/** Araç şeridi: tam kipte arama kutusu + süzgeç + sütunlar; kompakt kipte küçük simgeler (+ açıldıysa arama kutusu). Altında etkin süzgeç çipleri ve süzülen satır sayısı. */
export function YerelTabloAraclari<R>({ tablo }: { readonly tablo: YerelTablo<R> }) {
  const s = useStyles();
  const { testID } = tablo.ayar;
  const [sutunAcik, setSutunAcik] = useState(false);
  const [suzgecAcik, setSuzgecAcik] = useState(false);
  const suzgecSayisi = etkinSuzgecSayisi(gecerliSecim(tablo.gruplar, tablo.secim));
  return (
    <View testID={`${testID}-araclar`}>
      {!tablo.kompakt ? (
        <>
          <TabloAraclari
            testID={testID}
            ara={{ value: tablo.ara, onChangeText: tablo.setAra, placeholder: tablo.ayar.aramaIpucu }}
            suzgecSayisi={suzgecSayisi}
            onSuzgec={tablo.gruplar.length > 0 ? () => setSuzgecAcik(true) : undefined}
            onSutun={() => setSutunAcik(true)}
          />
          <YerelSayfalar tablo={tablo} sutunAcik={sutunAcik} suzgecAcik={suzgecAcik} onSutunKapat={() => setSutunAcik(false)} onSuzgecKapat={() => setSuzgecAcik(false)} />
        </>
      ) : !tablo.ayar.simgeDisarida ? (
        <View style={s.kompaktSatir}><YerelTabloSimgeleri tablo={tablo} /></View>
      ) : null}
      {tablo.kompakt && tablo.aramaAcik ? (
        <View style={s.kompaktArama}>
          <SearchField value={tablo.ara} onChangeText={tablo.setAra} placeholder={tablo.ayar.aramaIpucu} autoFocus testID={`${testID}-ara`} />
        </View>
      ) : null}
      <EtkinSuzgecler gruplar={tablo.gruplar} secim={tablo.secim} onKaldir={(g) => tablo.setSecim(suzgecAta(tablo.secim, g, []))} onTemizle={() => tablo.setSecim({})} testID={`${testID}-suzgec`} />
      {tablo.suzuldu ? (
        <Text style={s.not} testID={`${testID}-sayi`}>
          {[`${formatNumber(tablo.satirlar.length, 0)} / ${formatNumber(tablo.toplamSayi, 0)} ${tablo.ayar.birim ?? "satır"}`, tablo.ayar.pencereNotu].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
    </View>
  );
}

export function YerelTabloBasligi<R>({ tablo }: { readonly tablo: YerelTablo<R> }) {
  return (
    <TabloBasligi testID={tablo.ayar.testID} sutunlar={tablo.gorunur} siralama={tablo.siralama} siralanabilir={tablo.siralanabilir} onSirala={tablo.sirala} yatay={tablo.yatay ?? undefined} />
  );
}

export function YerelTabloGovdesi<R>(p: {
  readonly tablo: YerelTablo<R>;
  readonly onPress?: (r: R) => void;
  /** Satırın hemen altında yerinde açılan içerik (ör. çuvalın topları); null = kapalı. */
  readonly acilir?: (r: R) => ReactNode;
  /** Satırı saran kabın stili (ör. vurgu zemini) ve test kimliği. */
  readonly sarmal?: (r: R) => { readonly style?: StyleProp<ViewStyle>; readonly testID?: string };
  /** Satır test kimliği (yoksa `<testID>-satir-<anahtar>`). */
  readonly satirTestID?: (r: R) => string;
}) {
  const { tablo } = p;
  const { testID } = tablo.ayar;
  if (tablo.gorunen.length === 0) return null;
  return (
    <TabloGovdesi testID={`${testID}-govde`} yatay={tablo.yatay ? { eksen: tablo.yatay, genislik: toplamGenislik(tablo.gorunur) } : undefined}>
      {tablo.gorunen.map((r, i) => {
        const k = tablo.anahtarOf(r);
        const sar = p.sarmal?.(r);
        return (
          <View key={k} style={sar?.style} testID={sar?.testID}>
            <TabloSatiri yatay={!!tablo.yatay} sutunlar={tablo.gorunur} kayit={r} ayrac={i > 0} onPress={p.onPress ? () => p.onPress!(r) : undefined} testID={p.satirTestID?.(r) ?? `${testID}-satir-${k}`} />
            {p.acilir?.(r) ?? null}
          </View>
        );
      })}
    </TabloGovdesi>
  );
}

/** "Daha fazla" + süzgeç/arama boş durumu. */
export function YerelTabloAlti<R>({ tablo, bosArama }: { readonly tablo: YerelTablo<R>; readonly bosArama?: string }) {
  const s = useStyles();
  const t = useTokens();
  const { testID } = tablo.ayar;
  return (
    <>
      {tablo.toplamSayi > 0 && tablo.satirlar.length === 0 ? (
        tablo.suzgecEtkin
          ? <SuzgecBos onTemizle={() => tablo.setSecim({})} testID={`${testID}-bos-suzgec`} />
          : <Text style={s.bos} testID={`${testID}-bos-arama`}>{bosArama ?? "Aramaya uyan kayıt yok"}</Text>
      ) : null}
      {tablo.kalan > 0 ? (
        <Pressable onPress={tablo.dahaFazla} style={s.dahaFazla} accessibilityRole="button" testID={`${testID}-daha`}>
          <Text style={[s.dahaYazi, { color: t.tint }]}>{`Daha fazla ${tablo.ayar.birim ?? "göster"} (${formatNumber(tablo.kalan, 0)} kaldı)`}</Text>
        </Pressable>
      ) : null}
    </>
  );
}

/** Hepsi bir arada: araçlar · başlık · satırlar · boş/daha fazla · `alt`. */
export function YerelTablo<R>(p: {
  readonly tablo: YerelTablo<R>;
  readonly onPress?: (r: R) => void;
  readonly acilir?: (r: R) => ReactNode;
  readonly sarmal?: (r: R) => { readonly style?: StyleProp<ViewStyle>; readonly testID?: string };
  readonly satirTestID?: (r: R) => string;
  readonly bosArama?: string;
  /** Satır yokken araç/başlık çizilmez, yalnız bu (ör. boş/hata durumu). */
  readonly alt?: ReactNode;
}) {
  const { tablo } = p;
  if (tablo.toplamSayi === 0) return <View testID={tablo.ayar.testID}>{p.alt}</View>;
  return (
    <View testID={tablo.ayar.testID} onLayout={tablo.onLayout}>
      <YerelTabloAraclari tablo={tablo} />
      {tablo.gorunen.length > 0 ? <YerelTabloBasligi tablo={tablo} /> : null}
      <YerelTabloGovdesi tablo={tablo} onPress={p.onPress} acilir={p.acilir} sarmal={p.sarmal} satirTestID={p.satirTestID} />
      <YerelTabloAlti tablo={tablo} bosArama={p.bosArama} />
      {p.alt}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  simgeler: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s },
  kompaktSatir: { flexDirection: "row" as const, justifyContent: "flex-end" as const, paddingBottom: space.xs },
  kompaktArama: { paddingBottom: space.xs },
  not: { ...typography.footnote, color: t.textSecondary, paddingBottom: space.xs },
  bos: { ...typography.footnote, color: t.color.textMuted, paddingVertical: space.m },
  dahaFazla: { minHeight: 44, alignItems: "center" as const, justifyContent: "center" as const },
  dahaYazi: { ...typography.callout, fontWeight: "600" as const },
}));
