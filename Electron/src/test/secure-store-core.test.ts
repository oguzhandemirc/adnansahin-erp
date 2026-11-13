import { describe, expect, it } from "vitest";
import { decodeStored, type CipherPort } from "../../electron/ipc/secure-store.core";

// =============================================================================
// Güvenli depo üç durumlu okuma (cihaz kimliği ezme düzeltmesi, 2026-11-13; ana ürün PR #134).
// İddia: yok → ABSENT; çözülebilen → OK; çözülemeyen (anahtar halkası değişti) → UNREADABLE;
// şifreleme yokken değer düz döner (bugünkü `read` davranışı korunur).
// =============================================================================

const ok: CipherPort = { isEncryptionAvailable: () => true, decryptString: (b) => `cozuldu:${b.toString()}` };
const broken: CipherPort = {
  isEncryptionAvailable: () => true,
  decryptString: () => {
    throw new Error("Error while decrypting the ciphertext provided to safeStorage.decryptString.");
  },
};
const none: CipherPort = { isEncryptionAvailable: () => false, decryptString: () => "kullanilmaz" };

describe("decodeStored", () => {
  it("yok / boş → ABSENT", () => {
    expect(decodeStored(undefined, ok)).toEqual({ status: "ABSENT" });
    expect(decodeStored("", ok)).toEqual({ status: "ABSENT" });
  });
  it("çözülen → OK", () => {
    expect(decodeStored(Buffer.from("kimlik").toString("base64"), ok)).toEqual({ status: "OK", value: "cozuldu:kimlik" });
  });
  it("⭐ çözülemeyen → UNREADABLE (yok SAYILMAZ)", () => {
    expect(decodeStored("Ym96dWs=", broken)).toEqual({ status: "UNREADABLE" });
  });
  it("şifreleme yokken düz değer (bugünkü read)", () => {
    expect(decodeStored("duz-deger", none)).toEqual({ status: "OK", value: "duz-deger" });
  });
  it("isEncryptionAvailable istisna atarsa UNREADABLE", () => {
    const thrower: CipherPort = {
      isEncryptionAvailable: () => {
        throw new Error("x");
      },
      decryptString: () => "",
    };
    expect(decodeStored("deger", thrower)).toEqual({ status: "UNREADABLE" });
  });
});
