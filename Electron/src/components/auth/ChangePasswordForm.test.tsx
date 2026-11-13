import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { authService } from "@/services/authService";
import { ChangePasswordForm } from "./ChangePasswordForm";

/**
 * ⭐ İDDİA: kendi parola formu (zorunlu adım + hesap menüsü)
 *   • kısıtlı token'ı isteğe TAŞIR ve başarıda yeni token'ı çağırana verir,
 *   • kısa parola / eşleşmeyen tekrar ağa çıkmaz,
 *   • sunucunun Türkçe ret cümlesini DOĞRU alanın altında gösterir,
 *   • 401'de oturumu düşürme kararını çağırana bırakır.
 */
const STRONG = "Kirmizi-Tambur-42";

function fill(current: string, next: string, confirm = next) {
  fireEvent.change(screen.getByLabelText(/Mevcut parola/), { target: { value: current } });
  fireEvent.change(screen.getByLabelText(/^Yeni parola\s*\*?$/), { target: { value: next } });
  fireEvent.change(screen.getByLabelText(/Yeni parola \(tekrar\)/), { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: /Parolayı değiştir/ }));
}

const axiosErr = (status: number, code?: string, message?: string) =>
  Object.assign(new Error("http"), {
    isAxiosError: true,
    response: { status, data: { message, details: code ? { code } : undefined } },
  });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ChangePasswordForm", () => {
  it("⭐ başarı: kısıtlı token isteğe gider, yeni token onChanged'e", async () => {
    const spy = vi
      .spyOn(authService, "changePassword")
      .mockResolvedValue({ success: true, data: { token: "tok-NEW", user: {} as never }, message: "" });
    const onChanged = vi.fn();
    render(<ChangePasswordForm restrictedToken="tok-RESTRICTED" onChanged={onChanged} />);
    fill("eski-parola", STRONG);
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("tok-NEW"));
    expect(spy).toHaveBeenCalledWith({ currentPassword: "eski-parola", newPassword: STRONG }, "tok-RESTRICTED");
  });

  it("kısa parola ve eşleşmeyen tekrar ağa çıkmaz", async () => {
    const spy = vi.spyOn(authService, "changePassword");
    render(<ChangePasswordForm onChanged={vi.fn()} />);
    fill("eski", "kisa1234");
    expect(await screen.findByText("En az 10 karakter")).toBeTruthy();
    fill("eski", STRONG, `${STRONG}x`);
    expect(await screen.findByText("Parolalar eşleşmiyor")).toBeTruthy();
    expect(spy).not.toHaveBeenCalled();
  });

  it("⭐ sunucu reddi: kural cümlesi yeni parolanın, yanlış eski parola mevcut alanın altında", async () => {
    const spy = vi
      .spyOn(authService, "changePassword")
      .mockRejectedValueOnce(axiosErr(400, "PASSWORD_POLICY", "Bu parola çok yaygın."))
      .mockRejectedValueOnce(axiosErr(400, "CURRENT_PASSWORD_INVALID", "Mevcut parola yanlış."));
    const onChanged = vi.fn();
    render(<ChangePasswordForm onChanged={onChanged} />);
    fill("eski-parola", STRONG);
    expect(await screen.findByText("Bu parola çok yaygın.")).toBeTruthy();
    fill("eski-parola", STRONG);
    expect(await screen.findByText("Mevcut parola yanlış.")).toBeTruthy();
    expect(spy).toHaveBeenCalledTimes(2);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("401 → onSessionExpired", async () => {
    vi.spyOn(authService, "changePassword").mockRejectedValue(axiosErr(401));
    const onSessionExpired = vi.fn();
    render(<ChangePasswordForm onChanged={vi.fn()} onSessionExpired={onSessionExpired} />);
    fill("eski-parola", STRONG);
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalled());
  });
});
