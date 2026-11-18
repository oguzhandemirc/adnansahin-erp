// Cari kartı (şartname §4.8): tek satır başlık (ad · kod · il · rozet · tazelik) → alt sekme şeridi (Özet · Siparişler · Sevkiyatlar · Bilgi) → seçili
// sekmenin blokları. Adnan'da bakiye/ekstre/hareket (finans) YOKTUR. İadeler, toplamlar ve en çok alınan ürünler için
// fabrika henüz alan göndermiyor: "henüz gelmedi" satırı, yer tutucu sayı YOK. Uygulama listeyi sayıp toplamaz.
// Kart seçimi (2026-11-17): başlıktaki simge → Özet kartları, blokları ve Bilgi'deki kayıt tarihi aç/kapa (hepsi
// kapatılabilir; yeni eklenenler KAPALI). Seçim listeyle aynı `tablo.cari-kart` tercihinde (`src/ui/cari/kartlar`).
import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { can } from "../../../../src/lib/access";
import { formatDate } from "../../../../src/lib/format";
import { CARI_KARTLARI, DONEMLI_KARTLAR, TOPLAM_KARTLARI, cariKartDegistir, cariKartSifirla, cariKartlari, type CariKartKey } from "../../../../src/ui/cari/kartlar";
import { cariTemizle } from "../../../../src/ui/cari/sutunlar";
import { Basilabilir } from "../../../../src/ui/hareket";
import { VisibilityPicker } from "../../../../src/ui/tablo/Seciciler";
import { useTabloTercihi } from "../../../../src/ui/tablo/useTabloTercihi";
import { destinationLabel } from "../../../../src/lib/labels/siparis";
import { useSession } from "../../../../src/state/session";
import { useRemote } from "../../../../src/state/useRemote";
import { Screen } from "../../../../src/ui/Frame";
import { KademeliGiris } from "../../../../src/ui/hareket";
import { MODULE_ICON } from "../../../../src/ui/icons";
import { AcikSiparislerBolumu, EnCokUrunBolumu, IadelerBolumu, ToplamlarBolumu, useCariOzeti, type Donem } from "../../../../src/ui/cari/OzetBolumleri";
import { openRecord } from "../../../../src/ui/nav";
import { AltSekmeler, BlokBasligi, HataDurumu, Iskelet, ListeBlogu, ListeSatiri, Rozet } from "../../../../src/ui/ortak";
import { useListCapability } from "../../../../src/ui/siparis/capabilities";
import { cariRowText } from "../../../../src/ui/siparis/CustomerRow";
import { asObj, str } from "../../../../src/ui/siparis/OrderRow";
import { FabrikaVeriAni, ListStates, StaleNote } from "../../../../src/ui/siparis/parts";
import { CARI_SIPARIS_SUTUNLARI, SIPARIS_SUTUNLARI } from "../../../../src/ui/siparis/sutunlar";
import { CARI_SEVK_SUTUNLARI, SEVKIYAT_SUTUNLARI } from "../../../../src/ui/sevkiyat/sutunlar";
import { KisaTablo, sutunSec } from "../../../../src/ui/tablo/KisaTablo";
import { KompaktSecim } from "../../../../src/ui/KompaktSecim";
import { useRemoteList } from "../../../../src/ui/siparis/useRemoteList";
import { makeStyles, useTokens } from "../../../../src/ui/theme-context";
import { TOUCH, space, tabularNums, typography } from "../../../../src/ui/tokens";

