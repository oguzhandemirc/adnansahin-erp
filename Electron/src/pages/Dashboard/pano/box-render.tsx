// Kutu anahtarı → çizici. Çizicisi olmayan anahtar çizilmez; `hasContent` false dönen kutu (veri null ya da
// bütün kaynakları kapalı) ızgarada yer tutmaz.
import type { ReactNode } from "react";
import { StationLoad } from "../StationLoad";
import { PanoDagilim, PanoEgilim } from "./PanoGrafikKutulari";
import { PanoKpiCard, type KpiKey } from "./PanoKpiCard";
import { PanoBekleyen, PanoHareketler, PanoHizliIslemler, PanoSiralama, PanoStok } from "./PanoListeKutulari";
import { PanoBekleyenMal, PanoFasonda, PanoIsEmri, PanoKalite } from "./PanoUretimKutulari";
import type {
  DistributionBox, KpiBox, MovementBox, OutsideBox, PanoDonem, PendingBox, QualityBox, RankBox, StockBox, TrendBox, WipBox, WorkOrderBox,
} from "./types";
import type { PanoErisim } from "./usePanoErisim";

export interface RenderCtx { donem: PanoDonem; erisim: PanoErisim }

type Renderer = (d: never, c: RenderCtx) => ReactNode;

const kpi = (k: KpiKey): Renderer => (d: KpiBox, c: RenderCtx) => <PanoKpiCard boxKey={k} data={d} donem={c.donem} erisim={c.erisim} />;

const RENDERERS: Record<string, Renderer> = {
  uretim: kpi("uretim"),
  sevk: kpi("sevk"),
  siparis: kpi("siparis"),
  fason: kpi("fason"),
  stok: kpi("stok"),
  egilim: (d: TrendBox) => <PanoEgilim d={d} />,
  dagilim: (d: DistributionBox) => <PanoDagilim d={d} />,
  kalite: (d: QualityBox, c) => <PanoKalite d={d} erisim={c.erisim} />,
  enCok: (d: RankBox) => <PanoSiralama title="En çok kumaş" d={d} />,
  enCokMusteri: (d: RankBox) => <PanoSiralama title="En çok müşteri" d={d} avatar />,
  bekleyenMal: (d: WipBox, c) => <PanoBekleyenMal d={d} erisim={c.erisim} />,
  fasonOzeti: (d: OutsideBox, c) => <PanoFasonda d={d} erisim={c.erisim} />,
  isEmriDurum: (d: WorkOrderBox, c) => <PanoIsEmri d={d} erisim={c.erisim} />,
  stokOzeti: (d: StockBox, c) => <PanoStok d={d} erisim={c.erisim} />,
  bekleyen: (d: PendingBox, c) => <PanoBekleyen d={d} erisim={c.erisim} />,
  sonHareketler: (d: MovementBox, c) => <PanoHareketler d={d} erisim={c.erisim} />,
};

/** Verisini kendi bileşeninde alan (yükleyicisiz) kutular. */
const LOCAL: Record<string, (c: RenderCtx) => ReactNode> = {
  hizliIslemler: (c) => <PanoHizliIslemler erisim={c.erisim} />,
  istasyonDoluluk: () => <StationLoad />,
};

export const hasRenderer = (key: string): boolean => key in RENDERERS || key in LOCAL;
export const isLocalBox = (key: string): boolean => key in LOCAL;

/** Gelen veri çizilecek bir şey taşıyor mu (alt kaynakların hepsi kapalıysa hayır). */
export function hasContent(key: string, data: unknown): boolean {
  if (data === null || data === undefined) return false;
  switch (key) {
    case "egilim":
      return (data as TrendBox).noktalar.some((n) => n.uretim !== null || n.sevk !== null);
    case "enCok":
    case "enCokMusteri":
      return (data as RankBox).sekmeler.length > 0;
    case "bekleyen":
      return Object.values(data as PendingBox).some((v) => v !== null);
    default:
      return true;
  }
}

export function renderBox(key: string, data: unknown, ctx: RenderCtx): ReactNode {
  const local = LOCAL[key];
  if (local) return local(ctx);
  const r = RENDERERS[key] as ((d: unknown, c: RenderCtx) => ReactNode) | undefined;
  return r ? r(data, ctx) : null;
}
