// =============================================================================
// TeksERP - Login Deneme Kilidi (hızlı PIN + kart) — bellek-içi throttle
// =============================================================================
// Salt hızlı-PIN (6 hane, sistem-genelinde benzersiz) + QR kart girişleri
// LAN'da parola sormadan tek istekte kimlik belirler → throttle olmadan
// brute-force ile hesap düşürülebilir. Bu modül IP (yoksa cihaz kimliği)
// başına ardışık yanlış denemeleri sayar, eşik aşılınca artan ceza uygular.
//
// auth.middleware.ts:11-43 `lastSeenWrites` desenini aynalar: modül-seviye Map,
// tek-process invariant (yerel tek-sunucu kurulum), restart'ta sıfırlanır
// (kalıcı defter değil — LAN brute-force'a karşı yeterli). Boyut-cap sweep ile
// sınırsız büyüme engellenir. Ayarlar readPinLockout* ile CANLI okunur (cache'siz).
// =============================================================================

import type { Request } from "express";
import { readPinLockoutConfig } from "../services/system-setting.service";
import { readWebHardeningConfig, resolveClientIp } from "./web-hardening";
import "../types/express-augment";

/** Anahtar başına deneme durumu: ardışık yanlış (fails), toplam ceza turu
 *  (penaltyRounds — escalate için), blok bitiş zamanı (epoch ms) ve son deneme
 *  anı (lastFailAt — F48 idle-decay için). */
type FailEntry = {
  fails: number;
  penaltyRounds: number;
  blockedUntil: number;
  lastFailAt: number;
  /** Y4: bu kovaya dokunan son rezervasyonun sıra no'su, kilidi kuran
   *  rezervasyonun sıra no'su ve o andaki sayaç — eşiği kuran deneme BAŞARILI
   *  çıkarsa `settleLoginSuccess` yalnız KENDİ kurduğu kilidi geri alabilsin. */
  lastSeq?: number;
  lockSeq?: number;
  lockedAtFails?: number;
};

/** Rezervasyon sıra sayacı (tek süreç; yalnız eşitlik için kullanılır). */
let reserveSeq = 0;

const failCounts = new Map<string, FailEntry>();
/** Bellek tavanı — bu sayının üstünde sweep ile bayat girişler budanır. */
const MAX_ENTRIES = 5000;

/**
 * Login isteğinden kilit anahtarını çöz: IP öncelikli (LAN brute-force'a karşı
 * device-id'den daha sağlam — device-id spoof edilebilir). IP yoksa cihaz
 * kimliği (eşleşmiş cihaz ya da ham x-device-id), o da yoksa "unknown".
 */
export function resolveLoginLockoutKey(
  req: Request,
  /** Gerçek istemci IP'sini taşıyan güvenilen başlık — bkz. resolveClientIp. */
  clientIpHeader: string | null = null,
  clientIpHeaderRemoteOnly = false,
): string {
  const ip = resolveClientIp(req, clientIpHeader, clientIpHeaderRemoteOnly);
  if (ip) return ip;
  if (req.device?.deviceId) return `dev:${req.device.deviceId}`;
  const h = req.headers["x-device-id"];
  const v = Array.isArray(h) ? h[0] : h;
  if (typeof v === "string" && v.trim()) return `dev:${v.trim().slice(0, 64)}`;
  return "unknown";
}

// =============================================================================
// TERS VEKİL ARKASINDA ANAHTAR: iki katman (2026-08-14, internete açma)
// =============================================================================
// Yukarıdaki tek-anahtar (=IP) modeli fabrika LAN'ında DOĞRUDUR ve gerekçesi
// `auth.controller.ts`te yazılı: her cihaz kendi IP'sini taşır, dolayısıyla
// kullanıcı adını anahtara katmamak password-spraying'i kapatır.
//
// ⚠️ İnternete açılınca aynı model TERSİNE DÖNER. nginx/Cloudflare arkasında
// `req.ip` bütün ziyaretçiler için AYNI kenar IP'sidir; şifresini yanlış giren
// İLK ziyaretçi 5 denemede TÜM kurulumu kilitler — kimlik doğrulama gerektirmeyen,
// tek kişilik bir hizmet kesintisi. (`trust proxy` set edilirse `req.ip` yeniden
// gerçek istemci IP'si olur ve bu senaryo büyük ölçüde kapanır; ama kurumsal
// NAT arkasındaki ofis hâlâ tek IP'dir — yani "tek kişi hepsini kilitler"
// riski tamamen bitmez.)
//
// ÇÖZÜM: kimliği anahtara KATMAK ama IP katmanını da BIRAKMAK — iki kova:
//   • DAR  (`ip|kimlik`, bütçe ×1)  → hesabı brute-force'tan korur.
//   • GENİŞ(`ip`,        bütçe ×N)  → aynı kaynaktan çok hesap denemesini
//                                     (password spraying) yakalar.
// Yalnız dar kova olsaydı saldırgan kullanıcı adını değiştirerek kilidi
// atlardı (mevcut yorumun haklı olarak korktuğu şey). Yalnız geniş kova
// olsaydı bugünkü demo-kilitleme sorunu sürerdi. İkisi birlikte, meşru
// kullanıcının komşusunu kilitlemeden saldırganı durdurur.
//
// Bu davranış `LOGIN_LOCKOUT_SCOPE`/`TRUST_PROXY` ile açılır; ortam değişkeni
// YOKKEN `resolveLoginLockoutKeys` tek elemanlı bir liste döner ve aşağıdaki
// rezervasyon mantığı bugünküyle BİREBİR aynı yolu koşar (tek kod yolu — iki
// ayrı dal yazılsaydı zamanla ayrışırlardı).
// =============================================================================

