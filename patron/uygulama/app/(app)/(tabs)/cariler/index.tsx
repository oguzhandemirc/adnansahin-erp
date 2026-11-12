// Cariler (şartname §4.7): arama (sunucu `ara`) + "Rol: Tümü" süzgeci modalla (sunucu `suzgec`, `LIST_SEARCH.cari-kart`)
// + tam genişlik tek satırlar: ad · il · rol rozetleri. Bakiye ayrıntıda (`cari-hesap`, cari kart satırı bakiye taşımaz). İstemci süzmez.
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { LIST_SEARCH } from "../../../../src/api/wire";
import { can } from "../../../../src/lib/access";
import { useSession } from "../../../../src/state/session";
import { FilterChip } from "../../../../src/ui/FilterChip";
import { Screen } from "../../../../src/ui/Frame";
import { KademeliGiris } from "../../../../src/ui/hareket";
import { ListeBlogu } from "../../../../src/ui/ortak";
import { useDebounced } from "../../../../src/ui/Picker";
import { ChoiceSheet } from "../../../../src/ui/siparis/ChoiceSheet";
import { CustomerRow } from "../../../../src/ui/siparis/CustomerRow";
import { CapsuleButton, ListStates, SearchField, StaleNote } from "../../../../src/ui/siparis/parts";
import { useRemoteList } from "../../../../src/ui/siparis/useRemoteList";
import { space } from "../../../../src/ui/tokens";
import { EMPTY_ICON, MODULE_ICON } from "../../../../src/ui/icons";

const SPEC = LIST_SEARCH["cari-kart"]!;
const ROLE_CHOICES = [{ key: "tumu", label: "Tümü" }, ...(SPEC.suzgec?.secenekler ?? []).map((o) => ({ key: o.deger, label: o.etiket }))];

export default function Customers() {
  const { permissions, offline } = useSession();
  const router = useRouter();
  const [term, setTerm] = useState("");
  const [rol, setRol] = useState("tumu");
  const [sheet, setSheet] = useState(false);
  const ara = useDebounced(term.trim(), 300);
  const list = useRemoteList("cari-kart", { ara: ara || undefined, suzgec: rol === "tumu" ? undefined : rol });
  const canWrite = can(permissions, "bulut:cari:yaz");
  return (
    <Screen
      title="Cariler" module="cariler"
      onRefresh={list.reload} refreshing={list.refreshing}
      subtitle={<StaleNote stale={list.stale} savedAt={list.savedAt} />}
      headerRight={canWrite ? <CapsuleButton label="Yeni cari" icon="add" disabled={offline} onPress={() => router.push("/cariler/yeni")} testID="yeni-cari" /> : undefined}
    >
      <KademeliGiris sira={0} style={{ gap: space.s, marginTop: space.xs }}>
        <SearchField value={term} onChangeText={setTerm} placeholder="Ad ya da kod ara" testID="cari-ara" />
        <View style={{ flexDirection: "row" }}>
          <FilterChip label={SPEC.suzgec?.etiket ?? "Rol"} value={ROLE_CHOICES.find((c) => c.key === rol)?.label ?? "Tümü"} selected={rol !== "tumu"} onPress={() => setSheet(true)} testID="suzgec-rol" />
        </View>
      </KademeliGiris>
      <KademeliGiris sira={1}>
        {list.items.length > 0 ? (
          <ListeBlogu baslik={rol === "tumu" ? "Tüm cariler" : (ROLE_CHOICES.find((c) => c.key === rol)?.label ?? "Cariler")} sayi={!list.loading && !list.hasMore ? list.items.length : undefined} testID="cari-listesi">
            {list.items.map((r, i) => <CustomerRow key={r.id} r={r} ayrac={i > 0} onPress={() => router.push({ pathname: "/cariler/[id]", params: { id: r.id } } as never)} />)}
          </ListeBlogu>
        ) : null}
        <ListStates list={list} empty={ara ? "Eşleşen cari yok" : "Cari yok"} icon={ara ? EMPTY_ICON.arama : MODULE_ICON.cariler.icon} testID="cariler" />
      </KademeliGiris>
      <ChoiceSheet visible={sheet} title={SPEC.suzgec?.etiket ?? "Rol"} choices={ROLE_CHOICES} value={rol} onSelect={setRol} onClose={() => setSheet(false)} testIDPrefix="rol-" />
    </Screen>
  );
}
