// Cari kartı (şartname §4.8): kimlik başlığı → alt sekme şeridi (Özet · Siparişler · Sevkiyatlar · Bilgi) → seçili
// sekmenin blokları. Bakiye, ekstre ve hareketler YALNIZ `bulut:cari-bakiye:oku` izniyle çizilir; izin yoksa bölüm
// hiç yoktur ("izniniz yok" yazısı da yok — finans kapalı fabrikada). İadeler, toplamlar ve en çok alınan ürünler için
// fabrika henüz alan göndermiyor: "henüz gelmedi" satırı, yer tutucu sayı YOK. Uygulama listeyi sayıp toplamaz.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import type { ProjectionRecord } from "../../../../src/api/wire";
import { can } from "../../../../src/lib/access";
import { cariLockView } from "../../../../src/lib/cari-lock";
import { fmtFactoryDateTime } from "../../../../src/lib/factory-time";
import { formatMoney, formatNumber } from "../../../../src/lib/format";
import { cariKindLabel, destinationLabel } from "../../../../src/lib/labels/siparis";
import { useSession } from "../../../../src/state/session";
import { useRemote } from "../../../../src/state/useRemote";
import { Screen } from "../../../../src/ui/Frame";
import { KademeliGiris } from "../../../../src/ui/hareket";
import { MODULE_ICON } from "../../../../src/ui/icons";
import { Button } from "../../../../src/ui/kit";
import { openRecord } from "../../../../src/ui/nav";
import { AltSekmeler, HataDurumu, IconTile, Iskelet, ListeBlogu, ListeSatiri, Rozet, SectionCard } from "../../../../src/ui/ortak";
import { useListCapability } from "../../../../src/ui/siparis/capabilities";
import { ShipmentRow, cariRowText } from "../../../../src/ui/siparis/CustomerRow";
import { CustomerMovements } from "../../../../src/ui/siparis/OrderLines";
import { OrderRow, asObj, str } from "../../../../src/ui/siparis/OrderRow";
import { ListStates, StaleNote } from "../../../../src/ui/siparis/parts";
import { useRemoteList } from "../../../../src/ui/siparis/useRemoteList";
import { makeStyles } from "../../../../src/ui/theme-context";
import { FONT_SCALE, space, tabularNums, typography } from "../../../../src/ui/tokens";

type Sekme = "ozet" | "siparisler" | "sevkiyatlar" | "bilgi";
const OZET_SATIR = 5;

interface Amount { doviz: string; value: unknown }
const amounts = (v: unknown, field: "bakiye" | "tutar"): Amount[] =>
  Array.isArray(v) ? v.map((x) => asObj(x)).map((x) => ({ doviz: str(x.doviz) ?? "TRY", value: x[field] })) : [];

/** Muhasebe hesabı kartı: para birimi başına ayrı bakiye satırı (toplanmaz); kilit ve vadesi geçen fabrikadan. */
function BalanceCard({ r }: { r: ProjectionRecord }) {
  const s = useStyles();
  const k = asObj(r.kayit);
  const fin = r.finans === undefined || r.finans === null ? null : asObj(r.finans);
  const balances = fin ? amounts(fin.bakiyeler, "bakiye") : [];
  const overdue = fin ? amounts(fin.gecikmis, "tutar") : [];
  const lock = cariLockView(k);
  const sag = (
    <View style={s.rozetler}>
      {k.aktif === false ? <Rozet label="Pasif" /> : null}
      {lock.state === "KILITLI" ? <Rozet label={lock.label} tone="danger" icon="lock-closed" testID={`cari-kilit-${r.id}`} /> : null}
    </View>
  );
  return (
    <SectionCard baslik={cariKindLabel(k.tur)} sag={sag} testID={`cari-hesap-${r.id}`}>
      {lock.state === "KILITLI" ? <Text style={s.meta} testID={`cari-kilit-ayrinti-${r.id}`}>{lock.text}</Text> : null}
      {lock.state === "BILINMIYOR" ? <Text style={s.meta} testID={`cari-kilit-bilinmiyor-${r.id}`}>{lock.text}</Text> : null}
      {fin !== null && balances.length === 0 ? <Text style={s.meta}>Bakiye yok</Text> : null}
      {balances.map((b) => (
        <Text key={b.doviz} style={s.bakiye} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={FONT_SCALE.title} accessibilityLabel={`Bakiye ${formatMoney(b.value, b.doviz)}`}>
          {formatMoney(b.value, b.doviz)}
        </Text>
      ))}
      {overdue.length > 0 ? (
        <View style={s.rozetler}>
          {overdue.map((o) => <Rozet key={o.doviz} tone="danger" label={`Vadesi geçmiş ${formatMoney(o.value, o.doviz)}`} testID={`vadesi-gecmis-${o.doviz}`} />)}
        </View>
      ) : null}
      {fin !== null && (fin.vadeGun != null || fin.riskLimiti != null) ? (
        <Text style={s.meta}>
          {[fin.vadeGun != null ? `Vade ${formatNumber(fin.vadeGun, 0)} gün` : null, fin.riskLimiti != null ? `Risk limiti ${formatMoney(fin.riskLimiti, str(k.varsayilanDoviz) ?? "TRY")}` : null].filter(Boolean).join(" · ")}
        </Text>
      ) : null}
    </SectionCard>
  );
}