/** Bir kilit kovası: anahtar + eşik çarpanı (1 = bugünkü eşik). `wide` =
 *  kaynağın (IP) ortak kovası — başarılı giriş onu SIFIRLAMAZ (Y4, bkz.
 *  `settleLoginSuccess`). Bayraksız kova DAR kovadır (kaynak|kimlik ya da
 *  eski `string` sözleşmesi). */
export type LockoutKeySpec = { key: string; budgetMultiplier: number; wide?: boolean };

/**
 * GENİŞ (IP) kovanın bütçe çarpanı. 5 seçildi: varsayılan eşik 5 deneme →
 * IP başına 25 hatalı deneme. Meşru bir ofis (tek NAT IP'si) gün içinde bu
 * kadar yanlış şifre üretmez; buna karşılık 25 farklı hesabı deneyen bir
 * spray tam da bu sınıra takılır.
 */
export const WIDE_KEY_BUDGET_MULTIPLIER = 5;

/** Kimlik parçasını normalize et — anahtar patlamasını ve büyük/küçük harf
 *  ayrışmasını önler ("Admin" ile "admin" AYNI kova olmalı). */
function normalizeIdentity(identity: string | null | undefined): string {
  const v = (identity ?? "").trim().toLowerCase();
  return v ? v.slice(0, 80) : "-";
}

/**
 * Bu giriş denemesinin sayılacağı kovalar.
 *
 * `identity` ÇAĞIRANIN sorumluluğundadır ve **sır olmamalıdır**: şifre yolunda
 * kullanıcı adı, kart/PIN yolunda cihaz kimliği kullanılır. Kart kodunu ya da
 * PIN'i kimlik olarak vermek onları bellek-içi bir haritanın anahtarına yazmak
 * olurdu; ayrıca sır her denemede değişeceği için kova hiç dolmaz, yani koruma
 * sessizce kaybolurdu.
 */
export function resolveLoginLockoutKeys(
  req: Request,
  identity?: string | null,
  /** Yalnız bekçi için: `process.env`i mutasyona uğratıp geri almak paralel
   *  koşumda sızdıran bir desendir; kapsam kararı buradan enjekte edilebilir. */
  env: NodeJS.ProcessEnv = process.env,
): LockoutKeySpec[] {
  // Uyarılar boot'ta app.ts tarafından basılıyor — her giriş denemesinde
  // tekrarlamak log'u boğar, o yüzden burada sessiz okunur.
  const { loginLockoutScope, clientIpHeader, clientIpHeaderRemoteOnly } =
    readWebHardeningConfig(env, () => {});
  const ipKey = resolveLoginLockoutKey(req, clientIpHeader, clientIpHeaderRemoteOnly);
  const narrow: LockoutKeySpec = { key: `${ipKey}|${normalizeIdentity(identity)}`, budgetMultiplier: 1 };
  // Y4 (güvenlik denetimi 2026-11-13): fabrika kipinde de DAR kova tutulur.
  // Eşiği değiştirmez (geniş kova da ×1 → aynı IP'den 5 hata yine kilit,
  // spraying kapalı); işi, başarılı girişin YALNIZ o kimliğin kendi
  // hatalarını geniş kovadan düşebilmesidir. Eskiden tek kova vardı ve
  // başarılı giriş onu sıfırlıyordu: araya kendi geçerli girişini sokan
  // saldırgan sınırsız deneme yapıyordu.
  if (loginLockoutScope === "ip") {
    return [narrow, { key: ipKey, budgetMultiplier: 1, wide: true }];
  }
  return [narrow, { key: ipKey, budgetMultiplier: WIDE_KEY_BUDGET_MULTIPLIER, wide: true }];
}

