// Gün sonu özeti saati alanı (D6b): sunucudaki saati gösterir · değişmeden Kaydet kapalı · biçim dışı değerde kapalı ·
// Kaydet yalnız `{ time }` gövdesini `/api/bildirim-atamalari/gun-sonu-saati`ye yazar.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import { DailySummaryTimeField } from "./DailySummaryTimeField";

const get = vi.fn();
const put = vi.fn();

vi.mock("@/services/apiClient", () => ({
  default: {
    get: (...a: unknown[]) => get(...a),
    put: (...a: unknown[]) => put(...a),
  },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const URL = "/api/bildirim-atamalari/gun-sonu-saati";

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: { success: true, data: { time: "18:30", defaultTime: "18:30" } } });
  put.mockReset().mockImplementation((_u: string, body: { time: string }) => Promise.resolve({ data: { success: true, data: { time: body.time, defaultTime: "18:30" } } }));
});

describe("DailySummaryTimeField", () => {
  it("sunucudaki saati gösterir; değişmeden Kaydet kapalı", async () => {
    renderWithProviders(<DailySummaryTimeField />);
    const input = await screen.findByLabelText("Gün sonu özeti saati");
    await waitFor(() => expect(input).toHaveValue("18:30"));
    expect(get).toHaveBeenCalledWith(URL);
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeDisabled();
  });

  it("⭐ yeni saat Kaydet ile yalnız { time } gövdesiyle yazılır", async () => {
    renderWithProviders(<DailySummaryTimeField />);
    const input = await screen.findByLabelText("Gün sonu özeti saati");
    await waitFor(() => expect(input).toHaveValue("18:30"));
    fireEvent.change(input, { target: { value: "19:05" } });
    const save = screen.getByRole("button", { name: "Kaydet" });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(put).toHaveBeenCalledWith(URL, { time: "19:05" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Kaydet" })).toBeDisabled());
  });

  it("boş saat (temizlenmiş alan) kaydedilemez", async () => {
    renderWithProviders(<DailySummaryTimeField />);
    const input = await screen.findByLabelText("Gün sonu özeti saati");
    await waitFor(() => expect(input).toHaveValue("18:30"));
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeDisabled();
    expect(put).not.toHaveBeenCalled();
  });
});
