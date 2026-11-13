import { act, render, waitFor } from "@testing-library/react-native";
import { AppState } from "react-native";

// Bellek depoları (gizli + düz) — jest.mock fabrikası dış değişkene yalnız `mock` önekiyle uzanır.
function mockMem() {
  const m = new Map<string, string>();
  return {
    m,
    get: async (k: string) => m.get(k) ?? null,
    set: async (k: string, v: string) => void m.set(k, v),
    remove: async (k: string) => void m.delete(k),
    keys: async () => [...m.keys()],
    removeMany: async (ks: readonly string[]) => ks.forEach((k) => m.delete(k)),
  };
}
const mockSecret = mockMem();
const mockPlain = mockMem();
jest.mock("../src/state/store", () => ({ secretStore: mockSecret, plainStore: mockPlain, legacyPlainStore: null }));
jest.mock("../src/lib/config", () => ({ apiBaseUrl: () => "http://bulut.test" }));

const { SessionProvider, useSession } = require("../src/state/session") as typeof import("../src/state/session");
type Value = import("../src/state/session").SessionValue;

const TESIS = { id: "t1", ad: "Bir Tekstil" };
const hesap = (id: string) => ({ id, kullaniciAdi: id, ad: id, izinler: ["bulut:oturum"] });
/** Sunucunun giriş gövdesi KATI (`z.strictObject`): bilinmeyen alan (`tesisId`, `eposta`) 400. */
const GIRIS_ALANLARI = new Set(["kullaniciAdi", "parola", "totp", "istemci"]);

interface Call { method: string; path: string; body: unknown; token: string | null }
let calls: Call[] = [];
/** Değişim akışı yanıtı; null → uç yok (eski sunucu, 404). */
let feed: { sayac: number; degisenler: string[]; fabrikaDamgasi: string | null } | null = null;
/** `GET /oturum` eşitleme ufku (fabrika veri anı); null → henüz eşitleme yok. */
let ufuk: string | null = null;
const esitleme = () => (ufuk ? { sonEsitleme: "2026-10-22T08:05:00.000Z", ufuk, ufukTakildi: false, sozlesmeUyarisi: null, fabrikaSurumu: null } : null);
const appListeners = new Set<(s: string) => void>();
const appState = (st: string) => [...appListeners].forEach((l) => l(st));

function reply(status: number, data: unknown, code?: string) {
  const body = status < 400 ? { success: true, data } : { success: false, message: "ret", details: { code } };
  return Promise.resolve({ ok: status < 400, status, json: async () => body } as unknown as Response);
}

function server(url: string, init: RequestInit): Promise<Response> {
  const path = url.replace("http://bulut.test/api", "").split("?")[0]!;
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  const token = ((init.headers as Record<string, string>).Authorization ?? "").replace("Bearer ", "") || null;
  calls.push({ method: init.method ?? "GET", path, body, token });
  const key = `${init.method} ${path}`;
  if (key === "POST /oturum/ac") {
    if (Object.keys(body).some((k) => !GIRIS_ALANLARI.has(k))) return reply(400, null, "GECERSIZ_ISTEK");
    if (body.kullaniciAdi === "yok") return reply(401, null, "GIRIS_BASARISIZ");
    const kimlik = body.kullaniciAdi === "baska" ? "h2" : "h1";
    return reply(200, { belirtec: kimlik === "h2" ? "c1" : "b1", bitis: "2026-10-16T00:00:00Z", hesap: hesap(kimlik), tesisId: "t1", tesisler: [{ ...TESIS, hizmet: "ACIK" }] });
  }
  if (key === "GET /oturum") {
    if (!token) return reply(401, null, "OTURUM_GEREKLI");
    return reply(200, { tesis: { ...TESIS, saklamaAy: 13 }, hesap: hesap("h1"), projeksiyonlar: [], esitleme: esitleme(), hizmet: { asama: "ACIK", bitis: null, saltOkunurBitis: null } });
  }
  if (key === "POST /oturum/kapat") return reply(200, null);
  if (key === "GET /degisim" && feed) {
    if (feed.fabrikaDamgasi) ufuk = feed.fabrikaDamgasi; // paket bulutta kabul edildi
    return reply(200, feed);
  }
  return reply(404, null, "BULUNAMADI");
}

let cur: Value;
function Probe() {
  cur = useSession();
  return null;
}

async function boot() {
  render(<SessionProvider><Probe /></SessionProvider>);
  await waitFor(() => expect(cur.phase).toBe("giris"));
}
async function login(kullaniciAdi = "patron") {
  await act(async () => cur.login({ kullaniciAdi, parola: "p", totp: "123456" }));
}
const cacheKeys = () => [...mockPlain.m.keys()].filter((k) => k.startsWith("patron:onbellek:"));