/** `string` (eski sözleşme) ya da kova listesi → kova listesi. */
function toSpecs(key: string | LockoutKeySpec[]): LockoutKeySpec[] {
  return typeof key === "string" ? [{ key, budgetMultiplier: 1 }] : key;
}

/**
 * F20: Login denemesini ATOMİK rezerve et — blok kontrolü + sayaç artışı tek
 * çağrıda, get→mutate→set arasında AWAIT YOK. Node tek-thread olduğundan ayar
 * okumaları bittikten sonraki senkron bölge, N paralel isteği seri işletir; her
 * biri kendi fails++'ını görür → eşik tam sayıda denemede kurulur (eski
 * check→verify→record akışında N istek record'dan önce check'i geçip
 * brute-force penceresi açıyordu).
 *
 * Deneme başarısız VARSAYIMIYLA sayılır; başarılı giriş `resetLoginLockout` ile
 * geri alır (net sıfır). Eşiği kuran deneme yine doğrulamaya geçer, SONRAKİ
 * denemeler bloklanır (orijinal "N deneme sonra kilit" semantiği korunur). Kilit
 * kapalıysa (pinLockoutEnabled=false) her zaman {blocked:false}.
 *
 * ⚠️ `justLocked` = "kilit TAM BU DENEMEDE kuruldu" (bir kova ilk kez
 * `blockedUntil` aldı). Çağıranlar denetim satırını YALNIZ bu anda yazar.
 * Gerekçe ÖLÇÜLDÜ (D2, 2026-09-03): audit `blocked` dalında yazılıyordu, yani
 * kilitliyken gelen HER istek bir satır üretiyordu — 60 paralel istek 60 satır
 * ekledi (koşum toplamı 319 LOCKED). Yetkili bir oturumdan saniyede yüzlerce
 * satırla `system_logs` şişirilebiliyordu ve asıl sinyal ("kilit kuruldu")
 * gürültüde kayboluyordu. Olay bir DURUM değil bir GEÇİŞTİR; bir kez yazılır.
 *
 * ⚠️ `justLocked` dönen istek `blocked:false`tur ve doğrulamaya DEVAM EDER —
 * bu, "N deneme sonra kilit" semantiğinin doğal sonucudur; kilit bir SONRAKİ
 * istekte hissedilir.
 */
