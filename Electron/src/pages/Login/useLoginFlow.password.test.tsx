import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

/**
 * ⭐ İDDİA: zayıf parolayla giriş (backend `passwordChangeRequired` + kısıtlı,
 * izinsiz token) panelde KAÇIŞSIZ parola adımına düşer:
 *   • kısıtlı token diske YAZILMAZ ve kullanıcı uygulamaya alınmaz
 *     ("yetkin yok" toast'ı da çıkmaz — sebep parola, yetki değil),
 *   • başarılı değişimden dönen TAM token normal giriş yolundan girer,
 *   • "Çıkış" kısıtlı oturumu sunucuda iptal eder, forma döner.
 */
const tokenStoreMock = vi.hoisted(() => ({
  get: vi.fn(async () => null),
  set: vi.fn(async () => undefined),
  clear: vi.fn(async () => undefined),
}));
vi.mock("@/lib/secure-token", () => ({ tokenStore: tokenStoreMock }));
vi.mock("@/lib/server-identity", () => ({ pinServerIdentityAfterLogin: vi.fn(async () => undefined) }));
const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast: toastMock }));

import { authService } from "@/services/authService";
import { useAuthStore } from "@/store/auth";
import { useLoginFlow } from "./useLoginFlow";

function jwt(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;
}
const RESTRICTED = jwt({ userId: "u1", username: "ahmet", permissions: [], passwordChangeRequired: true });
const FULL = jwt({ userId: "u1", username: "ahmet", permissions: ["order:read"] });

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  useAuthStore.setState({ user: null });
  vi.spyOn(useAuthStore.getState(), "refreshSystemAccount").mockResolvedValue(undefined);
});

describe("useLoginFlow — zorunlu parola değişimi", () => {
  it("⭐ kısıtlı yanıt: adım açılır, token saklanmaz, kullanıcı içeri alınmaz", async () => {
    vi.spyOn(authService, "login").mockResolvedValue({
      success: true,
      data: { token: RESTRICTED, user: {} as never, passwordChangeRequired: true },
      message: "",
    });
    const { result } = renderHook(() => useLoginFlow(), { wrapper });
    await act(() => result.current.performLogin({ username: "ahmet", password: "123456" }, false));
    expect(result.current.passwordChange).toEqual({ username: "ahmet", token: RESTRICTED });
    expect(tokenStoreMock.set).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
    expect(toastMock.error).not.toHaveBeenCalled();
  });

  it("alanı taşımayan yanıt ama claim'li token da adıma düşer", async () => {
    vi.spyOn(authService, "login").mockResolvedValue({
      success: true,
      data: { token: RESTRICTED, user: {} as never },
      message: "",
    });
    const { result } = renderHook(() => useLoginFlow(), { wrapper });
    await act(() => result.current.performLogin({ username: "ahmet", password: "123456" }, false));
    expect(result.current.passwordChange?.token).toBe(RESTRICTED);
  });

  it("⭐ başarılı değişim: yeni TAM token saklanır, kullanıcı içeri alınır", async () => {
    vi.spyOn(authService, "login").mockResolvedValue({
      success: true,
      data: { token: RESTRICTED, user: {} as never, passwordChangeRequired: true },
      message: "",
    });
    const { result } = renderHook(() => useLoginFlow(), { wrapper });
    await act(() => result.current.performLogin({ username: "ahmet", password: "123456" }, false));
    await act(() => result.current.completePasswordChange(FULL));
    expect(tokenStoreMock.set).toHaveBeenCalledWith(FULL);
    expect(tokenStoreMock.set).not.toHaveBeenCalledWith(RESTRICTED);
    expect(useAuthStore.getState().user?.permissions).toEqual(["order:read"]);
    expect(result.current.passwordChange).toBeNull();
  });

  it("Çıkış: kısıtlı oturum sunucuda iptal edilir, forma dönülür", async () => {
    vi.spyOn(authService, "login").mockResolvedValue({
      success: true,
      data: { token: RESTRICTED, user: {} as never, passwordChangeRequired: true },
      message: "",
    });
    const logout = vi.spyOn(authService, "logout").mockResolvedValue(undefined);
    const { result } = renderHook(() => useLoginFlow(), { wrapper });
    await act(() => result.current.performLogin({ username: "ahmet", password: "123456" }, false));
    act(() => result.current.abandonPasswordChange());
    expect(logout).toHaveBeenCalledWith(RESTRICTED);
    expect(result.current.passwordChange).toBeNull();
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("normal giriş değişmedi: tam token saklanır, adım açılmaz", async () => {
    vi.spyOn(authService, "login").mockResolvedValue({
      success: true,
      data: { token: FULL, user: {} as never },
      message: "",
    });
    const { result } = renderHook(() => useLoginFlow(), { wrapper });
    await act(() => result.current.performLogin({ username: "ahmet", password: "x" }, false));
    expect(result.current.passwordChange).toBeNull();
    expect(tokenStoreMock.set).toHaveBeenCalledWith(FULL);
  });
});
