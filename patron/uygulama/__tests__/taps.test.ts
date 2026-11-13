import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

jest.mock("expo-notifications", () => ({ setNotificationHandler: jest.fn() }));
jest.mock("../src/state/session", () => ({ useSession: () => ({}) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ push: jest.fn() }) }));

const { openNotification } = require("../src/push/taps") as typeof import("../src/push/taps");

function deps(facilityId: string | null) {
  const order: string[] = [];
  return {
    order,
    d: {
      facilityId,
      push: jest.fn((r: string) => void order.push(`rota:${r}`)),
    },
  };
}

describe("bildirim dokunuşu (tek tesis; geçiş yok)", () => {
  it("farklı tesisId → rota AÇILMAZ (tesis geçişi yok)", async () => {
    const { order, d } = deps("t1");
    await expect(openNotification({ rota: "/siparisler", tesisId: "t2" }, d)).resolves.toBe(false);
    expect(order).toEqual([]);
  });
  it("aynı tesis ya da tesisId yok (eski yük) → rota açılır", async () => {
    for (const data of [{ rota: "/stok", tesisId: "t1" }, { rota: "/stok" }]) {
      const { order, d } = deps("t1");
      await openNotification(data, d);
      expect(order).toEqual(["rota:/stok"]);
    }
  });
  it("güvensiz rota → rota yok", async () => {
    const { order, d } = deps("t1");
    await expect(openNotification({ rota: "https://kotu.ornek", tesisId: "t2" }, d)).resolves.toBe(false);
    expect(order).toEqual([]);
  });
});

describe("web bildirimi: service worker → adres → tesis denetimi", () => {
  const { webTapFromUrl } = require("../src/push/taps") as typeof import("../src/push/taps");
  const T2 = "11111111-2222-3333-4444-555555555555";

  /** Service worker'ı sahte `self` içinde koşturur; push → gösterilen bildirim → tıklama → açılan adres. */
  async function swAc(yuk: unknown): Promise<string> {
    const kod = readFileSync(path.join(__dirname, "..", "public", "bildirim-sw.js"), "utf8");
    const dinleyici: Record<string, (e: unknown) => void> = {};
    let gosterilen: { data: unknown } | null = null;
    let acilan = "";
    const self = {
      location: { origin: "https://patron.ornek" },
      addEventListener: (ad: string, f: (e: unknown) => void) => void (dinleyici[ad] = f),
      registration: { showNotification: (_t: string, o: { data: unknown }) => { gosterilen = o; return Promise.resolve(); } },
      clients: { matchAll: () => Promise.resolve([]), openWindow: (u: string) => { acilan = u; return Promise.resolve(null); } },
    };
    vm.runInNewContext(kod, { self, URL });
    const bekle: Promise<unknown>[] = [];
    dinleyici.push!({ data: { json: () => yuk }, waitUntil: (p: Promise<unknown>) => bekle.push(p) });
    dinleyici.notificationclick!({ notification: { close: () => undefined, data: gosterilen!.data }, waitUntil: (p: Promise<unknown>) => bekle.push(p) });
    await Promise.all(bekle);
    return acilan;
  }

  it("yük tesisId taşıyorsa adres `?tesis=` taşır; aynı tesiste rota açılır, başka tesiste açılmaz", async () => {
    const url = await swAc({ baslik: "x", rota: "/siparisler", tesisId: T2 });
    expect(url).toBe(`https://patron.ornek/siparisler?tesis=${T2}`);
    const tap = webTapFromUrl(url);
    expect(tap).toEqual({ rota: "/siparisler", tesisId: T2 });
    const ayni = deps(T2);
    await expect(openNotification(tap, ayni.d)).resolves.toBe(true);
    expect(ayni.order).toEqual(["rota:/siparisler"]);
    const baska = deps("t1");
    await expect(openNotification(tap, baska.d)).resolves.toBe(false);
    expect(baska.order).toEqual([]);
  });
  it("tesisId yok (eski yük) ya da biçimsiz → adres tesis taşımaz, geçiş yok", async () => {
    for (const yuk of [{ rota: "/stok" }, { rota: "/stok", tesisId: "../kotu" }]) {
      const url = await swAc(yuk);
      expect(url).toBe("https://patron.ornek/stok");
      expect(webTapFromUrl(url)).toBeNull();
    }
  });
  it("güvensiz yol adresten gelse de açılmaz", async () => {
    const { order, d } = deps("t1");
    await expect(openNotification(webTapFromUrl(`https://patron.ornek/bilinmeyen?tesis=${T2}`), d)).resolves.toBe(false);
    expect(order).toEqual([]);
    expect(webTapFromUrl("bicimsiz")).toBeNull();
  });
});