export async function reserveLoginAttempt(
  key: string | LockoutKeySpec[],
): Promise<{ blocked: boolean; retryAfterSec: number; justLocked: boolean }> {
  // Beş ayar TEK sorguda (readPinLockoutConfig). Önbellek YOK — her denemede canlı
  // DB okunur, yani "middleware tazeliği" garantisi aynen korunur; yalnız
  // round-trip 5→1 iner. Ayrıca bu, aşağıdaki SENKRON BÖLGE invariant'ını
  // GÜÇLENDİRİR: iki await aşaması (enabled, sonra Promise.all) yerine tek
  // interleaving noktası kalır.
  const { enabled, attempts, penaltySec, escalateAfter, longPenaltyMin } = await readPinLockoutConfig();
  if (!enabled) return { blocked: false, retryAfterSec: 0, justLocked: false };

  // --- SENKRON BÖLGE: buradan sonra await YOK → paralel N istek seri işlenir. ---
  const now = Date.now();
  const specs = toSpecs(key);

  // 1) BLOK KONTROLÜ — hiçbir sayaç ARTMADAN, TÜM kovalar için. Kontrol ile
  //    rezervasyon ayrı turlarda: tek turda yapılsaydı ilk kova bloklu iken
  //    ikinci kovanın sayacı artmış olurdu, yani bloklu bir istemci geniş kovayı
  //    doldurmaya devam eder ve cezayı sonsuza uzatırdı.
  let blockedForMs = 0;
  for (const spec of specs) {
    const e = failCounts.get(spec.key);
    if (e && e.blockedUntil > now) blockedForMs = Math.max(blockedForMs, e.blockedUntil - now);
  }
  if (blockedForMs > 0) {
    return { blocked: true, retryAfterSec: Math.ceil(blockedForMs / 1000), justLocked: false };
  }

  // 2) REZERVASYON — her kova kendi eşiğiyle (çarpan 1 = bugünkü eşik).
  let justLocked = false;
  let newBlockMs = 0;
  const seq = ++reserveSeq;
  for (const spec of specs) {
    const entry = failCounts.get(spec.key)
      ?? { fails: 0, penaltyRounds: 0, blockedUntil: 0, lastFailAt: 0 };
    // F48: escalation ladder (penaltyRounds) idle sürede çürür — meşru kullanıcı
    // kalıcı olarak uzun-cezaya yapışmasın. Pencere = longPenaltyMin (yeni ayar YOK).
    const decayMs = Math.max(1, longPenaltyMin) * 60_000;
    if (entry.lastFailAt > 0 && now - entry.lastFailAt > decayMs) {
      const drop = Math.floor((now - entry.lastFailAt) / decayMs);
      entry.penaltyRounds = Math.max(0, entry.penaltyRounds - drop);
      // Y4: başarılı giriş geniş kovayı artık sıfırlamadığı için hatalar
      // kendiliğinden ÇÜRÜR — aynı pencere boyunca deneme gelmeyen kovanın
      // sayacı sıfırdan başlar (ortak NAT'taki ofis gün boyu biriktirmez).
      // Sürekli deneyen saldırganın sayacı çürümez: her deneme pencereyi tazeler.
      entry.fails = 0;
    }
    entry.lastFailAt = now;
    entry.lastSeq = seq;
    entry.fails += 1;
    // Eşik kovanın bütçesiyle ölçeklenir: dar kova ×1 (hesabı korur), geniş
    // (IP) kova ×N (spraying'i yakalar ama tek meşru kullanıcıyı kilitlemez).
    const budget = Math.max(1, attempts * spec.budgetMultiplier);
    if (entry.fails >= budget) {
      entry.penaltyRounds += 1;
      entry.lockSeq = seq;
      entry.lockedAtFails = entry.fails;
      entry.fails = 0;
      entry.blockedUntil =
        entry.penaltyRounds >= escalateAfter
          ? now + longPenaltyMin * 60 * 1000
          : now + penaltySec * 1000;
      // GEÇİŞ ANI — çağıranın denetim satırını yazacağı tek nokta.
      justLocked = true;
      newBlockMs = Math.max(newBlockMs, entry.blockedUntil - now);
    }
    failCounts.set(spec.key, entry);
  }

  // Sınırsız büyümeyi önle: tavan aşılınca aktif olmayan (blok bitmiş + fails=0 +
  // escalation yok) bayat girişleri buda. F48: penaltyRounds>0 olan escalation
  // state'i erken budanmasın (başarı sonrası fails=0 kalabilir).
  if (failCounts.size > MAX_ENTRIES) {
    for (const [k, e] of failCounts) {
      if (e.blockedUntil < now && e.fails === 0 && e.penaltyRounds === 0) failCounts.delete(k);
    }
  }

  // ⚠️ `retryAfterSec` burada BİLGİDİR, sözleşme değil: istek bloklanmadı (bu
  // deneme doğrulamaya geçer), yalnız kilidin kurulduğu an denetime yazılabilsin
  // diye cezanın süresi taşınır. `blocked` yüklemine bakmadan başlığa/mesaja
  // basan bir çağıran kullanıcıya yanlış cümle kurar.
  return { blocked: false, retryAfterSec: Math.ceil(newBlockMs / 1000), justLocked };
}

/**
 * TAM TEMİZLİK: verilen kovaların sayacını (fails) ve aktif bloğunu
 * (blockedUntil) sıfırlar, geniş kova dahil. ⚠️ GİRİŞ YOLUNDA KULLANILMAZ —
 * başarılı giriş `settleLoginSuccess`ten geçer (Y4; bekçi
 * `test_login_lockout_success_settle` controller'da bu çağrıyı yasaklar).
 * Yalnız bekçi temizliği ve eski `string` sözleşmesi içindir.
 * F48: penaltyRounds burada da silinmez (idle-decay ile çürür).
 */
export function resetLoginLockout(key: string | LockoutKeySpec[]): void {
  for (const spec of toSpecs(key)) {
    const e = failCounts.get(spec.key);
    if (!e) continue;
    e.fails = 0;
    e.blockedUntil = 0;
  }
}

