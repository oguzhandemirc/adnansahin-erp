// "Şimdi güncelle" (2026-11-13): panonun başlık altı satırında, tazelik göstergesinin hemen altında. Basınca fabrikaya
// eşitleme işareti gider (veri taşımaz); yanıt kısa Türkçe geri bildirime döner. Sunucu ucu beyan etmediyse (eski
// bulut) eylem HİÇ çizilmez. Kabul edilince fabrika damgası birkaç kez yoklanır; değişince bütün veri tazelenir.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import type { SyncNowResponse } from "../../api/wire";
import { AFTER_SYNC_NOW_MS, syncNowAvailable, syncNowErrorFeedback, syncNowFeedback, type SyncNowFeedback } from "../../lib/simdi-guncelle";
import { ALL_TAGS, invalidate } from "../../state/changes";
import { useSession } from "../../state/session";
import { followDoorbell } from "../../state/useOpenRefresh";
import { Basilabilir } from "../hareket/Basilabilir";
import { makeStyles, useTokens } from "../theme-context";
import { space, typography } from "../tokens";

/** Geri bildirimin ekranda kaldığı süre. */
export const FEEDBACK_MS = 8_000;

export function SimdiGuncelleSatiri({ sol, gorunur, istek, onKabul, now = Date.now }: {
  /** Satırın solu (telefonda tesis adı); yoksa eylem sağa yaslı tek başına. */
  readonly sol?: ReactNode;
  readonly gorunur: boolean;
  readonly istek: () => Promise<SyncNowResponse>;
  /** İşaret açık (yeni ya da bekleyen): çağıran fabrika damgasını izler. */
  readonly onKabul?: () => void;
  readonly now?: () => number;
}) {
  const t = useTokens();
  const s = useStyles();
  const [gidiyor, setGidiyor] = useState(false);
  const [bildirim, setBildirim] = useState<SyncNowFeedback | null>(null);
  const canli = useRef(true);
  useEffect(() => () => void (canli.current = false), []);
  useEffect(() => {
    if (!bildirim) return;
    const id = setTimeout(() => setBildirim(null), FEEDBACK_MS);
    return () => clearTimeout(id);
  }, [bildirim]);
  if (!gorunur) return sol ? <>{sol}</> : null;
  const bas = () => {
    if (gidiyor) return;
    setGidiyor(true);
    void istek()
      .then((r) => {
        const f = syncNowFeedback(r, now());
        if (!canli.current) return;
        setBildirim(f);
        if (f.follow) onKabul?.();
      })
      .catch((err: unknown) => canli.current && setBildirim(syncNowErrorFeedback(err)))
      .finally(() => canli.current && setGidiyor(false));
  };
  const renk = bildirim?.tone === "error" ? t.color.danger.solid : t.textSecondary;
  return (
    <View testID="simdi-guncelle-satiri">
      <View style={s.satir}>
        <View style={s.sol}>{sol}</View>
        <Basilabilir onPress={bas} disabled={gidiyor} style={s.dugme} accessibilityRole="button" accessibilityLabel="Şimdi güncelle" accessibilityState={{ disabled: gidiyor, busy: gidiyor }} hitSlop={8} testID="simdi-guncelle">
          <Ionicons name="refresh-outline" size={16} color={t.color.link} />
          <Text style={[s.dugmeYazi, { color: t.color.link }]}>{gidiyor ? "Gönderiliyor…" : "Şimdi güncelle"}</Text>
        </Basilabilir>
      </View>
      {bildirim ? (
        <Text style={[s.bildirim, { color: renk }]} accessibilityLiveRegion="polite" testID="simdi-guncelle-bildirim">{bildirim.text}</Text>
      ) : null}
    </View>
  );
}

/** Oturuma bağlı hâli: beyan, istek ve kabul sonrası damga takibi (`/oturum` 3…25 sn; damga değişince veri tazelenir). */
export function SimdiGuncelle({ sol }: { readonly sol?: ReactNode }) {
  const { api, facility, refresh, factoryStamp } = useSession();
  const live = useRef({ refresh, factoryStamp });
  live.current = { refresh, factoryStamp };
  const iptal = useRef<(() => void) | null>(null);
  useEffect(() => () => iptal.current?.(), []);
  const izle = () => {
    iptal.current?.();
    iptal.current = followDoorbell(live.current.factoryStamp, async () => (await live.current.refresh())?.esitleme?.ufuk ?? null, () => invalidate([ALL_TAGS]), AFTER_SYNC_NOW_MS);
  };
  return <SimdiGuncelleSatiri sol={sol} gorunur={syncNowAvailable(facility)} istek={() => api.syncNow()} onKabul={izle} />;
}

const useStyles = makeStyles(() => ({
  satir: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m },
  sol: { flex: 1, minWidth: 0 },
  dugme: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.xs, paddingVertical: space.xs },
  dugmeYazi: { ...typography.footnote },
  bildirim: { ...typography.footnote, marginTop: space.xs },
}));