beforeEach(() => {
  mockSecret.m.clear();
  mockPlain.m.clear();
  calls = [];
  feed = null;
  ufuk = null;
  appListeners.clear();
  (AppState as { currentState: unknown }).currentState = "active";
  (AppState.addEventListener as jest.Mock).mockImplementation((_t: string, l: (st: string) => void) => {
    appListeners.add(l);
    return { remove: () => appListeners.delete(l) };
  });
  globalThis.fetch = jest.fn(server) as unknown as typeof fetch;
});

describe("oturum (fabrika kullanıcı adı; tek tesis)", () => {
  it("giriş gövdesi yalnız kullanıcı adı + parola + kod + istemci; tesis listesi istenmez", async () => {
    await boot();
    await mockPlain.set("patron.sonTesis", "t9"); // eski sürümden kalan ipucu artık gönderilmez
    await login();
    expect(cur.phase).toBe("hazir");
    expect(calls.filter((c) => c.path === "/oturum/ac").map((c) => c.body)).toEqual([{ kullaniciAdi: "patron", parola: "p", totp: "123456", istemci: "mobil" }]);
    expect(calls.some((c) => c.path === "/oturum/tesisler" || c.path === "/oturum/gecis")).toBe(false);
    expect(cur.facilityId).toBe("t1");
    expect(cur.facility?.hesap.kullaniciAdi).toBe("h1");
    expect(mockSecret.m.get("patron.kapsam")).toBe("t1:h1");
  });

  it("401 GIRIS_BASARISIZ: oturum açılmaz, hata çağırana döner", async () => {
    await boot();
    await act(async () => { await expect(cur.login({ kullaniciAdi: "yok", parola: "p" })).rejects.toMatchObject({ status: 401, code: "GIRIS_BASARISIZ" }); });
    expect(cur.phase).toBe("giris");
    expect(mockSecret.m.size).toBe(0);
  });

  it("başka kimlikle girişte bütün önbellek silinir", async () => {
    await boot();
    mockPlain.m.set("patron:onbellek:t9:h9:pano", "{}");
    mockPlain.m.set("patron:onbellek:t1:h1:oturum", "{}");
    await login("baska");
    expect(cacheKeys().filter((k) => !k.startsWith("patron:onbellek:t1:h2:"))).toEqual([]);
  });

  it("çıkış hepsi:true gönderir ve önbelleği, belirteci siler", async () => {
    await boot();
    await login();
    await act(async () => cur.logout());
    expect(calls.find((c) => c.path === "/oturum/kapat")!.body).toEqual({ hepsi: true });
    expect(cur.phase).toBe("giris");
    expect(cacheKeys()).toEqual([]);
    expect(mockSecret.m.size).toBe(0);
  });
});

describe("tazelik (K1): öne gelme, değişim akışı, fabrika damgası", () => {
  const sessionReads = () => calls.filter((c) => c.method === "GET" && c.path === "/oturum").length;

  it("öne gelince refresh(): GET /oturum yeniden okunur; arka planda okunmaz", async () => {
    await boot();
    await login();
    const before = sessionReads();
    await act(async () => appState("background"));
    expect(sessionReads()).toBe(before);
    await act(async () => appState("active"));
    await waitFor(() => expect(sessionReads()).toBe(before + 1));
  });

  it("oturumsuzken öne gelme GET /oturum atmaz", async () => {
    await boot();
    calls = [];
    await act(async () => appState("background"));
    await act(async () => appState("active"));
    expect(sessionReads()).toBe(0);
  });

  it("eski sunucu (GET /degisim 404): akış yoklama kipine düşer, uygulama bugünkü gibi çalışır", async () => {
    await boot();
    await login();
    await waitFor(() => expect(cur.feedMode).toBe("yoklama"));
    expect(calls.filter((c) => c.path === "/degisim")).toHaveLength(1);
    expect(cur.phase).toBe("hazir");
  });

  it("factoryStamp = esitleme.ufuk; akıştaki fabrika damgası değişince oturum tazelenir", async () => {
    ufuk = "2026-10-22T08:00:00.000Z";
    // Girişten hemen sonra fabrika yeni paket gönderir: akış yeni damgayı getirir (öne gelme YOK).
    feed = { sayac: 5, degisenler: ["siparis"], fabrikaDamgasi: "2026-10-22T08:00:20.000Z" };
    await boot();
    await login();
    await waitFor(() => expect(cur.factoryStamp).toBe("2026-10-22T08:00:20.000Z"));
    expect(cur.feedMode).toBe("uzun");
    expect(sessionReads()).toBe(2);
  });

  it("damga aynıysa akış oturumu yeniden okutmaz", async () => {
    ufuk = "2026-10-22T08:00:00.000Z";
    feed = { sayac: 1, degisenler: [], fabrikaDamgasi: ufuk };
    await boot();
    await login();
    await waitFor(() => expect(calls.some((c) => c.path === "/degisim")).toBe(true));
    await act(async () => undefined);
    expect(sessionReads()).toBe(1);
  });
});
