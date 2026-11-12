// İmleçli kayıt listesi, `useRemote` üstünde: ilk sayfa `veri:<projeksiyon>` anahtarıyla saklanır ve projeksiyon
// etiketiyle tazelenir (değişim akışı / aşağı çek); "Daha fazla" sonraki 50'yi aynı imleçle ekler. Satır çizimi
// çağıranda (tek satırlık `ListeSatiri`, `ayrac={i > 0}`); liste tam genişlik `ListeBlogu`; `kayit-<id>` korunur.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { errorMessage } from "../../api/client";
import type { Page, ProjectionRecord } from "../../api/wire";
import { useSession } from "../../state/session";
import { useRemote, type Remote } from "../../state/useRemote";
import { Basilabilir } from "../hareket";
import type { IconName } from "../icons";
import { BlokBasligi, BosDurum, HataDurumu, Iskelet, ListeBlogu } from "../ortak";
import { makeStyles, useTokens } from "../theme-context";
import { TOUCH, space, type Domain } from "../tokens";

export const PAGE_SIZE = 50;

export function useRecordPage(projection: string, enabled = true): Remote<Page<ProjectionRecord>> {
  const { api } = useSession();
  return useRemote<Page<ProjectionRecord>>(enabled ? `veri:${projection}:ilk` : null, () => api.list(projection, { limit: PAGE_SIZE }), { tags: [projection] });
}

export function RemoteList({ projection, remote, renderRow, empty, baslik, emptyIcon, testID }: {
  readonly projection: string;
  readonly remote: Remote<Page<ProjectionRecord>>;
  readonly renderRow: (r: ProjectionRecord, i: number) => ReactNode;
  readonly empty: string;
  /** Liste bloğunun başlığı (yükleniyor/boşken de çizilir). */
  readonly baslik?: string;
  /** Eski çağıranlar için; kullanılmaz. */
  readonly domain?: Domain;
  readonly emptyIcon?: IconName;
  readonly testID?: string;
}) {
  const { api } = useSession();
  const t = useTokens();
  const s = useStyles();
  const [more, setMore] = useState<readonly ProjectionRecord[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const first = remote.data;

  // İlk sayfa tazelenince eklenen sayfalar düşer (sıra/sürüm değişmiş olabilir).
  useEffect(() => {
    setMore([]);
    setMoreError(null);
    setNext(remote.offline ? null : (first?.sonraki ?? null));
  }, [first, remote.offline]);

  const loadMore = async () => {
    if (!next) return;
    setBusy(true);
    setMoreError(null);
    try {
      const page = await api.list(projection, { imlec: next, limit: PAGE_SIZE });
      setMore((old) => [...old, ...page.kayitlar]);
      setNext(page.sonraki);
    } catch (err) {
      setMoreError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const bas = baslik ? <BlokBasligi baslik={baslik} /> : null;
  if (!first) {
    if (remote.loading) return <View>{bas}<Iskelet bicim="liste" satir={4} testID={testID ? `${testID}-yukleniyor` : undefined} /></View>;
    if (remote.error) return <View>{bas}<HataDurumu mesaj={remote.error} onTekrar={remote.reload} testID={testID ? `${testID}-hata` : undefined} /></View>;
    return null;
  }
  const rows = [...first.kayitlar, ...more];
  if (rows.length === 0) return <View>{bas}<BosDurum baslik={empty} icon={emptyIcon} testID={testID ? `${testID}-bos` : undefined} /></View>;
  return (
    <View>
      <ListeBlogu baslik={baslik} sayi={next ? undefined : rows.length} testID={testID}>
        {rows.map((r, i) => <View key={r.id}>{renderRow(r, i)}</View>)}
      </ListeBlogu>
      {moreError ? <HataDurumu mesaj={moreError} onTekrar={() => void loadMore()} /> : null}
      {busy ? (
        <ActivityIndicator style={s.daha} color={t.color.primary} accessibilityLabel="Yükleniyor" />
      ) : next ? (
        <Basilabilir onPress={() => void loadMore()} style={s.daha} olcek={1} basiliZemin={t.color.pressed} accessibilityRole="button" testID={testID ? `${testID}-daha` : undefined}>
          <Text style={[s.dahaYazi, { color: t.color.link }]}>Daha fazla</Text>
          <Ionicons name="chevron-down" size={16} color={t.color.link} />
        </Basilabilir>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  daha: { minHeight: TOUCH + 4, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: space.xs, marginTop: space.s },
  dahaYazi: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const },
}));