type Sekme = "ozet" | "siparisler" | "sevkiyatlar" | "bilgi";
type SiparisGorunum = "tumu" | "ACIK";
const SIPARIS_GORUNUMLERI = [{ key: "tumu" as const, label: "Tümü" }, { key: "ACIK" as const, label: "Açık" }];
const OZET_SATIR = 5;
// Satırlar ortak tablonun sütun tanımlarından (liste ekranlarıyla aynı biçim/hücre; elle kopya yok), hepsi sola dayalı.
const SIPARIS_TABLO = sutunSec(SIPARIS_SUTUNLARI, CARI_SIPARIS_SUTUNLARI);
const SEVK_TABLO = sutunSec(SEVKIYAT_SUTUNLARI, CARI_SEVK_SUTUNLARI);

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
  const t = useTokens();
  const pref = useTabloTercihi("tablo.cari-kart", cariTemizle);
  const [secici, setSecici] = useState(false);
  const shown = cariKartlari(pref.tercih);
  const goster = (x: CariKartKey) => shown.includes(x);
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
  const acikSayi = ozet.data?.ozet?.acik.siparisSayisi;
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
  const siparisAc = (o: { id: string }) => openRecord(router, "siparis", o.id);
  const sevkAc = (x: { id: string }) => openRecord(router, "sevkiyat", x.id);
  const bilgiler = [
    { key: "kod", etiket: "Kod", deger: str(k.kod) },
    { key: "yer", etiket: "Adres", deger: place || null },
    { key: "yon", etiket: "Varsayılan sevk yönü", deger: str(k.varsayilanYon) ? destinationLabel(k.varsayilanYon) : null },
    { key: "kayit", etiket: "Kayıt tarihi", deger: goster("kayitTarihi") && str(k.olusturulma) ? formatDate(k.olusturulma) : null },
  ].filter((x) => x.deger !== null);
  const kartDugmesi = (
    <Basilabilir onPress={() => setSecici(true)} style={s.kartDugmesi} accessibilityRole="button" accessibilityLabel="Kartları seç" testID="cari-kart-sec">
      <Ionicons name="options-outline" size={22} color={t.color.link} />
    </Basilabilir>
  );
  // Kimlik başlıkla TEK satırda (2026-11-16): ad · "kod · il" · tür rozeti (ardından ortak tazelik öğesi). Dar ekranda ad sarılırsa bu öğe
  // adın altına küçük alt yazı olarak düşer; ayrı kimlik bloğu ve büyük simge yok.
  const kodIl = [str(k.kod), str(k.il)].filter(Boolean).join(" · ");
  const meta = !kimlik ? undefined : (
    <View style={s.kimlik} testID="cari-kimlik">
      {kodIl ? <Text style={s.kod} numberOfLines={1}>{kodIl}</Text> : null}
      {kimlik.roles.map((x) => <Rozet key={x.key} label={x.label} tone="primary" />)}
      {kimlik.passive ? <Rozet label="Pasif" /> : null}
    </View>
  );

  return (
    <Screen title={str(k.ad) ?? "Cari"} module="cariler" back onRefresh={refresh} refreshing={r.refreshing} meta={meta} subtitle={<StaleNote stale={r.stale} savedAt={r.savedAt} />} headerRight={kartDugmesi}>
      {r.loading && !r.data ? <Iskelet bicim="liste" satir={4} /> : null}
      {r.error && !r.data ? <HataDurumu mesaj={r.error} onTekrar={r.reload} /> : null}
      {r.data && kimlik ? (
        <>
          <KademeliGiris sira={0}>
            <AltSekmeler sekmeler={sekmeler} secili={sekme} onSec={setSekme} testID="cari-sekme" />
          </KademeliGiris>

          {sekme === "ozet" ? (
            <KademeliGiris sira={1}>
              {orders ? (
                <ToplamlarBolumu ozet={ozet} donem={donem} onDonem={setDonem} kartlar={TOPLAM_KARTLARI.filter(goster)} donemli={DONEMLI_KARTLAR.some(goster)} />
              ) : null}
              {acikDestek && goster("acikSiparisler") ? (
                <AcikSiparislerBolumu list={acik} sayi={ozet.data?.ozet?.acik.siparisSayisi} onAc={(x) => openRecord(router, "siparis", x)}
                  onTumu={() => { setGorunum("ACIK"); setSekme("siparisler"); }} />
              ) : null}
              {orders && goster("enCokUrun") ? <EnCokUrunBolumu ozet={ozet} donem={donem} /> : null}
              {iadeIzni && cariId && goster("iadeler") ? <IadelerBolumu cariKartId={cariId} destek={cap.idFilter("iade", "cariKartId")} enabled={ozetGorunur} iade={ozet.data?.ozet?.tumZamanlar.iade} /> : null}
              {orders && goster("sonSiparisler") && recent.loading && recent.items.length === 0 ? <Iskelet bicim="liste" satir={2} testID="cari-siparisler-yukleniyor" /> : null}
              {orders && goster("sonSiparisler") && recent.items.length > 0 ? (
                <View style={s.bolum}>
                  <BlokBasligi baslik="Son siparişler" sag={<Text style={s.tumu} onPress={() => setSekme("siparisler")} accessibilityRole="link">Tümü</Text>} />
                  <KisaTablo sutunlar={SIPARIS_TABLO} satirlar={recent.items.slice(0, OZET_SATIR)} onPress={siparisAc} testID="cari-siparisler" />
                </View>
              ) : null}
              {shipments && goster("sonSevkiyatlar") && sevk.loading && sevk.items.length === 0 ? <Iskelet bicim="liste" satir={2} testID="cari-sevkiyatlar-yukleniyor" /> : null}
              {shipments && goster("sonSevkiyatlar") && sevk.items.length > 0 ? (
                <View style={s.bolum}>
                  <BlokBasligi baslik="Son sevkiyatlar" sag={<Text style={s.tumu} onPress={() => setSekme("sevkiyatlar")} accessibilityRole="link">Tümü</Text>} />
                  <KisaTablo sutunlar={SEVK_TABLO} satirlar={sevk.items.slice(0, OZET_SATIR)} onPress={sevkAc} testID="cari-sevkiyatlar" />
                </View>
              ) : null}
            </KademeliGiris>
          ) : null}

          {sekme === "siparisler" ? (
            <KademeliGiris sira={1}>
              {/* Sekme adı başlığı tekrarlamaz: bölüm başlığı yok; kompakt seçim (içerik genişliği, sola dayalı) tablonun üstünde. */}
              {acikDestek ? (
                <View style={s.aracSatiri}>
                  <KompaktSecim items={SIPARIS_GORUNUMLERI} value={gorunum} onChange={setGorunum} testIDPrefix="cari-siparis-gorunum-" accessibilityLabel="Sipariş görünümü" />
                  {acikGorunum && acikSayi !== undefined ? <Text style={s.sayi} testID="cari-siparis-acik-sayi">{`${acikSayi} açık sipariş`}</Text> : null}
                </View>
              ) : null}
              {acikGorunum ? (
                <KisaTablo sutunlar={SIPARIS_TABLO} satirlar={acik.items} onPress={siparisAc} testID="cari-siparis-acik"
                  alt={<ListStates list={acik} empty="Açık sipariş yok" icon={MODULE_ICON.siparisler.icon} testID="cari-siparis-acik" />} />
              ) : (
                <KisaTablo sutunlar={SIPARIS_TABLO} satirlar={recent.items} onPress={siparisAc} testID="cari-siparis-tumu"
                  alt={<ListStates list={recent} empty="Bu cariye ait sipariş yok" icon={MODULE_ICON.siparisler.icon} testID="cari-siparis" />} />
              )}
            </KademeliGiris>
          ) : null}

          {sekme === "sevkiyatlar" ? (
            <KademeliGiris sira={1}>
              <View style={s.ustBosluk} />
              <KisaTablo sutunlar={SEVK_TABLO} satirlar={sevk.items} onPress={sevkAc} testID="cari-sevk-tumu"
                alt={<ListStates list={sevk} empty="Bu cariye sevkiyat yok" icon={MODULE_ICON.sevkiyat.icon} testID="cari-sevk" />} />
            </KademeliGiris>
          ) : null}

          {sekme === "bilgi" ? (
            <KademeliGiris sira={1}>
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

          <FabrikaVeriAni />
        </>
      ) : null}
      <VisibilityPicker
        visible={secici} title="Kartları seç" testID="cari-kart-secici"
        items={CARI_KARTLARI} shown={shown} enAz={0}
        onToggle={(x) => pref.degistir((p) => cariKartDegistir(p, x as CariKartKey))}
        onDefault={() => pref.degistir(cariKartSifirla)}
        onClose={() => setSecici(false)}
      />
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  kimlik: { flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, columnGap: space.s, rowGap: space.xs },
  kod: { ...typography.footnote, ...tabularNums, color: t.color.textMuted, flexShrink: 1 },
  aracSatiri: { flexDirection: "row" as const, alignItems: "center" as const, flexWrap: "wrap" as const, gap: space.m, marginTop: space.m, marginBottom: space.s },
  ustBosluk: { height: space.m },
  sayi: { ...typography.footnote, ...tabularNums, color: t.color.textMuted },
  bolum: { marginTop: space.m },
  tumu: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const, color: t.color.link, paddingVertical: space.xs, paddingLeft: space.m },
  kartDugmesi: { minWidth: TOUCH, minHeight: TOUCH, alignItems: "center" as const, justifyContent: "center" as const },
}));
