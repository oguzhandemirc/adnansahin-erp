import { useMemo } from "react";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { REPORT_BY_KEY } from "@/lib/report-catalog";
import { reportKeyOfPath } from "@/lib/report-gate";
import { isRouteModuleOpen } from "@/lib/route-modules";
import { useOperationsVisibilityContext } from "@/pages/Operations/useOperationsVisibility";

/** Tıklama hedefi: yol + route'un izinlerinden HERHANGİ biri. */
export interface PanoTarget { to: string; izin: readonly string[] }

export interface PanoErisim {
  izin: (perm: string) => boolean;
  /** Modül (yol) kapısı — bayrak yüklenmeden kapalı; okunamadıysa route gibi açık (gerçek kapı backend). */
  modul: (path: string) => boolean;
  /** Rapor ucu okunabilir mi: rapor izni + kategori modülü + süperadminin rapor listesi (fail-closed). */
  rapor: (key: string) => boolean;
  /** Hedef açılabilir mi (ProtectedRoute'un kapılarıyla aynı sıra). */
  canGo: (t: PanoTarget) => boolean;
  /** Bayrak sorgusu sonuçlandı mı — sonuçlanmadan kutu kataloğu kurulmaz. */
  hazir: boolean;
}

/** Pano erişimi — kutu kataloğu ve tıklama hedefleri aynı kapıları okur. */
export function usePanoErisim(): PanoErisim {
  const { hasPermission, permissions } = useRoleAccess();
  const vis = useOperationsVisibilityContext();
  const { flagsReady, flagsFailed, isReportOpen } = vis;
  const modulKey = [vis.productionEnabled, vis.financeEnabled, vis.ticaretEnabled, vis.iplikEnabled, vis.dokumaEnabled, vis.devereEnabled, vis.depoMultiEnabled].join();
  const permKey = permissions.join();
  return useMemo(() => {
    const modul = (path: string) => {
      if (!vis.flagsReady) return false;
      return vis.flagsFailed || isRouteModuleOpen(path, vis);
    };
    const rapor = (key: string) => {
      const entry = REPORT_BY_KEY.get(key);
      return !!entry && hasPermission(entry.izin) && modul(`/${entry.panelYolu}`) && vis.isReportOpen(key);
    };
    const canGo = (t: PanoTarget) => {
      const path = t.to.split("?")[0]!;
      if (!t.izin.some(hasPermission) || !modul(path)) return false;
      const key = reportKeyOfPath(path);
      return key === null || vis.flagsFailed || vis.isReportOpen(key);
    };
    return { izin: hasPermission, modul, rapor, canGo, hazir: flagsReady };
    // Bağlam ve izin işlevi her çizimde yeni nesne; kararı değiştiren değerler anahtarlarda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permKey, modulKey, flagsReady, flagsFailed, isReportOpen]);
}
