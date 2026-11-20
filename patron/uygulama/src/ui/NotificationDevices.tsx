// Bildirim Ayarları ekranının alt bölümleri: Cihazlar (bu cihazın izin durumu + kaydet — izin isteme akışı — + kayıtlı
// cihazlar + deneme; ekranın EN ÜSTÜNDE ki izin akışı bulunsun) ve
// Bildirimler (son 20; okunmamış vurgulu + nokta; dokununca okundu sayılır ve yalnız uygulamanın kendi ekranı açılır —
// `safeRoute`; "Tümünü okundu işaretle"). Okundu kişi başına tek kayıttır, panel ile köprüyle eşitlenir.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import type { Device, NotificationItem, TestNotificationResult } from "../api/wire";
import { formatAgo } from "../lib/format";
import { devicePlatform, NOTIFICATION_SKIP, notificationKind } from "../lib/labels/diger";
import { safeRoute } from "../lib/notification-form";
import { permissionView, readPermission, type PermissionState } from "../push/permission";
import { registerThisDevice } from "../push/register";
import { NATIVE_PUSH_SOON, pushAvailable } from "../push/support";
import { BILDIRIM_ETIKETI, okunduSonucu, okunmamisAyarla } from "../state/bildirim-okunmamis";
import { useSession } from "../state/session";
import { useRemote } from "../state/useRemote";
import { GroupNote } from "./diger/parts";
import { BlokBasligi, BosDurum, IconTile, ListeBlogu, ListeSatiri, Rozet, STATUS_ROZET_TONU } from "./ortak";
import { statusEntry, type StatusEntry } from "../lib/labels";

/** Liste rozeti: gönderim anında okunmuş satır (`ATLANDI` · `OKUNDU`) "Atlandı" değil "Okundu" görünür (saha 2026-11-18). */
export function notificationBadge(n: { readonly durum: string; readonly atlamaNedeni: string | null }): StatusEntry {
  if (n.durum === "ATLANDI" && n.atlamaNedeni === "OKUNDU") return { label: "Okundu", tone: "bilgi" };
  return statusEntry(n.durum);
}
import { DOMAIN_TONE } from "./tokens";
import { Banner, Button } from "./kit";
import { makeStyles, useTokens } from "./theme-context";
import { TOUCH, space, typography } from "./tokens";
import { useWrite } from "./useWrite";
import { EMPTY_ICON } from "./icons";

/** Deneme sonucu: kaç cihaza gitti, kayıtsız cihaz çıkarıldı mı. */
export function testOutcome(r: TestNotificationResult): { tone: "off" | "warn"; text: string } {
  const dropped = r.cihazlar.filter((c) => c.sonuc === "GECERSIZ_CIHAZ").length;
  const failed = r.cihazlar.length - r.gonderilen - dropped;
  const parts = [r.gonderilen > 0 ? `Deneme bildirimi ${r.gonderilen} cihaza gönderildi` : "Deneme bildirimi hiçbir cihaza gönderilemedi"];
  if (dropped > 0) parts.push(`${dropped} cihaz artık kayıtlı değil, listeden çıkarıldı`);
  if (failed > 0) parts.push(`${failed} cihaza şu an ulaşılamadı`);
  return { tone: r.gonderilen > 0 && failed + dropped === 0 ? "off" : "warn", text: parts.join(" · ") };
}

