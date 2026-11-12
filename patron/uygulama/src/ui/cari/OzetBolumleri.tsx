// Cari kartı "Özet" bölümleri (M2 sözleşmesi): Toplamlar · En çok alınan · Açık siparişler · İadeler. Her bölüm
// kendi isteği, iskeleti, boş durumu ve hatasıyla yaşar; birinin hatası diğerini düşürmez. Uygulama SAYMAZ:
// sayılar fabrikanın `cari-ozeti` anlığından, listeler sunucu süzgecinden. Para yok; birimler toplanmaz.
import { useState } from "react";
import { Text, View } from "react-native";
import type { CustomerSummary, CustomerSummaryPeriod, CustomerSummaryResponse, UnitQuantity } from "../../api/wire";
import { formatNumber } from "../../lib/format";
import { UNIT } from "../../lib/labels/siparis";
import { useSession } from "../../state/session";
import { useRemote, type Remote } from "../../state/useRemote";
import { MODULE_ICON } from "../icons";
import { BosDurum, HataDurumu, Iskelet, ListeBlogu, ListeSatiri, Rozet, StatCard, type StatDeger } from "../ortak";
import { SegmentedControl } from "../SegmentedControl";
import { OrderRow, asObj, str } from "../siparis/OrderRow";
import { ListStates } from "../siparis/parts";
import { useRemoteList, type RemoteList } from "../siparis/useRemoteList";
import { makeStyles } from "../theme-context";
import { space } from "../tokens";

export type Donem = "tumZamanlar" | "son12Ay";
export const DONEMLER: readonly { key: Donem; label: string }[] = [
  { key: "tumZamanlar", label: "Tüm zamanlar" },
  { key: "son12Ay", label: "Son 12 ay" },
];
export const OZET_ILK = 5;
export const URUN_TUMU = 10;
const IADE_SAYFA = 25;

/** Fabrika birim kodu → kısa etiket (`MT` → m); tanınmayan kod küçük harfle. */
export const birimEtiketi = (b: string): string => UNIT[b] ?? b.toLowerCase();
const sayi = (n: number, hane = 1) => formatNumber(n, hane);
/** Birim başına AYRI değer (toplanmaz). */
export const birimDegerleri = (xs: readonly UnitQuantity[]): StatDeger[] => xs.map((x) => ({ deger: sayi(x.miktar), birim: birimEtiketi(x.birim) }));

export function useCariOzeti(cariKartId: string | null, enabled: boolean): Remote<CustomerSummaryResponse> {
  const { api } = useSession();
  return useRemote(enabled && cariKartId ? `anlik:cari-ozeti:${cariKartId}` : null, () => api.customerSummary(String(cariKartId)));
}

/** Dört kart: sipariş · açık (şu an) · brüt sevk · iade. Sevk brüt; iade ayrı, sevkten düşülmez. */
export function toplamKartlari(ozet: CustomerSummary, d: CustomerSummaryPeriod) {
  const sevk: StatDeger[] = [{ deger: sayi(d.sevk.metre), birim: "m" }, { deger: sayi(d.sevk.top, 0), birim: "top" }];
  const acikMiktar = birimDegerleri(ozet.acik.acikMiktar);
  return [
    {
      key: "siparis", etiket: "Sipariş", icon: MODULE_ICON.siparisler.icon, ton: "violet" as const,
      degerler: [{ deger: sayi(d.siparisSayisi, 0), birim: "sipariş" }],
      ipucu: d.siparisMiktari.length > 0 ? birimDegerleri(d.siparisMiktari).map((x) => `${x.deger} ${x.birim}`).join(" · ") : `${sayi(d.kalemSayisi, 0)} kalem`,
    },
    {
      key: "acik", etiket: "Açık (şu an)", icon: "hourglass-outline" as const, ton: "amber" as const,
      degerler: acikMiktar.length > 0 ? acikMiktar : [{ deger: sayi(ozet.acik.siparisSayisi, 0), birim: "sipariş" }],
      ipucu: acikMiktar.length > 0 ? `${sayi(ozet.acik.siparisSayisi, 0)} sipariş · ${sayi(ozet.acik.kalemSayisi, 0)} kalem` : undefined,
    },
    {
      key: "sevk", etiket: "Sevk (brüt)", icon: MODULE_ICON.sevkiyat.icon, ton: "sky" as const, degerler: sevk,
      ipucu: d.sevk.cuval > 0 ? `${sayi(d.sevk.kg)} kg · ${sayi(d.sevk.tartiliCuval, 0)}/${sayi(d.sevk.cuval, 0)} çuval tartılı` : undefined,
    },
    {
      key: "iade", etiket: "İade", icon: "return-down-back-outline" as const, ton: "rose" as const,
      degerler: [{ deger: sayi(d.iade.adet, 0), birim: "top" }, { deger: sayi(d.iade.metre), birim: "m" }],
      ipucu: "sevkten düşülmez",
    },
  ];
}

