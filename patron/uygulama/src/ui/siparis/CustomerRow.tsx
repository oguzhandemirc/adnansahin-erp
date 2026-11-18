// Cari ve sevk satırları (şartname §4.7–4.8): TEK satır 48, tam genişlik. Cari: baş harf kutusu · ad · il · rol
// rozetleri (roller kimlik değil bayraktır — master veri kuralı). Sevk satırı 2026-11-19 tabloya taşındı (`ui/sevkiyat/sutunlar`).
import { View } from "react-native";
import type { ProjectionRecord } from "../../api/wire";
import { cariRoles } from "../../lib/labels/siparis";
import { ListeSatiri, Rozet, type RozetTonu } from "../ortak";
import { space } from "../tokens";
import { asObj, str } from "./OrderRow";

const ROL_TONU: Readonly<Record<string, RozetTonu>> = { musteriRolu: "primary", tedarikciRolu: "info", fasonRolu: "warning" };

export function cariRowText(r: ProjectionRecord) {
  const k = asObj(r.kayit);
  const roles = cariRoles(k);
  const passive = k.aktif === false;
  const name = str(k.ad) ?? "—";
  const sub = str(k.il) ?? str(k.kod) ?? undefined;
  const label = [name, str(k.kod), str(k.il), ...roles.map((x) => x.label), passive ? "Pasif" : null].filter(Boolean).join(", ");
  return { name, sub, roles, passive, label };
}

export function CustomerRow({ r, onPress, ayrac }: { r: ProjectionRecord; onPress: () => void; ayrac?: boolean }) {
  const x = cariRowText(r);
  const rozetler = x.roles.length > 0 || x.passive ? (
    <View style={{ flexDirection: "row", gap: space.xs }}>
      {x.roles.map((y) => <Rozet key={y.key} label={y.label} tone={ROL_TONU[y.key] ?? "soft"} />)}
      {x.passive ? <Rozet label="Pasif" /> : null}
    </View>
  ) : undefined;
  return (
    <ListeSatiri
      icon={x.passive ? "archive-outline" : "business-outline"}
      ton={x.passive ? "sky" : "rose"}
      birincil={x.name}
      ikincil={x.sub}
      rozet={rozetler}
      ayrac={ayrac}
      onPress={onPress}
      accessibilityLabel={x.label}
      testID={`cari-${r.id}`}
    />
  );
}
