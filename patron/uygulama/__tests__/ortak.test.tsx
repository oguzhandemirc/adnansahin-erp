// Ortak bileşenler (şartname §3): çiziliyor · etkin temadan besleniyor (koyu + gül + az köşe ile ölçülür) · veri yokken
// boş durum · dokunma hedefi ≥ 44 · erişilebilirlik etiketi.
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import type { ReactElement } from "react";
import { StyleSheet, Text } from "react-native";
import { DEFAULT_APPEARANCE, TILE_TONES, buildTheme, type Appearance } from "../src/ui/tokens";
import { ThemeProvider } from "../src/ui/theme-context";
import { ActivityList, BosDurum, HataDurumu, ICON_TILE_SIZE, IconTile, Iskelet, ListeBlogu, ListeSatiri, MetricList, OzetSeridi, Rozet, SectionCard, StatCard } from "../src/ui/ortak";

const KOYU: Appearance = { ...DEFAULT_APPEARANCE, mode: "koyu", preset: "rose", radius: "small", surface: "neutral" };
const T = buildTheme("dark", KOYU);

async function withTheme(ui: ReactElement, a: Appearance = KOYU) {
  const store = { get: jest.fn(async () => JSON.stringify(a)), set: jest.fn(async () => undefined) };
  const r = render(<ThemeProvider store={store}>{ui}</ThemeProvider>);
  await act(async () => undefined);
  return r;
}
const flat = (id: string) => StyleSheet.flatten(screen.getByTestId(id).props.style) as Record<string, unknown>;

describe("IconTile", () => {
  it("8 ton + primary + durum tonu temadan; boy ve köşe ölçüden", async () => {
    await withTheme(
      <>
        {TILE_TONES.map((k) => <IconTile key={k} icon="cube-outline" tone={k} testID={`k-${k}`} />)}
        <IconTile icon="alert" tone="danger" size="md" testID="k-danger" accessibilityLabel="Hata" />
      </>,
    );
    for (const k of TILE_TONES) expect(flat(`k-${k}`).backgroundColor).toBe(T.tile[k].bg);
    expect(new Set(TILE_TONES.map((k) => flat(`k-${k}`).backgroundColor)).size).toBe(8);
    const d = flat("k-danger");
    expect(d).toMatchObject({ width: ICON_TILE_SIZE.md.kutu, height: 40, borderRadius: T.radius.tile.md, backgroundColor: T.color.danger.bg });
    expect(screen.getByLabelText("Hata")).toBeTruthy();
  });
});

describe("Rozet", () => {
  it("köşe YALNIZ radius.badge (Görünüm › Köşe), boy 20; metin okunur", async () => {
    await withTheme(<Rozet label="Gecikti" tone="warning" icon="time-outline" testID="r" />);
    expect(flat("r")).toMatchObject({ borderRadius: 4, minHeight: 20, backgroundColor: T.color.warning.bg });
    expect(screen.getByLabelText("Gecikti")).toBeTruthy();
  });
  it("geniş köşede hap", async () => {
    await withTheme(<Rozet label="Açık" testID="r" />, { ...KOYU, radius: "large" });
    expect(flat("r").borderRadius).toBe(buildTheme("dark", { ...KOYU, radius: "large" }).radius.badge);
  });
});

describe("StatCard", () => {
  it("değer + birim + değişim; kart temadan; basılınca çalışır; etiket tek cümle", async () => {
    const onPress = jest.fn();
    await withTheme(<StatCard etiket="Bugünkü üretim" icon="layers-outline" ton="violet" degerler={[{ deger: "12.480", birim: "m" }]} degisim={{ yuzde: -4.5, kiyas: "düne göre" }} onPress={onPress} testID="kpi" />);
    expect(screen.getByText("12.480")).toBeTruthy();
    expect(screen.getByText("%4,5")).toBeTruthy();
    expect(flat("kpi")).toMatchObject({ backgroundColor: T.color.card, borderColor: T.color.cardBorder, minHeight: 104, borderRadius: T.radius.card });
    expect(screen.getByTestId("kpi").props.accessibilityLabel).toBe("Bugünkü üretim, 12.480 m, azalış %4,5 düne göre");
    fireEvent.press(screen.getByTestId("kpi"));
    expect(onPress).toHaveBeenCalled();
  });
  it("değer yoksa — ve not; değişim verilmezse ok çizilmez", async () => {
    await withTheme(<StatCard etiket="Kasa" icon="wallet-outline" degerler={[]} bos="Bu dönemde hareket yok" testID="kpi" />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("Bu dönemde hareket yok")).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });
  it("row: para birimi başına ayrı satır (toplanmaz)", async () => {
    await withTheme(<StatCard layout="row" etiket="Alacak" icon="cash-outline" degerler={[{ deger: "1.200", birim: "TRY" }, { deger: "300", birim: "USD" }]} />);
    expect(screen.getByText("1.200")).toBeTruthy();
    expect(screen.getByText("300")).toBeTruthy();
    expect(screen.getByText("USD")).toBeTruthy();
  });
});

describe("SectionCard", () => {
  it("başlık + Tümü eylemi (dokunma ≥ 44); içerik çizilir", async () => {
    const onEylem = jest.fn();
    await withTheme(<SectionCard baslik="Son siparişler" aciklama="Bu hafta" eylem="Tümü" onEylem={onEylem} testID="b"><Text>içerik</Text></SectionCard>);
    expect(screen.getByRole("header").props.children).toBe("Son siparişler");
    const e = screen.getByTestId("b-eylem");
    const hs = e.props.hitSlop as { top: number; bottom: number };
    expect((StyleSheet.flatten(e.props.style).minHeight as number) + hs.top + hs.bottom).toBeGreaterThanOrEqual(44);
    fireEvent.press(e);
    expect(onEylem).toHaveBeenCalled();
    expect(flat("b").backgroundColor).toBe(T.color.card);
    expect(screen.getByText("içerik")).toBeTruthy();
  });
});

