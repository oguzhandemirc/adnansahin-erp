// Tam yenileme çekirdeği (2026-11-19): aşağı çekme ve menüdeki "Son veri" simgesi aynı boğazdan geçer. Aynı anda tek
// yenileme; fabrika isteği 60 sn penceresindeyse atılmaz (yalnız bulut); başarı sessiz (bildirim yok); hata kısa
// bildirim; bulut beyan etmediyse fabrikaya istek yok.
import { ApiError } from "../src/api/client";
import type { SyncNowResponse } from "../src/api/wire";
import { YENILE_BILDIRIM_MS, createYenileci, type YenileGirdisi } from "../src/state/yenile";

let saat = Date.parse("2026-11-19T10:00:00Z");
const now = () => saat;

function girdi(fabrika: YenileGirdisi["fabrika"], izle = jest.fn(() => () => undefined)) {
  return { ekran: jest.fn(), oturum: jest.fn(async () => null), fabrika, izle };
}

const yanit = (durum: SyncNowResponse["durum"], sonrakiMs = 60_000): SyncNowResponse => ({ durum, sonrakiMumkun: new Date(saat + sonrakiMs).toISOString() });

afterEach(() => {
  jest.useRealTimers();
  saat = Date.parse("2026-11-19T10:00:00Z");
});

describe("tam yenileme çekirdeği", () => {
  it("ekran + oturum + fabrika isteği; kabulde damga izlenir; başarı SESSİZ (bildirim yok)", async () => {
    const y = createYenileci(now);
    const g = girdi(jest.fn(async () => yanit("BEKLIYOR")));
    expect(await y.yenile(g)).toBe("tamam");
    expect(g.ekran).toHaveBeenCalledTimes(1);
    expect(g.oturum).toHaveBeenCalledTimes(1);
    expect(g.fabrika).toHaveBeenCalledTimes(1);
    expect(g.izle).toHaveBeenCalledTimes(1);
    expect(y.durum()).toEqual({ yenileniyor: false, bildirim: null });
  });

  it("tekilleştirme: sürerken ikinci çağrı düşer (ekran da ikinci kez okunmaz)", async () => {
    const y = createYenileci(now);
    let bitir: (r: SyncNowResponse) => void = () => undefined;
    const g = girdi(jest.fn(() => new Promise<SyncNowResponse>((r) => (bitir = r))));
    const ilk = y.yenile(g);
    expect(y.durum().yenileniyor).toBe(true);
    expect(await y.yenile(g)).toBe("atlandi");
    expect(g.ekran).toHaveBeenCalledTimes(1);
    bitir(yanit("BEKLIYOR"));
    await ilk;
    expect(y.durum().yenileniyor).toBe(false);
  });

  it("soğuma: pencere içinde fabrikaya istek YOK, yalnız buluttan okunur; pencere bitince yine istenir", async () => {
    const y = createYenileci(now);
    const fabrika = jest.fn(async () => yanit("YAKIN_ZAMANDA", 40_000));
    await y.yenile(girdi(fabrika));
    const g2 = girdi(fabrika);
    saat += 39_000;
    expect(await y.yenile(g2)).toBe("tamam");
    expect(g2.ekran).toHaveBeenCalledTimes(1);
    expect(fabrika).toHaveBeenCalledTimes(1);
    expect(y.durum().bildirim).toBeNull(); // pencere sessizdir
    saat += 1_000;
    await y.yenile(girdi(fabrika));
    expect(fabrika).toHaveBeenCalledTimes(2);
  });

  it("YAKIN_ZAMANDA: izleme başlamaz, bildirim yok", async () => {
    const y = createYenileci(now);
    const g = girdi(jest.fn(async () => yanit("YAKIN_ZAMANDA")));
    await y.yenile(g);
    expect(g.izle).not.toHaveBeenCalled();
    expect(y.durum().bildirim).toBeNull();
  });

  it("hata: kısa bildirim 'Bağlantı yok — tekrar deneyin', süre dolunca kalkar; pencere açılmaz (hemen yeniden denenir)", async () => {
    jest.useFakeTimers();
    const y = createYenileci(now);
    const fabrika = jest.fn(async (): Promise<SyncNowResponse> => {
      throw new ApiError(0, "AG", "ağ");
    });
    expect(await y.yenile(girdi(fabrika))).toBe("hata");
    expect(y.durum().bildirim).toBe("Bağlantı yok — tekrar deneyin");
    jest.advanceTimersByTime(YENILE_BILDIRIM_MS);
    expect(y.durum().bildirim).toBeNull();
    await y.yenile(girdi(fabrika));
    expect(fabrika).toHaveBeenCalledTimes(2);
  });

  it("403: fabrika bağlantısı kapalı cümlesi", async () => {
    jest.useFakeTimers();
    const y = createYenileci(now);
    await y.yenile(girdi(jest.fn(async (): Promise<SyncNowResponse> => {
      throw new ApiError(403, "YETKI", "x");
    })));
    expect(y.durum().bildirim).toBe("Fabrika bağlantısı kapalı — güncelleme istenemedi");
  });

  it("eski bulut (beyan yok): fabrikaya istek yok, ekran yine okunur", async () => {
    const y = createYenileci(now);
    const g = girdi(null);
    expect(await y.yenile(g)).toBe("tamam");
    expect(g.ekran).toHaveBeenCalledTimes(1);
    expect(g.izle).not.toHaveBeenCalled();
  });

  it("aboneler durum değişiminde haberdar edilir", async () => {
    const y = createYenileci(now);
    const l = jest.fn();
    const birak = y.abone(l);
    await y.yenile(girdi(null));
    expect(l).toHaveBeenCalled();
    birak();
    l.mockReset();
    await y.yenile(girdi(null));
    expect(l).not.toHaveBeenCalled();
  });
});
