// =============================================================================
// PAROLA KURALI — TEK KAYNAK (kullanıcı kararı 2026-11-13)
// =============================================================================
// Kullanıcı parolası yazan HER yol bu dosyadan geçer: kullanıcı yarat, yönetici
// sıfırla, kendi parolasını değiştir, süperadmin kur/`--rotate`. Girişte de
// "mevcut parola kurala uyuyor mu" sorusunu aynı yüklem cevaplar (zayıfsa
// kısıtlı oturum — `AuthService.login`).
//
// ⚠️ Hash ÜRETEN tek fonksiyon `hashNewPassword`dır: kuralı atlayarak hash
// yazmak mümkün olmasın diye kural ile hash aynı çağrıdadır. Bekçi
// `test_password_policy` `src/` ve süperadmin betiğinde başka bir parola
// hash'i üreticisi (`bcrypt.hash`) bulursa KIRMIZI verir.
//
// ⚠️ SIR HİJYENİ: dönen mesajlar ve `details` parolayı ya da bir parçasını
// ASLA taşımaz (yalnız kural kodu). Bu dosya log yazmaz.
//
// Ayar şifresi (`settings-password.service.ts`) ve TOTP kurtarma kodları ayrı
// sırlardır; bu kural onlara uygulanmaz.
// =============================================================================

import bcrypt from "bcryptjs";
import { AppError } from "../../utils/app-error";
import { COMMON_PASSWORDS } from "../../constants/common-passwords";

export const PASSWORD_MIN_LENGTH = 10;
/** bcrypt 72 baytın ötesini SESSİZCE kırpar — üst sınır bu yüzden bayt cinsinden. */
export const PASSWORD_MAX_BYTES = 72;
const BCRYPT_COST = 10;
/** Kullanıcı adı/ad-soyad çıkarıldıktan sonra kalması gereken en az karakter. */
const PERSONAL_REST_MIN = 6;

export type PasswordPolicyCode =
  | "TOO_SHORT"
  | "TOO_LONG"
  | "REPEATED"
  | "SEQUENCE"
  | "COMMON"
  | "PERSONAL";

export interface PasswordPolicyViolation {
  code: PasswordPolicyCode;
  message: string;
}

export interface PasswordPolicyContext {
  username?: string | null;
  fullName?: string | null;
}

const MESSAGES: Record<PasswordPolicyCode, string> = {
  TOO_SHORT: `Parola en az ${PASSWORD_MIN_LENGTH} karakter olmalı.`,
  TOO_LONG: `Parola en fazla ${PASSWORD_MAX_BYTES} bayt olabilir (Türkçe harfler 2 bayt sayılır).`,
  REPEATED: "Parola tek bir karakterin ya da kısa bir parçanın tekrarı olamaz.",
  SEQUENCE: "Parola ardışık rakam/harf ya da klavye sırası olamaz.",
  COMMON: "Bu parola çok yaygın ve kolay tahmin edilir; başka bir parola seçin.",
  PERSONAL:
    "Parola kullanıcı adına ya da ad-soyada dayanamaz; bunların dışında en az " +
    `${PERSONAL_REST_MIN} farklı karakter ekleyin.`,
};

const TR_FOLD: Record<string, string> = {
  ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", I: "i", İ: "i", i: "i",
  ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
};

/** Küçük harf + Türkçe katlama + yalnız [a-z0-9]. Karşılaştırmanın tek normali. */
export function normalizeForPasswordCompare(value: string): string {
  let out = "";
  for (const ch of value) {
    const folded = TR_FOLD[ch] ?? ch.toLowerCase();
    if (/^[a-z0-9]$/.test(folded)) out += folded;
  }
  return out;
}

const COMMON_SET: ReadonlySet<string> = new Set(COMMON_PASSWORDS.map(normalizeForPasswordCompare));

const reverse = (s: string): string => [...s].reverse().join("");

/** Düz dizi ve klavye sıraları (normalize edilmiş, iki yönde aranır). */
const SEQUENCES: readonly string[] = (() => {
  const base = [
    "01234567890123456789",
    "abcdefghijklmnopqrstuvwxyz",
    "qwertyuiopasdfghjklzxcvbnm",
    "qwertyuiopgu", // Türkçe Q üst sıra (ğ ü katlanmış)
    "asdfghjklsi", // Türkçe Q orta sıra (ş i katlanmış)
    "zxcvbnmoc", // Türkçe Q alt sıra (ö ç katlanmış)
    "1qaz2wsx3edc4rfv5tgb6yhn7ujm8ik9ol0p",
    "qazwsxedcrfvtgbyhnujmikolp",
    "1q2w3e4r5t6y7u8i9o0p",
    "q1w2e3r4t5y6u7i8o9p0",
  ];
  return [...base, ...base.map(reverse)];
})();

