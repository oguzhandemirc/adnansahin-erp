// Hareket altyapısı: süreler tek kaynaktan (başka dosyada sayı yok) ve sınır içinde (geçiş 150–250, toplam ≤ 400);
// "hareketi azalt" açıkken süreler 0, kayma yok, gezgin solmaya döner; açılış perdesi ilk içerikte kalkar.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { AccessibilityInfo, StyleSheet, Text } from "react-native";
import { AcilisPerdesi, Basilabilir, BASMA, KADEME, KademeliGiris, SURE, SayiGecisi, TOPLAM_UST, gezinmeAyarlari, kademe, sure } from "../src/ui/hareket";
import { BRAND_PRIMARY } from "../src/ui/tokens";

const ROOT = join(__dirname, "..");
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(tsx?|jsx?)$/.test(n) ? [p] : [];
  });
}

let azaltMock = false;
beforeEach(() => {
  azaltMock = false;
  jest.spyOn(AccessibilityInfo, "isReduceMotionEnabled").mockImplementation(async () => azaltMock);
});
afterEach(() => jest.restoreAllMocks());

async function draw(ui: React.ReactElement) {
  const r = render(ui);
  await act(async () => undefined);
  return r;
}

describe("§1 sabitler tek kaynak ve sınırda", () => {
  it("geçiş süreleri 150–250; en uzun kademe + giriş ≤ 400", () => {
    for (const [k, v] of Object.entries(SURE)) {
      if (k === "nabiz") continue;
      expect([k, v >= 150 && v <= 250]).toEqual([k, true]);
    }
    expect(kademe(99, false)).toBe(KADEME.enCokSira * KADEME.adim);
    expect(kademe(99, false) + SURE.orta).toBeLessThanOrEqual(TOPLAM_UST);
  });
  it("hareket/sabitler.ts dışında süre/gecikme/yay sayısı yazılmaz", () => {
    const re = /(duration|animationDuration|stiffness|damping):\s*\d|(delay|withDelay)\(\s*\d/;
    const bad: string[] = [];
    for (const f of [...walk(join(ROOT, "src")), ...walk(join(ROOT, "app"))]) {
      const rel = relative(ROOT, f).split("\\").join("/");
      if (rel === "src/ui/hareket/sabitler.ts") continue;
      readFileSync(f, "utf8").split("\n").forEach((l, i) => {
        if (re.test(l)) bad.push(`${rel}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
  it("açılış perdesi rengi = yerel açılış ekranı rengi (app.json)", () => {
    const app = JSON.parse(readFileSync(join(ROOT, "app.json"), "utf8")) as { expo: { splash: { backgroundColor: string }; android: { splash: { backgroundColor: string } } } };
    expect(app.expo.splash.backgroundColor.toUpperCase()).toBe(BRAND_PRIMARY);
    expect(app.expo.android.splash.backgroundColor.toUpperCase()).toBe(BRAND_PRIMARY);
  });
});

describe("§2 hareketi azalt (tek yerden)", () => {
  it("sure/kademe 0; gezgin kayma yerine kısa solma, sekme hareketsiz", () => {
    for (const k of Object.keys(SURE) as (keyof typeof SURE)[]) expect(sure(k, true)).toBe(0);
    expect(kademe(3, true)).toBe(0);
    const a = gezinmeAyarlari(true);
    expect(a.yigin.animation).toBe("fade");
    expect(a.modal.animation).toBe("fade");
    expect(a.sekme).toMatchObject({ animation: "none", transitionSpec: { config: { duration: 0 } } });
    const n = gezinmeAyarlari(false);
    expect(n.yigin).toMatchObject({ animation: "ios_from_right", animationDuration: SURE.uzun });
    expect(n.modal).toMatchObject({ animation: "slide_from_bottom", gestureDirection: "vertical" });
    expect(n.sekme).toMatchObject({ animation: "fade", transitionSpec: { config: { duration: SURE.orta } } });
  });

  it.each([[false, true], [true, false]] as const)("Basilabilir: azalt=%s → basınca ölçek 0.97 animasyonu %s; onPress çalışır", async (azalt, olcekli) => {
    azaltMock = azalt;
    // Reanimated mock'u paylaşılan değeri her çizimde sıfırlar; ölçek bu yüzden animasyon çağrısından okunur.
    const R = require("react-native-reanimated") as { withTiming: (...a: unknown[]) => unknown };
    const spy = jest.spyOn(R, "withTiming");
    const onPress = jest.fn();
    await draw(<Basilabilir onPress={onPress} testID="b" accessibilityLabel="Kart"><Text>x</Text></Basilabilir>);
    fireEvent(screen.getByTestId("b"), "pressIn");
    expect(spy.mock.calls.some((c) => c[0] === BASMA.olcek)).toBe(olcekli);
    fireEvent.press(screen.getByTestId("b"));
    expect(onPress).toHaveBeenCalled();
    expect(screen.getByLabelText("Kart").props.accessibilityRole).toBe("button");
  });

  it.each([[false, true], [true, false]] as const)("KademeliGiris: azalt=%s → giriş animasyonu %s", async (azalt, var_) => {
    azaltMock = azalt;
    await draw(<KademeliGiris sira={2} testID="k"><Text>öğe</Text></KademeliGiris>);
    expect(screen.getByText("öğe")).toBeTruthy();
    expect(screen.getByTestId("k").props.entering !== undefined).toBe(var_);
  });

  it("SayiGecisi değeri değişince yeni metni çizer", async () => {
    const r = await draw(<SayiGecisi testID="s">12</SayiGecisi>);
    r.rerender(<SayiGecisi testID="s">{"1.250"}</SayiGecisi>);
    expect(screen.getByText("1.250")).toBeTruthy();
  });
});

describe("§3 açılış perdesi", () => {
  it("içerik hazır olana dek durur, sonra solup kalkar", async () => {
    jest.useFakeTimers();
    try {
      const r = await draw(<AcilisPerdesi hazir={false} />);
      expect(StyleSheet.flatten(screen.getByTestId("acilis-perdesi").props.style).backgroundColor).toBe(BRAND_PRIMARY);
      act(() => jest.advanceTimersByTime(2_000));
      expect(screen.getByTestId("acilis-perdesi")).toBeTruthy();
      r.rerender(<AcilisPerdesi hazir />);
      expect(screen.getByTestId("acilis-perdesi")).toBeTruthy();
      act(() => jest.advanceTimersByTime(SURE.uzun + 60));
      expect(screen.queryByTestId("acilis-perdesi")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
  it("hareket azaltılmışsa hazır olur olmaz kalkar", async () => {
    azaltMock = true;
    const r = await draw(<AcilisPerdesi hazir={false} />);
    r.rerender(<AcilisPerdesi hazir />);
    await act(async () => undefined);
    expect(screen.queryByTestId("acilis-perdesi")).toBeNull();
  });
});
