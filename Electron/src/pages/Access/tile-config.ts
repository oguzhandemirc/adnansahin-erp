import { Users2, Layers, BookOpen, Tablet, ShieldCheck, Cpu, BellRing, type LucideIcon } from "lucide-react";
import { ACCESS_TILE_DEFAULT_PERMISSION } from "@/lib/permissions";

/** Yetkilendirme = "sisteme kim/ne girebilir": insanlar (kullanıcı erişimi) +
 *  saha tabletleri (cihaz erişimi). İki grup ayrı başlık altında sunulur. */
export type AccessTileGroup = "user" | "device";

export interface AccessTile {
  key: string;
  title: string;
  description: string;
  icon: LucideIcon;
  to: string;
  group: AccessTileGroup;
  /** Verilirse karo yalnız bu izinle görünür (route kapısıyla BİREBİR). Verilmezse `ACCESS_TILE_DEFAULT_PERMISSION` (`admin:users`) ister. */
  permission?: string;
}

export interface AccessGroup {
  key: AccessTileGroup;
  title: string;
  description: string;
  icon: LucideIcon;
}

export const accessGroups: AccessGroup[] = [
  {
    key: "user",
    title: "Kullanıcı Erişimi",
    description: "Sistem kullanıcıları, yetki atamaları ve şablonlar",
    icon: ShieldCheck,
  },
  {
    key: "device",
    title: "Cihaz Erişimi",
    description: "Sahadaki tabletlerin bağlantı onayı ve makine ataması",
    icon: Cpu,
  },
];

export const accessTiles: AccessTile[] = [
  {
    key: "users",
    title: "Kullanıcılar",
    description: "Sistem kullanıcıları ve yetki atamaları",
    icon: Users2,
    to: "/access/users",
    group: "user",
  },
  {
    key: "templates",
    title: "Yetki Şablonları",
    description: "Sık kullanılan yetki kümelerini şablonla",
    icon: Layers,
    to: "/access/templates",
    group: "user",
  },
  {
    key: "permissions",
    title: "Yetki Kataloğu",
    description: "Sistemdeki tüm yetkilerin referans listesi",
    icon: BookOpen,
    to: "/access/permissions",
    group: "user",
  },
  {
    key: "notifications",
    title: "Bildirim Atamaları",
    description: "Kişiye ve rol şablonuna hangi bildirimlerin gideceği",
    icon: BellRing,
    to: "/access/bildirimler",
    group: "user",
    permission: "bildirim:yonet",
  },
  {
    // Saha tabletleri: announce → onay → makineye atama. "Cihaz Kaydı" (Donanım:
    // metre/yazıcı/tartı) ile karışmasın diye "Tabletler" adı kullanılır.
    key: "devices",
    title: "Tabletler",
    description: "Sahadaki tabletler ve hangi makineye eşli oldukları",
    icon: Tablet,
    to: "/access/devices",
    group: "device",
  },
];

/**
 * Hub'da çizilecek karolar. Hub `ACCESS_HUB_ACCESS` ile açılır; izinsiz karo
 * `admin:users` ister — yalnız `bildirim:yonet` taşıyan kişi tek karo görür.
 */
export function visibleAccessTiles(hasPermission: (code: string) => boolean): AccessTile[] {
  return accessTiles.filter((tile) => hasPermission(tile.permission ?? ACCESS_TILE_DEFAULT_PERMISSION));
}
