// Stok & Ölü Stok — "Kalem bazında" sekmesi. Üstte Ham | Bitmiş (varsayılan Bitmiş) ve
// Kalem bazında | Top bazında anahtarı; kalem satırına tıklanınca o kalemin topları açılır.
// Kalem tablosunun alt toplamı sunucunun toplamıdır (Excel'le aynı rakam).
import { useCallback, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DetailTable } from "../_components";
import { fmtInt, fmtNum } from "../_components/formatters";
import { bitmisColumns, hamColumns, right } from "./stockKalemColumns";
import { StockKalemRollsDialog, StockKalemRollsView } from "./StockKalemRolls";
import { anyKg, kalemLabel, matchesSearch, type KalemBolum, type KalemGorunum, type StockKalem, type StockKalemRow } from "./stockKalem";

interface Props {
  data: StockKalem | undefined;
  isLoading: boolean;
  /** Satır tavanı uyarısı (sunucu) — toplamlar yine tam kümedir. */
  warnings?: string[];
  /** Yükleme hatası cümlesi (`kalemErrorText`); varsa tablolar yerine yalnız o basılır. */
  errorText?: string;
  /** Görünüm sayfada tutulursa Excel/PDF açık görünümün tablosunu basar; verilmezse sekme kendi tutar. */
  gorunum?: KalemGorunum;
  onGorunumChange?: (g: KalemGorunum) => void;
}

function KalemTable({ data, bolum, search, isLoading, onPick }: {
  data: StockKalem | undefined;
  bolum: KalemBolum;
  search: string;
  isLoading: boolean;
  onPick: (row: StockKalemRow) => void;
}) {
  const all: StockKalemRow[] = (bolum === "ham" ? data?.ham : data?.bitmis) ?? [];
  const rows = all.filter((r) => matchesSearch(kalemLabel(r), search));
  const withKg = anyKg(all.map((r) => r.kg));
  const t = data?.totals;
  const lead = bolum === "ham" ? ["Toplam"] : ["Toplam", "", "", ""];
  // Arama varken alt satır görünen satırların toplamıdır; yokken sunucunun tam küme toplamı.
  const count = search ? rows.reduce((s, r) => s + r.count, 0) : bolum === "ham" ? t?.hamCount : t?.bitmisCount;
  const qty = search ? rows.reduce((s, r) => s + r.qty, 0) : bolum === "ham" ? t?.hamQty : t?.bitmisQty;
  const total = t ? [...lead, right(fmtInt(count)), right(`${fmtNum(qty)} m`, true), ...(withKg ? [""] : []), ""] : undefined;
  const common = { isLoading, totalRow: total, maxHeight: 560, onRowClick: onPick };
  return bolum === "ham" ? (
    <DetailTable
      {...common}
      title="Ham"
      description="Kumaş başına rafta bekleyen ham top ve metre. Dışarıdan alınan yarı mamul dahil değil. Satıra tıklayın: toplar açılır."
      data={rows as NonNullable<StockKalem["ham"]>}
      columns={hamColumns(withKg)}
      emptyLabel={search ? "Aramaya uyan kalem yok" : "Rafta ham kumaş yok"}
    />
  ) : (
    <DetailTable
      {...common}
      title="Bitmiş"
      description="Kumaş, en, renk ve kat başına depodaki bitmiş top ve metre. Satıra tıklayın: toplar açılır."
      data={rows as NonNullable<StockKalem["bitmis"]>}
      columns={bitmisColumns(withKg)}
      emptyLabel={search ? "Aramaya uyan kalem yok" : "Rafta bitmiş mal yok"}
    />
  );
}

export function StockKalemTab({ data, isLoading, warnings, errorText, gorunum: disGorunum, onGorunumChange }: Props) {
  const [bolum, setBolum] = useState<KalemBolum>("bitmis");
  const [icGorunum, setIcGorunum] = useState<KalemGorunum>("kalem");
  const gorunum = disGorunum ?? icGorunum;
  const setGorunum = onGorunumChange ?? setIcGorunum;
  const [search, setSearch] = useState("");
  // Seçili kalem kapanışta da tutulur: diyalog kapanırken başlığı boşalmasın.
  const [picked, setPicked] = useState<StockKalemRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const pick = useCallback((r: StockKalemRow) => {
    setPicked(r);
    setDialogOpen(true);
  }, []);

  const labels = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of [...(data?.ham ?? []), ...(data?.bitmis ?? [])]) m.set(r.key, kalemLabel(r));
    return m;
  }, [data]);
  const labelOf = useCallback((key: string) => labels.get(key) ?? "—", [labels]);

  if (errorText) {
    return (
      <p role="alert" className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
        {errorText}
      </p>
    );
  }
  const t = data?.totals;
  return (
    <div className="flex flex-col gap-4">
      {warnings?.map((w) => (
        <p key={w} className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
          {w}
        </p>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={bolum} onValueChange={(v) => setBolum(v as KalemBolum)}>
          <TabsList aria-label="Stok bölümü">
            <TabsTrigger value="ham">Ham{t ? ` · ${fmtInt(t.hamCount)} top` : ""}</TabsTrigger>
            <TabsTrigger value="bitmis">Bitmiş{t ? ` · ${fmtInt(t.bitmisCount)} top` : ""}</TabsTrigger>
          </TabsList>
        </Tabs>
        <Tabs value={gorunum} onValueChange={(v) => setGorunum(v as KalemGorunum)}>
          <TabsList aria-label="Görünüm">
            <TabsTrigger value="kalem">Kalem bazında</TabsTrigger>
            <TabsTrigger value="top">Top bazında</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={gorunum === "kalem" ? "Kumaş, en, renk ara" : "Top no, kalem, parti, depo ara"}
            aria-label="Ara"
            className="pl-8"
          />
        </div>
      </div>
      {gorunum === "kalem" ? (
        <KalemTable data={data} bolum={bolum} search={search} isLoading={isLoading} onPick={pick} />
      ) : (
        <StockKalemRollsView bolum={bolum} search={search} labelOf={labelOf} />
      )}
      <StockKalemRollsDialog bolum={bolum} row={picked} open={dialogOpen} onClose={() => setDialogOpen(false)} />
    </div>
  );
}
