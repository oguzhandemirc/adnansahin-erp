// Patron bulutu KURULUM ANAHTARI — yalnız Ed25519 (istek imzası); lisans yok, X25519 yok.
// Özel yarı yalnız bu dosyada durur: repoya, log'a, hata mesajına, audit yüküne GİRMEZ —
// bu yüzden her hata yolu SABİT metin döner (JSON.parse/crypto mesajı içerikten parça taşıyabilir).
import { chmodSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createPrivateKey, generateKeyPairSync, type KeyObject } from "node:crypto";
import { publicKeyX } from "./jws";
import { b64uDecode, b64uEncode, isPlainObject } from "./ortak";

/** Anahtar dosyasının yolu YALNIZ bu ortam değişkeninden okunur. */
export const KEY_FILE_ENV = "PATRON_CLOUD_KEY_FILE";
export const KEY_FILE_MODE = 0o600;

export type KeyFileProblem = "DOSYA_YOK" | "IZIN_GENIS" | "OKUNAMADI" | "BICIM";

export interface CloudSigningKey {
  readonly privateKey: KeyObject;
  /** Ham açık anahtar, base64url — bulutta `kurulum-kaydet --acik-anahtar=` değeri. */
  readonly publicKeyX: string;
  readonly createdAt: string;
}

export type KeyFileResult =
  | { readonly ok: true; readonly key: CloudSigningKey }
  | { readonly ok: false; readonly problem: KeyFileProblem; readonly message: string };

const MESSAGES: Record<KeyFileProblem, string> = {
  DOSYA_YOK: "Patron bulutu anahtar dosyası yok",
  IZIN_GENIS: "Patron bulutu anahtar dosyasının izni 0600 değil (grup/diğer erişebiliyor); dosya açılmadı",
  OKUNAMADI: "Patron bulutu anahtar dosyası okunamadı",
  BICIM: "Patron bulutu anahtar dosyası biçimsiz ya da tutarsız",
};

function problem(p: KeyFileProblem): KeyFileResult {
  return { ok: false, problem: p, message: MESSAGES[p] };
}

/** Ortamdaki yol; boş ⇒ null (eşitleme kapalı). */
export function resolveKeyFilePath(raw: string | undefined = process.env[KEY_FILE_ENV]): string | null {
  const v = raw?.trim();
  return v ? v : null;
}

/** Windows'ta mode bitleri NTFS ACL'yi yansıtmaz (hep 0666/0444) — orada dizin ACL'sine güvenilir. */
export function keyFileModeOk(mode: number, platform: NodeJS.Platform = process.platform): boolean {
  if (platform === "win32") return true;
  return (mode & 0o077) === 0;
}

export function keyFileBody(key: CloudSigningKey): string {
  const pkcs8 = key.privateKey.export({ format: "der", type: "pkcs8" });
  return JSON.stringify({ v: 1, ed25519: { pkcs8: b64uEncode(pkcs8), x: key.publicKeyX }, olusturuldu: key.createdAt }, null, 2);
}

function parseBody(text: string): KeyFileResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return problem("BICIM");
  }
  if (!isPlainObject(raw) || raw.v !== 1 || !isPlainObject(raw.ed25519)) return problem("BICIM");
  const { pkcs8, x } = raw.ed25519;
  if (typeof pkcs8 !== "string" || typeof x !== "string") return problem("BICIM");
  const der = b64uDecode(pkcs8);
  if (!der) return problem("BICIM");
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  } catch {
    return problem("BICIM");
  }
  if (privateKey.asymmetricKeyType !== "ed25519") return problem("BICIM");
  // Açık yarı özel yarıdan türetilir; dosyadaki `x` uymuyorsa elle bozulmuştur — bulut kaydıyla da uymaz.
  if (publicKeyX(privateKey) !== x) return problem("BICIM");
  const createdAt = typeof raw.olusturuldu === "string" ? raw.olusturuldu : "";
  return { ok: true, key: { privateKey, publicKeyX: x, createdAt } };
}

/** Dosyayı okur; izni geniş dosya AÇILMAZ (içerik hiç okunmaz). */
export function loadKeyFile(path: string, platform: NodeJS.Platform = process.platform): KeyFileResult {
  let mode: number;
  try {
    const st = statSync(path);
    if (!st.isFile()) return problem("OKUNAMADI");
    mode = st.mode;
  } catch (err) {
    return problem((err as NodeJS.ErrnoException).code === "ENOENT" ? "DOSYA_YOK" : "OKUNAMADI");
  }
  if (!keyFileModeOk(mode, platform)) return problem("IZIN_GENIS");
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return problem("OKUNAMADI");
  }
  return parseBody(text);
}

/** Yeni çift üretir ve 0600 yazar; dosya VARSA dokunmaz (`wx`), fırlatır — anahtar asla ezilmez. */
export function generateKeyFile(path: string, nowMs: number = Date.now()): CloudSigningKey {
  const { privateKey } = generateKeyPairSync("ed25519");
  const key: CloudSigningKey = { privateKey, publicKeyX: publicKeyX(privateKey), createdAt: new Date(nowMs).toISOString() };
  writeFileSync(path, keyFileBody(key), { encoding: "utf8", mode: KEY_FILE_MODE, flag: "wx" });
  chmodSync(path, KEY_FILE_MODE);
  return key;
}
