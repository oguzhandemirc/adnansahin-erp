// Cariler (şartname §4.7): yapışkan veri tablosu — arama (ad/kod), süzgeç (rol + aktiflik), sütun seçimi, sıralanabilir
// başlık. Süzme/sıralama SUNUCUDA (`useVeriTablosu`), görünüm tercihi profilde (`tablo.cari-kart`). Bakiye ayrıntıda
// (`cari-hesap`, cari kart satırı bakiye taşımaz).
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import type { ProjectionRecord } from "../../../../src/api/wire";
import { can } from "../../../../src/lib/access";
import { cariRoles } from "../../../../src/lib/labels/siparis";
import { useSession } from "../../../../src/state/session";
import { Screen } from "../../../../src/ui/Frame";
import { MODULE_ICON } from "../../../../src/ui/icons";
import { Rozet, type RozetTonu } from "../../../../src/ui/ortak";
import { asObj, str } from "../../../../src/ui/siparis/OrderRow";
import { CapsuleButton, StaleNote } from "../../../../src/ui/siparis/parts";
import type { SutunTanimi } from "../../../../src/ui/tablo/model";
import { TabloListesi, TabloUstu, useVeriTablosu } from "../../../../src/ui/tablo/useVeriTablosu";
import { useTokens } from "../../../../src/ui/theme-context";
import { space, typography } from "../../../../src/ui/tokens";

const k = (r: ProjectionRecord) => asObj(r.kayit);
const ROL_TONU: Readonly<Record<string, RozetTonu>> = { musteriRolu: "primary", tedarikciRolu: "info", fasonRolu: "warning" };

/** Dar sütunda tek rozet: ilk rol + kalan rol sayısı ("+1"); tam liste erişilebilirlik etiketinde. */
function RolHucresi({ r }: { r: ProjectionRecord }) {
  const t = useTokens();
  const roller = cariRoles(k(r));
  if (roller.length === 0) return <Text style={[typography.subhead, { color: t.textSecondary }]}>—</Text>;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, minWidth: 0 }}>
      <Rozet label={roller[0]!.label} tone={ROL_TONU[roller[0]!.key] ?? "soft"} />
      {roller.length > 1 ? <Text style={[typography.caption, { color: t.textSecondary }]}>{`+${roller.length - 1}`}</Text> : null}
    </View>
  );
}

const CARI_SUTUNLARI: readonly SutunTanimi<ProjectionRecord>[] = [
  { key: "ad", baslik: "Ad", ad: "Cari adı", agirlik: 2, sirala: "ad", hucre: (r) => str(k(r).ad) ?? "—" },
  { key: "kod", baslik: "Kod", ad: "Cari kodu", agirlik: 1, sirala: "kod", hucre: (r) => str(k(r).kod) ?? "—" },
  { key: "il", baslik: "İl", agirlik: 1, sirala: "il", hucre: (r) => str(k(r).il) ?? "—" },
  { key: "ilce", baslik: "İlçe", agirlik: 1, sirala: "ilce", hucre: (r) => str(k(r).ilce) ?? "—" },
  { key: "ulke", baslik: "Ülke", agirlik: 1, sirala: "ulke", hucre: (r) => str(k(r).ulke) ?? "—" },
  { key: "rol", baslik: "Rol", agirlik: 1.3, hucre: (r) => cariRoles(k(r)).map((x) => x.label).join(", ") || "—", ogeler: (r) => <RolHucresi r={r} /> },
  { key: "durum", baslik: "Durum", agirlik: 0.9, hucre: (r) => (k(r).aktif === false ? "Pasif" : "Aktif") },
];

const AYAR = {
  projeksiyon: "cari-kart",
  anahtar: "tablo.cari-kart",
  sutunlar: CARI_SUTUNLARI,
  varsayilan: ["ad", "il", "rol"],
  aramaIpucu: "Ad ya da kod",
  testID: "cari",
} as const;

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
      headerRight={canWrite ? <CapsuleButton label="Yeni cari" icon="add" disabled={offline} onPress={() => router.push("/cariler/yeni")} testID="yeni-cari" /> : undefined}
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