/**
 * Y4 (güvenlik denetimi 2026-11-13): başarılı girişin kilide etkisi.
 *
 * Eskiden başarılı giriş GENİŞ (IP) kovayı da sıfırlıyordu: herhangi bir
 * operatör hesabı olan kişi 4 yanlış deneme → kendi geçerli girişi → tekrar
 * döngüsüyle başka hesabın parolasını ya da PIN uzayını SINIRSIZ tarıyordu
 * (sayaç eşiğe hiç varmadığı için ceza basamağı da artmıyordu).
 *
 * - `"account"` (kimlik = HESAP: parola girişi `u:<ad>`, parola değiştirme
 *   `pwchg:<id>`): DAR kova tamamen sıfırlanır; geniş kovadan YALNIZ bu
 *   kimliğin kendi hataları düşülür (dar sayaç kadar). Başka hesaba yapılan
 *   denemeler geniş kovada kalır; geniş kovanın aktif bloğu kaldırılmaz.
 * - `"device"` (kimlik = CİHAZ: PIN `pin:<cihaz>`, kart `card:<cihaz>`):
 *   başarı önceki hataların SAHİBİNİ kanıtlamaz (yanlış PIN bir hesaba
 *   bağlanamaz) → her kovada yalnız bu denemenin rezervasyonu geri alınır.
 *
 * Meşru kullanıcının biriken yanlışları `reserveLoginAttempt`teki boşta
 * çürümeyle (pencere = `longPenaltyMin`) temizlenir.
 */
export function settleLoginSuccess(
  key: string | LockoutKeySpec[],
  identityKind: "account" | "device",
): void {
  const specs = toSpecs(key);
  // Bu denemenin rezervasyon sıra no'su dar kovadan okunur (dar kova kimliğe özeldir).
  let mySeq: number | undefined;
  for (const spec of specs) {
    if (!spec.wide) mySeq = failCounts.get(spec.key)?.lastSeq ?? mySeq;
  }
  if (identityKind === "device") {
    // Yalnız bu denemenin kendi payı geri alınır; eşiği BU deneme kurduysa o
    // kilit de geri alınır (sayaç eşik-1'de kalır → sonraki yanlış kilitler).
    for (const spec of specs) {
      const e = failCounts.get(spec.key);
      if (!e) continue;
      if (lockedBy(e, mySeq)) undoOwnLock(e, 1);
      else if (e.fails > 0) e.fails -= 1;
    }
    return;
  }
  let credit = 1; // en az bu denemenin kendi rezervasyonu
  for (const spec of specs) {
    if (spec.wide) continue;
    const e = failCounts.get(spec.key);
    if (!e) continue;
    credit = Math.max(credit, lockedBy(e, mySeq) ? (e.lockedAtFails ?? 1) : e.fails);
    e.fails = 0;
    e.blockedUntil = 0;
  }
  for (const spec of specs) {
    if (!spec.wide) continue;
    const e = failCounts.get(spec.key);
    if (!e) continue;
    if (lockedBy(e, mySeq)) {
      // Eşiği BU (başarılı) deneme kurdu: kilit geri alınır, sayaç kilit
      // öncesine döner ve kimliğin kendi payı düşülür. Kilidi başka bir deneme
      // kurduysa ya da sonra başka deneme geldiyse bu dal koşmaz.
      undoOwnLock(e, credit);
      continue;
    }
    e.fails = Math.max(0, e.fails - credit);
  }
}

/** Bu denemenin kurduğu kilidi geri al: sayaç kilit öncesine döner, `credit` düşülür. */
function undoOwnLock(e: FailEntry, credit: number): void {
  e.blockedUntil = 0;
  e.penaltyRounds = Math.max(0, e.penaltyRounds - 1);
  e.fails = Math.max(0, (e.lockedAtFails ?? 0) - credit);
  e.lockSeq = undefined;
}

/** Kovanın kilidini `seq` rezervasyonu mu kurdu ve ondan sonra kovaya dokunan olmadı mı? */
function lockedBy(e: FailEntry, seq: number | undefined): boolean {
  return seq !== undefined && e.blockedUntil > 0 && e.lockSeq === seq && e.lastSeq === seq;
}

/**
 * F49: brute-force OLMAYAN sonuç (409 SESSION_EXISTS, 403 yöntem-kapalı) sonrası
 * bu denemenin assume-fail rezervasyonunu TEK adım geri al (fails--). resetLoginLockout'tan
 * farkı: birikmiş gerçek 401 hatalarını SİLMEZ — yalnız kendi artışını düşer; böylece
 * saldırgan araya 403/409 sokarak lockout'u sıfırlayamaz. (Nadir durum: bu deneme eşiği
 * tetiklediyse fails zaten 0 + blok kuruldu → güvenli tarafta blok bırakılır.)
 */
export function releaseLoginAttempt(key: string | LockoutKeySpec[]): void {
  for (const spec of toSpecs(key)) {
    const e = failCounts.get(spec.key);
    if (!e) continue;
    if (e.fails > 0) e.fails -= 1;
  }
}
