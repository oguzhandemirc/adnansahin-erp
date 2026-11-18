// Sipariş durumu renkleri + sipariş listesi hizası bekçisi (2026-11-18, kullanıcı: "her durumun kendine özgü rengi
// olmalı" · "her şey sola dayalı yazılmalı").
// §1 Her sipariş durumu (sözlük + bulut süzgeç kataloğunun `durum` değerleri) TEK kaynakta (`ui/siparis/durum.ts`)
//    bir tona eşli; tonlar birbirinden ayrık; metin/zemin kontrastı açık ve koyu temada ≥ 4.5; bilinmeyen değer nötr.
// §2 Liste, cari satırı ve ayrıntı rozeti aynı helper'dan okur.
// §3 Sipariş listesinde TÜM sütunlar (başlık + hücre) sola dayalı; sayı sütunu tabular rakamlı kalır. Ortak tablonun
//    varsayılanı (sayı sağa) başka listeler için DEĞİŞMEDİ.
import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { ORDER_STATUS } from "../src/lib/labels/siparis";
import { LIST_SEARCH } from "../src/api/wire";
import { contrast } from "../src/ui/color";
import { rozetRenk } from "../src/ui/ortak";
import { SIPARIS_DURUM_GORUNUMU, siparisDurumu } from "../src/ui/siparis/durum";
import { orderRowText } from "../src/ui/siparis/OrderRow";
import { SIPARIS_SUTUNLARI } from "../src/ui/siparis/sutunlar";
import { sutunHizasi, type SutunTanimi } from "../src/ui/tablo/model";
import { TabloBasligi, TabloSatiri } from "../src/ui/tablo/VeriTablosu";
import { schemes } from "../src/ui/tokens";

const ID = "11111111-1111-4111-8111-111111111111";
const rec = (kayit: Record<string, unknown>) => ({ id: ID, kayit, surum: "2026-11-18T09:00:00.000Z" });

/** Sözlükteki + bulut süzgeç kataloğundaki tüm sipariş durum değerleri. */
function tumDurumlar(): string[] {
  const katalog = (LIST_SEARCH.siparis?.suzgec?.secenekler ?? []).filter((s) => s.alan === "durum").map((s) => String(s.esit));
  return [...new Set([...Object.keys(ORDER_STATUS), ...katalog])];
}

describe("§1 sipariş durumu → ton (tek kaynak)", () => {
  it("her durum değeri bir tona eşli (eşlenmemiş değer kırmızı)", () => {
    const durumlar = tumDurumlar();
    expect(durumlar.length).toBeGreaterThanOrEqual(5);
    for (const d of durumlar) {
      expect([d, (SIPARIS_DURUM_GORUNUMU as Record<string, unknown>)[d] !== undefined]).toEqual([d, true]);
      expect([d, siparisDurumu(d).bilinen]).toEqual([d, true]);
    }
  });

  it("anlam: iptal kırmızı · gönderilmedi nötr · onay bekliyor amber · kısmen mavi · gönderildi yeşil; hepsi ayrık", () => {
    expect(Object.fromEntries(Object.entries(SIPARIS_DURUM_GORUNUMU).map(([k, v]) => [k, v.ton]))).toEqual({
      PENDING: "warning",
      APPROVED: "soft",
      PARTIAL_SHIPPED: "info",
      COMPLETED: "success",
      CANCELLED: "danger",
    });
    const tonlar = Object.values(SIPARIS_DURUM_GORUNUMU).map((v) => v.ton);
    expect(new Set(tonlar).size).toBe(tonlar.length);
  });

  it("açık ve koyu temada rozet metni zeminine karşı okunaklı (≥ 4.5)", () => {
    for (const tema of Object.values(schemes)) {
      for (const [d, g] of Object.entries(SIPARIS_DURUM_GORUNUMU)) {
        const c = rozetRenk(tema, g.ton);
        expect([tema.scheme, d, contrast(c.fg, c.bg) >= 4.5]).toEqual([tema.scheme, d, true]);
      }
    }
  });

  it("bilinmeyen durum ham metinle nötr gri döner", () => {
    expect(siparisDurumu("YENI_DURUM")).toMatchObject({ label: "YENI_DURUM", kisa: "YENI_DURUM", ton: "soft", bilinen: false });
    expect(siparisDurumu(undefined)).toMatchObject({ label: "—", ton: "soft", bilinen: false });
    expect(siparisDurumu("CANCELLED")).toMatchObject({ label: "Sipariş iptal edildi", kisa: "İptal", ton: "danger" });
  });
});