/** Bölüm başlığı + "henüz gelmedi" satırı (veri fabrikadan gerçekten gelmediyse). */
function HenuzGelmedi({ baslik, testID }: { baslik: string; testID: string }) {
  return (
    <ListeBlogu baslik={baslik} testID={testID}>
      <ListeSatiri birincil="Fabrikadan henüz gelmedi" rozet={<Rozet label="Henüz gelmedi" />} ayrac={false} accessibilityLabel={`${baslik}: fabrikadan henüz gelmedi`} />
    </ListeBlogu>
  );
}

export function ToplamlarBolumu({ ozet, donem, onDonem }: { ozet: Remote<CustomerSummaryResponse>; donem: Donem; onDonem: (d: Donem) => void }) {
  const s = useStyles();
  if (ozet.forbidden) return null;
  if (ozet.loading && !ozet.data) return <View style={s.bolum}><Iskelet bicim="kpi" satir={4} testID="cari-toplamlar-yukleniyor" /></View>;
  if (ozet.notFound) return <HenuzGelmedi baslik="Toplamlar" testID="cari-toplamlar-gelmedi" />;
  if (ozet.error && !ozet.data) return <View style={s.bolum}><HataDurumu mesaj={ozet.error} onTekrar={ozet.reload} testID="cari-toplamlar-hata" /></View>;
  const veri = ozet.data?.ozet;
  if (ozet.data && !veri) return <View style={s.bolum}><BosDurum baslik="Bu müşterinin henüz hareketi yok" icon={MODULE_ICON.siparisler.icon} testID="cari-toplamlar-bos" /></View>;
  if (!veri) return null;
  return (
    <View style={s.bolum} testID="cari-toplamlar">
      <SegmentedControl items={DONEMLER} value={donem} onChange={onDonem} testIDPrefix="cari-donem-" accessibilityLabel="Dönem" />
      <View style={s.izgara}>
        {toplamKartlari(veri, veri[donem]).map((k) => (
          <StatCard key={k.key} etiket={k.etiket} icon={k.icon} ton={k.ton} degerler={k.degerler} ipucu={k.ipucu} testID={`cari-toplam-${k.key}`} />
        ))}
      </View>
    </View>
  );
}

export function EnCokUrunBolumu({ ozet, donem }: { ozet: Remote<CustomerSummaryResponse>; donem: Donem }) {
  const s = useStyles();
  const [tumu, setTumu] = useState(false);
  const urunler = ozet.data?.ozet?.[donem].enCokUrun ?? [];
  // Yükleme/hata/henüz gelmedi Toplamlar'da gösterilir (aynı istek); boş dizi = blok çizilmez (sözleşme §1).
  if (urunler.length === 0) return null;
  const gorunen = urunler.slice(0, tumu ? URUN_TUMU : OZET_ILK);
  const sag = urunler.length > OZET_ILK ? (
    <Text style={s.tumu} onPress={() => setTumu((v) => !v)} accessibilityRole="button" testID="cari-urun-tumu">{tumu ? "Daha az" : "Tümü"}</Text>
  ) : undefined;
  return (
    <ListeBlogu baslik="En çok alınan · miktara göre" sag={sag} testID="cari-urunler">
      {gorunen.map((u, i) => (
        <ListeSatiri
          key={`${u.urunId}:${u.renkId ?? ""}:${u.birim}`}
          birincil={u.urunAdi}
          ikincil={[u.renkAdi, `${sayi(u.siparisSayisi, 0)} sipariş`].filter(Boolean).join(" · ")}
          deger={`${sayi(u.miktar)} ${birimEtiketi(u.birim)}`}
          ayrac={i > 0}
          testID={`cari-urun-${i}`}
        />
      ))}
    </ListeBlogu>
  );
}

/** Açık siparişler: liste sunucuda `suzgec=ACIK` ile süzülür; başlıktaki sayı fabrikanın özetinden. */
export function AcikSiparislerBolumu({ list, sayi: adet, onAc, onTumu }: { list: RemoteList; sayi?: number; onAc: (id: string) => void; onTumu: () => void }) {
  const s = useStyles();
  if (list.forbidden) return null;
  if (list.loading) return <View style={s.bolum}><Iskelet bicim="liste" satir={2} testID="cari-acik-yukleniyor" /></View>;
  if (list.notFound) return <HenuzGelmedi baslik="Açık siparişler" testID="cari-acik-gelmedi" />;
  if (list.error && list.items.length === 0) return <View style={s.bolum}><HataDurumu mesaj={list.error} onTekrar={list.reload} testID="cari-acik-hata" /></View>;
  if (list.items.length === 0) {
    return (
      <ListeBlogu baslik="Açık siparişler" testID="cari-acik-bos">
        <ListeSatiri birincil="Açık sipariş yok" ayrac={false} />
      </ListeBlogu>
    );
  }
  const sag = <Text style={s.tumu} onPress={onTumu} accessibilityRole="link" testID="cari-acik-tumu">Tümü</Text>;
  return (
    <ListeBlogu baslik="Açık siparişler" sayi={adet} sag={sag} testID="cari-acik">
      {list.items.slice(0, OZET_ILK).map((o, i) => <OrderRow key={o.id} r={o} showCustomer={false} ayrac={i > 0} onPress={() => onAc(o.id)} />)}
    </ListeBlogu>
  );
}

