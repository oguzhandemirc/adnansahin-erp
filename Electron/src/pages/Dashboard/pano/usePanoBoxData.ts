import { useMemo } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import type { BoxSpec } from "./box-katalog";
import { donemPenceresi } from "./pano-donem";
import type { PanoDonem } from "./types";
import type { PanoErisim } from "./usePanoErisim";

export interface BoxState {
  data: unknown;
  loading: boolean;
  error: boolean;
  refetch: () => void;
}

/** Dönemsiz kutu dönem değişiminde yeniden istenmez (anahtarında dönem yok). Kök "dashboard" → Yenile düğmesi. */
export function boxQueryKey(box: Pick<BoxSpec, "anahtar" | "donemli">, donem: PanoDonem): unknown[] {
  return ["dashboard", "pano", box.donemli ? donem : "*", box.anahtar];
}

/**
 * Ekli kutuların verisi — kutu başına sorgu; hata/yükleme kutu bazında yalıtılır. Aynı uca giden kutular
 * `pano-kaynak` önbelleğinde tek istek olur. `enabled:false` (düzenleme kipi) iken istek atılmaz.
 */
export function usePanoBoxData(boxes: readonly BoxSpec[], donem: PanoDonem, erisim: PanoErisim, enabled: boolean): Record<string, BoxState> {
  const qc = useQueryClient();
  const pencere = useMemo(() => donemPenceresi(donem), [donem]);
  const remote = boxes.filter((b) => b.yukle);
  const results = useQueries({
    queries: remote.map((b) => ({
      queryKey: boxQueryKey(b, donem),
      queryFn: async () => (await b.yukle!({ qc, pencere, erisim })) ?? null,
      enabled,
      staleTime: 60_000,
      retry: false,
    })),
  });
  const out: Record<string, BoxState> = {};
  remote.forEach((b, i) => {
    const r = results[i]!;
    out[b.anahtar] = {
      data: r.data,
      loading: r.data === undefined && r.isPending && enabled,
      error: r.isError && r.data === undefined,
      refetch: () => void r.refetch(),
    };
  });
  return out;
}
