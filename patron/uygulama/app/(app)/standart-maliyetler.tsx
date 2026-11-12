// Standart maliyetler: ürün başına maliyet sürümleri (fabrikanın hesapladığı, tüm sürümler). Ekran yalnız teklif +
// maliyet izniyle görünür; metre maliyeti ve 5 grup `.finans`tan aynen — istemci toplamaz, oran hesaplamaz.
import { useRouter } from "expo-router";
import { standardCostRowText } from "../../src/ui/teklif/rows";
import { Screen } from "../../src/ui/Frame";
import { openRecord } from "../../src/ui/nav";
import { ListeBlogu, ListeSatiri } from "../../src/ui/ortak";
import { SectionHeader } from "../../src/ui/SectionHeader";
import { ListStates, StaleNote } from "../../src/ui/siparis/parts";
import { useRemoteList } from "../../src/ui/siparis/useRemoteList";
import { DOMAIN_TONE } from "../../src/ui/tokens";

export default function StandardCosts() {
  const router = useRouter();
  const list = useRemoteList("standart-maliyet");
  return (
    <Screen title="Standart Maliyetler" module="standart-maliyetler" onRefresh={list.reload} refreshing={list.refreshing} subtitle={<StaleNote stale={list.stale} savedAt={list.savedAt} />}>
      <SectionHeader title="Maliyet sürümleri" domain="finans" count={!list.loading && !list.hasMore ? list.items.length : undefined} />
      {list.items.length > 0 ? (
        <ListeBlogu testID="maliyet-listesi">
          {list.items.map((r, i) => {
            const x = standardCostRowText(r);
            return (
              <ListeSatiri
                key={r.id}
                birincil={x.title}
                deger={x.value}
                ikincil={x.groups ? `${x.line} · ${x.groups}` : x.line}
                ton={DOMAIN_TONE.finans}
                ayrac={i > 0}
                onPress={() => openRecord(router, "standart-maliyet", r.id)}
                testID={`kayit-${r.id}`}
              />
            );
          })}
        </ListeBlogu>
      ) : null}
      <ListStates list={list} empty="Henüz standart maliyet hesaplanmadı" domain="finans" testID="standart-maliyetler" />
    </Screen>
  );
}
