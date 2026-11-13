// "Şimdi güncelle" (2026-11-13): panodaki eylem yalnız sunucu beyan ettiyse görünür; yanıt kısa Türkçe geri bildirime
// döner; kabulde (BEKLIYOR) fabrika damgası izlenir, YAKIN_ZAMANDA'da izlenmez; hata cümlesi; örnek veri 60 sn taklidi.
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Text } from "react-native";
import { ApiError } from "../src/api/client";
import type { SyncNowResponse } from "../src/api/wire";
import { syncNowAvailable } from "../src/lib/simdi-guncelle";
import { ornekSimdiGuncelle } from "../src/ornek/istemci";
import { SimdiGuncelleSatiri } from "../src/ui/pano/SimdiGuncelle";

const NOW = Date.parse("2026-11-13T10:00:00.000Z");
const now = () => NOW;

async function bas(): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByTestId("simdi-guncelle"));
  });
}

describe("Şimdi güncelle", () => {
  it("beyan yoksa eylem çizilmez, sol içerik kalır", () => {
    render(<SimdiGuncelleSatiri sol={<Text>Tesis</Text>} gorunur={false} istek={jest.fn()} now={now} />);
    expect(screen.queryByTestId("simdi-guncelle")).toBeNull();
    expect(screen.getByText("Tesis")).toBeTruthy();
  });

  it("yetenek beyanı: yalnız simdiGuncelle === true", () => {
    expect(syncNowAvailable({})).toBe(false);
    expect(syncNowAvailable(null)).toBe(false);
    expect(syncNowAvailable({ simdiGuncelle: true })).toBe(true);
  });

  it("BEKLIYOR → gönderildi cümlesi ve damga izlenir", async () => {
    const onKabul = jest.fn();
    const istek = jest.fn(async (): Promise<SyncNowResponse> => ({ durum: "BEKLIYOR", sonrakiMumkun: new Date(NOW + 60_000).toISOString() }));
    render(<SimdiGuncelleSatiri gorunur istek={istek} onKabul={onKabul} now={now} />);
    await bas();
    expect(istek).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("simdi-guncelle-bildirim").props.children).toBe("İstek gönderildi, birkaç saniye içinde güncellenecek");
    expect(onKabul).toHaveBeenCalledTimes(1);
  });

  it("YAKIN_ZAMANDA → kalan saniye söylenir, damga izlenmez", async () => {
    const onKabul = jest.fn();
    const istek = async (): Promise<SyncNowResponse> => ({ durum: "YAKIN_ZAMANDA", sonrakiMumkun: new Date(NOW + 45_000).toISOString() });
    render(<SimdiGuncelleSatiri gorunur istek={istek} onKabul={onKabul} now={now} />);
    await bas();
    expect(screen.getByTestId("simdi-guncelle-bildirim").props.children).toBe("Az önce güncellendi, 45 sn sonra tekrar deneyebilirsiniz");
    expect(onKabul).not.toHaveBeenCalled();
  });

  it("hata → Türkçe hata cümlesi (403 ayrı)", async () => {
    render(<SimdiGuncelleSatiri gorunur istek={async () => { throw new Error("ağ"); }} now={now} />);
    await bas();
    expect(screen.getByTestId("simdi-guncelle-bildirim").props.children).toBe("İstek gönderilemedi, bağlantınızı kontrol edin");
    screen.unmount();
    render(<SimdiGuncelleSatiri gorunur istek={async () => { throw new ApiError(403, "MODULE_DISABLED", "kapalı"); }} now={now} />);
    await bas();
    expect(screen.getByTestId("simdi-guncelle-bildirim").props.children).toBe("Fabrika bağlantısı kapalı; güncelleme istenemedi");
  });

  it("örnek veri kipi bulutun 60 sn penceresini taklit eder", () => {
    const t0 = NOW + 10 * 60_000;
    expect(ornekSimdiGuncelle(t0).durum).toBe("BEKLIYOR");
    const ikinci = ornekSimdiGuncelle(t0 + 15_000);
    expect(ikinci).toEqual({ durum: "YAKIN_ZAMANDA", sonrakiMumkun: new Date(t0 + 60_000).toISOString() });
    expect(ornekSimdiGuncelle(t0 + 60_000).durum).toBe("BEKLIYOR");
  });

  it("pano başlık altı satırı eylemi taşır", () => {
    const pano = readFileSync(path.join(__dirname, "../app/(app)/(tabs)/pano.tsx"), "utf8");
    expect(pano).toMatch(/subtitle=\{<SimdiGuncelle sol=\{header\} \/>\}/);
  });
});
