import { useCallback, useMemo } from "react";
import type { BoxSpec } from "./box-katalog";
import { validPeriod } from "./pano-donem";
import { applySubsetOrder, cleanLayout, cleanSizes, defaultLayout, type SizeChoice } from "./pano-layout";
import type { PanoDonem } from "./types";
import { usePanoTercih } from "./usePanoTercih";

export interface PanoLayout {
  /** Çizilecek kutular (sıralı; katalogda/erişimde olmayan anahtar düşmüş, kullanıcı boyutu uygulanmış). */
  boxes: BoxSpec[];
  /** Eklenebilir kutuların tamamı (erişimi açık olanlar). */
  available: BoxSpec[];
  /** Kullanıcı düzeni hiç değiştirmedi mi. */
  isDefault: boolean;
  add: (key: string) => void;
  remove: (key: string) => void;
  reorder: (visibleOrder: string[]) => void;
  resize: (key: string, size: SizeChoice) => void;
  reset: () => void;
  donem: PanoDonem;
  setDonem: (d: PanoDonem) => void;
}

/**
 * Kutu düzeni — kullanıcı başına bu bilgisayarda (`usePanoTercih`). Okurken katalogda olmayan anahtar sessizce
 * düşer; erişimi kapalı kutu listede kalır ama çizilmez (bayrak açılınca yerinde döner).
 */
export function usePanoLayout(catalog: readonly BoxSpec[], available: readonly BoxSpec[]): PanoLayout {
  const [tercih, update] = usePanoTercih();
  const known = useMemo(() => new Set(catalog.map((b) => b.anahtar)), [catalog]);
  const byKey = useMemo(() => new Map(available.map((b) => [b.anahtar, b])), [available]);
  const full = useMemo(() => cleanLayout(tercih.boxes, known) ?? defaultLayout(catalog), [tercih.boxes, known, catalog]);
  const sizes = useMemo(() => cleanSizes(tercih.sizes), [tercih.sizes]);
  const boxes = useMemo(
    () => full.map((k) => byKey.get(k)).filter((b): b is BoxSpec => b !== undefined)
      .map((b) => (b.boyut !== "kpi" && sizes[b.anahtar] ? { ...b, boyut: sizes[b.anahtar]! } : b)),
    [full, byKey, sizes],
  );

  const writeBoxes = useCallback((next: string[]) => update((cur) => ({ ...cur, boxes: next })), [update]);
  const add = useCallback((key: string) => { if (!full.includes(key)) writeBoxes([...full, key]); }, [full, writeBoxes]);
  const remove = useCallback((key: string) => writeBoxes(full.filter((k) => k !== key)), [full, writeBoxes]);
  const reorder = useCallback((visible: string[]) => writeBoxes(applySubsetOrder(full, visible)), [full, writeBoxes]);
  const resize = useCallback((key: string, size: SizeChoice) => {
    const d = byKey.get(key);
    if (!d || d.boyut === "kpi") return;
    const next = { ...sizes };
    if (d.boyut === size) delete next[key];
    else next[key] = size;
    update((cur) => ({ ...cur, sizes: Object.keys(next).length ? next : undefined }));
  }, [byKey, sizes, update]);
  const reset = useCallback(() => update((cur) => ({ donem: cur.donem })), [update]);
  const setDonem = useCallback((d: PanoDonem) => update((cur) => ({ ...cur, donem: d })), [update]);

  return {
    boxes, available: available as BoxSpec[], isDefault: tercih.boxes === undefined && tercih.sizes === undefined,
    add, remove, reorder, resize, reset, donem: validPeriod(tercih.donem), setDonem,
  };
}