/** Kayıtlı cihaz satırı: çıkarma iki adımlıdır (ilk dokunuş sorar). */
function DeviceRow({ d, busy, onRemove, ayrac }: { readonly d: Device; readonly busy: boolean; readonly onRemove: () => void; readonly ayrac?: boolean }) {
  const t = useTokens();
  const s = useStyles();
  const [asking, setAsking] = useState(false);
  const p = devicePlatform(d.platform);
  if (asking) {
    return (
      <View style={[s.ask, { backgroundColor: t.color.danger.bg }]}>
        <Text style={[s.askText, { color: t.color.danger.fg }]}>Bu cihaza artık bildirim gönderilmesin mi?</Text>
        <View style={s.askRow}>
          <View style={s.flex}><Button label="Vazgeç" tone="plain" onPress={() => setAsking(false)} /></View>
          <View style={s.flex}><Button label="Evet, çıkar" tone="danger" busy={busy} onPress={() => { setAsking(false); onRemove(); }} /></View>
        </View>
      </View>
    );
  }
  return (
    <ListeSatiri
      birincil={d.ad ?? p.ad}
      ikincil={`${p.ad} · son görülme ${formatAgo(d.sonGorulme)}`}
      icon={p.icon}
      ton={DOMAIN_TONE.gelenKutusu}
      ayrac={ayrac}
      rozet={
        <Pressable accessibilityRole="button" accessibilityLabel="Bu cihazı çıkar" onPress={() => setAsking(true)} hitSlop={8} style={s.remove}>
          <Text style={[s.removeText, { color: t.color.danger.fg }]}>Çıkar</Text>
        </Pressable>
      }
    />
  );
}

// `pushHere` yanlışsa (ilk mağaza sürümünde telefon) kayıt düğmesi yerine "yakında" notu çizilir; liste ve deneme kalır.
export function NotificationDevices({ vapidKey, pushHere = pushAvailable(Platform.OS), permission: initial = null, os = Platform.OS }: {
  vapidKey: string | null;
  pushHere?: boolean;
  /** Testte izin durumu (verilirse okunmaz). */
  permission?: PermissionState | null;
  os?: string;
}) {
  const { api } = useSession();
  const t = useTokens();
  const s = useStyles();
  const devices = useRemote("cihazlar", () => api.deviceList());
  const [outcome, setOutcome] = useState<{ tone: "off" | "warn" | "error"; text: string } | null>(null);
  const [permission, setPermission] = useState<PermissionState | null>(initial);
  const readState = useCallback(() => {
    if (pushHere) void readPermission(os).then(setPermission).catch(() => setPermission(null));
  }, [pushHere, os]);
  useEffect(() => {
    if (initial === null) readState();
  }, [initial, readState]);
  const view = permission ? permissionView(permission, os) : null;
  const register = useWrite(useCallback(() => registerThisDevice(api, vapidKey), [api, vapidKey]));
  // Hedef cihaz ref'te: aynı dokunuşta yazılıp okunur (state bir sonraki render'a kalır).
  const removeId = useRef<string | null>(null);
  const remove = useWrite(useCallback(() => api.deviceRemove(String(removeId.current)), [api]));
  const test = useWrite(useCallback(() => api.notificationTest(), [api]));
  const onTest = async () => {
    const r = await test.run();
    if (!r) return;
    setOutcome(testOutcome(r));
    devices.reload();
  };
  const onRegister = async () => {
    const r = await register.run();
    if (!r) return;
    setOutcome(r.kind === "KAYITLI" ? { tone: "off", text: "Bu cihaz bildirim alacak" } : { tone: "warn", text: r.message });
    devices.reload();
    readState();
  };
  const list = devices.data ?? [];
  return (
    <View>
      <BlokBasligi baslik="Cihazlar" sayi={devices.data ? list.length : undefined} />
      {pushHere ? (
        <View style={s.here}>
          <IconTile icon="phone-portrait-outline" tone={DOMAIN_TONE.gelenKutusu} size="md" />
          <View style={s.flex}>
            <View style={s.hereHead}>
              <Text style={s.hereTitle}>Bu cihaz</Text>
              {view ? <Rozet label={view.label} tone={STATUS_ROZET_TONU[view.kind]} accessibilityLabel={`Durum: ${view.label}`} testID="izin-durumu" /> : null}
            </View>
            <Text style={s.hereHint} testID="izin-aciklama">{view?.hint ?? "Bildirim izni istenir; izin verince bildirimler bu cihaza da gelir"}</Text>
          </View>
        </View>
      ) : (
        <View style={s.soon}>
          <View style={[s.soonIcon, { backgroundColor: t.domain.gelenKutusu.chip }]}>
            <Ionicons name="phone-portrait-outline" size={26} color={t.domain.gelenKutusu.fg} />
          </View>
          <Text style={s.soonText} testID="cihaz-yakinda">{NATIVE_PUSH_SOON}</Text>
        </View>
      )}
      {pushHere && view?.action === "ayarlar" && os !== "web" ? (
        <Button label="Telefon ayarlarını aç" icon="settings-outline" onPress={() => void Linking.openSettings().catch(() => undefined)} testID="izin-ayarlar" />
      ) : null}
      {pushHere && view?.action !== "ayarlar" && permission !== "DESTEKLENMIYOR" ? (
        <Button label="Bu cihazda bildirimleri aç" icon="notifications-outline" busy={register.busy} disabled={register.disabled} onPress={() => void onRegister()} testID="cihaz-kaydet" />
      ) : null}
      {register.error ? <Banner tone="error" text={register.error} /> : null}
      {outcome ? <Banner tone={outcome.tone} text={outcome.text} testID="cihaz-sonuc" /> : null}
      {list.length > 0 ? (
        <View style={s.gap}>
          <ListeBlogu testID="cihaz-listesi">
            {list.map((d, i) => (
              <DeviceRow key={d.id} d={d} ayrac={i > 0} busy={remove.busy && removeId.current === d.id}
                onRemove={() => { removeId.current = d.id; void remove.run(d.id).then(() => devices.reload()); }} />
            ))}
          </ListeBlogu>
        </View>
      ) : null}
      {remove.error ? <Banner tone="error" text={remove.error} /> : null}
      {list.length > 0 ? (
        <Button label="Deneme bildirimi gönder" tone="plain" icon="paper-plane-outline" busy={test.busy} disabled={test.disabled} onPress={() => void onTest()} testID="bildirim-deneme" />
      ) : null}
      {test.error ? <Banner tone="error" text={test.error} testID="bildirim-deneme-hata" /> : null}
      {devices.data && list.length === 0 && pushHere ? <GroupNote>Kayıtlı cihaz yok; bildirim almak için yukarıdaki düğmeye dokunun.</GroupNote> : null}
    </View>
  );
}

