// Çuvallar (2026-11-17) — patronun sorusu: "kimin kaç çuvalı var, çuvalda ne var?". Panelin Paketleme/Çuvallar ekranının
// SALT İZLEME karşılığı: çuvala ekleme/çıkarma, sevk ve yazdırma YOK. Kaynak anlık `cuval-deposu` (fabrika 2.12.4+):
// sevk edilmemiş çuvallar (depoda + sevke atanmış), fabrikanın saydığı özet ve cari dökümü, çuval başına toplar.
// Uygulama toplamaz: kartlar ve döküm fabrikanın sayısıdır. Cari dökümü satırına dokunmak o cariyi süzer ("Hepsi" kaldırır);
// çuval satırına dokunmak içeriği altında açar. Eski fabrikada anlık yok → anlaşılır boş durum.
// Kart, sütun ve süzgeç seçimi yalnız bu cihazda (`tablo.cuval`, `src/ui/cuval/gorunum.ts`).
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo, useState, type ReactElement } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import { can } from "../../src/lib/access";
import { cariAnahtari, cuvalDeposu, CUVAL_SIRALANABILIR, cuvalSuzgecGruplari, gorunenCuvallar, topKalemi, type Cuval, type CuvalDeposu } from "../../src/lib/cuval-deposu";
import { UNIT } from "../../src/lib/labels/uretim";
import { useSession } from "../../src/state/session";
import { Screen } from "../../src/ui/Frame";
import { Basilabilir, KademeliGiris } from "../../src/ui/hareket";
import { MODULE_ICON } from "../../src/ui/icons";
import { BlokBasligi, ListeBlogu, ListeSatiri, Rozet, StatCard } from "../../src/ui/ortak";
import { qty } from "../../src/ui/pano/read";
import { SnapshotGate } from "../../src/ui/pano/SnapshotGate";
import { useSnapshot } from "../../src/ui/pano/useSnapshot";
import {
  CUVAL_KARTLARI, CUVAL_SUTUNLARI, CUVAL_VARSAYILAN_SUTUN, cuvalKartDegistir, cuvalKartlari, cuvalKartSifirla, cuvalTemizle, ETIKET_FARKLI, type CuvalKartKey,
} from "../../src/ui/cuval/gorunum";
import { azamiSutun, etkinSuzgecSayisi, siganSutun, sonrakiSiralama, suzgecSec, sutunDegistir, sutunTasi, type SutunTanimi } from "../../src/ui/tablo/model";
import { SutunSecici, SuzgecSecici, VisibilityPicker } from "../../src/ui/tablo/Seciciler";
import { useCihazTercihi } from "../../src/ui/tablo/useCihazTercihi";
import type { TabloTercihiDurumu } from "../../src/ui/tablo/useTabloTercihi";
import { TabloAraclari, TabloBasligi, TabloGovdesi, TabloSatiri, toplamGenislik, useYatayEksen } from "../../src/ui/tablo/VeriTablosu";
import { makeStyles, useTokens } from "../../src/ui/theme-context";
import { TOUCH, space, tabularNums, typography } from "../../src/ui/tokens";

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
  const kartDugmesi = (
    <Basilabilir onPress={() => setKartSecici(true)} style={s.kartDugmesi} accessibilityRole="button" accessibilityLabel="Kartları seç" testID="cuval-kart-sec">
      <Ionicons name="options-outline" size={22} color={t.color.link} />
    </Basilabilir>
  );
  return (
    <Screen module="cuvallar" onRefresh={snap.reload} refreshing={snap.refreshing} headerRight={kartDugmesi}>
      <SnapshotGate remote={snap} variant="list" rows={4} empty={CUVAL_BOS} testID="cuval">
        {(veri) => <Icerik d={cuvalDeposu(veri)} pref={pref} azami={azami} />}
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

function Icerik({ d, pref, azami }: { readonly d: CuvalDeposu; readonly pref: TabloTercihiDurumu; readonly azami: number }) {
  const s = useStyles();
  const genislik = useWindowDimensions().width;
  const eksen = useYatayEksen();
  const [ara, setAra] = useState("");
  const [sutunAcik, setSutunAcik] = useState(false);
  const [suzgecAcik, setSuzgecAcik] = useState(false);
  const kartlar = cuvalKartlari(pref.tercih);
  const gruplar = useMemo(() => cuvalSuzgecGruplari(d), [d]);
  // Yalnız seçeneği hâlâ olan seçimler süzer (çuvalı kalmamış cari listeyi boşaltmaz).
  const suzgec = useMemo(() => Object.fromEntries(gruplar.flatMap((g) => {
    const v = pref.tercih.suzgec[g.anahtar];
    return v && g.secenekler.some((o) => o.deger === v) ? [[g.anahtar, v]] : [];
  })), [gruplar, pref.tercih.suzgec]);
  const satirlar = useMemo(() => gorunenCuvallar(d, ara, suzgec, pref.tercih.siralama), [d, ara, suzgec, pref.tercih.siralama]);
  const gorunur = pref.tercih.sutunlar.flatMap((k) => CUVAL_SUTUNLARI.filter((c) => c.key === k));
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
        ara={{ value: ara, onChangeText: setAra, placeholder: "Çuval no, cari, top no, ürün ara" }}
        suzgecSayisi={etkinSuzgecSayisi(suzgec)}
        onSuzgec={() => setSuzgecAcik(true)}
        onSutun={() => setSutunAcik(true)}
      />
      <TabloBasligi
        testID="cuval" sutunlar={gorunur} siralama={pref.tercih.siralama} yatay={yatay ?? undefined} siralanabilir={CUVAL_SIRALANABILIR}
        onSirala={(alan) => pref.degistir((v) => ({ ...v, siralama: sonrakiSiralama(v.siralama, alan) }))}
      />
      <CuvalListesi satirlar={satirlar} sutunlar={gorunur as readonly SutunTanimi<Cuval>[]} yatay={yatay} />

      <SutunSecici
        visible={sutunAcik} testID="cuval-sutun-secici" sutunlar={CUVAL_SUTUNLARI} gorunur={pref.tercih.sutunlar} azami={azami}
        onDegistir={(k) => pref.degistir((v) => ({ ...v, sutunlar: sutunDegistir(v.sutunlar, k, azami) }))}
        onTasi={(k, yon) => pref.degistir((v) => ({ ...v, sutunlar: sutunTasi(v.sutunlar, k, yon) }))}
        onVarsayilan={() => pref.degistir((v) => ({ ...v, sutunlar: CUVAL_VARSAYILAN_SUTUN }))}
        onClose={() => setSutunAcik(false)}
      />
      <SuzgecSecici
        visible={suzgecAcik} testID="cuval-suzgec-secici" gruplar={gruplar} secim={suzgec}
        onSec={(g, deger) => pref.degistir((v) => ({ ...v, suzgec: suzgecSec(v.suzgec, g, deger) }))}
        // Temizle kart seçimini silmez (aynı tercihin `kartlar` alanı).
        onTemizle={() => pref.degistir((v) => ({ ...v, suzgec: Object.fromEntries(Object.entries(v.suzgec).filter(([k]) => !gruplar.some((g) => g.anahtar === k))) }))}
        onClose={() => setSuzgecAcik(false)}
      />
    </View>
  );
}

