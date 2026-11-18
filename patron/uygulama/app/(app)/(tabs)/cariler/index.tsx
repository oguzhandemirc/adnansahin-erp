// Cariler (şartname §4.7): yapışkan veri tablosu — arama (ad/kod), süzgeç (rol + aktiflik), sütun seçimi, sıralanabilir
// başlık. Süzme/sıralama SUNUCUDA (`useVeriTablosu`), görünüm tercihi profilde (`tablo.cari-kart`). Sütun tanımları
// `src/ui/cari/sutunlar` (cari kartı aynı tercihi kart seçimi için okur). Bakiye yok (finans buluta gitmez).
import { useRouter } from "expo-router";
import { can } from "../../../../src/lib/access";
import { useSession } from "../../../../src/state/session";
import { CARI_TABLO_AYARI as AYAR } from "../../../../src/ui/cari/sutunlar";
import { Screen } from "../../../../src/ui/Frame";
import { MODULE_ICON } from "../../../../src/ui/icons";
import { CapsuleButton, StaleNote } from "../../../../src/ui/siparis/parts";
import { TabloListesi, TabloUstu, useVeriTablosu } from "../../../../src/ui/tablo/useVeriTablosu";

export default function Customers() {
  const { permissions, offline } = useSession();
  const router = useRouter();
  const tablo = useVeriTablosu(AYAR);
  const { list } = tablo;
  const canWrite = can(permissions, "bulut:cari:yaz");
  return (
    <Screen
      title="Cariler" module="cariler"
      onRefresh={list.reload} refreshing={list.refreshing}
      onEndReached={list.loadMore}
      subtitle={<StaleNote stale={list.stale} savedAt={list.savedAt} />}
      headerRight={canWrite ? <CapsuleButton label="Cari" erisim="Yeni cari" icon="add" disabled={offline} onPress={() => router.push("/cariler/yeni")} testID="yeni-cari" /> : undefined}
      sticky={<TabloUstu tablo={tablo} />}
    >
      <TabloListesi
        tablo={tablo}
        onPress={(r) => router.push({ pathname: "/cariler/[id]", params: { id: r.id } } as never)}
        bos="Cari yok" bosSuzgecli="Eşleşen cari yok" icon={MODULE_ICON.cariler.icon}
      />
    </Screen>
  );
}
