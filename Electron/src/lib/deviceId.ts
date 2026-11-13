/**
 * Bu PC'nin kalıcı cihaz kimliği (deviceId).
 *
 * Backend bunu `x-device-id` header'ından okuyup Device → Machine'e çözer
 * (mobil tabletle aynı model). Sevkiyat PC'si atandığı makinenin kantarını
 * (PeripheralDevice/SCALE) bu sayede `getForDevice` ile bulur.
 *
 * Makineye özgü → secure-store'a (apiBaseUrl gibi) yazılır, backend
 * UserPreference'a değil. İlk açılışta üretilir, sonra sabit kalır.
 *
 * ⚠️ "Değer YOK" ile "OKUNAMADI" ayrıdır (2026-11-13, ana ürün PR #134): okunamayan asıl
 * kimliğin ÜSTÜNE YAZILMAZ (anahtar halkası geri gelince eski kimlik döner). Eskiden
 * okunamayan kimlik taze UUID ile eziliyordu → her seferinde yeni cihaz satırı (masaüstü
 * kopya kayıtlarının ikinci kök nedeni).
 * Adnan uyarlaması: asıl okunamazken ana üründeki gibi her açılışta geçici kimlik
 * üretilseydi, `device.autoReattachKnownHardware` KAPALIYKEN (varsayılan) her açılış yeni
 * satır açardı. Bu yüzden asıl okunamazken ayrı bir YEDEK yuva kullanılır: yedek okunur,
 * yoksa bir kez yazılır; yedek de okunamazsa yalnız bu oturum için geçici kimlik.
 */
import { secureStore } from "@/lib/secure-store";
import type { LocalIdRead, LocalIdSlot } from "@shared/ipc-contract";

const STORE_KEYS: Record<LocalIdSlot, string> = {
  primary: "config.deviceId",
  fallback: "config.deviceId.fallback",
};
let cached: string | null = null;
/**
 * "stored" asıl kalıcı · "created" bu açılışta üretilip asıla yazıldı ·
 * "fallback" asıl okunamadı, yedek yuva kullanılıyor · "ephemeral" yalnız bu oturum.
 */
export type DeviceIdState = "stored" | "created" | "fallback" | "ephemeral";
let cachedState: DeviceIdState | null = null;

/** Web Crypto varsa randomUUID, yoksa elle v4 (her ortamda çalışsın). */
function genUuid(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* fallthrough */
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function bridge() {
  return typeof window !== "undefined" ? window.api?.deviceIdentity : undefined;
}

/** Masaüstünde ana süreç üç durumlu okur; köprü yoksa (web) `get`: null = yok, istisna = okunamadı. */
async function readLocal(slot: LocalIdSlot): Promise<LocalIdRead> {
  const b = bridge();
  try {
    if (b) return await b.readLocalId(slot);
    const v = await secureStore.get(STORE_KEYS[slot]);
    return v ? { status: "OK", value: v } : { status: "ABSENT" };
  } catch {
    return { status: "UNREADABLE" };
  }
}

async function writeIfAbsent(slot: LocalIdSlot, value: string): Promise<boolean> {
  const b = bridge();
  try {
    if (b) return await b.createLocalId(slot, value);
    await secureStore.set(STORE_KEYS[slot], value);
    return true;
  } catch {
    return false;
  }
}

const usable = (r: LocalIdRead): r is { status: "OK"; value: string } => r.status === "OK" && r.value.length >= 8;
/** Bozuk kısa değer (<8) bizim yazdığımız olamaz → "yok" sayılır; okunamayan değere dokunulmaz. */
const writable = (r: LocalIdRead): boolean => r.status === "ABSENT" || (r.status === "OK" && r.value.length < 8);

async function resolve(): Promise<{ id: string; state: DeviceIdState }> {
  const primary = await readLocal("primary");
  if (usable(primary)) return { id: primary.value, state: "stored" };
  const fresh = genUuid();
  if (writable(primary)) {
    return { id: fresh, state: (await writeIfAbsent("primary", fresh)) ? "created" : "ephemeral" };
  }
  // Asıl OKUNAMADI → asla yazılmaz; yedek yuva.
  const fallback = await readLocal("fallback");
  if (usable(fallback)) return { id: fallback.value, state: "fallback" };
  if (writable(fallback) && (await writeIfAbsent("fallback", fresh))) return { id: fresh, state: "fallback" };
  return { id: fresh, state: "ephemeral" };
}

/** Yerel kalıcı deviceId (bkz. dosya başı: okunamayan asıl kimliğin üstüne yazılmaz). */
export async function getOrCreateDeviceId(): Promise<string> {
  if (cached) return cached;
  const r = await resolve();
  cached = r.id;
  cachedState = r.state;
  return r.id;
}

export function deviceIdState(): DeviceIdState | null {
  return cachedState;
}

/** Yalnız test: modül önbelleğini sıfırlar. */
export function resetDeviceIdForTest(): void {
  cached = null;
  cachedState = null;
}