function isRepetition(lower: string): boolean {
  const chars = [...lower];
  if (new Set(chars).size <= 2) return true;
  const n = chars.length;
  for (let unit = 1; unit <= Math.floor(n / 2); unit++) {
    if (n % unit !== 0) continue;
    const head = chars.slice(0, unit).join("");
    if (head.repeat(n / unit) === lower) return true;
  }
  return false;
}

function isSequence(norm: string): boolean {
  if (norm.length < 4) return false;
  return SEQUENCES.some((seq) => seq.includes(norm));
}

function isCommon(norm: string): boolean {
  if (COMMON_SET.has(norm)) return true;
  // Baştaki/sondaki rakamlar ayıklanmış gövde: "adnansahin2026", "1905galatasaray".
  const core = norm.replace(/^\d+/, "").replace(/\d+$/, "");
  if (core.length >= 3 && core !== norm && (COMMON_SET.has(core) || isSequence(core))) return true;
  // Gövde boşsa (yalnız rakam) ya da gövdeyi kaldırınca yalnız dizi kalıyorsa
  // dizi kuralı zaten yakalar.
  return false;
}

function personalTokens(ctx: PasswordPolicyContext): string[] {
  const tokens = new Set<string>();
  const add = (raw: string | null | undefined): void => {
    const n = normalizeForPasswordCompare(raw ?? "");
    if (n.length >= 3) {
      tokens.add(n);
      tokens.add(reverse(n));
    }
  };
  add(ctx.username);
  for (const part of (ctx.fullName ?? "").split(/\s+/)) add(part);
  add((ctx.fullName ?? "").replace(/\s+/g, ""));
  // Uzundan kısaya: önce bütün ad, sonra parçaları çıkar.
  return [...tokens].sort((a, b) => b.length - a.length);
}

function isPersonal(norm: string, ctx: PasswordPolicyContext): boolean {
  let rest = norm;
  let removed = false;
  for (const t of personalTokens(ctx)) {
    if (rest.includes(t)) {
      rest = rest.split(t).join("");
      removed = true;
    }
  }
  return removed && rest.length < PERSONAL_REST_MIN;
}

/**
 * Parola kurala uyuyor mu? Uymuyorsa İLK ihlali döner, uyuyorsa `null`.
 * Saf fonksiyon: DB yok, log yok, parolayı hiçbir çıktıya koymaz.
 */
export function checkPasswordPolicy(
  password: string,
  ctx: PasswordPolicyContext = {},
): PasswordPolicyViolation | null {
  const v = (code: PasswordPolicyCode): PasswordPolicyViolation => ({ code, message: MESSAGES[code] });
  const plain = typeof password === "string" ? password : "";
  if ([...plain].length < PASSWORD_MIN_LENGTH) return v("TOO_SHORT");
  if (Buffer.byteLength(plain, "utf8") > PASSWORD_MAX_BYTES) return v("TOO_LONG");
  if (isRepetition(plain.toLowerCase())) return v("REPEATED");
  const norm = normalizeForPasswordCompare(plain);
  if (norm.length > 0 && isRepetition(norm)) return v("REPEATED");
  if (isSequence(norm)) return v("SEQUENCE");
  if (isCommon(norm)) return v("COMMON");
  if (isPersonal(norm, ctx)) return v("PERSONAL");
  return null;
}

/** Kural ihlalinde 400 fırlatır: `details.code = "PASSWORD_POLICY"`, `details.reason` = kural kodu. */
export function assertPasswordPolicy(password: string, ctx: PasswordPolicyContext = {}): void {
  const violation = checkPasswordPolicy(password, ctx);
  if (violation) {
    throw AppError.badRequest(violation.message, {
      code: "PASSWORD_POLICY",
      reason: violation.code,
    });
  }
}

/**
 * YENİ parolanın hash'i — kural + bcrypt TEK çağrıda. Kullanıcı parolası yazan
 * her yol hash'i yalnız buradan alır (bekçi: `test_password_policy`).
 */
export async function hashNewPassword(password: string, ctx: PasswordPolicyContext = {}): Promise<string> {
  assertPasswordPolicy(password, ctx);
  return bcrypt.hash(password, BCRYPT_COST);
}
