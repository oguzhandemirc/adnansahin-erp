// Pano kutu çizicileri: her katalog anahtarına bir çizici (`KUTU_CIZICI`). Veri pano ekranından gelir (yalnız ekli
// kutuların kaynakları istenir); çizici yalnız okur ve biçimler — sayı fabrikanın, uygulama toplamaz/oran hesaplamaz.
// Yükleniyor → iskelet · hata → yeniden dene · veri hiç gelmediyse "henüz gelmedi" (uydurma yok).
import type { Router } from "expo-router";
import type { ReactNode } from "react";
import { Text, View } from "react-native";
import type { Snapshot } from "../../api/wire";
import { can } from "../../lib/access";
import { formatCountPossessive, formatDate } from "../../lib/format";
import { lookup } from "../../lib/labels";
import { ORDER_STATUS } from "../../lib/labels/siparis";
import { PERIOD_LABEL, SHIPMENT_STATUS, UNIT, type PeriodKey } from "../../lib/labels/uretim";
import type { Remote } from "../../state/useRemote";
import { BarRow } from "../charts/BarRow";
import { AgingBar } from "../charts/AgingBar";
import { Donut } from "../charts/Donut";
import { Basilabilir } from "../hareket";
import { openRecord } from "../nav";
import { ActivityList, BosDurum, HataDurumu, IconTile, Iskelet, SectionCard, StatCard, type StatDeger } from "../ortak";
import type { RemoteList } from "../siparis/useRemoteList";
import { makeStyles, useTokens } from "../theme-context";
import { space, typography } from "../tokens";
import { FlowStrip } from "./production";
import { arr, num, obj, period, qty, str } from "./read";
import { kutu, type KutuAnahtari } from "./kutular";

export interface KutuBaglami {
  readonly anlik: Readonly<Record<string, Remote<Snapshot>>>;
  readonly liste: Readonly<Record<string, RemoteList>>;
  readonly donem: PeriodKey;
  readonly router: Router;
  readonly permissions: readonly string[];
}

const HENUZ = "Fabrikadan henüz gelmedi";

function veriOf(b: KutuBaglami, a: KutuAnahtari): { r: Remote<Snapshot> | undefined; veri: unknown } {
  const k = kutu(a).kaynak;
  const r = k?.tur === "anlik" ? b.anlik[k.ad] : undefined;
  return { r, veri: r?.data?.veri };
}

/** Gösterge kutusu: veri yoksa iskelet / hata / boş; varsa StatCard. */
function Gosterge({ b, a, degerler, ipucu, git, layout }: {
  readonly b: KutuBaglami;
  readonly a: KutuAnahtari;
  readonly degerler: (veri: unknown) => StatDeger[];
  readonly ipucu: (veri: unknown) => string | undefined;
  readonly git?: string;
  readonly layout?: "stacked" | "row";
}) {
  const t = kutu(a);
  const { r, veri } = veriOf(b, a);
  const testID = `kutu-${a}`;
  if (r?.loading && !r.data) return <View style={{ flex: 1 }} testID={testID}><Iskelet bicim="kpi" satir={1} testID={`${testID}-iskelet`} /></View>;
  if (!r?.data) {
    // 404 = fabrika bu özeti henüz göndermedi: hata değil boş durum (SnapshotGate ile aynı ayrım).
    const hata = r?.notFound ? null : (r?.error ?? null);
    return <StatCard etiket={t.baslik} icon={t.icon} ton={t.ton} degerler={[]} bos={hata ? "Alınamadı · dokun, yeniden dene" : HENUZ} onPress={hata ? r?.reload : undefined} testID={testID} />;
  }
  return <StatCard etiket={t.baslik} icon={t.icon} ton={t.ton} degerler={degerler(veri)} ipucu={ipucu(veri)} layout={layout} onPress={git ? () => b.router.push(git as never) : undefined} testID={testID} />;
}