describe("§2 liste ve satır aynı helper'dan", () => {
  it("cari ayrıntısındaki sipariş satırı tonu helper'dan alır", () => {
    for (const d of Object.keys(ORDER_STATUS)) expect(orderRowText(rec({ durum: d }) as never).status.ton).toBe(siparisDurumu(d).ton);
  });

  it("liste durum hücresi tonlu rozet çizer, metni kısa etiket", () => {
    const durum = SIPARIS_SUTUNLARI.find((c) => c.key === "durum")!;
    render(<>{durum.ogeler!(rec({ durum: "CANCELLED" }) as never)}</>);
    expect(screen.getByText("İptal")).toBeTruthy();
    expect(screen.getByLabelText("Durum: Sipariş iptal edildi")).toBeTruthy();
  });
});

const duz = (s: unknown): Record<string, unknown> => (StyleSheet.flatten(s as never) ?? {}) as Record<string, unknown>;

function hizaOlc(sutunlar: readonly SutunTanimi<never>[]) {
  render(
    <>
      <TabloBasligi sutunlar={sutunlar} siralama={null} siralanabilir={[]} onSirala={() => undefined} testID="t" />
      <TabloSatiri sutunlar={sutunlar} kayit={rec({ sevkMiktari: 10, toplamMiktar: 20, kalemSayisi: 3, durum: "APPROVED" }) as never} ayrac={false} testID="s" />
    </>,
  );
  const satir = screen.getByTestId("s");
  return sutunlar.map((c, i) => {
    const baslikIc = screen.getByTestId(`t-sutun-${c.key}`).children[0] as unknown as { props: { style: unknown } };
    const hucre = (satir.children[i] as unknown as { props: { style: unknown; children: unknown } });
    const baslikSag = duz(baslikIc.props.style).justifyContent === "flex-end";
    const hucreSag = duz(hucre.props.style).alignItems === "flex-end";
    return { key: c.key, baslikSag, hucreSag };
  });
}

describe("§3 hizalama", () => {
  it("sipariş listesinde her sütun sola dayalı (model)", () => {
    for (const c of SIPARIS_SUTUNLARI) expect([c.key, sutunHizasi(c)]).toEqual([c.key, "sol"]);
    expect(SIPARIS_SUTUNLARI.some((c) => c.sayi)).toBe(true); // sayı sütunları tabular kalır
  });

  it("çizimde başlık ve hücre birebir aynı hizada, hiçbiri sağa yaslı değil", () => {
    for (const x of hizaOlc(SIPARIS_SUTUNLARI as never)) expect(x).toEqual({ key: x.key, baslikSag: false, hucreSag: false });
  });

  it("sayı hücresi tabular rakamlı, sola yazılı", () => {
    render(<TabloSatiri sutunlar={SIPARIS_SUTUNLARI.filter((c) => c.key === "kalem") as never} kayit={rec({ kalemSayisi: 3 }) as never} ayrac={false} testID="s" />);
    const st = duz(screen.getByText("3").props.style) as { fontVariant?: string[]; textAlign?: string };
    expect(st.fontVariant).toContain("tabular-nums");
    expect(st.textAlign).not.toBe("right");
  });

  it("ortak varsayılan değişmedi: hiza verilmemiş sayı sütunu (stok, çuval, iş emri…) sağa yaslı", () => {
    const sayiSutun = { key: "m", baslik: "Metre", agirlik: 1, sayi: true, hucre: () => "5" } as SutunTanimi<never>;
    expect(sutunHizasi(sayiSutun)).toBe("sag");
    expect(hizaOlc([sayiSutun])).toEqual([{ key: "m", baslikSag: true, hucreSag: true }]);
  });
});
