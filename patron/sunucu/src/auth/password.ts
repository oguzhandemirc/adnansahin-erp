// Bulut hesap parolası — scrypt (node:crypto; yeni paket yok). Saklanan biçim:
//   scrypt$<log2 N>$<r>$<p>$<tuz b64u>$<özet b64u>
// Karşılaştırma sabit zamanlı; bilinmeyen kullanıcıda da aynı maliyette bir doğrulama koşulur
// (yanıt süresi hesabın varlığını sızdırmasın).
import crypto from "node:crypto";
import { promisify } from "node:util";
import { CloudError } from "../lib/errors";

const scryptAsync = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

export const MIN_PASSWORD_LENGTH = 12;
const LOG2_N = 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const MAXMEM = 128 * 1024 * 1024;
const FORMAT = /^scrypt\$(\d{2})\$(\d{1,2})\$(\d{1,2})\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/;

/** Yaygın zayıf parolalar (küçük harf; gömülü kısa liste — yeni paket yok). Yalnız YENİ belirlenen parolaya uygulanır. */
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  "123456789012", "1234567890123", "12345678901234", "123456789123", "098765432109", "123123123123", "123321123321",
  "qwertyuiopas", "qwertyuiop12", "qwertyuiop123", "qwerty123456", "qwerty1234567", "1q2w3e4r5t6y", "1qaz2wsx3edc",
  "qazwsxedcrfv", "asdfghjkl123", "zxcvbnm12345", "password1234", "password12345", "passwordpassword", "password2026",
  "parola123456", "parola1234567", "parolaparola", "sifre1234567", "şifre1234567", "sifresifre12", "iloveyou1234",
  "abcdefghijkl", "abc123abc123", "abcd1234abcd", "welcome12345", "admin1234567", "administrator", "yonetici1234",
  "adnansahin12", "adnansahin123", "adnansahin2026", "adnanşahin123", "galatasaray1", "fenerbahce12", "besiktas1903",
]);

/** Tekrarlı (aaaa…, abcabc…, 1212…) ya da düz artan/azalan rakam dizisi. */
function trivialPattern(p: string): boolean {
  for (let size = 1; size <= 4; size++) {
    const unit = p.slice(0, size);
    if (p.length % size === 0 && unit.repeat(p.length / size) === p) return true;
  }
  if (/^\d+$/.test(p)) {
    const steps = new Set([...p].slice(1).map((d, i) => (Number(d) - Number(p[i]) + 10) % 10));
    if (steps.size === 1 && (steps.has(1) || steps.has(9))) return true;
  }
  return false;
}

export function assertPasswordStrength(password: string): void {
  const normalized = password.normalize("NFC");
  const length = [...normalized].length;
  if (length < MIN_PASSWORD_LENGTH || length > 200) {
    throw new CloudError(400, "PAROLA_ZAYIF", `Parola ${MIN_PASSWORD_LENGTH}–200 karakter olmalı`);
  }
  const folded = normalized.toLowerCase();
  if (COMMON_PASSWORDS.has(folded) || trivialPattern(folded)) {
    throw new CloudError(400, "PAROLA_ZAYIF", "Bu parola çok yaygın ya da tahmin edilebilir; başka bir parola seçin");
  }
}

export async function hashPassword(password: string): Promise<string> {
  assertPasswordStrength(password);
  const salt = crypto.randomBytes(16);
  const digest = await scryptAsync(Buffer.from(password.normalize("NFC"), "utf8"), salt, KEY_LENGTH, { N: 1 << LOG2_N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${LOG2_N}$${R}$${P}$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}

/** Doğrular; biçimsiz saklı değer `false` döner (fırlatmaz). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const m = FORMAT.exec(stored);
  if (!m) return false;
  const log2n = Number(m[1]);
  if (log2n < 14 || log2n > 17) return false;
  const expected = Buffer.from(m[5]!, "base64url");
  const actual = await scryptAsync(Buffer.from(password.normalize("NFC"), "utf8"), Buffer.from(m[4]!, "base64url"), expected.length, {
    N: 1 << log2n,
    r: Number(m[2]),
    p: Number(m[3]),
    maxmem: MAXMEM,
  });
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** Bilinmeyen/uygun olmayan kullanıcıda harcanan eşdeğer iş (sonuç atılır). */
let dummyHash: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword("bos-kullanici-parolasi-degil");
  await verifyPassword(password, await dummyHash);
}
