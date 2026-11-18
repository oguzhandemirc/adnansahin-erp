// Geri gezinme bekçisi (2026-11-19, kullanıcı: "cari ayrıntısında geri tuşu Pano'ya gidiyor"). Kök neden: kayıt ayrıntıları
// (cari, sipariş) sekme yığınlarının İÇİNDEYDİ; başka sekmeden açılınca (sipariş → cari bağlantısı) hedef sekmenin yığını
// tek ekranla kuruluyordu ve geri, Tabs'ın varsayılan `backBehavior="firstRoute"`u ile Pano'ya düşüyordu. Düzeltme:
// ayrıntılar kök yığında (iş emri/kayıt ayrıntılarıyla aynı), sekmeler `backBehavior="history"`.
// (1) Gerçek ağaç bu düzende mi (dosya + kaynak denetimi), (2) aynı düzenin davranışı (expo-router testing-library).
import { act, screen } from "@testing-library/react-native";
import { router, Stack, Tabs } from "expo-router";
import { renderRouter } from "expo-router/testing-library";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { Text } from "react-native";

const APP = join(__dirname, "..", "app", "(app)");

describe("gerçek rota ağacı", () => {
  it("cari ve sipariş ayrıntısı kök yığında; sekme yığınlarında [id] yok", () => {
    expect(existsSync(join(APP, "cariler", "[id].tsx"))).toBe(true);
    expect(existsSync(join(APP, "siparisler", "[id].tsx"))).toBe(true);
    expect(existsSync(join(APP, "is-emirleri", "[id].tsx"))).toBe(true);
    expect(existsSync(join(APP, "(tabs)", "cariler", "[id].tsx"))).toBe(false);
    expect(existsSync(join(APP, "(tabs)", "siparisler", "[id].tsx"))).toBe(false);
  });

  it("sekmeler geçmişe göre geri döner (Pano'ya atmaz)", () => {
    expect(readFileSync(join(APP, "(tabs)", "_layout.tsx"), "utf8")).toMatch(/backBehavior="history"/);
  });
});

const Ekran = ({ ad }: { ad: string }) => <Text>{ad}</Text>;
const AGAC = {
  _layout: () => <Stack screenOptions={{ headerShown: false }} />,
  "(tabs)/_layout": () => <Tabs backBehavior="history" screenOptions={{ headerShown: false }} />,
  "(tabs)/pano": () => <Ekran ad="PANO" />,
  "(tabs)/cariler/_layout": () => <Stack screenOptions={{ headerShown: false }} />,
  "(tabs)/cariler/index": () => <Ekran ad="CARI LISTESI" />,
  "(tabs)/siparisler/_layout": () => <Stack screenOptions={{ headerShown: false }} />,
  "(tabs)/siparisler/index": () => <Ekran ad="SIPARIS LISTESI" />,
  "cariler/[id]": () => <Ekran ad="CARI AYRINTISI" />,
  "siparisler/[id]": () => <Ekran ad="SIPARIS AYRINTISI" />,
};
const git = async (f: () => void) => act(async () => f());

describe("geri davranışı", () => {
  it("liste → ayrıntı → geri = liste", async () => {
    const r = renderRouter(AGAC, { initialUrl: "/pano" });
    await git(() => router.navigate("/cariler"));
    await git(() => router.push("/cariler/c1"));
    expect(r.getPathname()).toBe("/cariler/c1");
    await git(() => router.back());
    expect(r.getPathname()).toBe("/cariler");
    expect(screen.getByText("CARI LISTESI")).toBeTruthy();
  });

  it("sipariş ayrıntısı → cari bağlantısı → geri = o sipariş (Pano ya da cari listesi değil)", async () => {
    const r = renderRouter(AGAC, { initialUrl: "/pano" });
    await git(() => router.navigate("/siparisler"));
    await git(() => router.push("/siparisler/s1"));
    await git(() => router.push("/cariler/c1"));
    await git(() => router.back());
    expect(r.getPathname()).toBe("/siparisler/s1");
    await git(() => router.back());
    expect(r.getPathname()).toBe("/siparisler");
  });

  it("kök ekranda geri = önceki kök ekran; Pano'da geri yok (uygulamadan çıkış)", async () => {
    const r = renderRouter(AGAC, { initialUrl: "/pano" });
    await git(() => router.navigate("/siparisler"));
    await git(() => router.navigate("/cariler"));
    await git(() => router.back());
    expect(r.getPathname()).toBe("/siparisler");
    await git(() => router.back());
    expect(r.getPathname()).toBe("/pano");
    expect(router.canGoBack()).toBe(false);
  });
});
