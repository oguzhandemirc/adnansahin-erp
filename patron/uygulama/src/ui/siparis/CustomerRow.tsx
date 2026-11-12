// Cari ve sevk satırları (şartname §4.7–4.8): TEK satır 48, tam genişlik. Cari: baş harf kutusu · ad · il · rol
// rozetleri (roller kimlik değil bayraktır — master veri kuralı). Sevk: sevk no · tarih (ya da müşteri) · metre · durum.
import { View } from "react-native";
import type { ProjectionRecord } from "../../api/wire";
import { formatDate } from "../../lib/format";
import { lookup } from "../../lib/labels";
import { cariRoles } from "../../lib/labels/siparis";
import { SHIPMENT_STATUS, UNIT, type RecordTone } from "../../lib/labels/uretim";
import { qty } from "../pano/read";
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

const SEVK_TONU: Readonly<Record<RecordTone, RozetTonu>> = { iyi: "success", uyari: "warning", kritik: "danger", bilgi: "info", etkin: "primary", notr: "soft", sonuk: "soft" };

export function ShipmentRow({ r, onPress, showCustomer = false, ayrac }: { r: ProjectionRecord; onPress?: () => void; showCustomer?: boolean; ayrac?: boolean }) {
  const k = asObj(r.kayit);
  const st = SHIPMENT_STATUS[String(k.durum)] ?? { label: lookup({}, k.durum), tone: "notr" as const };
  const tarih = formatDate(k.cikisTarihi ?? k.olusturulma);
  const no = str(k.sevkNo) ?? "—";
  return (
    <ListeSatiri
      birincil={no}
      birincilGenislik={84}
      ikincil={showCustomer ? (str(k.musteriAdi) ?? tarih) : tarih}
      deger={`${qty(k.toplamMetre)} ${UNIT.metre}`}
      rozet={<Rozet label={st.label} tone={SEVK_TONU[st.tone]} />}
      ayrac={ayrac}
      onPress={onPress}
      ok={false}
      accessibilityLabel={[no, str(k.musteriAdi), tarih, `${qty(k.toplamMetre)} ${UNIT.metre}`, st.label].filter(Boolean).join(", ")}
      testID={`sevk-${r.id}`}
    />
  );
}