/** Tam genişlik kutu kabı: başlık + durum (iskelet/hata/boş) ya da içerik. */
function Kart({ a, r, children, eylem, onEylem, iskelet = "liste" }: {
  readonly a: KutuAnahtari;
  readonly r: { readonly loading: boolean; readonly error: string | null; readonly reload: () => void; readonly varMi: boolean } | null;
  readonly children: () => ReactNode;
  readonly eylem?: string;
  readonly onEylem?: () => void;
  readonly iskelet?: "liste" | "cubuk";
}) {
  const t = kutu(a);
  let ic: ReactNode;
  if (r && !r.varMi && r.loading) ic = <Iskelet bicim={iskelet} satir={3} testID={`kutu-${a}-iskelet`} />;
  else if (r && !r.varMi && r.error) ic = <HataDurumu mesaj={r.error} onTekrar={r.reload} />;
  else if (r && !r.varMi) ic = <BosDurum baslik={HENUZ} aciklama="Fabrika bir sonraki eşitlemede gönderir." icon={t.icon} />;
  else ic = children();
  return (
    <SectionCard baslik={t.baslik} eylem={r?.varMi ? eylem : undefined} onEylem={onEylem} testID={`kutu-${a}`}>
      {ic}
    </SectionCard>
  );
}

const anlikDurum = (r: Remote<Snapshot> | undefined) => (r ? { loading: r.loading, error: r.notFound ? null : r.error, reload: r.reload, varMi: r.data !== null } : { loading: false, error: null, reload: () => undefined, varMi: false });
const listeDurum = (r: RemoteList | undefined) => (r ? { loading: r.loading, error: r.error, reload: r.reload, varMi: r.items.length > 0 || (!r.loading && !r.error) } : { loading: false, error: null, reload: () => undefined, varMi: false });

function HizliIslemler({ b }: { readonly b: KutuBaglami }) {
  const s = useStyles();
  const p = b.permissions;
  const islemler = [
    { key: "yeni-siparis", etiket: "Yeni\nsipariş", icon: "add-circle-outline" as const, ton: "blue" as const, git: "/siparisler/yeni", izin: "bulut:siparis:yaz" },
    { key: "yeni-musteri", etiket: "Yeni\nmüşteri", icon: "person-add-outline" as const, ton: "green" as const, git: "/cariler/yeni", izin: "bulut:cari:yaz" },
    { key: "rapor-iste", etiket: "Rapor\niste", icon: "document-text-outline" as const, ton: "violet" as const, git: "/raporlar/yeni", izin: "bulut:rapor:oku" },
    { key: "cari-ara", etiket: "Cari\nara", icon: "search-outline" as const, ton: "teal" as const, git: "/cariler", izin: "bulut:cari:oku" },
  ].filter((x) => can(p, x.izin));
  return (
    <SectionCard baslik="Hızlı işlemler" testID="kutu-hizliIslemler">
      {islemler.length === 0 ? (
        <BosDurum baslik="Yetkine uygun hızlı işlem yok" icon="flash-outline" />
      ) : (
        <View style={s.izgara}>
          {islemler.map((x) => (
            <Basilabilir key={x.key} style={s.islem} onPress={() => b.router.push(x.git as never)} accessibilityRole="button" accessibilityLabel={x.etiket.replace("\n", " ")} testID={`hizli-${x.key}`}>
              <IconTile icon={x.icon} tone={x.ton} size="md" />
              <Text style={s.islemYazi} numberOfLines={2}>{x.etiket}</Text>
            </Basilabilir>
          ))}
        </View>
      )}
    </SectionCard>
  );
}

function IstasyonCubuklari({ veri }: { readonly veri: unknown }) {
  const t = useTokens();
  const rows = arr(obj(veri).istasyonlar);
  if (rows.length === 0) return <BosDurum baslik="İstasyon verisi yok" icon="bar-chart-outline" />;
  const max = Math.max(1, ...rows.map((r) => num(r.bugunTamamlanan) ?? 0));
  return (
    <View style={{ gap: space.s }}>
      {rows.map((r, i) => (
        <BarRow key={String(r.id ?? i)} label={str(r.ad) ?? str(r.kod) ?? "—"} value={num(r.bugunTamamlanan) ?? 0} max={max} valueText={`${qty(r.bugunTamamlanan)} ${UNIT.top}`} color={t.chart[i % t.chart.length]} testID={`istasyon-${String(r.kod ?? i)}`} />
      ))}
    </View>
  );
}

