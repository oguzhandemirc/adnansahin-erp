// Panel zili: rozet, tıklayınca okundu + gezinme, tümünü okundu, şalter kapalı / atamasız boş durum,
// köşe bildirimi yalnız YENİ gelende ve bir kez (window.api IPC köprüsü mock'lu).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/render";
import type { InboxItem, InboxPage } from "./types";
import { NotificationInboxBell } from "./NotificationInboxBell";
import { useDesktopNotices } from "./useDesktopNotices";

const get = vi.fn();
const post = vi.fn();
const openTab = vi.fn();

vi.mock("@/services/apiClient", () => ({
  default: { get: (...a: unknown[]) => get(...a), post: (...a: unknown[]) => post(...a) },
}));
vi.mock("@/store/tabs", () => ({
  useTabsStore: (sel: (s: { openTab: typeof openTab }) => unknown) => sel({ openTab }),
}));
vi.mock("@/store/auth", () => ({
  useAuthStore: (sel: (s: { user: { userId: string } }) => unknown) => sel({ user: { userId: "u1" } }),
}));

function item(id: string, over: Partial<InboxItem> = {}): InboxItem {
  return {
    id,
    eventId: `ev-${id}`,
    kind: "yeni-siparis",
    topic: "siparisler",
    entityId: `ord-${id}`,
    authorName: "Ayşe Yılmaz",
    title: `Yeni sipariş açıldı ${id}`,
    body: `Ayşe Yılmaz · Sipariş ${id}`,
    route: null,
    createdAt: new Date().toISOString(),
    readAt: null,
    ...over,
  };
}

function page(items: InboxItem[], over: Partial<InboxPage> = {}): InboxPage {
  return { items, unreadCount: items.filter((i) => !i.readAt).length, enabled: true, nextCursor: null, hasMore: false, limit: 20, ...over };
}

let inbox: InboxPage;
let prefsItems: unknown[];

beforeEach(() => {
  inbox = page([item("a"), item("b", { kind: "yeni-is-emri", entityId: "wo-9" }), item("c", { readAt: "2026-11-17T08:00:00Z" })]);
  prefsItems = [{ kind: "yeni-siparis", topic: "siparisler", label: "Yeni sipariş", mutedByUser: false, required: true }];
  get.mockReset().mockImplementation((url: string) => {
    if (url === "/api/bildirimler") return Promise.resolve({ data: { success: true, data: inbox } });
    if (url === "/api/bildirimler/tercihler")
      return Promise.resolve({ data: { success: true, data: { canChange: false, topics: [], items: prefsItems } } });
    return Promise.reject(new Error(`beklenmeyen GET ${url}`));
  });
  post.mockReset().mockImplementation((url: string) =>
    Promise.resolve({ data: { success: true, data: url.endsWith("/tumu/okundu") ? { updated: 2, unreadCount: 0 } : { id: "x", readAt: "t", unreadCount: 1 } } }),
  );
  openTab.mockReset();
});

