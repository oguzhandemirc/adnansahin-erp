// Çuvallar (2026-11-17) — patronun sorusu: "kimin kaç çuvalı var, çuvalda ne var?". Panelin Paketleme/Çuvallar ekranının
// SALT İZLEME karşılığı: çuvala ekleme/çıkarma, sevk ve yazdırma YOK. Kaynak anlık `cuval-deposu` (fabrika 2.12.4+):
// sevk edilmemiş çuvallar (depoda + sevke atanmış), fabrikanın saydığı özet ve cari dökümü, çuval başına toplar.
// Uygulama toplamaz: kartlar ve döküm fabrikanın sayısıdır. Cari dökümü satırına dokunmak o cariyi süzer ("Hepsi" kaldırır);
// çuval satırına dokunmak içeriği altında açar. Eski fabrikada anlık yok → anlaşılır boş durum.
// Kart, sütun ve süzgeç seçimi yalnız bu cihazda (`tablo.cuval`, `src/ui/cuval/gorunum.ts`).
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { can } from "../../src/lib/access";
import { cariAnahtari, cuvalDeposu, CUVAL_SIRALANABILIR, cuvalSuzgecGruplari, cuvalToplami, gorunenCuvallar, type Cuval, type CuvalDeposu, type CuvalTopu } from "../../src/lib/cuval-deposu";
import { UNIT } from "../../src/lib/labels/uretim";
import { useSession } from "../../src/state/session";
import { Screen } from "../../src/ui/Frame";
import { kartSecEylemi } from "../../src/ui/BaslikMenusu";
import { Basilabilir, KademeliGiris } from "../../src/ui/hareket";
import { MODULE_ICON } from "../../src/ui/icons";
import { CuvalToplari, type TopIsareti } from "../../src/ui/cuval/CuvalToplari";
import { CuvalToplamSatiri, type CuvalAltToplam } from "../../src/ui/cuval/CuvalToplamSatiri";
import { BlokBasligi, ListeBlogu, ListeSatiri, Rozet, StatCard } from "../../src/ui/ortak";
import { qty } from "../../src/ui/pano/read";
import { SnapshotGate } from "../../src/ui/pano/SnapshotGate";
import { useSnapshot } from "../../src/ui/pano/useSnapshot";
import {
  CUVAL_KARTLARI, CUVAL_SUTUNLARI, CUVAL_VARSAYILAN_SUTUN, cuvalKartDegistir, doluSutunlar, cuvalKartlari, cuvalKartSifirla, cuvalTemizle, ETIKET_FARKLI, type CuvalKartKey,
} from "../../src/ui/cuval/gorunum";
import { azamiSutun, etkinSuzgecSayisi, gecerliSecim, siganSutun, sonrakiSiralama, suzgecAta, suzgecSec, sutunDegistir, sutunTasi, type SutunTanimi } from "../../src/ui/tablo/model";
import { SutunSecici, VisibilityPicker } from "../../src/ui/tablo/Seciciler";
import { EtkinSuzgecler, SuzgecBos, SuzgecSayfasi } from "../../src/ui/tablo/Suzgec";
import { useCihazTercihi } from "../../src/ui/tablo/useCihazTercihi";
import type { TabloTercihiDurumu } from "../../src/ui/tablo/useTabloTercihi";
import { TabloAraclari, TabloBasligi, TabloGovdesi, TabloSatiri, toplamGenislik, useYatayEksen } from "../../src/ui/tablo/VeriTablosu";
import { makeStyles, useTokens } from "../../src/ui/theme-context";
import { TOUCH, space, typography } from "../../src/ui/tokens";

/** İlk çizimde bu kadar çuval; "Daha fazla" her basışta bir o kadar açar. */
export const CUVAL_SAYFA = 50;
export const CUVAL_BOS = "Çuval listesi fabrika güncellemesinden sonra görünür";

