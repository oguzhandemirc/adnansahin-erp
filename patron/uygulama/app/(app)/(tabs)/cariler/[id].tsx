// Cari kartı (şartname §4.8): kimlik başlığı → alt sekme şeridi (Özet · Siparişler · Sevkiyatlar · Bilgi) → seçili
// sekmenin blokları. Adnan'da bakiye/ekstre/hareket (finans) YOKTUR. İadeler, toplamlar ve en çok alınan ürünler için
// fabrika henüz alan göndermiyor: "henüz gelmedi" satırı, yer tutucu sayı YOK. Uygulama listeyi sayıp toplamaz.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { can } from "../../../../src/lib/access";
import { fmtFactoryDateTime } from "../../../../src/lib/factory-time";
import { destinationLabel } from "../../../../src/lib/labels/siparis";
import { useSession } from "../../../../src/state/session";
import { useRemote } from "../../../../src/state/useRemote";
import { Screen } from "../../../../src/ui/Frame";
import { KademeliGiris } from "../../../../src/ui/hareket";
import { MODULE_ICON } from "../../../../src/ui/icons";
import { AcikSiparislerBolumu, EnCokUrunBolumu, IadelerBolumu, ToplamlarBolumu, useCariOzeti, type Donem } from "../../../../src/ui/cari/OzetBolumleri";
import { openRecord } from "../../../../src/ui/nav";
import { AltSekmeler, HataDurumu, IconTile, Iskelet, ListeBlogu, ListeSatiri, Rozet } from "../../../../src/ui/ortak";
import { useListCapability } from "../../../../src/ui/siparis/capabilities";
import { ShipmentRow, cariRowText } from "../../../../src/ui/siparis/CustomerRow";
import { OrderRow, asObj, str } from "../../../../src/ui/siparis/OrderRow";
import { ListStates, StaleNote } from "../../../../src/ui/siparis/parts";
import { SegmentedControl } from "../../../../src/ui/SegmentedControl";
import { useRemoteList } from "../../../../src/ui/siparis/useRemoteList";
import { makeStyles } from "../../../../src/ui/theme-context";
import { space, tabularNums, typography } from "../../../../src/ui/tokens";

type Sekme = "ozet" | "siparisler" | "sevkiyatlar" | "bilgi";
type SiparisGorunum = "tumu" | "ACIK";
const SIPARIS_GORUNUMLERI = [{ key: "tumu" as const, label: "Tümü" }, { key: "ACIK" as const, label: "Açık" }];
const OZET_SATIR = 5;

