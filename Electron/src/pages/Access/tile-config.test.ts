// Yetkilendirme hub kapısı: hub `admin:users ∨ bildirim:yonet`; izinsiz karo `admin:users` ister.
// NEGATİF SONDA (2026-11-17, md5 ile geri alındı):
//   S1 karo süzgeci eski hâline (izinsiz karo herkese) → 2 ✗ (yalnız bildirim · hiçbiri)
//   S2 menü satırı `permissionAny` yerine `adminOnly` → 1 ✗ (menü ↔ route kümesi)
import { describe, expect, it } from "vitest";
import { accessTiles, visibleAccessTiles } from "./tile-config";
import { ACCESS_HUB_ACCESS } from "@/lib/permissions";
import { navGroups } from "@/components/layout/nav-config";

const holder = (...codes: string[]) => (code: string) => codes.includes(code);

describe("Yetkilendirme hub kapısı", () => {
  it("yalnız bildirim:yonet taşıyan kişi yalnız Bildirim Atamaları karosunu görür", () => {
    const tiles = visibleAccessTiles(holder("bildirim:yonet"));
    expect(tiles.map((t) => t.key)).toEqual(["notifications"]);
  });

  it("admin:users taşıyan (bildirim:yonet yok) kişi Bildirimler hariç bütün karoları görür", () => {
    const keys = visibleAccessTiles(holder("admin:users")).map((t) => t.key);
    expect(keys).toEqual(accessTiles.filter((t) => t.key !== "notifications").map((t) => t.key));
    expect(keys).toEqual(expect.arrayContaining(["users", "templates", "permissions"]));
  });

  it("admin:users + bildirim:yonet taşıyan kişi bütün karoları görür", () => {
    const tiles = visibleAccessTiles(holder("admin:users", "bildirim:yonet"));
    expect(tiles).toHaveLength(accessTiles.length);
  });

  it("ikisini de taşımayan kişi hiç karo görmez", () => {
    expect(visibleAccessTiles(holder("admin:settings"))).toHaveLength(0);
  });

  it("menü satırı route kapısıyla aynı küme (admin:users ∨ bildirim:yonet)", () => {
    expect([...ACCESS_HUB_ACCESS].sort()).toEqual(["admin:users", "bildirim:yonet"]);
    const item = navGroups.flatMap((g) => g.items).find((i) => i.to === "/access");
    expect(item?.permissionAny).toBe(ACCESS_HUB_ACCESS);
    expect(item?.adminOnly).toBeFalsy();
  });
});