export default function Cuvallar() {
  const { permissions } = useSession();
  const t = useTokens();
  const s = useStyles();
  const acik = can(permissions, "bulut:sevkiyat:oku");
  const snap = useSnapshot("cuval-deposu", acik);
  const azami = azamiSutun();
  const pref = useCihazTercihi("tablo.cuval", useMemo(() => cuvalTemizle(azami), [azami]));
  const [kartSecici, setKartSecici] = useState(false);
  const kartlarEylemi = kartSecEylemi(() => setKartSecici(true), "cuval-kart-sec");
  // Alt şerit görünen (süzülen) satırların toplamı; içerik hesaplayıp buraya bildirir (şerit ekranın altında sabit).
  const [toplam, setToplam] = useState<CuvalAltToplam | null>(null);
  return (
    <Screen module="cuvallar" onRefresh={snap.reload} refreshing={snap.refreshing} headerSecondary={[kartlarEylemi]} footer={snap.data ? <CuvalToplamSatiri toplam={toplam} /> : undefined}>
      <SnapshotGate remote={snap} variant="list" rows={4} empty={CUVAL_BOS} testID="cuval">
        {(veri) => <Icerik d={cuvalDeposu(veri)} pref={pref} azami={azami} onToplam={setToplam} />}
      </SnapshotGate>
      <Text style={s.not}>Salt izleme: çuvala ekleme, çıkarma ve sevk panelden yapılır. Kg çuvalın brüt tartısıdır.</Text>
      <VisibilityPicker
        visible={kartSecici} title="Kartları seç" testID="cuval-kart-secici"
        items={CUVAL_KARTLARI} shown={cuvalKartlari(pref.tercih)} enAz={0}
        onToggle={(k) => pref.degistir((v) => cuvalKartDegistir(v, k as CuvalKartKey))}
        onDefault={() => pref.degistir(cuvalKartSifirla)}
        onClose={() => setKartSecici(false)}
      />
    </Screen>
  );
}