function IadeSatiri({ r, ayrac }: { r: { id: string; kayit: unknown }; ayrac: boolean }) {
  const k = asObj(r.kayit);
  const iptal = str(k.iptalTarihi) !== null;
  return (
    <ListeSatiri
      birincil={str(k.iadeNo) ?? "İade"}
      ikincil={[str(k.urunAdi), str(k.renkAdi), str(k.sebepAdi)].filter(Boolean).join(" · ") || undefined}
      deger={`${formatNumber(k.metre, 1)} m`}
      rozet={iptal ? <Rozet label="İptal" /> : undefined}
      ayrac={ayrac}
      testID={`cari-iade-${r.id}`}
    />
  );
}

/**
 * İadeler: satırlar `GET /veri/iade?cariKartId=` (iade edilen top başına bir satır); sayı özetten (liste sayılmaz).
 * "Tümü" kart içinde sayfalı listeyi açar (ayrı iade ekranı yok). `destek` false = bulut iade süzgecini beyan etmiyor.
 */
export function IadelerBolumu({ cariKartId, destek, enabled, iade }: { cariKartId: string; destek: boolean; enabled: boolean; iade?: { adet: number; metre: number } }) {
  const s = useStyles();
  const [acik, setAcik] = useState(false);
  const ilk = useRemoteList("iade", { cariKartId }, { enabled: enabled && destek, limit: OZET_ILK });
  const hepsi = useRemoteList("iade", { cariKartId }, { enabled: enabled && destek && acik, limit: IADE_SAYFA });
  if (!destek || ilk.notFound) return <HenuzGelmedi baslik="İadeler" testID="cari-iade-gelmedi" />;
  if (ilk.forbidden) return null;
  if (ilk.loading) return <View style={s.bolum}><Iskelet bicim="liste" satir={2} testID="cari-iade-yukleniyor" /></View>;
  if (ilk.error && ilk.items.length === 0) return <View style={s.bolum}><HataDurumu mesaj={ilk.error} onTekrar={ilk.reload} testID="cari-iade-hata" /></View>;
  if (ilk.items.length === 0) {
    return (
      <ListeBlogu baslik="İadeler" testID="cari-iade-bos">
        <ListeSatiri birincil="Bu müşterinin iadesi yok" ayrac={false} />
      </ListeBlogu>
    );
  }
  // "Tümü" açılınca büyük sayfa gelene kadar ilk 5 durur (zıplama yok).
  const liste = acik && hepsi.items.length > 0 ? hepsi : ilk;
  const satirlar = acik ? liste.items : ilk.items.slice(0, OZET_ILK);
  const ozetMetni = iade ? `${sayi(iade.adet, 0)} top · ${sayi(iade.metre)} m` : null;
  const sag = (
    <View style={s.sagSira}>
      {ozetMetni ? <Text style={s.ozetMetni} testID="cari-iade-ozet">{ozetMetni}</Text> : null}
      {ilk.hasMore || acik ? <Text style={s.tumu} onPress={() => setAcik((v) => !v)} accessibilityRole="button" testID="cari-iade-tumu">{acik ? "Daha az" : "Tümü"}</Text> : null}
    </View>
  );
  return (
    <View>
      <ListeBlogu baslik="İadeler" sag={sag} testID="cari-iade">
        {satirlar.map((r, i) => <IadeSatiri key={r.id} r={r} ayrac={i > 0} />)}
      </ListeBlogu>
      {acik && liste === hepsi ? <ListStates list={hepsi} empty="Bu müşterinin iadesi yok" icon={MODULE_ICON.sevkiyat.icon} testID="cari-iade-sayfa" /> : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  bolum: { marginTop: space.l, gap: space.m },
  izgara: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: space.m },
  sagSira: { flexDirection: "row" as const, alignItems: "center" as const },
  ozetMetni: { fontSize: 13, lineHeight: 18, color: t.color.textMuted },
  tumu: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const, color: t.color.link, paddingVertical: space.xs, paddingLeft: space.m },
}));
