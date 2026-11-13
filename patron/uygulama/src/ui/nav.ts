import type { Router } from "expo-router";

/** Kayıt ayrıntısına git: sipariş ve iş emrinin kendi ekranı var, diğerleri jenerik kayıt ekranı. */
export function openRecord(router: Router, projection: string, id: string): void {
  if (projection === "siparis") {
    router.push({ pathname: "/siparisler/[id]", params: { id } } as never);
    return;
  }
  if (projection === "is-emri") {
    router.push({ pathname: "/is-emirleri/[id]", params: { id } } as never);
    return;
  }
  router.push({ pathname: "/kayit/[projeksiyon]/[id]", params: { projeksiyon: projection, id } } as never);
}
