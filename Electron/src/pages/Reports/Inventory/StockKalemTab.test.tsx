import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KALEM_SERVER_OUTDATED, type StockKalem, type StockKalemRoll } from "./stockKalem";

const ROLLS: StockKalemRoll[] = [
  { rollId: "r1", barcode: "T0001", kalemKey: "p|330|b|4-KAT", qty: 6, weightKg: null, batchNumber: "P34", warehouseName: "Merkez Depo", days: 3.2, shelfDay: "2026-11-10" },
  { rollId: "r2", barcode: "T0002", kalemKey: "p|330|b|4-KAT", qty: 20, weightKg: null, batchNumber: "P60", warehouseName: "Merkez Depo", days: 44.9, shelfDay: "2026-09-30" },
];
const get = vi.fn(async (url: string) =>
  url.includes("/toplar") ? { data: { success: true, data: { bitmis: ROLLS, ham: [] } } } : { data: {} },
);
vi.mock("@/services/apiClient", () => ({ default: { get: (url: string) => get(url) } }));
import { StockKalemTab } from "./StockKalemTab";

const K: StockKalem = {
  totals: { hamCount: 2, hamQty: 150, bitmisCount: 3, bitmisQty: 38 },
  ham: [{ key: "i", itemId: "i", itemName: "IŞIK HAM", count: 2, qty: 150, kg: null, oldestDays: 12.7 }],
  bitmis: [
    { key: "p|330|b|4-KAT", itemId: "p", itemName: "PANOS", width: 330, colorId: "b", colorName: "01-BEYAZ", foldType: "4-KAT", foldName: "4 Kat", count: 2, qty: 26, kg: null, oldestDays: 44.9 },
    { key: "s|||", itemId: "s", itemName: "ŞİFON", width: null, colorId: null, colorName: null, foldType: null, foldName: null, count: 1, qty: 12, kg: 3.5, oldestDays: null },
  ],
};

function renderTab(props: Partial<Parameters<typeof StockKalemTab>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <StockKalemTab data={K} isLoading={false} {...props} />
    </QueryClientProvider>,
  );
}

// Eski sunucu (uç yok): sekme tablo yerine güncelleme cümlesini basar, çökmez.
describe("StockKalemTab hata durumu", () => {
  it("errorText varken yalnız uyarı görünür", () => {
    renderTab({ data: undefined, errorText: KALEM_SERVER_OUTDATED });
    expect(screen.getByRole("alert").textContent).toBe(KALEM_SERVER_OUTDATED);
    expect(screen.queryByText("Ham")).toBeNull();
  });
});

describe("StockKalemTab görünümler", () => {
  it("varsayılan Bitmiş kalem görünümü: kg sütunu yalnız tartılı kalem varsa; en eski gün tam gün", () => {
    renderTab();
    expect(screen.getByRole("heading", { name: "Bitmiş" })).toBeInTheDocument();
    expect(screen.getByText("Kg")).toBeInTheDocument();
    expect(screen.getByText("3,5 kg")).toBeInTheDocument();
    expect(screen.getByText("44")).toBeInTheDocument();
  });

  it("arama Türkçe harf katlamalı: 'sifon' ŞİFON'u bulur, PANOS düşer", async () => {
    renderTab();
    await userEvent.type(screen.getByLabelText("Ara"), "sifon");
    expect(screen.getByText("ŞİFON")).toBeInTheDocument();
    expect(screen.queryByText("PANOS")).toBeNull();
  });

  it("Ham sekmesi kalem tablosunu değiştirir; tartısız kümede kg sütunu yok", async () => {
    renderTab();
    await userEvent.click(screen.getByRole("tab", { name: /^Ham/ }));
    expect(screen.getByText("IŞIK HAM")).toBeInTheDocument();
    expect(screen.queryByText("Kg")).toBeNull();
  });

  it("kalem satırına tıklanınca o kalemin topları açılır (en eski üstte)", async () => {
    renderTab();
    await userEvent.click(screen.getByText("PANOS"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("PANOS · 330 cm · 01-BEYAZ · 4 Kat")).toBeInTheDocument();
    const rows = await within(dialog).findAllByText(/^T000/);
    expect(rows.map((r) => r.textContent)).toEqual(["T0002", "T0001"]);
    expect(get).toHaveBeenCalledWith(expect.stringContaining("bolum=bitmis&kalem=p%7C330%7Cb%7C4-KAT"));
  });

  it("Top bazında görünüm topları kalem adıyla listeler", async () => {
    renderTab();
    await userEvent.click(screen.getByRole("tab", { name: "Top bazında" }));
    expect(await screen.findByText("T0001")).toBeInTheDocument();
    expect(screen.getAllByText("PANOS · 330 cm · 01-BEYAZ · 4 Kat")).toHaveLength(2);
  });
});
