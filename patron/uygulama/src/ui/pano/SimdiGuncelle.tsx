// "Şimdi güncelle" (2026-11-13; yerleşim 2026-11-16): panoda AYRI satır yok — başlıktaki tazelik etiketi ("↻ 47 saat
// önce") eylemin kendisidir. Basınca fabrikaya eşitleme işareti gider (veri taşımaz); yanıtın kısa Türkçe geri bildirimi
// yalnız varken başlığın altında görünür. Sunucu ucu beyan etmediyse (eski bulut) eylem HİÇ çizilmez; başlık bugünkü
// eşitleme göstergesine döner. Kabul edilince fabrika damgası birkaç kez yoklanır; değişince bütün veri tazelenir.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { SyncNowResponse } from "../../api/wire";
import { formatSince } from "../../lib/format";
import { AFTER_SYNC_NOW_MS, syncNowAvailable, syncNowErrorFeedback, syncNowFeedback, type SyncNowFeedback } from "../../lib/simdi-guncelle";
import { ALL_TAGS, invalidate } from "../../state/changes";
import { useSession } from "../../state/session";
import { followDoorbell } from "../../state/useOpenRefresh";
import { BASMA } from "../hareket/sabitler";
import { useMinuteClock } from "../SyncIndicator";
import { makeStyles, useTokens } from "../theme-context";
import { TOUCH, space, typography } from "../tokens";

/** Geri bildirimin ekranda kaldığı süre. */
export const FEEDBACK_MS = 8_000;

export interface SyncNowState {
  /** Sunucu ucu beyan etti mi (değilse eylem çizilmez). */
  readonly available: boolean;
  readonly busy: boolean;
  readonly feedback: SyncNowFeedback | null;
  readonly trigger: () => void;
}

/** İstek + geri bildirim durumu (oturumdan bağımsız; test edilebilir çekirdek). */
export function useSyncNowAction({ available, request, onAccepted, now = Date.now }: {
  readonly available: boolean;
  readonly request: () => Promise<SyncNowResponse>;
  /** İşaret açık (yeni ya da bekleyen): çağıran fabrika damgasını izler. */
  readonly onAccepted?: () => void;
  readonly now?: () => number;
}): SyncNowState {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<SyncNowFeedback | null>(null);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  useEffect(() => {
    if (!feedback) return;
    const id = setTimeout(() => setFeedback(null), FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [feedback]);
  const trigger = () => {
    if (!available || busy) return;
    setBusy(true);
    void request()
      .then((r) => {
        const f = syncNowFeedback(r, now());
        if (!alive.current) return;
        setFeedback(f);
        if (f.follow) onAccepted?.();
      })
      .catch((err: unknown) => alive.current && setFeedback(syncNowErrorFeedback(err)))
      .finally(() => alive.current && setBusy(false));
  };
  return { available, busy, feedback, trigger };
}

/** Oturuma bağlı hâli: beyan, istek ve kabul sonrası damga takibi (`/oturum` 3…25 sn; damga değişince veri tazelenir). */
export function useSyncNow(): SyncNowState {
  const { api, facility, refresh, factoryStamp } = useSession();
  const live = useRef({ refresh, factoryStamp });
  live.current = { refresh, factoryStamp };
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  const follow = () => {
    cancel.current?.();
    cancel.current = followDoorbell(live.current.factoryStamp, async () => (await live.current.refresh())?.esitleme?.ufuk ?? null, () => invalidate([ALL_TAGS]), AFTER_SYNC_NOW_MS);
  };
  return useSyncNowAction({ available: syncNowAvailable(facility), request: () => api.syncNow(), onAccepted: follow });
}

/**
 * Başlıktaki tazelik + eylem: "↻ 47 saat önce" link renginde, dokunma hedefi ≥ 44 pt. Gönderilirken çark döner ve
 * dokunuş kapalıdır. Çevrimdışıyken simge bulut-yok olur, eylem yine denenebilir (hata cümlesi döner).
 */
export function SyncNowIndicator({ last, offline = false, busy, onPress }: {
  readonly last: string | null | undefined;
  readonly offline?: boolean;
  readonly busy: boolean;
  readonly onPress: () => void;
}) {
  const t = useTokens();
  const s = useStyles();
  const now = useMinuteClock();
  const since = last ? formatSince(last, now) : null;
  const text = busy ? "Gönderiliyor…" : since ?? "Şimdi güncelle";
  const state = since ? `${offline ? "Çevrimdışı · son eşitleme" : "Son eşitleme"} ${since}` : null;
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={state ? `Şimdi güncelle. ${state}` : "Şimdi güncelle"}
      accessibilityState={{ disabled: busy, busy }}
      style={({ pressed }) => [s.button, pressed && { opacity: BASMA.opaklik }]}
      testID="simdi-guncelle"
    >
      {busy ? (
        <ActivityIndicator size="small" color={t.color.link} style={s.spinner} testID="simdi-guncelle-cark" />
      ) : (
        <Ionicons name={offline ? "cloud-offline-outline" : "refresh-outline"} size={15} color={t.color.link} />
      )}
      <Text style={[s.text, { color: t.color.link }]} numberOfLines={1}>{text}</Text>
    </Pressable>
  );
}

/** Yanıtın kısa cümlesi; yokken hiçbir şey çizilmez (başlık altında krom şerit kalmaz). */
export function SyncNowFeedbackText({ feedback }: { readonly feedback: SyncNowFeedback | null }) {
  const t = useTokens();
  const s = useStyles();
  if (!feedback) return null;
  const color = feedback.tone === "error" ? t.color.danger.solid : t.textSecondary;
  return (
    <View testID="simdi-guncelle-satiri">
      <Text style={[s.feedback, { color }]} accessibilityLiveRegion="polite" testID="simdi-guncelle-bildirim">{feedback.text}</Text>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  button: { minHeight: TOUCH, flexDirection: "row" as const, alignItems: "center" as const, gap: space.xs },
  spinner: { width: 15, height: 15, transform: [{ scale: 0.75 }] },
  text: { ...typography.footnote, fontWeight: "500" as const },
  feedback: { ...typography.footnote, paddingTop: space.xs },
}));