/** Okunmamış mı? Eski bulut `okunma` göndermez → alan yoksa okunmuş sayılır (vurgu yok, bugünkü liste). */
export function isUnread(n: NotificationItem): boolean {
  return n.okunma === null && n.durum !== "ATLANDI";
}

export function NotificationHistory() {
  const { api } = useSession();
  const router = useRouter();
  const t = useTokens();
  const s = useStyles();
  const list = useRemote("bildirimler", () => api.notificationHistory({ limit: 20 }), { tags: [BILDIRIM_ETIKETI] });
  // Dokunulan satır sunucu yanıtı gelmeden okunmuş görünür (yanıt sayacı düzeltir); liste yeniden çekilince sıfırlanır.
  const [readHere, setReadHere] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    if (list.data) {
      okunmamisAyarla(list.data.okunmamis, { listeyiTazele: false });
      setReadHere(new Set());
    }
  }, [list.data]);
  const readAll = useWrite(useCallback(() => api.notificationReadAll(), [api]));
  const items = list.data?.kayitlar ?? [];
  const unread = (n: NotificationItem) => isUnread(n) && !readHere.has(n.id);
  // Liste açılınca okunmamışlar KENDİLİĞİNDEN okundu sayılır (kullanıcı kararı 2026-11-20: düğme yok, alışılmış yol).
  // Eski bulut (`okunmamis` yok) → çağrı yok. Ekran başına bir kez; satır vurgusu liste yeniden çekilene dek kalır.
  const otomatikOkundu = useRef(false);
  const okunmamisVar = list.data?.okunmamis !== undefined && (list.data.okunmamis > 0 || items.some(isUnread));
  const tumunuOku = readAll.run;
  useEffect(() => {
    if (!okunmamisVar || otomatikOkundu.current) return;
    otomatikOkundu.current = true;
    void tumunuOku("tumu").then((r) => { if (r) okunduSonucu(r); });
  }, [okunmamisVar, tumunuOku]);
  const open = (n: NotificationItem, route: string | null) => {
    if (unread(n)) {
      setReadHere((x) => new Set([...x, n.id]));
      void api.notificationRead(n.id).then(okunduSonucu, () => undefined);
    }
    if (route) router.push(route as never);
  };
  return (
    <View>
      {list.data && items.length === 0 ? <BosDurum icon={EMPTY_ICON.bildirim} baslik="Henüz bildirim yok" /> : null}
      {items.length > 0 ? (
        <ListeBlogu ayracli testID="bildirim-gecmisi">
          {items.map((n) => {
            const route = safeRoute(n.rota);
            const look = notificationKind(n.tur);
            const why = n.atlamaNedeni ? NOTIFICATION_SKIP[n.atlamaNedeni] ?? n.atlamaNedeni : null;
            const yeni = unread(n);
            const badge = notificationBadge(n);
            return (
              <Pressable key={n.id} disabled={!route && !yeni} onPress={() => open(n, route)} accessibilityRole={route ? "link" : "button"}
                accessibilityLabel={[yeni ? "Okunmadı" : null, n.baslik, n.metin].filter(Boolean).join(", ")} testID={`bildirim-${n.id}`}
                style={({ pressed }) => [s.hist, yeni ? { backgroundColor: t.color.primarySoft } : null, pressed ? { backgroundColor: t.color.pressed } : null]}>
                <IconTile icon={look.icon} tone={DOMAIN_TONE[look.domain]} size="md" />
                <View style={s.flex}>
                  <View style={s.histHead}>
                    {yeni ? <View style={[s.dot, { backgroundColor: t.color.primary }]} testID={`bildirim-yeni-${n.id}`} /> : null}
                    <Text style={[s.histTitle, yeni ? s.unreadTitle : null]}>{n.baslik}</Text>
                  </View>
                  <Text style={s.histBody}>{n.metin}</Text>
                  <View style={s.histMeta}>
                    <Rozet label={badge.label} tone={STATUS_ROZET_TONU[badge.tone]} accessibilityLabel={`Durum: ${badge.label}`} testID={`bildirim-durum-${n.id}`} />
                    <Text style={s.histTime}>{why ? `${formatAgo(n.olusturulma)} · ${why}` : formatAgo(n.olusturulma)}</Text>
                  </View>
                </View>
                {route ? <Ionicons name="chevron-forward" size={18} color={t.color.textMuted} /> : null}
              </Pressable>
            );
          })}
        </ListeBlogu>
      ) : null}
      {readAll.error ? <Banner tone="error" text={readAll.error} testID="bildirim-tumu-hata" /> : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1, minWidth: 0 },
  gap: { marginTop: space.s },
  here: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, backgroundColor: t.color.card, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.cardBorder, padding: space.l, marginBottom: space.s, ...t.shadow.card },
  hereHead: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, flexWrap: "wrap" as const },
  hereTitle: { ...typography.headline, color: t.color.text },
  hereHint: { ...typography.footnote, color: t.color.textMuted, marginTop: 2 },
  soon: { alignItems: "center" as const, gap: space.m, backgroundColor: t.surface, borderRadius: t.radius.card, paddingVertical: space.xl, paddingHorizontal: space.l, marginBottom: space.m, ...t.cardShadow },
  soonIcon: { width: 52, height: 52, borderRadius: t.radius.cardInner + 4, alignItems: "center" as const, justifyContent: "center" as const },
  soonText: { ...typography.callout, color: t.textSecondary, textAlign: "center" as const },
  ask: { padding: space.m, gap: space.s },
  askText: { ...typography.subhead, fontWeight: "600" as const },
  askRow: { flexDirection: "row" as const, gap: space.s },
  remove: { minHeight: TOUCH, justifyContent: "center" as const, paddingHorizontal: space.xs },
  removeText: { ...typography.subhead, fontWeight: "600" as const },
  hist: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m },
  histHead: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  histTitle: { ...typography.headline, color: t.color.text, flexShrink: 1 },
  unreadTitle: { fontWeight: "700" as const },
  histBody: { ...typography.subhead, color: t.color.textMuted, marginTop: 2 },
  histMeta: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, marginTop: space.s, flexWrap: "wrap" as const },
  histTime: { ...typography.footnote, color: t.textMuted },
}));
