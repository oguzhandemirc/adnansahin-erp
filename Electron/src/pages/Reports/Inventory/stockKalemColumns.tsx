// Stok & Ölü Stok — "Kalem bazında" sekmesinin kolon tanımları (kalem tabloları + top listesi).
// Kg sütunu yalnız kümede tartılmış top varsa çizilir; metreyle toplanmaz.
import type { ColumnDef } from "@tanstack/react-table";
import { fmtInt, fmtNum } from "../_components/formatters";
import { daysText, widthText, type StockKalemBitmisRow, type StockKalemHamRow, type StockKalemRoll } from "./stockKalem";

export const right = (text: string, strong = false) => (
  <div className={`text-right tabular-nums ${strong ? "font-medium" : ""}`}>{text}</div>
);
const kgText = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${fmtNum(v)} kg`);

type KalemNums = { count: number; qty: number; kg?: number | null; oldestDays?: number | null };

function numCols<T extends KalemNums>(withKg: boolean): ColumnDef<T, unknown>[] {
  return [
    { accessorKey: "count", header: () => right("Top"), cell: ({ getValue }) => right(fmtInt(getValue() as number)) },
    { accessorKey: "qty", header: () => right("Metre"), cell: ({ getValue }) => right(`${fmtNum(getValue() as number)} m`, true) },
    ...(withKg
      ? [{ id: "kg", header: () => right("Kg"), cell: ({ row }) => right(kgText(row.original.kg)) } as ColumnDef<T, unknown>]
      : []),
    { id: "oldest", header: () => right("En eski (gün)"), cell: ({ row }) => right(daysText(row.original.oldestDays)) },
  ];
}

export const hamColumns = (withKg: boolean): ColumnDef<StockKalemHamRow, unknown>[] => [
  { accessorKey: "itemName", header: "Kumaş" },
  ...numCols<StockKalemHamRow>(withKg),
];

export const bitmisColumns = (withKg: boolean): ColumnDef<StockKalemBitmisRow, unknown>[] => [
  { accessorKey: "itemName", header: "Kumaş" },
  { accessorKey: "width", header: "En", cell: ({ getValue }) => <span className="tabular-nums">{widthText(getValue() as number | null)}</span> },
  { accessorKey: "colorName", header: "Renk", cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
  { accessorKey: "foldName", header: "Kat", cell: ({ getValue }) => (getValue() as string | null) ?? "—" },
  ...numCols<StockKalemBitmisRow>(withKg),
];

/** Top listesi; `labelOf` verilirse "Kalem" sütunu çizilir (kalem diyaloğunda gereksiz). */
export function rollColumns(withKg: boolean, labelOf?: (key: string) => string): ColumnDef<StockKalemRoll, unknown>[] {
  return [
    { id: "barcode", header: "Top no", cell: ({ row }) => <span className="font-mono">{row.original.barcode ?? "—"}</span> },
    ...(labelOf ? [{ id: "kalem", header: "Kalem", cell: ({ row }) => labelOf(row.original.kalemKey) } as ColumnDef<StockKalemRoll, unknown>] : []),
    { id: "qty", header: () => right("Metre"), cell: ({ row }) => right(`${fmtNum(row.original.qty)} m`, true) },
    ...(withKg ? [{ id: "kg", header: () => right("Kg"), cell: ({ row }) => right(kgText(row.original.weightKg)) } as ColumnDef<StockKalemRoll, unknown>] : []),
    { id: "batch", header: "Parti", cell: ({ row }) => row.original.batchNumber ?? "—" },
    { id: "warehouse", header: "Depo", cell: ({ row }) => row.original.warehouseName ?? "—" },
    { id: "days", header: () => right("Yaş (gün)"), cell: ({ row }) => right(daysText(row.original.days)) },
  ];
}
