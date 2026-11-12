import { useMemo, useState } from "react";
import { PageShell, PageBody } from "@/components/layout/PageShell";
import { RefreshButton } from "@/components/RefreshButton";
import { BOX_CATALOG } from "./pano/box-katalog";
import { PanoAddSheet } from "./pano/PanoAddSheet";
import { PanoBoard } from "./pano/PanoBoard";
import { PanoHeader } from "./pano/PanoHeader";
import { usePanoBoxData } from "./pano/usePanoBoxData";
import { usePanoErisim } from "./pano/usePanoErisim";
import { usePanoLayout } from "./pano/usePanoLayout";

/**
 * Açılış panosu — kutu düzeni. Kutu kataloğu istemcide; her kutu Adnan backend'inin mevcut rapor/liste
 * uçlarından beslenir ve YALNIZ panoya ekliyse istenir. Düzen kullanıcı başına bu bilgisayarda; düzenleme
 * kipinde veri isteği atılmaz.
 */
export function DashboardPage() {
  const erisim = usePanoErisim();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const available = useMemo(() => (erisim.hazir ? BOX_CATALOG.filter((b) => b.acik(erisim)) : []), [erisim]);
  const layout = usePanoLayout(BOX_CATALOG, available);
  const states = usePanoBoxData(layout.boxes, layout.donem, erisim, !editing);
  const added = useMemo(() => new Set(layout.boxes.map((b) => b.anahtar)), [layout.boxes]);
  const periodic = layout.boxes.some((b) => b.donemli);

  return (
    <PageShell>
      <PageBody className="space-y-[var(--space-section)] bg-primary/[0.03] p-[var(--space-page)]">
        <PanoHeader donem={layout.donem} onDonem={layout.setDonem} donemGoster={periodic}
          eylem={<RefreshButton queryKey="dashboard" successMessage="Anasayfa yenilendi" />}
          edit={available.length > 0 ? {
            editing, isDefault: layout.isDefault,
            onStart: () => setEditing(true), onDone: () => { setEditing(false); setAdding(false); },
            onAdd: () => setAdding(true), onReset: layout.reset,
          } : undefined} />
        {!erisim.hazir ? (
          <BoardSkeleton />
        ) : (
          <PanoBoard boxes={layout.boxes} states={states} editing={editing} ctx={{ donem: layout.donem, erisim }}
            onRemove={layout.remove} onReorder={layout.reorder} onResize={layout.resize} />
        )}
        {erisim.hazir && layout.boxes.length === 0 && (
          <p className="rounded-xl border-2 border-dashed border-card-border py-10 text-center text-sm text-muted-foreground">
            {editing ? "Panoda kutu yok — “Kutu ekle” ile başla." : "Panoda kutu yok — “Panoyu düzenle” ile kutu ekle."}
          </p>
        )}
        <PanoAddSheet open={adding} onOpenChange={setAdding} available={available} added={added}
          onToggle={(key, add) => (add ? layout.add(key) : layout.remove(key))} />
      </PageBody>
    </PageShell>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-[var(--space-gap)]" data-testid="pano-iskelet">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(168px,1fr))] gap-[var(--space-gap)]">
        {Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton-shimmer h-20 rounded-xl bg-muted" />)}
      </div>
      <div className="grid gap-[var(--space-gap)] min-[768px]:max-[1101px]:grid-cols-2 min-[1101px]:grid-cols-12">
        <div className="skeleton-shimmer h-72 rounded-xl bg-muted min-[768px]:max-[1101px]:col-span-2 min-[1101px]:col-span-8" />
        <div className="skeleton-shimmer h-72 rounded-xl bg-muted min-[1101px]:col-span-4" />
      </div>
    </div>
  );
}