function StokDagilimi({ veri }: { readonly veri: unknown }) {
  const t = useTokens();
  const s = useStyles();
  const o = obj(obj(veri).ozet);
  const dilimler = [
    { label: "Ham", value: num(o.hamMiktar) ?? 0, color: t.chart[0]! },
    { label: "Yarı mamul", value: num(o.yariMamulMiktar) ?? 0, color: t.chart[1]! },
    { label: "Bitmiş", value: num(o.bitmisMiktar) ?? 0, color: t.chart[2]! },
  ];
  if (dilimler.every((d) => d.value <= 0)) return <BosDurum baslik="Stokta mal görünmüyor" icon="pie-chart-outline" />;
  return (
    <View style={s.donut}>
      <Donut slices={dilimler} size={112} thickness={16} testID="stok-donut" />
      <View style={s.lejant}>
        {dilimler.map((d) => (
          <View key={d.label} style={s.lejantSatir}>
            <View style={[s.nokta, { backgroundColor: d.color }]} />
            <Text style={s.lejantAd} numberOfLines={1}>{d.label}</Text>
            <Text style={s.lejantDeger} numberOfLines={1}>{`${qty(d.value)} ${UNIT.metre}`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function StokYasi({ veri }: { readonly veri: unknown }) {
  const kovalar = arr(obj(veri).yasKovalari);
  if (kovalar.length === 0) return <BosDurum baslik="Yaş kovası yok" icon="hourglass-outline" />;
  const tonlar = ["iyi", "bilgi", "uyari", "kritik"] as const;
  return (
    <AgingBar
      segments={kovalar.map((k, i) => ({ label: str(k.etiket) ?? "—", value: num(k.miktar) ?? 0, tone: tonlar[Math.min(i, tonlar.length - 1)]!, valueText: `${qty(k.miktar)} ${UNIT.metre}` }))}
      testID="stok-yas"
    />
  );
}

function sonSevkler(r: RemoteList, router: Router) {
  return r.items.slice(0, 5).map((x) => {
    const k = obj(x.kayit);
    return {
      key: x.id,
      baslik: `${str(k.sevkNo) ?? "—"} · ${str(k.musteriAdi) ?? "—"}`,
      alt: `${SHIPMENT_STATUS[String(k.durum)]?.label ?? lookup({}, k.durum)} · ${formatDate(k.cikisTarihi ?? k.olusturulma)}`,
      icon: "car-outline" as const,
      ton: "green" as const,
      sag: `${qty(k.toplamMetre)} ${UNIT.metre}`,
      onPress: () => openRecord(router, "sevkiyat", x.id),
    };
  });
}

function sonSiparisler(r: RemoteList, router: Router) {
  return r.items.slice(0, 5).map((x) => {
    const k = obj(x.kayit);
    return {
      key: x.id,
      baslik: `${str(k.siparisNo) ?? "—"} · ${str(k.musteriAdi) ?? "—"}`,
      alt: `${ORDER_STATUS[String(k.durum) as keyof typeof ORDER_STATUS]?.label ?? lookup({}, k.durum)} · ${formatDate(k.siparisTarihi)}`,
      icon: "receipt-outline" as const,
      ton: "blue" as const,
      sag: `${qty(k.acikMiktar)} ${UNIT.metre}`,
      onPress: () => openRecord(router, "siparis", x.id),
    };
  });
}

export const KUTU_CIZICI: Readonly<Record<KutuAnahtari, (b: KutuBaglami) => ReactNode>> = {
  uretim: (b) => <Gosterge b={b} a="uretim" git="/uretim" degerler={(v) => [{ deger: qty(obj(v).bugunTamamlananToplam), birim: UNIT.top }]} ipucu={() => "bugün biten"} />,
  sevk: (b) => (
    <Gosterge b={b} a="sevk" git="/sevkiyat" degerler={(v) => [{ deger: qty(period(v, b.donem).sevkTopSayisi), birim: UNIT.top }]} ipucu={(v) => `${qty(period(v, b.donem).sevkMiktari)} ${UNIT.metre} · ${PERIOD_LABEL[b.donem].toLocaleLowerCase("tr-TR")}`} />
  ),
  siparis: (b) => <Gosterge b={b} a="siparis" git="/siparisler" degerler={(v) => [{ deger: qty(obj(v).acikKalem), birim: UNIT.kalem }]} ipucu={(v) => `${qty(obj(v).acikMiktar)} ${UNIT.metre} açık`} />,
  stok: (b) => <Gosterge b={b} a="stok" git="/stok" degerler={(v) => [{ deger: qty(obj(v).bitmisMiktar), birim: UNIT.metre }]} ipucu={(v) => `ölü stok ${qty(obj(v).oluMiktar)} ${UNIT.metre}`} />,
  fason: (b) => (
    <Gosterge b={b} a="fason" git="/fason" degerler={(v) => [{ deger: qty(period(v, b.donem).acikMiktar), birim: UNIT.metre }]} ipucu={(v) => `${qty(period(v, b.donem).acikKalem)} açık ${UNIT.kalem}`} />
  ),
  fasonTop: (b) => (
    <Gosterge
      b={b}
      a="fasonTop"
      git="/fason"
      degerler={(v) => (num(obj(v).acikTop) === null ? [] : [{ deger: qty(obj(v).acikTop), birim: UNIT.top }])}
      ipucu={(v) => (num(obj(v).boyahanedeTop) === null ? "şu an fasonda" : `${formatCountPossessive(obj(v).boyahanedeTop)} boyahanede`)}
    />
  ),
  hizliIslemler: (b) => <HizliIslemler b={b} />,
  uretimIstasyon: (b) => {
    const { r, veri } = veriOf(b, "uretimIstasyon");
    return <Kart a="uretimIstasyon" r={anlikDurum(r)} iskelet="cubuk" eylem="Üretim" onEylem={() => b.router.push("/uretim" as never)}>{() => <IstasyonCubuklari veri={veri} />}</Kart>;
  },
  uretimAkisi: (b) => {
    const { r, veri } = veriOf(b, "uretimAkisi");
    return <Kart a="uretimAkisi" r={anlikDurum(r)}>{() => <FlowStrip data={veri} testID="kutu-akis" />}</Kart>;
  },
  stokDagilim: (b) => {
    const { r, veri } = veriOf(b, "stokDagilim");
    return <Kart a="stokDagilim" r={anlikDurum(r)} eylem="Stok" onEylem={() => b.router.push("/stok" as never)}>{() => <StokDagilimi veri={veri} />}</Kart>;
  },
  stokYas: (b) => {
    const { r, veri } = veriOf(b, "stokYas");
    return <Kart a="stokYas" r={anlikDurum(r)} iskelet="cubuk">{() => <StokYasi veri={veri} />}</Kart>;
  },
  sonSevkler: (b) => {
    const r = b.liste.sevkiyat;
    return <Kart a="sonSevkler" r={listeDurum(r)} eylem="Tümü" onEylem={() => b.router.push("/sevkiyat" as never)}>{() => <ActivityList items={r ? sonSevkler(r, b.router) : []} bos="Henüz sevk yok" />}</Kart>;
  },
  sonSiparisler: (b) => {
    const r = b.liste.siparis;
    return <Kart a="sonSiparisler" r={listeDurum(r)} eylem="Tümü" onEylem={() => b.router.push("/siparisler" as never)}>{() => <ActivityList items={r ? sonSiparisler(r, b.router) : []} bos="Henüz sipariş yok" />}</Kart>;
  },
};

const useStyles = makeStyles((t) => ({
  izgara: { flexDirection: "row" as const, justifyContent: "space-between" as const },
  islem: { flex: 1, alignItems: "center" as const, gap: space.xsm, paddingVertical: space.s, borderRadius: t.radius.control, minHeight: 88 },
  islemYazi: { ...typography.caption, color: t.color.text, textAlign: "center" as const },
  donut: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.l },
  lejant: { flex: 1, gap: space.s },
  lejantSatir: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s },
  nokta: { width: 10, height: 10, borderRadius: 5 },
  lejantAd: { ...typography.callout, color: t.color.textMuted, flex: 1 },
  lejantDeger: { ...typography.callout, fontWeight: "600" as const, color: t.color.text },
}));