describe("NotificationInboxBell", () => {
  it("rozet okunmamış sayısını gösterir; yoklama hata toast'ını bastırır", async () => {
    renderWithProviders(<NotificationInboxBell />);
    expect(await screen.findByTestId("bildirim-rozeti")).toHaveTextContent("2");
    expect(get.mock.calls[0]?.[1]).toMatchObject({ suppressErrorToast: true });
  });

  it("satıra tıklayınca okundu işaretlenir, ilgili kayıt açılır ve rozet düşer", async () => {
    renderWithProviders(<NotificationInboxBell />);
    await screen.findByTestId("bildirim-rozeti");
    await userEvent.click(screen.getByRole("button", { name: /Bildirimler/ }));
    expect(screen.getByRole("region", { name: "Bugün" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Yeni sipariş açıldı b/ }));
    expect(post).toHaveBeenCalledWith("/api/bildirimler/b/okundu");
    expect(openTab).toHaveBeenCalledWith("/operations/work-orders/wo-9");
    await waitFor(() => expect(screen.getByTestId("bildirim-rozeti")).toHaveTextContent("1"));
  });

  it("satırda yazar bir kez yazılır (gövdedeki 'yazar · ' öneki düşer), gövde 2 satırda kırpılır", async () => {
    renderWithProviders(<NotificationInboxBell />);
    await screen.findByTestId("bildirim-rozeti");
    await userEvent.click(screen.getByRole("button", { name: /Bildirimler/ }));
    const row = screen.getByRole("button", { name: /Yeni sipariş açıldı a/ });
    expect(row.textContent?.match(/Ayşe Yılmaz/g)).toHaveLength(1);
    const body = within(row).getByText("Sipariş a");
    expect(body).toHaveClass("line-clamp-2");
    expect(body).not.toHaveClass("block");
  });

  it("okunmuş satıra tıklamak okundu çağırmaz ama kaydı açar", async () => {
    renderWithProviders(<NotificationInboxBell />);
    await screen.findByTestId("bildirim-rozeti");
    await userEvent.click(screen.getByRole("button", { name: /Bildirimler/ }));
    await userEvent.click(screen.getByRole("button", { name: /Yeni sipariş açıldı c/ }));
    expect(post).not.toHaveBeenCalled();
    expect(openTab).toHaveBeenCalledWith("/operations/orders?focus=ord-c");
  });

  it("tümünü okundu işaretle → uç çağrılır, rozet kalkar", async () => {
    renderWithProviders(<NotificationInboxBell />);
    await screen.findByTestId("bildirim-rozeti");
    await userEvent.click(screen.getByRole("button", { name: /Bildirimler/ }));
    await userEvent.click(screen.getByRole("button", { name: /Tümünü okundu işaretle/ }));
    expect(post).toHaveBeenCalledWith("/api/bildirimler/tumu/okundu");
    await waitFor(() => expect(screen.queryByTestId("bildirim-rozeti")).toBeNull());
  });

  it("şalter kapalı: rozet yok, liste yerine 'kapalı' boş durumu", async () => {
    inbox = page([item("a")], { enabled: false });
    renderWithProviders(<NotificationInboxBell />);
    await userEvent.click(screen.getByRole("button", { name: "Bildirimler" }));
    expect(await screen.findByText("Bildirimler şu an kapalı.")).toBeInTheDocument();
    expect(screen.queryByTestId("bildirim-rozeti")).toBeNull();
    expect(screen.queryByRole("button", { name: /Yeni sipariş açıldı a/ })).toBeNull();
  });

  it("ataması olmayan kişi: sade boş durum", async () => {
    inbox = page([]);
    prefsItems = [];
    renderWithProviders(<NotificationInboxBell />);
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/bildirimler", expect.anything()));
    await userEvent.click(screen.getByRole("button", { name: "Bildirimler" }));
    expect(await screen.findByText(/Size atanmış bildirim yok/)).toBeInTheDocument();
  });
});

describe("useDesktopNotices (köşe bildirimi, IPC mock)", () => {
  const show = vi.fn();
  let clicked: ((tag: string) => void) | null = null;

  beforeEach(() => {
    show.mockReset().mockResolvedValue(true);
    clicked = null;
    (window as unknown as { api: unknown }).api = {
      desktopNotification: {
        show,
        onClicked: (cb: (tag: string) => void) => {
          clicked = cb;
          return () => (clicked = null);
        },
      },
    };
  });
  afterEach(() => {
    delete (window as unknown as { api?: unknown }).api;
  });

  function setup(initial: InboxItem[] | null) {
    const onOpenItem = vi.fn();
    const onOpenSummary = vi.fn();
    const hook = renderHook((p: { items: InboxItem[] | null; enabled: boolean }) =>
      useDesktopNotices({ userId: "u1", firstPageItems: p.items, enabled: p.enabled, onOpenItem, onOpenSummary }),
    { initialProps: { items: initial, enabled: true } });
    return { ...hook, onOpenItem, onOpenSummary };
  }

  it("ilk yüklemede gösterilmez; yeni gelen bir kez gösterilir; tıklanınca o kayıt açılır", () => {
    const { rerender, onOpenItem } = setup([item("a"), item("b")]);
    expect(show).not.toHaveBeenCalled();
    const fresh = item("n");
    rerender({ items: [fresh, item("a"), item("b")], enabled: true });
    expect(show).toHaveBeenCalledTimes(1);
    expect(show).toHaveBeenCalledWith({ title: fresh.title, body: fresh.body, tag: "teslim:n" });
    rerender({ items: [fresh, item("a"), item("b")].map((i) => ({ ...i })), enabled: true });
    expect(show).toHaveBeenCalledTimes(1);
    clicked?.("teslim:n");
    expect(onOpenItem).toHaveBeenCalledWith(fresh);
  });

  it("çok sayıda yeni → tek özet; tıklanınca liste açılır", () => {
    const { rerender, onOpenSummary } = setup([]);
    rerender({ items: ["p", "q", "r", "s", "t"].map((id) => item(id)), enabled: true });
    expect(show).toHaveBeenCalledTimes(1);
    expect(show.mock.calls[0]?.[0]).toMatchObject({ title: "5 yeni bildirim", tag: "ozet" });
    clicked?.("ozet");
    expect(onOpenSummary).toHaveBeenCalled();
  });

  it("şalter kapalıyken yeni gelen gösterilmez", () => {
    const { rerender } = setup([]);
    rerender({ items: [item("k")], enabled: false });
    expect(show).not.toHaveBeenCalled();
  });
});
