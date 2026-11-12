import { useState, type ReactNode } from "react";
import { ChevronRight, ClipboardList, Factory, ListOrdered, PackageOpen, Trophy, Users, Warehouse, type LucideIcon } from "lucide-react";
import { IconTile, type IconTileTone } from "@/components/ui/icon-tile";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PanoCard } from "./PanoBoxFrame";
import { formatCount, hareketZamani, metre } from "./pano-bicim";
import { TARGETS, HIZLI_EYLEMLER } from "./pano-hedefler";
import { Avatar, BoxTabs, PanoEmptyState, RowLink, useGo } from "./pano-ui";
import type { MovementBox, PanoHareket, PendingBox, RankBox, StockBox } from "./types";
import type { PanoErisim, PanoTarget } from "./usePanoErisim";

/** Sıralama kutusu (en çok kumaş / müşteri) — sekmeli ilk 5; müşteride baş harf avatarı. */
export function PanoSiralama({ title, d, avatar }: { title: string; d: RankBox; avatar?: boolean }) {
  const [tab, setTab] = useState(d.sekmeler[0]?.key ?? "");
  const aktif = d.sekmeler.find((s) => s.key === tab) ?? d.sekmeler[0]!;
  return (
    <PanoCard title={title} action={<BoxTabs items={d.sekmeler.map((s) => ({ key: s.key, label: s.etiket }))} active={aktif.key} onChange={setTab} label={title} />}>
      {aktif.satirlar.length === 0 ? <PanoEmptyState icon={avatar ? Users : Trophy} metin="Bu dönemde kayıt yok" /> : (
        <ol className="-mx-2 divide-y divide-border/60">
          {aktif.satirlar.map((r, i) => (
            <li key={r.id}>
              <RowLink>
                {avatar ? <Avatar name={r.ad} index={i} /> : <span className="w-4 shrink-0 text-right text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>}
                <span className="min-w-0 flex-1 truncate font-medium" title={r.ad}>{r.ad || "—"}</span>
                {r.ek && <span className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:inline">{r.ek}</span>}
                <span className="w-24 shrink-0 text-right font-semibold tabular-nums">{metre(r.metre)}</span>
              </RowLink>
            </li>
          ))}
        </ol>
      )}
    </PanoCard>
  );
}

interface InfoRowProps { etiket: ReactNode; deger: ReactNode; ek?: ReactNode; hedef?: PanoTarget; erisim: PanoErisim; simge?: { icon: LucideIcon; tone: IconTileTone } }

/** Özet satırı: (simge) etiket · hizalı rakam; hedef açılabiliyorsa tıklanır. */
function InfoRow({ etiket, deger, ek, hedef, erisim, simge }: InfoRowProps) {
  const goTo = useGo(erisim);
  const go = hedef ? goTo(hedef) : undefined;
  return (
    <RowLink onClick={go}>
      {simge && <IconTile icon={simge.icon} tone={simge.tone} size="sm" />}
      <span className="min-w-0 flex-1 truncate text-muted-foreground">{etiket}</span>
      <span className="flex shrink-0 items-baseline gap-1.5">
        {ek && <span className="text-[11px] tabular-nums text-muted-foreground">{ek}</span>}
        <span className="font-semibold tabular-nums">{deger}</span>
      </span>
      {go && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />}
    </RowLink>
  );
}

const InfoList = ({ children }: { children: ReactNode }) => <div className="-mx-2 divide-y divide-border/60">{children}</div>;

export function PanoStok({ d, erisim }: { d: StockBox; erisim: PanoErisim }) {
  return (
    <PanoCard title="Stok">
      <InfoList>
        <InfoRow etiket="Mamul" deger={metre(d.mamul.metre)} ek={`${formatCount(d.mamul.top)} top`} hedef={TARGETS.depoda} erisim={erisim} />
        <InfoRow etiket="Ham" deger={metre(d.ham.metre)} ek={`${formatCount(d.ham.top)} top`} hedef={TARGETS.stok} erisim={erisim} />
        <InfoRow etiket="Yarı mamul" deger={metre(d.yariMamul.metre)} ek={`${formatCount(d.yariMamul.top)} top`} erisim={erisim} />
      </InfoList>
    </PanoCard>
  );
}

/** Bekleyen işler — her satır kendi izniyle (izinsiz satır yok). */
export function PanoBekleyen({ d, erisim }: { d: PendingBox; erisim: PanoErisim }) {
  return (
    <PanoCard title="Bekleyen işler">
      <InfoList>
        {d.acikSiparis !== null && <InfoRow etiket="Açık sipariş" deger={formatCount(d.acikSiparis)} hedef={TARGETS.acikSiparisler} erisim={erisim} simge={{ icon: ClipboardList, tone: "blue" }} />}
        {d.isEmriYok !== null && <InfoRow etiket="İş emri açılmamış" deger={formatCount(d.isEmriYok)} hedef={TARGETS.isEmriYok} erisim={erisim} simge={{ icon: Factory, tone: "amber" }} />}
        {d.uretimde !== null && <InfoRow etiket="Üretimde top" deger={formatCount(d.uretimde)} hedef={TARGETS.uretimde} erisim={erisim} simge={{ icon: PackageOpen, tone: "violet" }} />}
        {d.depoda !== null && <InfoRow etiket="Depoda top" deger={formatCount(d.depoda)} hedef={TARGETS.depoda} erisim={erisim} simge={{ icon: Warehouse, tone: "teal" }} />}
      </InfoList>
    </PanoCard>
  );
}

/** Hızlı işlemler — izni ve modülü açık olanlar; hiçbiri yoksa kutu yok. */
export function PanoHizliIslemler({ erisim }: { erisim: PanoErisim }) {
  const go = useGo(erisim);
  const gorunen = HIZLI_EYLEMLER.flatMap((e) => { const fn = go(e); return fn ? [{ e, fn }] : []; });
  if (gorunen.length === 0) return null;
  return (
    <PanoCard title="Hızlı işlemler">
      <div className="@container">
        <div className="grid grid-cols-3 gap-x-2 gap-y-3 @[17rem]:grid-cols-4">
          {gorunen.map(({ e, fn }) => (
            <button key={e.key} type="button" onClick={fn} title={e.label}
              className="group flex flex-col items-center gap-1.5 rounded-xl p-1.5 text-center text-[11px] font-medium leading-tight text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <IconTile icon={e.icon} tone={e.tone} size="lg" className="transition-transform group-hover:-translate-y-0.5" />
              <span className="line-clamp-2 break-words">{e.label}</span>
            </button>
          ))}
        </div>
      </div>
    </PanoCard>
  );
}

const TUR: Record<PanoHareket["tur"], { etiket: string; sinif: string }> = {
  SIPARIS: { etiket: "Sipariş", sinif: "tile-blue" },
  SEVK: { etiket: "Sevk", sinif: "tile-green" },
};

const movementTarget = (h: PanoHareket): PanoTarget =>
  h.tur === "SIPARIS" ? { to: `/operations/orders?focus=${encodeURIComponent(h.id)}`, izin: ["order:read"] } : TARGETS.sevkiyatlar;

const miktar = (h: PanoHareket): string => (h.miktar === null ? "—" : h.birim === "m" || h.birim === "MT" ? metre(h.miktar) : `${formatNumber(h.miktar, 1)} ${h.birim ?? ""}`);

/** Son hareketler — sıkı tek satırlı tablo, tam genişlik. */
export function PanoHareketler({ d, erisim }: { d: MovementBox; erisim: PanoErisim }) {
  const go = useGo(erisim);
  return (
    <PanoCard title="Son hareketler" flush>
      {d.hareketler.length === 0 ? <PanoEmptyState icon={ListOrdered} metin="Henüz hareket yok" /> : (
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="border-y border-border/60 bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="w-20 py-1.5 pl-[var(--space-card)] font-semibold">Tür</th>
              <th className="w-36 py-1.5 font-semibold">Belge</th>
              <th className="py-1.5 font-semibold">Cari</th>
              <th className="w-24 py-1.5 text-right font-semibold">Miktar</th>
              <th className="w-24 py-1.5 pr-[var(--space-card)] text-right font-semibold">Zaman</th>
            </tr>
          </thead>
          <tbody>
            {d.hareketler.map((h) => {
              const fn = go(movementTarget(h));
              return (
                <tr key={`${h.tur}-${h.id}`} onClick={fn} className={cn("whitespace-nowrap border-b border-border/40 last:border-0", fn && "cursor-pointer hover:bg-muted/50")}>
                  <td className="py-1.5 pl-[var(--space-card)]"><span className={cn("icon-tile rounded-md px-1.5 py-0.5 text-[11px] font-semibold", TUR[h.tur].sinif)}>{TUR[h.tur].etiket}</span></td>
                  <td className="truncate py-1.5 font-medium tabular-nums">{h.belgeNo}</td>
                  <td className="truncate py-1.5 text-muted-foreground" title={h.cari ?? undefined}>{h.cari ?? "—"}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{miktar(h)}</td>
                  <td className="py-1.5 pr-[var(--space-card)] text-right text-xs tabular-nums text-muted-foreground">{hareketZamani(h.zaman)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </PanoCard>
  );
}
