// "Şimdi güncelle" (2026-11-13; yerleşim 2026-11-16): eylem yalnız sunucu beyan ettiyse çalışır; başlıktaki tazelik
// öğesinin kendisidir (ayrı satır yok); yanıt kısa Türkçe geri bildirime döner; kabulde (BEKLIYOR) fabrika damgası
// izlenir, YAKIN_ZAMANDA'da izlenmez; hata cümlesi; örnek veri 60 sn taklidi.
import { readFileSync } from "node:fs";
import path from "node:path";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { ApiError } from "../src/api/client";
import type { SyncNowResponse } from "../src/api/wire";
import { syncNowAvailable } from "../src/lib/simdi-guncelle";
import { ornekSimdiGuncelle } from "../src/ornek/istemci";
import { SyncNowFeedbackText, SyncNowIndicator, useSyncNowAction } from "../src/ui/pano/SimdiGuncelle";

const NOW = Date.parse("2026-11-13T10:00:00.000Z");
const now = () => NOW;

/** Panodaki bağlantının aynısı: başlık öğesi + yalnız varken geri bildirim. */
function Harness({ available = true, request, onAccepted, last = null, offline = false }: {
  readonly available?: boolean;
  readonly request: () => Promise<SyncNowResponse>;
  readonly onAccepted?: () => void;
  readonly last?: string | null;
  readonly offline?: boolean;
}) {
  const sync = useSyncNowAction({ available, request, onAccepted, now });
  return (
    <>
      <SyncNowIndicator last={last} offline={offline} busy={sync.busy} onPress={sync.trigger} />
      <SyncNowFeedbackText feedback={sync.feedback} />
    </>
  );
}

async function press(): Promise<void> {
  await act(async () => {
    fireEvent.press(screen.getByTestId("simdi-guncelle"));
  });
}

describe("Şimdi güncelle", () => {
  it("beyan yoksa dokunuş istek atmaz", async () => {
    const request = jest.fn();
    render(<Harness available={false} request={request} />);
    await press();
    expect(request).not.toHaveBeenCalled();
    expect(screen.queryByTestId("simdi-guncelle-bildirim")).toBeNull();
  });

  it("yetenek beyanı: yalnız simdiGuncelle === true", () => {
    expect(syncNowAvailable({})).toBe(false);
    expect(syncNowAvailable(null)).toBe(false);
    expect(syncNowAvailable({ simdiGuncelle: true })).toBe(true);
  });

  it("tazelik metni + erişilebilirlik etiketi 'Şimdi güncelle'; geri bildirim yokken satır çizilmez", () => {
    render(<Harness request={jest.fn()} last={new Date(Date.now() - 47 * 3_600_000).toISOString()} />);
    const btn = screen.getByTestId("simdi-guncelle");
    expect(btn.props.accessibilityRole).toBe("button");
    expect(btn.props.accessibilityLabel).toBe("Şimdi güncelle. Son eşitleme 47 saat önce");
    expect(screen.getByText("47 saat önce")).toBeTruthy();
    expect(screen.queryByTestId("simdi-guncelle-satiri")).toBeNull();
  });

  it("damga yoksa metin 'Şimdi güncelle'; çevrimdışı etikette söylenir", () => {
    render(<Harness request={jest.fn()} />);
    expect(screen.getByText("Şimdi güncelle")).toBeTruthy();
    screen.unmount();
    render(<Harness request={jest.fn()} offline last={new Date(Date.now() - 5 * 60_000).toISOString()} />);
    expect(screen.getByTestId("simdi-guncelle").props.accessibilityLabel).toBe("Şimdi güncelle. Çevrimdışı · son eşitleme 5 dk önce");
  });

  it("gönderilirken çark döner, dokunuş kapalı (ikinci istek yok)", async () => {
    let resolve: (r: SyncNowResponse) => void = () => undefined;
    const request = jest.fn(() => new Promise<SyncNowResponse>((r) => (resolve = r)));
    render(<Harness request={request} />);
    await press();
    expect(screen.getByTestId("simdi-guncelle-cark")).toBeTruthy();
    expect(screen.getByText("Gönderiliyor…")).toBeTruthy();
    expect(screen.getByTestId("simdi-guncelle").props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    await press();
    expect(request).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ durum: "BEKLIYOR", sonrakiMumkun: new Date(NOW + 60_000).toISOString() }));
    expect(screen.queryByTestId("simdi-guncelle-cark")).toBeNull();
  });

  it("BEKLIYOR → gönderildi cümlesi ve damga izlenir", async () => {
    const onAccepted = jest.fn();
    const request = jest.fn(async (): Promise<SyncNowResponse> => ({ durum: "BEKLIYOR", sonrakiMumkun: new Date(NOW + 60_000).toISOString() }));
    render(<Harness request={request} onAccepted={onAccepted} />);
    await press();
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("simdi-guncelle-bildirim").props.children).toBe("İstek gönderildi, birkaç saniye içinde güncellenecek");
    expect(onAccepted).toHaveBeenCalledTimes(1);
  });

  it("YAKIN_ZAMANDA → kalan saniye söylenir, damga izlenmez", async () => {
    const onAccepted = jest.fn();
    const request = async (): Promise<SyncNowResponse> => ({ durum: "YAKIN_ZAMANDA", sonrakiMumkun: new Date(NOW + 45_000).toISOString() });
    render(<Harness request={request} onAccepted={onAccepted} />);
    await press();
    expect(screen.getByTestId("simdi-guncelle-bildirim").props.children).toBe("Az önce güncellendi, 45 sn sonra tekrar deneyebilirsiniz");
    expect(onAccepted).not.toHaveBeenCalled();
  });

  it("hata → Türkçe hata cümlesi (403 ayrı)", async () => {
    render(<Harness request={async () => { throw new Error("ağ"); }} />);
    await press();
    expect(screen.getByTestId("simdi-guncelle-bildirim").props.children).toBe("İstek gönderilemedi, bağlantınızı kontrol edin");
    screen.unmount();
    render(<Harness request={async () => { throw new ApiError(403, "MODULE_DISABLED", "kapalı"); }} />);
    await press();
    expect(screen.getByTestId("simdi-guncelle-bildirim").props.children).toBe("Fabrika bağlantısı kapalı; güncelleme istenemedi");
  });

  it("örnek veri kipi bulutun 60 sn penceresini taklit eder", () => {
    const t0 = NOW + 10 * 60_000;
    expect(ornekSimdiGuncelle(t0).durum).toBe("BEKLIYOR");
    const ikinci = ornekSimdiGuncelle(t0 + 15_000);
    expect(ikinci).toEqual({ durum: "YAKIN_ZAMANDA", sonrakiMumkun: new Date(t0 + 60_000).toISOString() });
    expect(ornekSimdiGuncelle(t0 + 60_000).durum).toBe("BEKLIYOR");
  });

  it("pano: eylem başlığın tazelik yuvasında, başlık altında tesis adı/eylem satırı yok", () => {
    const pano = readFileSync(path.join(__dirname, "../app/(app)/(tabs)/pano.tsx"), "utf8");
    expect(pano).toMatch(/meta=\{meta\}/);
    expect(pano).toMatch(/<SyncNowIndicator/);
    expect(pano).toMatch(/subtitle=\{syncNow\.feedback \? <SyncNowFeedbackText feedback=\{syncNow\.feedback\} \/> : undefined\}/);
    expect(pano).not.toMatch(/FacilityName/);
  });
});