describe("MetricList / ActivityList", () => {
  it("satırlar çizilir ve okunur; boşken boş durum", async () => {
    await withTheme(
      <>
        <MetricList items={[{ key: "a", etiket: "Sevk", deger: "4.200 m", icon: "car-outline", ton: "green", degisim: { metin: "+%3", iyi: true } }]} />
        <ActivityList items={[{ key: "x", baslik: "SP-1042 onaylandı", alt: "Örnek Tekstil", icon: "checkmark", sag: "09:40", onPress: jest.fn() }]} />
        <MetricList items={[]} testID="m2" />
        <ActivityList items={[]} testID="a2" />
      </>,
    );
    expect(screen.getByLabelText("Sevk, 4.200 m, +%3")).toBeTruthy();
    expect(screen.getByLabelText("SP-1042 onaylandı, Örnek Tekstil, 09:40")).toBeTruthy();
    expect(screen.getByTestId("m2-bos")).toBeTruthy();
    expect(screen.getByTestId("a2-bos")).toBeTruthy();
  });
});

describe("ListeSatiri", () => {
  it("tek satır 48 pt, tam genişlik (köşe/yan boşluk yok), basılabilir + chevron, etiket birleşik", async () => {
    const onPress = jest.fn();
    await withTheme(<ListeSatiri birincil="SP-1042" ikincil="Örnek Tekstil" deger="1.250 m" rozet={<Rozet label="Açık" />} icon="cart-outline" ton="blue" onPress={onPress} testID="s" />);
    const row = screen.getByTestId("s");
    expect(row.props.accessibilityLabel).toBe("SP-1042, Örnek Tekstil, 1.250 m");
    const st = flat("s");
    expect(st.borderRadius).toBeUndefined();
    expect(st.marginHorizontal).toBeUndefined();
    expect(st.backgroundColor).toBe(T.color.card);
    expect(flat("s-satir").minHeight).toBe(48);
    fireEvent.press(row);
    expect(onPress).toHaveBeenCalled();
  });
});

describe("Durumlar", () => {
  it("BosDurum: başlık + açıklama + ikincil düğme ≥ 44", async () => {
    const onEylem = jest.fn();
    await withTheme(<BosDurum baslik="Sipariş yok" aciklama="Yeni sipariş ekleyin." eylem="Yeni sipariş" onEylem={onEylem} />);
    expect(screen.getByText("Sipariş yok")).toBeTruthy();
    expect(flat("bos-durum-eylem").minHeight as number).toBeGreaterThanOrEqual(44);
    fireEvent.press(screen.getByTestId("bos-durum-eylem"));
    expect(onEylem).toHaveBeenCalled();
  });
  it("HataDurumu: uyarı rolü, okunur tehlike rengi, Tekrar dene ≥ 44", async () => {
    const onTekrar = jest.fn();
    await withTheme(<HataDurumu onTekrar={onTekrar} ekran />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(StyleSheet.flatten(screen.getByText("Veri alınamadı.").props.style).color).toBe(T.color.danger.fg);
    expect(flat("hata-durumu-tekrar").minHeight as number).toBeGreaterThanOrEqual(44);
    fireEvent.press(screen.getByLabelText("Tekrar dene"));
    expect(onTekrar).toHaveBeenCalled();
  });
  it("Iskelet: 'Yükleniyor' der, meşgul; bloklar muted", async () => {
    await withTheme(<Iskelet bicim="kpi" satir={2} />);
    const sk = screen.getByLabelText("Yükleniyor");
    expect(sk.props.accessibilityState).toMatchObject({ busy: true });
    const json = JSON.stringify(screen.toJSON());
    expect(json).toContain(T.color.muted);
  });
});

describe("Bloklar (tam genişlik katmanlar)", () => {
  it("liste bloğu ekran oluğu kadar taşar, kart zemininde; başlık ve sayı çizilir", async () => {
    await withTheme(
      <ListeBlogu baslik="Kalemler" sayi={2} testID="b">
        <ListeSatiri birincil="A" ayrac={false} />
        <ListeSatiri birincil="B" />
      </ListeBlogu>,
    );
    const st = StyleSheet.flatten(screen.getByTestId("b").props.style);
    expect(st.marginHorizontal).toBe(-16);
    expect(st.backgroundColor).toBe(buildTheme("dark", KOYU).color.card);
    expect(screen.getByText(/Kalemler/)).toBeTruthy();
  });
  it("özet şeridi band zemininde; her öğe değer + birim + etiketle okunur; boşsa çizilmez", async () => {
    await withTheme(<OzetSeridi testID="o" items={[{ key: "a", deger: "24", birim: "kalem", etiket: "Açık" }]} />);
    expect(StyleSheet.flatten(screen.getByTestId("o").props.style).backgroundColor).toBe(buildTheme("dark", KOYU).color.band);
    expect(screen.getByTestId("o-a").props.accessibilityLabel).toBe("Açık: 24 kalem");
    screen.unmount();
    await withTheme(<OzetSeridi testID="o" items={[]} />);
    expect(screen.queryByTestId("o")).toBeNull();
  });
  it("ok={false} basılabilir satırda oku gizler", async () => {
    await withTheme(<ListeSatiri birincil="A" onPress={() => undefined} ok={false} testID="s" />);
    expect(screen.UNSAFE_queryAllByProps({ name: "chevron-forward" })).toHaveLength(0);
  });
});
