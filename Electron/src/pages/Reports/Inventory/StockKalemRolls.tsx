// Stok & Ölü Stok — kalemin arkasındaki toplar: (1) kalem satırına tıklanınca açılan döküm
// diyaloğu, (2) "Top bazında" görünümün tüm-bölüm listesi. İkisi de `/kalem/toplar` ucunu okur
// (kalem ucuyla aynı raf kümesi); liste tek istekte tam gelir, arama istemcide süzer.
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DetailTable } from "../_components";
import { fmtInt, fmtNum } from "../_components/formatters";
import { right, rollColumns } from "./stockKalemColumns";
import {
  anyKg,
  kalemErrorText,
  kalemLabel,
  matchesSearch,
  sortRollsByAge,
  stockKalemApi,
  stockKalemRollsKey,
  type KalemBolum,
  type StockKalemRoll,
  type StockKalemRow,
} from "./stockKalem";

function useToplar(bolum: KalemBolum, kalem: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: stockKalemRollsKey(bolum, kalem),
    queryFn: () => stockKalemApi.toplar(bolum, kalem),
    staleTime: 30_000,
    enabled,
  });
}

const ErrorLine = ({ text }: { text: string }) => (
  <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
    {text}
  </p>
);

interface DialogProps {
  bolum: KalemBolum;
  row: StockKalemRow | null;
  open: boolean;
  onClose: () => void;
}

export function StockKalemRollsDialog({ bolum, row, open, onClose }: DialogProps) {
  const q = useToplar(bolum, row?.key, open && Boolean(row));
  const rolls = useMemo(() => sortRollsByAge(q.data ?? []), [q.data]);
  const withKg = anyKg(rolls.map((r) => r.weightKg));
  const columns = useMemo(() => rollColumns(withKg), [withKg]);
  return (
    <Dialog open={open && Boolean(row)} onOpenChange={(o) => (o ? undefined : onClose())}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{row ? kalemLabel(row) : ""}</DialogTitle>
          <DialogDescription>
            {row ? `${fmtInt(row.count)} top · ${fmtNum(row.qty)} m — rafta duran toplar, en eski üstte.` : ""}
          </DialogDescription>
        </DialogHeader>
        {q.isError ? (
          <ErrorLine text={kalemErrorText(q.error)} />
        ) : (
          <DetailTable
            data={rolls}
            columns={columns}
            isLoading={q.isLoading}
            emptyLabel="Bu kalemde rafta top yok"
            maxHeight={420}
            totalRow={rollTotals(rolls, withKg, false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Top listesinin alt satırı: kolon sırasıyla hizalı (Top no · [Kalem] · Metre · [Kg] · Parti · Depo · Yaş). */
function rollTotals(rolls: StockKalemRoll[], withKg: boolean, withKalem: boolean) {
  if (rolls.length === 0) return undefined;
  const qty = rolls.reduce((s, r) => s + r.qty, 0);
  return [
    `${fmtInt(rolls.length)} top`,
    ...(withKalem ? [""] : []),
    right(`${fmtNum(qty)} m`, true),
    ...(withKg ? [""] : []),
    "",
    "",
    "",
  ];
}

interface ViewProps {
  bolum: KalemBolum;
  search: string;
  labelOf: (key: string) => string;
}

export function StockKalemRollsView({ bolum, search, labelOf }: ViewProps) {
  const q = useToplar(bolum, undefined, true);
  const rolls = useMemo(
    () =>
      sortRollsByAge(
        (q.data ?? []).filter((r) =>
          matchesSearch([r.barcode, labelOf(r.kalemKey), r.batchNumber, r.warehouseName].filter(Boolean).join(" "), search),
        ),
      ),
    [q.data, search, labelOf],
  );
  const withKg = anyKg((q.data ?? []).map((r) => r.weightKg));
  const columns = useMemo(() => rollColumns(withKg, labelOf), [withKg, labelOf]);
  if (q.isError) return <ErrorLine text={kalemErrorText(q.error)} />;
  return (
    <DetailTable
      title={bolum === "ham" ? "Ham toplar" : "Bitmiş toplar"}
      description="Rafta duran her top tek satır; en eski üstte."
      data={rolls}
      columns={columns}
      isLoading={q.isLoading}
      emptyLabel={search ? "Aramaya uyan top yok" : "Rafta top yok"}
      maxHeight={560}
      totalRow={rollTotals(rolls, withKg, true)}
    />
  );
}