function Icerik({ d, pref, azami, onToplam }: { readonly d: CuvalDeposu; readonly pref: TabloTercihiDurumu; readonly azami: number; readonly onToplam: (t: CuvalAltToplam | null) => void }) {
  const s = useStyles();
  const genislik = useWindowDimensions().width;
  const eksen = useYatayEksen();
  const [ara, setAra] = useState("");
  const [sutunAcik, setSutunAcik] = useState(false);
  const [suzgecAcik, setSuzgecAcik] = useState(false);
  const kartlar = cuvalKartlari(pref.tercih);
  const gruplar = useMemo(() => cuvalSuzgecGruplari(d), [d]);
  // Yalnız seçeneği hâlâ olan seçimler süzer (çuvalı kalmamış cari listeyi boşaltmaz).
  const suzgec = useMemo(() => gecerliSecim(gruplar, pref.tercih.suzgec), [gruplar, pref.tercih.suzgec]);
  // Temizle kart seçimini silmez (aynı tercihin `kartlar` alanı); yalnız süzgeç grupları.
  const yalnizKartlar = (v: Readonly<Record<string, string>>) => Object.fromEntries(Object.entries(v).filter(([k]) => !gruplar.some((g) => g.anahtar === k)));
  const suzgecTemizle = () => pref.degistir((v) => ({ ...v, suzgec: yalnizKartlar(v.suzgec) }));
  const satirlar = useMemo(() => gorunenCuvallar(d, ara, suzgec, pref.tercih.siralama), [d, ara, suzgec, pref.tercih.siralama]);
  const gorunur = doluSutunlar(pref.tercih.sutunlar, d.cuvallar).flatMap((k) => CUVAL_SUTUNLARI.filter((c) => c.key === k));
  const suzulmus = ara.trim() !== "" || etkinSuzgecSayisi(suzgec) > 0;
  const alt = useMemo<CuvalAltToplam | null>(() => (d.cuvallar.length === 0 ? null : { etiket: suzulmus ? "Süzülen" : "Toplam", sayilar: cuvalToplami(satirlar) }), [d.cuvallar.length, suzulmus, satirlar]);
  // Değer anahtarıyla: üst ekran her çizimde belgeyi yeniden okur (yeni nesne) — aynı toplam yeniden bildirilmez (döngü yok).
  const altAnahtar = alt ? JSON.stringify(alt) : "";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız değer değişince
  useEffect(() => { onToplam(alt); }, [altAnahtar, onToplam]);
  const yatay = gorunur.length > siganSutun(genislik) ? eksen : null;
  const cariSec = (deger: string | null) => pref.degistir((v) => ({ ...v, suzgec: suzgecSec(v.suzgec, "cari", deger) }));

  if (d.cuvallar.length === 0) {
    return <Text style={s.bos} testID="cuval-yok">Depoda bekleyen çuval yok</Text>;
  }
  const o = d.ozet;
  const stat: Partial<Record<CuvalKartKey, ReactElement>> = {
    cuval: <StatCard etiket="Çuval" icon={MODULE_ICON.cuvallar.icon} ton="blue" degerler={[{ deger: qty(o.cuval), birim: "çuval" }]} ipucu={`${qty(o.sevkeAtanan)} sevke atandı`} testID="kpi-cuval" />,
    top: <StatCard etiket="Top" icon="cube-outline" ton="teal" degerler={[{ deger: qty(o.top), birim: UNIT.top }]} ipucu="Çuvallardaki toplar" testID="kpi-cuval-top" />,
    metre: <StatCard etiket="Metre" icon="resize-outline" ton="green" degerler={[{ deger: qty(o.metre), birim: UNIT.metre }]} ipucu="Çuvallardaki toplam" testID="kpi-cuval-metre" />,
    ...(o.kg !== null
      ? { kg: <StatCard etiket="Brüt kg" icon="scale-outline" ton="amber" degerler={[{ deger: qty(o.kg), birim: "kg" }]} ipucu={`${qty(o.tartiliCuval)} çuval tartılı`} testID="kpi-cuval-kg" /> }
      : {}),
  };
  const kpis = kartlar.flatMap((k) => (stat[k] ? [{ k, el: stat[k] }] : []));
  const ikililer: { k: string; el: ReactElement }[][] = [];
  for (let i = 0; i < kpis.length; i += 2) ikililer.push(kpis.slice(i, i + 2));
  const seciliCari = suzgec.cari ?? null;

  return (
    <View testID="cuval-icerik">
      {ikililer.map((row, i) => (
        <KademeliGiris key={row.map((x) => x.k).join("+")} sira={i} style={s.ikili}>
          {row.map((x) => <View key={x.k} style={s.yarim}>{x.el}</View>)}
        </KademeliGiris>
      ))}

      {kartlar.includes("cariler") ? (
        <ListeBlogu baslik="Kimin kaç çuvalı" sayi={d.cariler.length} ilk={kpis.length === 0} testID="cuval-cariler">
          <ListeSatiri
            birincil="Hepsi" ikincil={`${qty(o.cuval)} çuval · ${qty(o.top)} ${UNIT.top}`} deger={`${qty(o.metre)} ${UNIT.metre}`} ikiSatir ayrac={false} ok={false}
            rozet={seciliCari === null ? <Rozet label="Seçili" tone="primary" /> : undefined}
            onPress={() => cariSec(null)} testID="cuval-cari-hepsi"
          />
          {d.cariler.map((c) => {
            const k = cariAnahtari(c);
            return (
              <ListeSatiri
                key={k} birincil={c.ad} ikincil={`${qty(c.cuval)} çuval · ${qty(c.top)} ${UNIT.top}${c.kg !== null ? ` · ${qty(c.kg)} kg` : ""}`}
                deger={`${qty(c.metre)} ${UNIT.metre}`} ikiSatir ok={false}
                rozet={seciliCari === k ? <Rozet label="Seçili" tone="primary" /> : undefined}
                onPress={() => cariSec(seciliCari === k ? null : k)} testID={`cuval-cari-${k}`}
              />
            );
          })}
        </ListeBlogu>
      ) : null}

      {/* Ekran adını yineleyen "Çuvallar" başlığı yalnız üstünde cari dökümü varken (iki listeyi ayırır); yoksa araç
          satırı doğrudan kartların ya da ekran başlığının altında (2026-11-19, boş bant kusuru). */}
      {kartlar.includes("cariler") ? (
        <View style={s.listeBasi}><BlokBasligi baslik="Çuvallar" sayi={satirlar.length} testID="cuval-liste-baslik" /></View>
      ) : null}
      <TabloAraclari
        testID="cuval"
        ara={{ value: ara, onChangeText: setAra, placeholder: "Çuval no, parti, cari, top no, ürün ara" }}
        suzgecSayisi={etkinSuzgecSayisi(suzgec)}
        onSuzgec={() => setSuzgecAcik(true)}
        onSutun={() => setSutunAcik(true)}
      />
      <EtkinSuzgecler gruplar={gruplar} secim={suzgec} onKaldir={(g) => pref.degistir((v) => ({ ...v, suzgec: suzgecAta(v.suzgec, g, []) }))} onTemizle={suzgecTemizle} testID="cuval-suzgec" />
      <TabloBasligi
        testID="cuval" sutunlar={gorunur} siralama={pref.tercih.siralama} yatay={yatay ?? undefined} siralanabilir={CUVAL_SIRALANABILIR}
        onSirala={(alan) => pref.degistir((v) => ({ ...v, siralama: sonrakiSiralama(v.siralama, alan) }))}
      />
      <CuvalListesi satirlar={satirlar} sutunlar={gorunur as readonly SutunTanimi<Cuval>[]} yatay={yatay} bos={Object.keys(suzgec).length > 0 ? suzgecTemizle : undefined} />

      <SutunSecici
        visible={sutunAcik} testID="cuval-sutun-secici" sutunlar={CUVAL_SUTUNLARI} gorunur={pref.tercih.sutunlar} azami={azami}
        onDegistir={(k) => pref.degistir((v) => ({ ...v, sutunlar: sutunDegistir(v.sutunlar, k, azami) }))}
        onTasi={(k, yon) => pref.degistir((v) => ({ ...v, sutunlar: sutunTasi(v.sutunlar, k, yon) }))}
        onVarsayilan={() => pref.degistir((v) => ({ ...v, sutunlar: CUVAL_VARSAYILAN_SUTUN }))}
        onClose={() => setSutunAcik(false)}
      />
      {/* Belge (anlık) tam ve istemcide ⇒ sonuç sayısı kesin. */}
      <SuzgecSayfasi
        visible={suzgecAcik} testID="cuval-suzgec-secici" gruplar={gruplar} secim={suzgec}
        onUygula={(yeni) => pref.degistir((v) => ({ ...v, suzgec: { ...yalnizKartlar(v.suzgec), ...yeni } }))}
        sayac={(taslak) => gorunenCuvallar(d, ara, taslak, null).length}
        onClose={() => setSuzgecAcik(false)}
      />
    </View>
  );
}

