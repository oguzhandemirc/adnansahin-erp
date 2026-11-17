import { BrowserWindow, Notification, ipcMain } from "electron";
import type { DesktopNotificationOpts } from "@shared/ipc-contract";

/**
 * İşletim sistemi köşe bildirimi (panel zili, 2.13.0 D3).
 *
 * Renderer yalnız metin + opak `tag` gönderir; tıklanınca pencere öne gelir ve
 * `tag` aynen geri döner (`desktop-notification:clicked`). Hangi kaydın açılacağına
 * renderer karar verir — main'de rota/URL yorumu yok.
 *
 * ⚠️ Gösterilen `Notification` nesnesi kapanana kadar REFERANSLA tutulur: Windows'ta
 * çöp toplanan bildirimin `click` dinleyicisi sessizce düşer (Electron bilinen sorunu).
 */
const MAX_TITLE = 120;
const MAX_BODY = 300;
const MAX_TAG = 200;
const live = new Set<Notification>();

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Girdi doğrulaması (saf; test edilebilir). Geçersizse null. */
export function sanitizeDesktopNotification(raw: unknown): DesktopNotificationOpts | null {
  if (!raw || typeof raw !== "object") return null;
  const { title, body, tag } = raw as Record<string, unknown>;
  if (typeof title !== "string" || typeof body !== "string" || typeof tag !== "string") return null;
  if (title.trim() === "" || tag === "" || tag.length > MAX_TAG) return null;
  return { title: clip(title, MAX_TITLE), body: clip(body, MAX_BODY), tag };
}

function bringToFront(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

export function registerDesktopNotificationIpc(): void {
  ipcMain.handle("desktop-notification:show", (event, raw: unknown) => {
    const opts = sanitizeDesktopNotification(raw);
    if (!opts || !Notification.isSupported()) return false;
    const win = BrowserWindow.fromWebContents(event.sender);
    const n = new Notification({ title: opts.title, body: opts.body, silent: false });
    live.add(n);
    const release = () => live.delete(n);
    n.on("click", () => {
      release();
      if (!win || win.isDestroyed()) return;
      bringToFront(win);
      win.webContents.send("desktop-notification:clicked", opts.tag);
    });
    n.on("close", release);
    n.on("failed", release);
    n.show();
    return true;
  });
}