function CuvalListesi({ satirlar, sutunlar, yatay }: { readonly satirlar: readonly Cuval[]; readonly sutunlar: readonly SutunTanimi<Cuval>[]; readonly yatay: ReturnType<typeof useYatayEksen> | null }) {
  const s = useStyles();
  const t = useTokens();
  const [adet, setAdet] = useState(CUVAL_SAYFA);
  const [acik, setAcik] = useState<string | null>(null);
  if (satirlar.length === 0) return <Text style={s.bos} testID="cuval-bos-suzgec">Aramaya ya da süzgece uyan çuval yok</Text>;
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

/** Açılan çuvalın içeriği: başlıkta çuvalın kendi bilgisi, altında toplar (top no · metre · kalem · kalite · kg · etiket). */
function CuvalIcerigi({ c }: { readonly c: Cuval }) {
  const s = useStyles();
  const t = useTokens();
  const bas = [c.cari ?? "Müşterisiz", c.sube, c.sevkiyatNo ? `Sevkiyat ${c.sevkiyatNo}` : "Depoda", c.kg !== null ? `${qty(c.kg)} kg brüt` : "Tartılmadı"].filter(Boolean).join(" · ");
  return (
    <View style={s.icerik} testID={`cuval-icerik-${c.id}`}>
      <Text style={s.icerikBas}>{bas}</Text>
      {c.toplar.length === 0 ? <Text style={s.topAlt}>Çuval boş</Text> : null}
      {c.toplar.map((x, i) => {
        const etiket = x.etiketMusteri ? `Etiket: ${x.etiketMusteri}` : "Stok etiketi";
        const alt = [x.kalite, x.kg !== null ? `${qty(x.kg)} kg` : null, etiket].filter(Boolean).join(" · ");
        return (
          <View
            key={x.id} style={[s.top, i > 0 && { borderTopWidth: 1, borderTopColor: t.separator }, x.etiketFarkli && { backgroundColor: t.color.warning.bg }]}
            accessible accessibilityLabel={[`Top ${x.topNo ?? "numarasız"}`, `${qty(x.metre)} metre`, topKalemi(x), alt, x.etiketFarkli ? ETIKET_FARKLI : null].filter(Boolean).join(", ")}
            testID={`cuval-top-${x.id}`}
          >
            <View style={s.topUst}>
              <Text style={s.topNo} numberOfLines={1}>{x.topNo ?? "—"}</Text>
              {x.etiketFarkli ? <Rozet label={ETIKET_FARKLI} tone="warning" testID={`cuval-top-fark-${x.id}`} /> : null}
              <Text style={s.topMetre}>{`${qty(x.metre)} ${UNIT.metre}`}</Text>
            </View>
            <Text style={s.topAlt} numberOfLines={2}>{topKalemi(x)}</Text>
            <Text style={s.topAlt} numberOfLines={2}>{alt}</Text>
          </View>
        );
      })}
    </View>
  );
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
  icerik: { backgroundColor: t.surfaceAlt, paddingVertical: space.xs, paddingLeft: space.l, paddingRight: space.s },
  icerikBas: { ...typography.footnote, color: t.textSecondary, paddingVertical: space.xs },
  top: { paddingVertical: space.xs, paddingHorizontal: space.xs, gap: 2 },
  topUst: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s },
  topNo: { ...typography.callout, color: t.text, flex: 1 },
  topMetre: { ...typography.callout, color: t.text, ...tabularNums },
  topAlt: { ...typography.footnote, color: t.textSecondary },
}));
