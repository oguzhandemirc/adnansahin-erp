import { ipcMain, safeStorage } from "electron";
import Store from "electron-store";
import { decodeStored, type SecureInspect } from "./secure-store.core.js";

interface StoreSchema {
  encrypted: Record<string, string>;
}

const store: Store<StoreSchema> = new Store<StoreSchema>({
  name: "secure",
  defaults: { encrypted: {} },
});

function read(key: string): string | null {
  const r = decodeStored(store.get("encrypted")[key], safeStorage);
  return r.status === "OK" ? r.value : null;
}

/**
 * Üç durumlu okuma (ABSENT / OK / UNREADABLE) — yalnız ana süreç içi.
 * Depo dosyası okunamazsa da UNREADABLE ("yok" sayılıp üstüne yazılmasın).
 */
export function inspectSecureValue(key: string): SecureInspect {
  let stored: string | undefined;
  try {
    stored = store.get("encrypted")[key];
  } catch {
    return { status: "UNREADABLE" };
  }
  return decodeStored(stored, safeStorage);
}

function write(key: string, value: string): void {
  const all = { ...store.get("encrypted") };
  if (safeStorage.isEncryptionAvailable()) {
    all[key] = safeStorage.encryptString(value).toString("base64");
  } else {
    all[key] = value;
  }
  store.set("encrypted", all);
}

function remove(key: string): void {
  const all = { ...store.get("encrypted") };
  delete all[key];
  store.set("encrypted", all);
}

/**
 * Aynı kasadan main process içinden okuma (renderer'dan geçmeden).
 * Güncelleyici, pencere daha açılmadan yayın adresi ezmesini okumak zorunda —
 * IPC yolu orada henüz yok. Yazma tarafı da aynı sebeple gerekli (Ayarlar'dan
 * gelen adres, `autoUpdater`ın kendi durumuyla birlikte tek yerde yazılsın).
 */
export function readSecureValue(key: string): string | null {
  return read(key);
}

export function writeSecureValue(key: string, value: string): void {
  write(key, value);
}

export function deleteSecureValue(key: string): void {
  remove(key);
}

export function registerSecureStoreIpc(): void {
  ipcMain.handle("secure-store:get", (_e, key: string) => read(key));
  ipcMain.handle("secure-store:set", (_e, key: string, value: string) => write(key, value));
  ipcMain.handle("secure-store:delete", (_e, key: string) => remove(key));
}