function CuvalListesi({ satirlar, sutunlar, yatay, bos }: { readonly satirlar: readonly Cuval[]; readonly sutunlar: readonly SutunTanimi<Cuval>[]; readonly yatay: ReturnType<typeof useYatayEksen> | null; readonly bos?: () => void }) {
  const s = useStyles();
  const t = useTokens();
  const [adet, setAdet] = useState(CUVAL_SAYFA);
  const [acik, setAcik] = useState<string | null>(null);
  if (satirlar.length === 0) return bos ? <SuzgecBos onTemizle={bos} testID="cuval-bos-suzgec" /> : <Text style={s.bos} testID="cuval-bos-arama">Aramaya uyan çuval yok</Text>;
  const kalan = satirlar.length - adet;
  return (
    <View>
      <TabloGovdesi testID="cuval-govde" yatay={yatay ? { eksen: yatay, genislik: toplamGenislik(sutunlar) } : undefined}>
        {satirlar.slice(0, adet).map((c, i) => (
          <View key={c.id}>
            <TabloSatiri yatay={!!yatay} sutunlar={sutunlar} kayit={c} ayrac={i > 0} onPress={() => setAcik((a) => (a === c.id ? null : c.id))} testID={`cuval-satir-${c.id}`} />
            {acik === c.id ? <CuvalIcerigi c={c} /> : null}
          </View>
        ))}
      </TabloGovdesi>
      {kalan > 0 ? (
        <Pressable onPress={() => setAdet((n) => n + CUVAL_SAYFA)} style={s.dahaFazla} accessibilityRole="button" testID="cuval-daha-fazla">
          <Text style={[s.dahaYazi, { color: t.tint }]}>{`Daha fazla göster (${kalan} kaldı)`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Açılan çuvalın içeriği: başlıkta çuvalın kendi bilgisi, altında toplar — ortak görünüm `ui/cuval/CuvalToplari`
 *  (sevkiyat ayrıntısının çuvallarıyla aynı); etiketi başka müşteriye basılmış top sarı zeminli ve işaretli. */
const FARK_ISARETI: readonly TopIsareti[] = [{ anahtar: "fark", label: ETIKET_FARKLI, tone: "warning" }];
const farkIsareti = (x: CuvalTopu): readonly TopIsareti[] => (x.etiketFarkli ? FARK_ISARETI : []);

function CuvalIcerigi({ c }: { readonly c: Cuval }) {
  const bas = [c.cari ?? "Müşterisiz", c.sube, c.sevkiyatNo ? `Sevkiyat ${c.sevkiyatNo}` : "Depoda", c.kg !== null ? `${qty(c.kg)} kg brüt` : "Tartılmadı"].filter(Boolean).join(" · ");
  return <CuvalToplari toplar={c.toplar} onEk="cuval" id={c.id} baslik={bas} isaretler={farkIsareti} vurgu={(x) => x.etiketFarkli} />;
}

const useStyles = makeStyles((t) => ({
  ikili: { flexDirection: "row" as const, gap: space.m, marginBottom: space.s },
  yarim: { flex: 1, minWidth: 0, flexDirection: "row" as const },
  listeBasi: { marginTop: space.l },
  not: { ...typography.footnote, color: t.color.textMuted, marginTop: space.s, marginBottom: space.m },
  bos: { ...typography.footnote, color: t.color.textMuted, paddingVertical: space.l, textAlign: "center" as const },
  dahaFazla: { minHeight: 44, alignItems: "center" as const, justifyContent: "center" as const, marginBottom: space.m },
  dahaYazi: { ...typography.callout, fontWeight: "600" as const },
  kartDugmesi: { minWidth: TOUCH, minHeight: TOUCH, alignItems: "center" as const, justifyContent: "center" as const },
}));