export default function CustomerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, permissions } = useSession();
  const router = useRouter();
  const s = useStyles();
  const cap = useListCapability();
  const cariId = id ? String(id) : null;
  const r = useRemote(cariId ? `kayit:cari-kart:${cariId}` : null, () => api.record("cari-kart", String(cariId)));
  const balance = can(permissions, "bulut:cari-bakiye:oku");
  const statement = balance && can(permissions, "bulut:rapor:oku");
  const orders = can(permissions, "bulut:siparis:oku");
  const shipments = can(permissions, "bulut:sevkiyat:oku") && cap.idFilter("sevkiyat", "cariKartId");
  const movements = cap.idFilter("cari-hareket", "cariHesapId") && balance;
  const [sekme, setSekme] = useState<Sekme>("ozet");
  const [tick, setTick] = useState(0);
  const hazir = !!cariId && !!r.data;
  const accounts = useRemoteList("cari-hesap", { cariKartId: cariId ?? undefined }, { enabled: balance && hazir });
  const recent = useRemoteList("siparis", { cariKartId: cariId ?? undefined }, { enabled: orders && hazir, limit: 10 });
  const sevk = useRemoteList("sevkiyat", { cariKartId: cariId ?? undefined }, { enabled: shipments && hazir, limit: 10 });
  const k = asObj(r.data?.kayit);
  const kisisel = r.data?.kisisel === undefined || r.data.kisisel === null ? null : asObj(r.data.kisisel);
  const kimlik = r.data ? cariRowText(r.data) : null;
  const place = [str(k.ilce), str(k.il), str(k.ulke)].filter(Boolean).join(", ");
  const refresh = () => {
    r.reload();
    accounts.reload();
    recent.reload();
    sevk.reload();
    setTick((n) => n + 1);
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
              {balance ? (
                <View style={s.finans}>
                  {accounts.items.map((a) => <BalanceCard key={a.id} r={a} />)}
                  <ListStates list={accounts} empty="Bu carinin muhasebe hesabı yok" icon={MODULE_ICON.finans.icon} testID="cari-hesaplar" />
                  {statement ? (
                    <Button label="Ekstre iste" tone="secondary" icon="document-text-outline" testID="ekstre-iste"
                      onPress={() => router.push({ pathname: "/raporlar/yeni", params: { anahtar: "finance/statement", cariKartId: String(cariId) } } as never)} />
                  ) : null}
                  {movements ? <CustomerMovements accounts={accounts.items} tick={tick} /> : null}
                </View>
              ) : null}
              {orders && recent.items.length > 0 ? (
                <ListeBlogu baslik="Son siparişler" sag={<Text style={s.tumu} onPress={() => setSekme("siparisler")} accessibilityRole="link">Tümü</Text>} testID="cari-siparisler">
                  {siparisSatirlari(OZET_SATIR)}
                </ListeBlogu>
              ) : null}
              {shipments && sevk.items.length > 0 ? (
                <ListeBlogu baslik="Son sevkiyatlar" sag={<Text style={s.tumu} onPress={() => setSekme("sevkiyatlar")} accessibilityRole="link">Tümü</Text>} testID="cari-sevkiyatlar">
                  {sevkSatirlari(OZET_SATIR)}
                </ListeBlogu>
              ) : null}
              <ListeBlogu baslik="Fabrikadan beklenen" testID="cari-gelmedi">
                {["İadeler", "Toplamlar", "En çok alınan ürünler"].map((x, i) => (
                  <ListeSatiri key={x} birincil={x} rozet={<Rozet label="Henüz gelmedi" />} ayrac={i > 0} accessibilityLabel={`${x}: fabrikadan henüz gelmedi`} />
                ))}
              </ListeBlogu>
            </KademeliGiris>
          ) : null}

          {sekme === "siparisler" ? (
            <KademeliGiris sira={2}>
              {recent.items.length > 0 ? <ListeBlogu baslik="Siparişler" testID="cari-siparis-tumu">{siparisSatirlari(recent.items.length)}</ListeBlogu> : null}
              <ListStates list={recent} empty="Bu cariye ait sipariş yok" icon={MODULE_ICON.siparisler.icon} testID="cari-siparis" />
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
  finans: { gap: space.m, marginTop: space.l },
  meta: { ...typography.footnote, color: t.color.textMuted },
  bakiye: { ...typography.kpi, color: t.color.text },
  tumu: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const, color: t.color.link, paddingVertical: space.xs, paddingLeft: space.m },
  foot: { ...typography.footnote, color: t.color.textMuted, textAlign: "center" as const, marginTop: space.l },
}));