export default function CustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, permissions } = useSession();
  const router = useRouter();
  const s = useStyles();
  const cap = useListCapability();
  const cariId = id ? String(id) : null;
  const r = useRemote(cariId ? `kayit:cari-kart:${cariId}` : null, () => api.record("cari-kart", String(cariId)));
  const orders = can(permissions, "bulut:siparis:oku");
  const shipments = can(permissions, "bulut:sevkiyat:oku") && cap.idFilter("sevkiyat", "cariKartId");
  const [sekme, setSekme] = useState<Sekme>("ozet");
  const [donem, setDonem] = useState<Donem>("tumZamanlar");
  const [gorunum, setGorunum] = useState<SiparisGorunum>("tumu");
  // Listeler kartla AYNI ANDA istenir: kart gelince sırayla istenen bloklar "Fabrikadan beklenen"i aşağı itiyordu.
  const hazir = !!cariId;
  const recent = useRemoteList("siparis", { cariKartId: cariId ?? undefined }, { enabled: orders && hazir, limit: 10 });
  const sevk = useRemoteList("sevkiyat", { cariKartId: cariId ?? undefined }, { enabled: shipments && hazir, limit: 10 });
  // M2: yeni bölümler yalnız görünür sekmede istenir. "Açık" süzgeci sunucuda (`suzgec=ACIK`); eski bulut beyan etmez.
  const ozetGorunur = sekme === "ozet";
  const acikDestek = orders && !!cap.search("siparis")?.suzgec?.secenekler.some((o) => o.deger === "ACIK");
  const acikGorunum = sekme === "siparisler" && gorunum === "ACIK";
  const ozet = useCariOzeti(cariId, orders && hazir && ozetGorunur);
  const acik = useRemoteList("siparis", { cariKartId: cariId ?? undefined, suzgec: "ACIK" }, { enabled: acikDestek && hazir && (ozetGorunur || acikGorunum), limit: 25 });
  const iadeIzni = can(permissions, "bulut:sevkiyat:oku");
  const k = asObj(r.data?.kayit);
  const kisisel = r.data?.kisisel === undefined || r.data.kisisel === null ? null : asObj(r.data.kisisel);
  const kimlik = r.data ? cariRowText(r.data) : null;
  const place = [str(k.ilce), str(k.il), str(k.ulke)].filter(Boolean).join(", ");
  const refresh = () => {
    r.reload();
    recent.reload();
    sevk.reload();
    ozet.reload();
    acik.reload();
  };
  const sekmeler = [
    { key: "ozet" as const, etiket: "Özet" },
    ...(orders ? [{ key: "siparisler" as const, etiket: "Siparişler" }] : []),
    ...(shipments ? [{ key: "sevkiyatlar" as const, etiket: "Sevkiyatlar" }] : []),
    { key: "bilgi" as const, etiket: "Bilgi" },
  ];
  const siparisSatirlari = (n: number) => recent.items.slice(0, n).map((o, i) => <OrderRow key={o.id} r={o} showCustomer={false} ayrac={i > 0} onPress={() => openRecord(router, "siparis", o.id)} />);
  const sevkSatirlari = (n: number) => sevk.items.slice(0, n).map((x, i) => <ShipmentRow key={x.id} r={x} ayrac={i > 0} onPress={() => openRecord(router, "sevkiyat", x.id)} />);
  const bilgiler = [
    { key: "kod", etiket: "Kod", deger: str(k.kod) },
    { key: "yer", etiket: "Adres", deger: place || null },
    { key: "yon", etiket: "Varsayılan sevk yönü", deger: str(k.varsayilanYon) ? destinationLabel(k.varsayilanYon) : null },
  ].filter((x) => x.deger !== null);

  return (
    <Screen title={str(k.ad) ?? "Cari"} module="cariler" back onRefresh={refresh} refreshing={r.refreshing} subtitle={<StaleNote stale={r.stale} savedAt={r.savedAt} />}>
      {r.loading && !r.data ? <Iskelet bicim="liste" satir={4} /> : null}
      {r.error && !r.data ? <HataDurumu mesaj={r.error} onTekrar={r.reload} /> : null}
      {r.data && kimlik ? (
        <>
          <KademeliGiris sira={0}>
            <View style={s.kimlik} testID="cari-kimlik">
              <IconTile icon={kimlik.passive ? "archive-outline" : "business-outline"} tone={kimlik.passive ? "sky" : "rose"} size="lg" />
              <View style={s.kimlikMetin}>
                <Text style={s.kod} numberOfLines={1}>{[str(k.kod), str(k.il)].filter(Boolean).join(" · ") || "—"}</Text>
                <View style={s.rozetler}>
                  {kimlik.roles.map((x) => <Rozet key={x.key} label={x.label} tone="primary" />)}
                  {kimlik.passive ? <Rozet label="Pasif" /> : null}
                </View>
              </View>
            </View>
          </KademeliGiris>
          <KademeliGiris sira={1}>
            <AltSekmeler sekmeler={sekmeler} secili={sekme} onSec={setSekme} testID="cari-sekme" />
          </KademeliGiris>

          {sekme === "ozet" ? (
            <KademeliGiris sira={2}>
              {orders ? <ToplamlarBolumu ozet={ozet} donem={donem} onDonem={setDonem} /> : null}
              {acikDestek ? (
                <AcikSiparislerBolumu list={acik} sayi={ozet.data?.ozet?.acik.siparisSayisi} onAc={(x) => openRecord(router, "siparis", x)}
                  onTumu={() => { setGorunum("ACIK"); setSekme("siparisler"); }} />
              ) : null}
              {orders ? <EnCokUrunBolumu ozet={ozet} donem={donem} /> : null}
              {iadeIzni && cariId ? <IadelerBolumu cariKartId={cariId} destek={cap.idFilter("iade", "cariKartId")} enabled={ozetGorunur} iade={ozet.data?.ozet?.tumZamanlar.iade} /> : null}
              {orders && recent.loading && recent.items.length === 0 ? <Iskelet bicim="liste" satir={2} testID="cari-siparisler-yukleniyor" /> : null}
              {orders && recent.items.length > 0 ? (
                <ListeBlogu baslik="Son siparişler" sag={<Text style={s.tumu} onPress={() => setSekme("siparisler")} accessibilityRole="link">Tümü</Text>} testID="cari-siparisler">
                  {siparisSatirlari(OZET_SATIR)}
                </ListeBlogu>
              ) : null}
              {shipments && sevk.loading && sevk.items.length === 0 ? <Iskelet bicim="liste" satir={2} testID="cari-sevkiyatlar-yukleniyor" /> : null}
              {shipments && sevk.items.length > 0 ? (
                <ListeBlogu baslik="Son sevkiyatlar" sag={<Text style={s.tumu} onPress={() => setSekme("sevkiyatlar")} accessibilityRole="link">Tümü</Text>} testID="cari-sevkiyatlar">
                  {sevkSatirlari(OZET_SATIR)}
                </ListeBlogu>
              ) : null}
            </KademeliGiris>
          ) : null}

          {sekme === "siparisler" ? (
            <KademeliGiris sira={2}>
              {acikDestek ? (
                <View style={s.gorunum}>
                  <SegmentedControl items={SIPARIS_GORUNUMLERI} value={gorunum} onChange={setGorunum} testIDPrefix="cari-siparis-gorunum-" accessibilityLabel="Sipariş görünümü" />
                </View>
              ) : null}
              {acikGorunum ? (
                <>
                  {acik.items.length > 0 ? (
                    <ListeBlogu baslik="Açık siparişler" sayi={ozet.data?.ozet?.acik.siparisSayisi} testID="cari-siparis-acik">
                      {acik.items.map((o, i) => <OrderRow key={o.id} r={o} showCustomer={false} ayrac={i > 0} onPress={() => openRecord(router, "siparis", o.id)} />)}
                    </ListeBlogu>
                  ) : null}
                  <ListStates list={acik} empty="Açık sipariş yok" icon={MODULE_ICON.siparisler.icon} testID="cari-siparis-acik" />
                </>
              ) : (
                <>
                  {recent.items.length > 0 ? <ListeBlogu baslik="Siparişler" testID="cari-siparis-tumu">{siparisSatirlari(recent.items.length)}</ListeBlogu> : null}
                  <ListStates list={recent} empty="Bu cariye ait sipariş yok" icon={MODULE_ICON.siparisler.icon} testID="cari-siparis" />
                </>
              )}
            </KademeliGiris>
          ) : null}

          {sekme === "sevkiyatlar" ? (
            <KademeliGiris sira={2}>
              {sevk.items.length > 0 ? <ListeBlogu baslik="Sevkiyatlar" testID="cari-sevk-tumu">{sevkSatirlari(sevk.items.length)}</ListeBlogu> : null}
              <ListStates list={sevk} empty="Bu cariye sevkiyat yok" icon={MODULE_ICON.sevkiyat.icon} testID="cari-sevk" />
            </KademeliGiris>
          ) : null}

          {sekme === "bilgi" ? (
            <KademeliGiris sira={2}>
              <ListeBlogu baslik="Kimlik" testID="cari-bilgi">
                {bilgiler.map((b, i) => <ListeSatiri key={b.key} birincil={b.etiket} ikincil={b.deger ?? undefined} ayrac={i > 0} />)}
              </ListeBlogu>
              {kisisel ? (
                <ListeBlogu baslik="İletişim" testID="cari-iletisim">
                  <ListeSatiri birincil="Yetkili" ikincil={str(kisisel.yetkili) ?? "—"} ayrac={false} />
                  <ListeSatiri birincil="Telefon" ikincil={str(kisisel.telefon) ?? "—"} />
                </ListeBlogu>
              ) : null}
            </KademeliGiris>
          ) : null}

          <Text style={s.foot}>{`Fabrika verisi ${fmtFactoryDateTime(r.data.surum)}`}</Text>
        </>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  kimlik: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, paddingVertical: space.s, marginBottom: space.m },
  kimlikMetin: { flex: 1, minWidth: 0, gap: space.xs },
  kod: { ...typography.subhead, ...tabularNums, color: t.color.textMuted },
  rozetler: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: space.xs },
  gorunum: { marginTop: space.m },
  tumu: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const, color: t.color.link, paddingVertical: space.xs, paddingLeft: space.m },
  foot: { ...typography.footnote, color: t.color.textMuted, textAlign: "center" as const, marginTop: space.l },
}));
