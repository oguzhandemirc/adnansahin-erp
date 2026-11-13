// =============================================================================
// Güvenli depo — SAF çözme çekirdeği (electron bağımlılığı yok → vitest'te sınanır).
// Üç durumlu okuma: "yok" (ABSENT) ile "var ama okunamadı" (UNREADABLE) AYRI;
// cihaz kimliği okunamayınca üstüne yazılmasın diye (ana ürün PR #134).
// `read()` davranışı bununla BİREBİR aynıdır (OK → değer, diğerleri → null).
// =============================================================================
import type { LocalIdRead } from "../../shared/ipc-contract.js";

export type SecureInspect = LocalIdRead;

export interface CipherPort {
  isEncryptionAvailable(): boolean;
  decryptString(buf: Buffer): string;
}

/**
 * Diskteki değeri çözer. Şifreleme yokken değer düz metin sayılır (bugünkü `read` davranışı);
 * şifre çözülemeyen değer "yok" DEĞİL, UNREADABLE'dır.
 */
export function decodeStored(stored: string | undefined, cipher: CipherPort): SecureInspect {
  if (!stored) return { status: "ABSENT" };
  try {
    if (!cipher.isEncryptionAvailable()) return { status: "OK", value: stored };
    return { status: "OK", value: cipher.decryptString(Buffer.from(stored, "base64")) };
  } catch {
    return { status: "UNREADABLE" };
  }
}
