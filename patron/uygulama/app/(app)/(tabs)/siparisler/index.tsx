// Siparişler (şartname §4.2): başlık (+ Yeni) → arama → süzgeç (modal) → özet şeridi → tam genişlik tek satırlık liste.
// Arama ve süzgeç SUNUCUDA (`ara` + `suzgec`, `LIST_SEARCH.siparis`); sunucu sipariş aramasını beyan etmiyorsa (eski
// bulut) arama gizlenir, tek "Durum" süzgeci (`durum`) kalır. Gecikme süzgeci ve "Geciken" sayısı çizilmez (kullanıcı
// kararı: termin/gecikme göstergesi yok). "Yeni sipariş" yalnız yazma izniyle ve çevrimiçiyken.
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { can } from "../../../../src/lib/access";
import { formatNumber } from "../../../../src/lib/format";
import { ORDER_STATUS, ORDER_STATUS_ORDER } from "../../../../src/lib/labels/siparis";
import { useSession } from "../../../../src/state/session";
import { useRemote } from "../../../../src/state/useRemote";
import { FilterChip } from "../../../../src/ui/FilterChip";
import { useDebounced } from "../../../../src/ui/Picker";
import { Screen } from "../../../../src/ui/Frame";
import { MODULE_ICON } from "../../../../src/ui/icons";
import { KademeliGiris } from "../../../../src/ui/hareket";
import { ListeBlogu, OzetSeridi } from "../../../../src/ui/ortak";
import { openRecord } from "../../../../src/ui/nav";
import { ChoiceSheet } from "../../../../src/ui/siparis/ChoiceSheet";
import { OrderRow, asObj } from "../../../../src/ui/siparis/OrderRow";
import { useListCapability } from "../../../../src/ui/siparis/capabilities";
import { CapsuleButton, ListStates, SearchField, StaleNote } from "../../../../src/ui/siparis/parts";
import { useRemoteList } from "../../../../src/ui/siparis/useRemoteList";
import { space } from "../../../../src/ui/tokens";

const TUMU = "tumu";
const DURUMLAR = [{ key: TUMU, label: "Tümü" }, ...ORDER_STATUS_ORDER.map((k) => ({ key: k as string, label: ORDER_STATUS[k].label }))];
/** Termin/gecikme göstergesi yok: sunucunun gecikme görünümü seçeneklere girmez. */
const GECIKME_ALANI = "gecikmis";

function Ozet({ veri }: { veri: unknown }) {
  const v = asObj(veri);
  return (
    <OzetSeridi
      testID="siparis-ozet"
      items={[
        { key: "acik", deger: formatNumber(v.acikKalem, 0), birim: "kalem", etiket: "Açık" },
        { key: "miktar", deger: formatNumber(v.acikMiktar, 0), birim: "m", etiket: "Açık miktar" },
        { key: "karsilanma", deger: formatNumber(v.karsilanmaYuzde, 0), birim: "%", etiket: "Karşılanma" },
      ]}
    />
  );
}

export default function Orders() {
  const { api, permissions, offline } = useSession();
  const router = useRouter();
  const search = useListCapability().search("siparis");
  const [secim, setSecim] = useState<string>(TUMU);
  const [sheet, setSheet] = useState(false);
  const [term, setTerm] = useState("");
  const ara = useDebounced(term.trim(), 300);
  const secili = secim === TUMU ? undefined : secim;
  const list = useRemoteList("siparis", search ? { ara: ara || undefined, suzgec: secili } : { durum: secili });
  const secenekler = search?.suzgec
    ? [{ key: TUMU, label: "Tümü" }, ...search.suzgec.secenekler.filter((o) => o.alan !== GECIKME_ALANI).map((o) => ({ key: o.deger, label: o.etiket }))]
    : DURUMLAR;
  const suzgecAdi = search?.suzgec ? search.suzgec.etiket : "Durum";
  const secimEtiketi = secenekler.find((c) => c.key === secim)?.label ?? "Tümü";
  const filtered = !!ara || secim !== TUMU;
  const canWrite = can(permissions, "bulut:siparis:yaz");
  const summary = useRemote(can(permissions, "bulut:ozet:oku") ? "anlik:ozet.siparis" : null, () => api.snapshot("ozet.siparis"), { tags: ["ozet", "ozet.siparis"] });
  const refresh = () => {
    list.reload();
    summary.reload();
  };
  const sayi = !list.loading && !list.hasMore ? list.items.length : undefined;
  return (
    <Screen
      title="Siparişler" module="siparisler" back={false}
      onRefresh={refresh} refreshing={list.refreshing || summary.refreshing}
      subtitle={<StaleNote stale={list.stale} savedAt={list.savedAt} />}
      headerRight={canWrite ? <CapsuleButton label="Yeni sipariş" icon="add" disabled={offline} onPress={() => router.push("/siparisler/yeni")} testID="yeni-siparis" /> : undefined}
    >
      <KademeliGiris sira={0}>
        <View style={{ gap: space.s, marginTop: space.xs }}>
          {search ? <SearchField value={term} onChangeText={setTerm} placeholder="Sipariş no ya da müşteri ara" testID="siparis-ara" /> : null}
          {secenekler.length > 1 ? (
            <View style={{ flexDirection: "row" }}>
              <FilterChip label={suzgecAdi} value={secimEtiketi} selected={secim !== TUMU} onPress={() => setSheet(true)} testID="suzgec-durum" />
            </View>
          ) : null}
        </View>
      </KademeliGiris>
      {summary.data ? (
        <KademeliGiris sira={1}>
          <View style={{ marginTop: space.m }}>
            <Ozet veri={summary.data.veri} />
          </View>
        </KademeliGiris>
      ) : null}
      <KademeliGiris sira={2}>
        {list.items.length > 0 ? (
          <ListeBlogu baslik={filtered ? secimEtiketi : "Tüm siparişler"} sayi={sayi} testID="siparis-listesi">
            {list.items.map((r, i) => <OrderRow key={r.id} r={r} ayrac={i > 0} onPress={() => openRecord(router, "siparis", r.id)} />)}
          </ListeBlogu>
        ) : null}
        <ListStates list={list} empty={filtered ? "Bu süzgeçte sipariş yok" : "Henüz sipariş yok"} icon={MODULE_ICON.siparisler.icon} testID="siparisler" />
      </KademeliGiris>
      <ChoiceSheet visible={sheet} title={suzgecAdi} choices={secenekler} value={secim} onSelect={setSecim} onClose={() => setSheet(false)} testIDPrefix="durum-" />
    </Screen>
  );
}
