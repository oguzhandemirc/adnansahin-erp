// Bildirim ayarları formu (görünüm): ana anahtar ("bildirim yok" dahil), KONU başlıklı tür satırları (başlık başına
// tümünü aç/kapat), sessiz saatler, eşikler. İzni yetmeyen tür gösterilir ama açıklanır (sunucu zaten göndermez).
// Fabrika aynası varsa fabrika türleri yalnız ATANMIŞSA görünür; değişiklik ANINDA fabrikaya istek olur (Kaydet
// beklemez, nihai durum fabrikadan döner); tercih yetkisi yoksa kilitli. Ayna yoksa bugünkü form.
import { Pressable, Text, View } from "react-native";
import type { FactoryNotificationPrefs, FactoryPreferenceChange, NotificationKindInfo } from "../api/wire";
import { notificationKind } from "../lib/labels/diger";
import { DUE_DATE_KIND, type NotificationForm } from "../lib/notification-form";
import { changeableRows, settingsGroups, type TopicGroup } from "../lib/notification-topics";
import { GroupNote, ToggleRow } from "./diger/parts";
import { Field } from "./kit";
import { ListeBlogu } from "./ortak";
import { makeStyles, useTokens } from "./theme-context";
import { TOUCH, space, typography } from "./tokens";

export const LOCKED_TEXT = "Bildirim tercihlerinizi yöneticiniz belirler";
/** Fabrika onayı gelene kadar satırın durumu (istek yolda ya da fabrika henüz işlemedi). */
export const SAVING_TEXT = "Kaydediliyor…";

