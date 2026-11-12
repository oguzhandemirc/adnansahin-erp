---
name: surum-cikar
description: Adnan Şahin ERP'de panel/tablet sürümü çıkarma akışı — sürüm notu taslağı (Claude yazar, kullanıcı ONAYLAR), not kapısı, paketleme ve yayın komutları (tablet yalnız Google Play). Tek kanal adnansahin. "sürüm çıkar", "sahaya güncelleme gönder", "yayınla" dendiğinde kullan.
---

# surum-cikar

Kural kaynağı: `docs/kurallar/surum-yayin.md` (tuzaklar, kapılar) · `docs/ops/ELECTRON-OTOMATIK-GUNCELLEME.md` · `docs/ops/SAHA-PLAY-DAGITIM.md` · `docs/ops/SURUM-NOTLARI.md`.

Tek dağıtım kanalı `adnansahin`. Hazırlık kanalı ve terfi etiketi YOK; korumalar sürüm notu kapısı, betiklerin kanal/kimlik kapıları ve kullanıcının sözlü onayıdır.

## Sıra — atlama yok

1. **Ne değişti?** `git log <son etiket>..HEAD --stat` (etiketler `panel-v*` / `tablet-v*` / `backend-v*`). Değişikliğin cinsini yaz: panel · tablet · backend.
2. **Sürüm notu TASLAĞI** — operatör diliyle, kapsam etiketli (`panel` | `tablet` | `her-ikisi`), `surum-notlari.json` biçiminde. **Kullanıcıya SUN ve açık onayını al.** Onay o sürüm içindir, başka sürüme taşınmaz; metin değişirse yeniden onay.
3. `node scripts/surum-notlari-kopyala.mjs` → `node scripts/check-surum-notlari.mjs` (şema + dil + kopya denetimi; kırmızıysa dur).
4. **Backend önce:** backend değiştiyse ÖNCE o deploy edilir (`docs/surumler/backend-<sürüm>.md`); sözleşme kırıldıysa `client-version-policy.ts` `minVersion` (sahadakinden büyük olamaz; önce istemci yayınlanır). Panel + tablet backend'den SONRA.
5. **Panel:** `./deploy/electron-paketle.sh adnansahin` (yama hanesi etiketten otomatik; küçük/büyük hane ELLE = karar) → `./deploy/electron-yayinla.sh --musteri=adnansahin --kuru` (ağsız plan) → kullanıcı "yayınla" dediğinde `./deploy/electron-yayinla.sh --musteri=adnansahin` (paket önce 0644 + dışarıdan doğrulanır, `latest.yml` EN SON) → `./deploy/electron-yayinla.sh --musteri=adnansahin --dogrula`. Ham `npm run build:win` YASAK.
6. **Tablet (yalnız Google Play — OTA yok):** `mobil/app.json` `version` + `android.versionCode` artar → `cd mobil && npm run build:apk -- --musteri=adnansahin --aab` (AAB + APK, kapılar) → `node ../deploy/play-yukle.mjs --musteri=adnansahin --aab=<yol>` (kuru) → kullanıcı onayından sonra `--uygula` (Play dahili test). Uygulama yeni sürümü uygulama içi Play güncellemesiyle kendisi bildirir; zorunluluğu `minVersion` belirler.
7. Yayın sonrası dışarıdan doğrulama (temiz URL ↔ `?cb=`); Cloudflare proxy AÇIK kalır. Panel etiketi (`panel-vX`) yayın betiği tarafından atılır; sonra `chore(sürüm): …` commit'i main'e.

## Kapılar (script durdurur, sen de dur)
- Not yoksa paketleme/yayın durur. `--musteri` her komutta zorunlu ve ARGÜMANDAN; hedef paketin KENDİ kimliğinden çözülür, niyetle birebir olmalı.
- ERP adresi kanal kaydından; açık verilirse kanalınkiyle eşit olmalı. Manifest / `latest.yml` / APK künyesi EN SON yüklenir.
- Gerçek paketleme ve yayın komutu yalnız kullanıcının o sürüm için verdiği açık onaydan sonra koşulur; canlı sunucuda her komut önce kullanıcıya gösterilir.
