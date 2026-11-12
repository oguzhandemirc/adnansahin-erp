// Telefon alt sekmeleri (şartname §5): Pano · Siparişler · Stok · Cariler · Diğer. Üretim, Sevkiyat, Finans ve
// Raporlar "Diğer"de. Yollar SABİT — `(tabs)` grubu URL'ye girmez; bildirim rotaları, `safeRoute` ve
// `public/bildirim-sw.js` bunlara bağlı. İzinsiz sekme çizilmez (`href: null`); Pano ve Diğer hep var.
import { moduleNavTitle, moduleVisible, type ModuleKey } from "../lib/access";
import { MODULE_ICON, MORE_ICON, type IconName } from "./icons";

export interface TabDef {
  /** `app/(app)/(tabs)/` altındaki rota adı. */
  readonly name: "pano" | "siparisler" | "stok" | "cariler" | "diger";
  /** Modül sekmesinde `access.ts` gezinme adından türer (tek kaynak). */
  readonly title: string;
  readonly route: string;
  /** Görünürlük bu modülün iznine bağlı; yoksa her hesapta görünür. */
  readonly module?: ModuleKey;
  /** Pasif simge (`-outline`); etkin sekmede dolu biçimi (`activeIcon`). */
  readonly icon: IconName;
  readonly activeIcon: IconName;
}

const dolu = (i: IconName) => i.replace(/-outline$/, "") as IconName;

export const TABS: readonly TabDef[] = [
  { name: "pano", title: moduleNavTitle("pano"), route: "/pano", module: "pano", icon: MODULE_ICON.pano.icon, activeIcon: dolu(MODULE_ICON.pano.icon) },
  { name: "siparisler", title: moduleNavTitle("siparisler"), route: "/siparisler", module: "siparisler", icon: MODULE_ICON.siparisler.icon, activeIcon: dolu(MODULE_ICON.siparisler.icon) },
  { name: "stok", title: moduleNavTitle("stok"), route: "/stok", module: "stok", icon: MODULE_ICON.stok.icon, activeIcon: dolu(MODULE_ICON.stok.icon) },
  { name: "cariler", title: moduleNavTitle("cariler"), route: "/cariler", module: "cariler", icon: MODULE_ICON.cariler.icon, activeIcon: dolu(MODULE_ICON.cariler.icon) },
  { name: "diger", title: "Diğer", route: "/diger", icon: MORE_ICON, activeIcon: dolu(MORE_ICON) },
];

export function tabVisible(perms: readonly string[], tab: TabDef): boolean {
  return tab.module === undefined || moduleVisible(perms, tab.module);
}

export function visibleTabs(perms: readonly string[]): TabDef[] {
  return TABS.filter((t) => tabVisible(perms, t));
}

/** Sekmeye sığmayan bölümlerin TEK grup tablosu (UX-4 P2): dar ekranda "Diğer" listesi, geniş ekranda rayın
 *  sekme bölümlerinden sonraki grupları AYNI başlık ve sırayla bundan çizer. */
export const NAV_GROUPS: readonly { readonly title: string; readonly modules: readonly ModuleKey[] }[] = [
  { title: "Operasyon", modules: ["uretim", "sevkiyat"] },
  { title: "İş", modules: ["raporlar", "finans", "teklifler", "standart-maliyetler", "gelen-kutusu"] },
  { title: "Hesap", modules: ["bildirimler", "hesaplar", "profil"] },
];

export const MORE_GROUPS = NAV_GROUPS;

/** Geniş ekran rayı: önce sekmelerle AYNI sırada ana bölümler (başlıksız), sonra `NAV_GROUPS`. */
export const RAIL_GROUPS: readonly { readonly title: string | null; readonly modules: readonly ModuleKey[] }[] = [
  { title: null, modules: TABS.flatMap((t) => (t.module ? [t.module] : [])) },
  ...NAV_GROUPS,
];
