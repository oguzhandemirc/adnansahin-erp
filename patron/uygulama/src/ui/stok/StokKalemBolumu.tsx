// Stok ekranının kalem listesi (anlık `stok-kalem`): HAM | BİTMİŞ segmenti, "Kalem bazında" (aynı ürün+en+renk(+kat)
// tek satır: top sayısı · toplam metre · en eski yaş) ve "Top bazında" (toplar tek tek). Kaleme dokununca o kalemin
// topları satırın altında açılır. Belge istemcide tek parça ⇒ arama/süzgeç/sıralama istemcide (`lib/stok-kalem`);
// seçimler profilde (`stok.gorunum` · `tablo.stok-kalem` · `tablo.stok-top`). Sayıları fabrika hesaplar.
import { useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";
import {
  gorunenKalemler, gorunenToplar, kaleminToplari, kgVar, stokBolumu, stokSuzgecGruplari,
  type Bolum, type Gorunum, type Kalem, type StokBolumu,
} from "../../lib/stok-kalem";
import { UNIT } from "../../lib/labels/uretim";
import { BlokBasligi } from "../ortak";
import { qty } from "../pano/read";
import { SnapshotGate } from "../pano/SnapshotGate";
import { useSnapshot } from "../pano/useSnapshot";
import { SegmentedControl } from "../SegmentedControl";
import { azamiSutun, etkinSuzgecSayisi, sonrakiSiralama, suzgecSec, sutunDegistir, sutunTasi, type SutunTanimi } from "../tablo/model";
import { SuzgecSecici, SutunSecici } from "../tablo/Seciciler";
import { useTabloTercihi } from "../tablo/useTabloTercihi";
import { TabloAraclari, TabloBasligi, TabloGovdesi, TabloSatiri } from "../tablo/VeriTablosu";
import { makeStyles, useTokens } from "../theme-context";
import { space, tabularNums, typography } from "../tokens";
import {
  bolumOf, gorunumOf, gorunumTemizle, kalemTemizle, KALEM_SIRALANABILIR, KALEM_SUTUNLARI, topTemizle, TOP_SIRALANABILIR, TOP_SUTUNLARI, VARSAYILAN_SUTUN,
} from "./sutunlar";

/** İlk çizimde bu kadar satır; "Daha fazla" her basışta bir o kadar açar (telefon ~700 satırı tek seferde çizmez). */
export const SAYFA = 60;

export function StokKalemBolumu() {
  const snap = useSnapshot("stok-kalem");
  return (
    <SnapshotGate remote={snap} variant="list" rows={4} empty="Kalem listesi fabrikadan henüz gelmedi" testID="stok-kalem">
      {(veri) => <Icerik veri={veri} />}
    </SnapshotGate>
  );
}

function Icerik({ veri }: { readonly veri: unknown }) {
  const s = useStyles();
  const azami = azamiSutun(useWindowDimensions().width);
  const gorunum = useTabloTercihi("stok.gorunum", gorunumTemizle);
  const kalemPref = useTabloTercihi("tablo.stok-kalem", useMemo(() => kalemTemizle(azami), [azami]));
  const topPref = useTabloTercihi("tablo.stok-top", useMemo(() => topTemizle(azami), [azami]));
  const bolum = bolumOf(gorunum.tercih);
  const kip = gorunumOf(gorunum.tercih);
  const b = useMemo(() => stokBolumu(veri, bolum), [veri, bolum]);
  const gruplar = useMemo(() => stokSuzgecGruplari(b), [b]);
  // Yalnız bu bölümde geçerli seçimler süzer (bitmişte seçilen renk ham bölümü boşaltmaz).
  const suzgec = useMemo(
    () => Object.fromEntries(gruplar.flatMap((g) => {
      const v = kalemPref.tercih.suzgec[g.anahtar];
      return v && g.secenekler.some((o) => o.deger === v) ? [[g.anahtar, v]] : [];
    })),
    [gruplar, kalemPref.tercih.suzgec],
  );
  const [ara, setAra] = useState("");
  const [sutunAcik, setSutunAcik] = useState(false);
  const [suzgecAcik, setSuzgecAcik] = useState(false);
  const pref = kip === "kalem" ? kalemPref : topPref;
  const sutunlar = (kip === "kalem" ? KALEM_SUTUNLARI : TOP_SUTUNLARI) as readonly SutunTanimi<unknown>[];
  const gorunur = pref.tercih.sutunlar.flatMap((k) => sutunlar.filter((c) => c.key === k));
  const sec = (k: "bolum" | "gorunum", v: Bolum | Gorunum) => gorunum.degistir((t) => ({ ...t, suzgec: { ...t.suzgec, [k]: v } }));

  return (
    <View testID="stok-kalem-bolumu">
      <View style={s.segment}>
        <SegmentedControl
          items={[{ key: "ham", label: "Ham" }, { key: "bitmis", label: "Bitmiş" }]} value={bolum} onChange={(v) => sec("bolum", v)}
          testIDPrefix="stok-bolum-" accessibilityLabel="Stok bölümü"
        />
      </View>
      <BlokBasligi
        baslik={kip === "kalem" ? "Kalem bazında" : "Top bazında"}
        sayi={kip === "kalem" ? b.kalemler.length : b.toplar.length}
        sag={<Text style={s.ozet} testID="stok-kalem-ozet">{`${qty(b.toplamTop)} ${UNIT.top} · ${qty(b.toplamMetre)} ${UNIT.metre}`}</Text>}
      />
      <View style={s.segment}>
        <SegmentedControl
          items={[{ key: "kalem", label: "Kalem bazında" }, { key: "top", label: "Top bazında" }]} value={kip} onChange={(v) => sec("gorunum", v)}
          testIDPrefix="stok-gorunum-" accessibilityLabel="Liste görünümü"
        />
      </View>
      <TabloAraclari
        testID="stok-kalem"
        ara={{ value: ara, onChangeText: setAra, placeholder: kip === "kalem" ? "Ürün, en, renk ara" : "Top no, parti, kalem ara" }}
        suzgecSayisi={etkinSuzgecSayisi(suzgec)}
        onSuzgec={gruplar.length > 0 ? () => setSuzgecAcik(true) : undefined}
        onSutun={() => setSutunAcik(true)}
      />
      <TabloBasligi
        testID="stok-kalem" sutunlar={gorunur} siralama={pref.tercih.siralama}
        siralanabilir={kip === "kalem" ? KALEM_SIRALANABILIR : TOP_SIRALANABILIR}
        onSirala={(alan) => pref.degistir((t) => ({ ...t, siralama: sonrakiSiralama(t.siralama, alan) }))}
      />
      {kip === "kalem"
        ? <KalemListesi b={b} kalemler={gorunenKalemler(b, ara, suzgec, kalemPref.tercih.siralama)} sutunlar={gorunur} />
        : <SayfaliListe satirlar={gorunenToplar(b, ara, suzgec, topPref.tercih.siralama)} sutunlar={gorunur} testID="stok-top" anahtar={(t) => t.id} />}
      {!kgVar(b) ? null : <Text style={s.not}>Kg yalnız tartılı topların toplamıdır; metreyle toplanmaz.</Text>}
      <SutunSecici
        visible={sutunAcik} testID="stok-kalem-sutun-secici" sutunlar={sutunlar} gorunur={pref.tercih.sutunlar} azami={azami}
        onDegistir={(k) => pref.degistir((t) => ({ ...t, sutunlar: sutunDegistir(t.sutunlar, k, azami) }))}
        onTasi={(k, yon) => pref.degistir((t) => ({ ...t, sutunlar: sutunTasi(t.sutunlar, k, yon) }))}
        onVarsayilan={() => pref.degistir((t) => ({ ...t, sutunlar: VARSAYILAN_SUTUN[kip] }))}
        onClose={() => setSutunAcik(false)}
      />
      <SuzgecSecici
        visible={suzgecAcik} testID="stok-kalem-suzgec-secici" gruplar={gruplar} secim={suzgec}
        onSec={(g, d) => kalemPref.degistir((t) => ({ ...t, suzgec: suzgecSec(t.suzgec, g, d) }))}
        onTemizle={() => kalemPref.degistir((t) => ({ ...t, suzgec: {} }))}
        onClose={() => setSuzgecAcik(false)}
      />
    </View>
  );
}

function KalemListesi({ b, kalemler, sutunlar }: { readonly b: StokBolumu; readonly kalemler: readonly Kalem[]; readonly sutunlar: readonly SutunTanimi<unknown>[] }) {
  const [acik, setAcik] = useState<string | null>(null);
  return (
    <SayfaliListe
      satirlar={kalemler} sutunlar={sutunlar} testID="stok-kalem" anahtar={(k) => k.anahtar}
      onPress={(k) => setAcik((a) => (a === k.anahtar ? null : k.anahtar))}
      ek={(k) => (acik === k.anahtar ? <KalemToplari b={b} kalem={k} /> : null)}
    />
  );
}

function SayfaliListe<R>(p: {
  readonly satirlar: readonly R[];
  readonly sutunlar: readonly SutunTanimi<unknown>[];
  readonly testID: string;
  readonly anahtar: (r: R) => string;
  readonly onPress?: (r: R) => void;
  readonly ek?: (r: R) => ReactNode;
}) {
  const s = useStyles();
  const t = useTokens();
  const [adet, setAdet] = useState(SAYFA);
  if (p.satirlar.length === 0) return <Text style={s.bos} testID={`${p.testID}-bos`}>Aramaya ya da süzgece uyan kayıt yok</Text>;
  const kalan = p.satirlar.length - adet;
  return (
    <View>
      <TabloGovdesi testID={`${p.testID}-govde`}>
        {p.satirlar.slice(0, adet).map((r, i) => (
          <View key={p.anahtar(r)}>
            <TabloSatiri sutunlar={p.sutunlar} kayit={r} ayrac={i > 0} onPress={p.onPress ? () => p.onPress!(r) : undefined} testID={`${p.testID}-satir-${p.anahtar(r)}`} />
            {p.ek?.(r)}
          </View>
        ))}
      </TabloGovdesi>
      {kalan > 0 ? (
        <Pressable onPress={() => setAdet((n) => n + SAYFA)} style={s.dahaFazla} accessibilityRole="button" testID={`${p.testID}-daha-fazla`}>
          <Text style={[s.dahaYazi, { color: t.tint }]}>{`Daha fazla göster (${kalan} kaldı)`}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Açılan kalemin topları: top no · metre · parti · yaş (en yaşlı önce, fabrikanın sırası). */
function KalemToplari({ b, kalem }: { readonly b: StokBolumu; readonly kalem: Kalem }) {
  const s = useStyles();
  const toplar = kaleminToplari(b, kalem.anahtar);
  return (
    <View style={s.toplar} testID={`stok-kalem-toplar-${kalem.anahtar}`}>
      {toplar.map((x) => (
        <View key={x.id} style={s.topSatir} accessible accessibilityLabel={`Top ${x.topNo ?? "numarasız"}, ${qty(x.metre)} metre, ${x.gun ?? "yaşı bilinmeyen"} gün`}>
          <Text style={[s.topYazi, s.topNo]} numberOfLines={1}>{x.topNo ?? "—"}</Text>
          <Text style={[s.topYazi, s.sayi]}>{`${qty(x.metre)} ${UNIT.metre}`}</Text>
          <Text style={[s.topYazi, s.parti]} numberOfLines={1}>{x.parti ?? ""}</Text>
          <Text style={[s.topYazi, s.sayi]}>{x.gun === null ? "—" : `${x.gun} ${UNIT.gun}`}</Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  segment: { marginBottom: space.m },
  ozet: { ...typography.footnote, color: t.color.textMuted, ...tabularNums },
  not: { ...typography.footnote, color: t.color.textMuted, marginBottom: space.m },
  bos: { ...typography.footnote, color: t.color.textMuted, paddingVertical: space.l, textAlign: "center" as const },
  dahaFazla: { minHeight: 44, alignItems: "center" as const, justifyContent: "center" as const, marginBottom: space.m },
  dahaYazi: { ...typography.callout, fontWeight: "600" as const },
  toplar: { backgroundColor: t.surfaceAlt, paddingVertical: space.xs, paddingLeft: space.l, paddingRight: space.s },
  topSatir: { flexDirection: "row" as const, alignItems: "center" as const, minHeight: 30, gap: space.s },
  topYazi: { ...typography.footnote, color: t.textSecondary },
  topNo: { flex: 1.6, color: t.text },
  sayi: { flex: 1, textAlign: "right" as const, ...tabularNums },
  parti: { flex: 0.8 },
}));