export function NotificationSettingsForm(p: {
  form: NotificationForm;
  kinds: readonly NotificationKindInfo[];
  onChange: (f: NotificationForm) => void;
  /** Fabrika termin türevi gönderiyor mu; göndermiyorsa geciken kalem türü ve eşiği çizilmez (hiç tetiklenmez). */
  dueDates?: boolean;
  /** Fabrika aynası (yoksa bugünkü form). */
  factory?: FactoryNotificationPrefs | null;
  onFactoryChange?: (changes: FactoryPreferenceChange[]) => void;
  factoryBusy?: boolean;
}) {
  const t = useTokens();
  const s = useStyles();
  const f = p.form;
  const kinds = p.dueDates ? p.kinds : p.kinds.filter((k) => k.tur !== DUE_DATE_KIND);
  const set = <K extends keyof NotificationForm>(k: K, v: NotificationForm[K]) => p.onChange({ ...f, [k]: v });
  const groups = settingsGroups(kinds, p.factory);
  /** Başlık düğmesi: buluttaki satırlar forma, fabrika satırları tek istekle fabrikaya. */
  const setTopic = (g: TopicGroup, on: boolean) => {
    const rows = changeableRows(g);
    const cloud = rows.flatMap((r) => (r.source === "bulut" ? [r.kind.tur] : []));
    if (cloud.length > 0) set("turler", { ...f.turler, ...Object.fromEntries(cloud.map((k) => [k, on])) });
    const factory = rows.flatMap((r) => (r.source === "fabrika" && r.kapali === on ? [{ tur: r.tur, kapali: !on }] : []));
    if (factory.length > 0) p.onFactoryChange?.(factory);
  };
  return (
    <View>
      <ListeBlogu>
        <ToggleRow label="Bildirimler açık" hint="Kapalıyken hiçbir bildirim gelmez" value={f.acik} onChange={(v) => set("acik", v)} testID="bildirim-ana"
          icon={f.acik ? "notifications" : "notifications-off-outline"} domain="gelenKutusu" />
      </ListeBlogu>
      {!p.factory ? (
        // Ayna yok (eski bulut / bulut kipi): bugünkü form AYNEN — tek blok, bütün türler bulut ayarında.
        <ListeBlogu baslik="Bildirim türleri" ayracli testID="bildirim-turleri">
          {kinds.map((k) => {
            const look = notificationKind(k.tur);
            return (
              <ToggleRow key={k.tur} label={k.ad} testID={`tur-${k.tur}`} icon={look.icon} domain={look.domain}
                hint={k.izinli ? k.aciklama : "Yetkiniz bu bildirimi almaya yetmiyor"}
                value={f.turler[k.tur]} disabled={!f.acik || !k.izinli}
                onChange={(v) => set("turler", { ...f.turler, [k.tur]: v })} />
            );
          })}
        </ListeBlogu>
      ) : groups.map((g) => {
        const editable = changeableRows(g);
        const allOn = editable.every((r) => (r.source === "bulut" ? f.turler[r.kind.tur] : !r.kapali));
        const toggleAll = editable.length > 1 && f.acik ? (
          <Pressable onPress={() => setTopic(g, !allOn)} disabled={p.factoryBusy} accessibilityRole="button" accessibilityLabel={`${g.label}: ${allOn ? "tümünü kapat" : "tümünü aç"}`}
            style={s.all} testID={`konu-tumu-${g.key}`}>
            <Text style={[s.allText, { color: t.color.link }]}>{allOn ? "Tümünü kapat" : "Tümünü aç"}</Text>
          </Pressable>
        ) : undefined;
        return (
          <ListeBlogu key={g.key} baslik={g.label} sag={toggleAll} ayracli testID={`konu-${g.key}`}>
            {g.rows.map((r) => {
              if (r.source === "bulut") {
                const k = r.kind;
                const look = notificationKind(k.tur);
                return (
                  <ToggleRow key={k.tur} label={k.ad} testID={`tur-${k.tur}`} icon={look.icon} domain={look.domain}
                    hint={k.izinli ? k.aciklama : "Yetkiniz bu bildirimi almaya yetmiyor"}
                    value={f.turler[k.tur]} disabled={!f.acik || !k.izinli}
                    onChange={(v) => set("turler", { ...f.turler, [k.tur]: v })} />
                );
              }
              const look = notificationKind(r.tur);
              return (
                <ToggleRow key={r.tur} label={look.ad} testID={`fabrika-tur-${r.tur}`} icon={look.icon} domain={look.domain}
                  hint={r.kilitli ? LOCKED_TEXT : r.bekliyor ? SAVING_TEXT : "Fabrikada atandı"}
                  value={!r.kapali} disabled={!f.acik || r.kilitli || p.factoryBusy === true}
                  onChange={(v) => p.onFactoryChange?.([{ tur: r.tur, kapali: !v }])} />
              );
            })}
          </ListeBlogu>
        );
      })}
      {p.factory && p.factory.turler.length === 0 ? (
        <GroupNote testID="fabrika-atama-yok">Size atanmış sipariş, iş emri ya da sevk bildirimi yok. Yöneticiniz atadığında burada görünür.</GroupNote>
      ) : null}
      {p.factory && p.factory.turler.length > 0 && !p.factory.tercihYetkisi ? <GroupNote testID="fabrika-kilitli">{LOCKED_TEXT}.</GroupNote> : null}
      <ListeBlogu baslik="Sessiz saatler">
        <ToggleRow label="Sessiz saatler" hint="Bu aralıkta doğan bildirim aralık bitince gelir (İstanbul saati)" value={f.sessizAcik} onChange={(v) => set("sessizAcik", v)}
          disabled={!f.acik} testID="sessiz" icon="moon-outline" domain="uretim" />
        {f.sessizAcik ? (
          <View style={{ flexDirection: "row", gap: space.m, paddingHorizontal: space.l, paddingTop: space.m }}>
            <View style={{ flex: 1 }}><Field label="Başlangıç" value={f.baslangic} onChangeText={(t) => set("baslangic", t.slice(0, 5))} placeholder="22:00" /></View>
            <View style={{ flex: 1 }}><Field label="Bitiş" value={f.bitis} onChangeText={(t) => set("bitis", t.slice(0, 5))} placeholder="07:00" /></View>
          </View>
        ) : null}
      </ListeBlogu>
      <ListeBlogu baslik="Eşikler" testID="bildirim-esikler">
        <View style={{ paddingHorizontal: space.l, paddingTop: space.l, paddingBottom: space.xs }}>
          <Field label="Ham stok şu miktarın altına inince" value={f.hamStokAlt} onChangeText={(t) => set("hamStokAlt", t)} placeholder="Kapalı" keyboardType="decimal-pad" />
          <Field label="Serbest stok şu miktarın altına inince" value={f.bitmisStokAlt} onChangeText={(t) => set("bitmisStokAlt", t)} placeholder="Kapalı" keyboardType="decimal-pad" />
          {p.dueDates ? <Field label="Geciken sipariş kalemi şu sayıyı aşınca" value={f.gecikenKalemUst} onChangeText={(t) => set("gecikenKalemUst", t)} placeholder="Kapalı" keyboardType="number-pad" /> : null}
          <Field label="Günlük üretim şu miktarın altındaysa" value={f.gunlukUretimAlt} onChangeText={(t) => set("gunlukUretimAlt", t)} placeholder="Kapalı" keyboardType="decimal-pad" />
          <Field label="Günlük üretim kontrol saati (0–23)" value={f.gunlukUretimSaati} onChangeText={(t) => set("gunlukUretimSaati", t.replace(/\D/g, "").slice(0, 2))} keyboardType="number-pad" />
          <Field label="Fabrikadan şu kadar dakika veri gelmezse" value={f.esitlemeGecikmeDk} onChangeText={(t) => set("esitlemeGecikmeDk", t.replace(/\D/g, "").slice(0, 5))} keyboardType="number-pad" />
        </View>
      </ListeBlogu>
      <GroupNote>Boş bırakılan eşik kapalıdır. Değerler fabrikanın gönderdiği özetle karşılaştırılır.</GroupNote>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  all: { minHeight: TOUCH, justifyContent: "center" as const, paddingHorizontal: space.xs },
  allText: { ...typography.subhead, fontWeight: "600" as const },
}));
