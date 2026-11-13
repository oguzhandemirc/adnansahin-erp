# Yetki · Süperadmin · Modül bayrakları

Kim neyi görür ve yazar: izin kataloğu ve rol şablonları, süperadmin (sistem hesabı), ayar şifresi ve modül/davranış bayrakları. Backend: `Teks-Erp/src/constants/{permission-catalog,role-template-catalog,settings-scopes,module-flags,module-profiles}.ts`, `src/middlewares/{rbac,system-account,settings-password,module,report}.middleware.ts`, `src/routes/feature-flag.routes.ts`, `scripts/superadmin-olustur.ts`. Panel: `Electron/src/types/auth.ts`, `lib/superadmin-gate.ts`, `lib/module-flags.ts`, `lib/route-modules.ts`, `pages/GeneralSettings/`, `pages/System/`. Tablet: `mobil/src/hooks/usePermission.ts`, `useVisibleScreens.ts`, `constants/screenModules.ts`.

## Kurallar

### Yetki, izin, rol

- İzin doğrudan kullanıcıya bağlanır (`UserPermission`), rol modeli yoktur; `PermissionTemplate` yalnız pakettir. [inceleme]
- İzin eşleşmesini yalnız `matchesPermission` yapsın (global `*` + `<domain>:*`), backend/Electron/mobil ikizdir; düz `includes("admin:*")` yazma, `["*"]`ı tanımaz. [bekçi: test_superadmin_visible]
- Yeni izni yalnız `PERMISSION_CATALOG`a bir satır ekleyerek getir; boot uzlaştırması eksik satırı yazar; izin için veri migration'ı ya da canlı DB'ye elle INSERT yazma. [bekçi: test_permission_catalog]
- Uzlaştırma yalnız ekler: silmez, açıklama ezmez, KİMSEYE atamaz; atama panelden yapılır, yeni izinde Yetki Kataloğu'ndaki "hiçbir kullanıcıda yok" bandına bak. [inceleme]
- Rol şablonları `role-template-catalog.ts`ten boot'ta uzlaştırılır; yeni izin dar bir rolde de yer alır, muaflar `ROLE_COVERAGE_EXEMPT`te gerekçeyle durur. [bekçi: test_role_template_catalog]
- Şablon kimliği `permission_templates.code`tur, ad değil; `code=null` fabrikanın kendi şablonudur ve dokunulmaz; sahiplenme yalnız `LEGACY_TEMPLATE_NAME_TO_CODE` ile. [bekçi: test_role_template_catalog]
- `mode:"all"` yalnız "Admin (Tam Yetki)" şablonundadır; diğer rollerde eksik izin eklenir, fazlası korunur. [bekçi: test_role_template_catalog]
- Sistem rolünü sert silme, pasifleştir (`isActive=false`); sert silinen rol sonraki açılışta dirilir. [inceleme]
- Saha operatörü şablonu (`SAHA_OPERATORU`) mobil ekran kataloğundan türer (`mobileScreenPermissionCodes`); yetenek izinleri ve `mobile:*` ona girmez. [bekçi: test_role_template_catalog]
- Mobil ekranın dokunduğu her uç `requireAnyPermission('<web-izni>', ...MOBILE_X)` taşır; yeni saha özelliğinde yeni izin kodu açmadan mevcut çifti kullan. [bekçi: test_permission_catalog]
- Panel karosu ile route aynı izin listesini taşır (`tile-config.permissionAny` ↔ `requireAnyPermission`). [bekçi: tile-route-permission.test.ts]
- Dar izin çiftinde READ kümesi WRITE kodunu da içerir; kümeler saf string literal dizi kalır. [bekçi: test_document_template_permission]
- `admin:settings`i `DOCUMENT_DESIGN_READ/WRITE` kümelerinden düşürme; kilitlenmeye karşı tek emniyet supabıdır. [bekçi: test_document_template_permission]
- Ayarlar ekran başına izinlidir: anahtar ↔ izin tablosu tek kaynak backend `settings-scopes.ts`, panel kategorisi onun aynası; `admin:settings` şemsiyedir. [bekçi: test_settings_scopes]
- `settings:workstation` ve `document-template:*` WEB kategorisidir, `admin:*` vermez ve Yönetim menüsünü açmaz. [bekçi: test_workstation_permission]
- Yeni ayar kategorisinde `permissionAny` verilmezse varsayılan `admin:settings`tir (gizler, sızdırmaz). [bekçi: settings-surface.test.ts]
- Panele girişte en az bir mobil-olmayan izin şarttır (`canEnterApp`); yalnız `mobile:*` izinli hesabın masaüstü girişi 403 `CHANNEL_DENIED` alır, token üretilmez; `!== "mobile"` yazma. [bekçi: test_rbac_error_codes]
- 403 yetki reddi `details.code` taşır: `PERMISSION_DENIED` (+ `required`/`requiredAny`), kanal reddi `CHANNEL_DENIED`, modül kapalı `MODULE_DISABLED`; `body.code` okuma. [bekçi: test_rbac_error_codes]
- Yeni kullanıcı `POST /api/admin/users` ile varsayılan `grantOperatorDefaults=true` olarak üç mobil istasyon izni + PIN/QR alır; web kullanıcısı için panel `false` gönderir. [bekçi: test_user_default_perms]
- Kimliksiz (public) uç yalnız gerekçeyle `test_route_auth_coverage` muaf listesine girer. [bekçi: test_route_auth_coverage]
- Görev ayrılığı üçlüsü (`shipping:invoice`, `shipping:undo-dispatch`, `roll:manual-adjust`) yalnız Muhasebe ve Üretim Süpervizörü şablonlarındadır; `shipping:invoice` `shipping:write` vermeden atanır. [inceleme]
- `admin:*` kısayolunu koruyan kapılar `matchesPermission(p, X) || matchesPermission(p, "admin:*")` yazımındadır; tek kola indirme. [inceleme]
- Panelde yetkiyi `useRoleAccess` + `<PermissionGate>` ile sor; `isAdmin` yalnız görünürlüktür, yetki kısayolu değildir. [bekçi: auth.test.ts]
- READ ile açılan ekranda yazma eylemi çizilmez (gri buton değil). [inceleme]
- Tablette `usePermissions().has()` üç jokeri tanır: `*`, `mobile:*`, `admin:*`. [bekçi: usePermission.test.ts]
- `mode:"all"` "her şey" kuralının tek istisnası `ALL_MODE_EXCLUDED`tir (`patron:giris`): parola özetini buluta taşıyan izin şablonla örtük gelmez. [bekçi: test_role_template_catalog]

### Süperadmin ve ayar şifresi

- Süperadmin bir rol değildir: `User.isSystemAccount` → `getEffectivePermissions` ilk ifadesi `["*"]`, grant satırı doğmaz, katalogda `*` yoktur. [bekçi: test_superadmin]
- Sistem hesabı kimliğini JWT'ye koyma; `verifyToken` her istekte taze okur, sahte claim 403 alır. [bekçi: test_superadmin]
- `isSystemAccount`i hiçbir Zod şemasına/yazma yoluna koyma; tek yazar `scripts/superadmin-olustur.ts`tir ve mevcut kullanıcı yükseltilmez. [bekçi: test_superadmin_visible]
- Hesabı yalnız sunucuda `npm run superadmin:kur` (`--rotate`) doğursun: idempotent, TTY yoksa gürültülü düşer; `.env` tohumlaması yoktur. [bekçi: test_superadmin_provision]
- Sistem hesabı tektir. [bekçi: test_db_invariants]
- En yetkili hesap gizlenmez (liste, audit, tablet gerçek adla); gizleme süzgeçlerini geri getirme. [bekçi: test_superadmin_visible]
- Görünürlük kimlik teslimi değildir: `GET /users/:id/credentials` sistem hesabı için başkasına 403; `/users/:id*` altındaki her yazma `protectSystemAccountTarget` ile 403 + audit `SYSTEM_ACCOUNT_WRITE_BLOCKED`. [bekçi: test_superadmin_visible]
- Süperadmin ekranları (Modüller · Veritabanı Geri Yükleme · Endpoint Performansı · Aktivite Arşivi) backend'de `requireSystemAccountWhenPresent`, panelde `superadminOnly`/`requireSystemAccount` ile kapılıdır. [bekçi: test_settings_scopes]
- Panelde süperadmin kapısı tek supaplı yüklemdir: `isSuperadminGateOpen` = `isSystemAccount || !systemAccountExists`; supapsız yüklem yazma. [bekçi: superadmin-gate.test.ts]
- Supap: sistem hesabı yoksa `admin:settings` modül anahtarı yazabilir + audit `SUPERADMIN_ABSENT_MODULE_WRITE`; durum bilinmiyorsa hesap VAR sayılır. [bekçi: test_superadmin]
- `PATCH /api/feature-flags` guard'ı anahtar-kapsamlı üç daldır: modül anahtarı varsa (`.some`, en önde, senkron) sistem hesabı; yalnız belge anahtarları (`.every`) `document-template:write`; gerisi anahtar başına ekran izni; düz OR yazma. [bekçi: test_document_template_permission]
- Ayar şifresi `requireSettingsPassword` guard'dan SONRA ve async çalışır; süperadmin ve belge-only gövde muaf, hash yoksa kapı uyur. [bekçi: test_settings_password]
- Ayar şifresini yalnız `X-Settings-Password` başlığında kabul et (gövde/query/cookie yok); ASCII `^[\x21-\x7E]+$`, 8–72, `.trim()` yerine ret. [bekçi: test_settings_password]
- `system_settings`e yazan her route zinciri `requireSettingsPassword` taşır; kapsam elle sayılmaz. [bekçi: test_settings_password]
- Ayar şifresi hash'ini (`security.settingsPasswordHash`) `systemSettingService.set()` ile yazma; `security.*` ön eki listeden ve config-bundle'dan dışlanır. [bekçi: test_settings_password]
- Panelde ayar yazan her istek `withSettingsPassword` sarmalayıcısından geçer; şifre eylemler arasında hatırlanmaz, log/toast/localStorage'a girmez. [bekçi: test_settings_password_callers]
- Oturum jti'si kullanıcıya bağlıdır: `session.userId !== payload.userId` → 401 `SESSION_INVALID`. [bekçi: test_superadmin]
- Süperadmin parolası/PIN/TOTP, ayar şifresi ve `quickPin` hiçbir yüzeye (repo, log, sürüm notu, audit yükü) girmez; `.env` uyarısı yalnız anahtar adı basar. [bekçi: test_superadmin_provision]
- Süperadmin için kurtarma kodu yoktur; cihaz kaybında `--rotate`. [inceleme]

### Parola ve giriş yöntemi

- Kullanıcı parolasını yalnız `helpers/password-policy.helper.ts` `hashNewPassword` yazar (≥ 10 karakter, ≤ 72 bayt; tekrar, dizi/klavye sırası, `constants/common-passwords.ts` listesi ve kullanıcı adı/ad-soyad tabanlı parola yasak; ret 400 `PASSWORD_POLICY` + `reason`); route Zod'u eşik taşımaz, süperadmin betiği aynı helper'ı çağırır. [bekçi: test_password_policy]
- Parolayla girişte parola kurala uymuyorsa giriş 200 + `passwordChangeRequired`: masaüstünde (electron/web) token izinsiz ve claim'li, `verifyToken` yalnız `POST /api/auth/change-password` + `/logout`u geçirir (diğer her uç 403 `PASSWORD_CHANGE_REQUIRED`); sahada token yalnız `mobile:*` taşır (eski tablet kilitlenmez). Kendi parolasını değiştirme eski parolayı ister (yanlışsa 400 `CURRENT_PASSWORD_INVALID`, deneme kilidine sayılır), `tokenVersion++` ile bütün oturumları düşürür ve yeni tam token döner. [bekçi: test_password_change_required]
- Hızlı PIN ve QR kart girişi yalnız onaylı + aktif saha cihazından (`req.device` TABLET/PHONE; gövdeden değil): masaüstü clientType, cihazsız ya da DESKTOP istek 403 `PIN_FIELD_ONLY`/`CARD_FIELD_ONLY`; kapı PIN/kart DB'ye sorulmadan önce koşar (panelden kâhin yok), 403 kilide sayılmaz. [bekçi: test_pin_field_only]

### Modül bayrakları

- Modül anahtarlarının tek kaynağı `src/constants/module-flags.ts` (`MODULE_FLAG_KEYS`, DB anahtarı `<alan>.enabled`); Electron `lib/module-flags.ts` birebir aynadır. [bekçi: test_module_flags]
- Rapor listesi (`reportsClosedKeys`) modül anahtarı değildir: süperadmin yazma kümesi ayrıdır (`SUPERADMIN_ONLY_FLAG_KEYS`), `MODULE_FLAG_KEYS`i genişletme. [bekçi: test_rapor_kapisi]
- Modül anahtarının tek yazma kapısı `PATCH /api/feature-flags`; ham ayar ucu `PUT /admin/settings/:key` modül anahtarına 400 `MODULE_KEY_RESERVED` döner. [bekçi: test_module_flags]
- Modül kapısını adlandırılmış middleware ile tak (`requireXEnabled`, `verifyToken`dan sonra, router'ın tüm uçlarından önce); jenerik `requireModule("x")` yazma. [lint]
- Kapalı modül 403 `details.code:"MODULE_DISABLED"` (+ `modul`) döner, uzak bağlantıda da. [bekçi: test_module_flag_off]
- Kapıyı taşıyan her `routes/*.routes.ts` rejim bekçisinin `KAPILI` listesinde anılır. [bekçi: test_production_regime_gate]
- Modül bağımlılığı iki yerde zorlanır: middleware ön koşulu ölçer, `setFeatureFlags` yazmada 400 `MODULE_DEPENDENCY` verir. [bekçi: test_module_flags]
- Yeni modül anahtarı kendi migration'ında damgalanır; dünkü davranışı olan modülde değer dünkü davranıştır (sabit `false` yasak), sıfırdan doğan modülde `false`. [bekçi: test_module_grandfathering]
- `readProductionEnabled`in "satır yok → true" sigortasını sadeleştirme. [bekçi: test_module_grandfathering]
- Yeni davranış bayrağının varsayılanı bugünkü davranıştır ve bu ölçülmeden yazılmaz. [bekçi: test_shipping_flags]
- Çıkışsız kapı üreten bayrak (`block`, `manualWeightRestricted`) yazılır ama açılmaz; önkoşul panel metninde durur. [bekçi: test_shipping_flags]
- Kapı takarken "malın çıktığı başka yol var mı" sorusunu kardeş bayrağın kapsamına bakarak sor. [bekçi: test_quality_batch_flags]
- Defter semantiği, brüt sevk, idempotency, atomik claim, kilit sırası, fail-closed kapı ve sır hijyeni bayrakla açılıp kapanmaz. [inceleme]
- Her ekran `ScreenEntry.modul` aidiyet beyanı taşır. [bekçi: test_screen_catalog]
- Panelde kapalı modül üç yolda kapalıdır: karo ve palet (`visibleWhen`) ve route (`ROUTE_MODULE` → `/forbidden`); kapı korunan rotanın yoluna (`useResolvedPath`) bakar. [bekçi: ProtectedRoute.module.test.tsx]
- Tablette kapalı modülün ekranları `SCREEN_MODULE` ile kart ve navigator listesinden birlikte düşer. [bekçi: useVisibleScreens.test.ts]
- Ayar satırının görünürlüğü satırdan türer (`flag-modules.ts` `FLAG_MODULE`); kapalı modülün bayrak satırı fabrika yöneticisine çizilmez. [bekçi: flag-modules.test.ts]
- Modül anahtarlarının tek panel evi Sistem → Modüller (`/system/module-profile`); davranış bayrakları Sistem → Özellik Anahtarları. [bekçi: settings-surface.test.ts]
- Kurulum profili mekanizması kodda durur (`module-profiles.ts` + `TEKSERP_PROFIL` boot job'ı, yalnız satır yoksa yazar); bu fabrikada tek değerle kullanılır, yeni profil eklenmez. [inceleme]

## Tuzaklar

- `requireSystemAccountOr404` adı bayattır; gövde 403 döner. Ada bakıp 404 varsayma.
- `module.middleware.ts`teki 403 mesajları hâlâ "Genel Ayarlar → Modüller" der; modül anahtarlarının yeri Sistem → Modüller'dir.
- Ayar şifresi kilit kovası giriş kovasından ayrıdır (`sp:` ön eki); aynı kovaya düşerse 5 yanlış ayar şifresi tüm IP'nin girişini kilitler.
- `superadmin:kur` TTY'siz (`ssh` -t'siz, `docker exec`, pm2) koşulursa `readline` sessizce bekler; kapı bu yüzden gürültülü düşer — kurulumu interaktif terminalde yap.
- Panelde modül kilidi istemci tarafındadır: bant "dondu" der, API alt bayrağı yazmaya devam eder.
- Karo döngüsü dışındaki palet girdileri (`ops:work-order-new`, `def:station-capabilities`) modül/süperadmin kapısını elle taşır; karo bekçisi onları görmez.
- `/users/:id/credentials` kapısını iki bekçi metin tarayarak ölçer (`test_superadmin`, `test_superadmin_visible`); kapının şeklini değiştirirsen ikisini birlikte güncelle.
- Tablette `MODULE_DISABLED` için özel yüz yoktur; kapalı modülde kart çizilmediği için jenerik toast kabul edilmiştir.

## Bekçiler

Backend: `test_password_policy` · `test_password_change_required` · `test_pin_field_only` · `test_permission_catalog` · `test_role_template_catalog` · `test_rbac_error_codes` · `test_route_auth_coverage` · `test_settings_scopes` · `test_workstation_permission` · `test_document_template_permission` · `test_user_default_perms` · `test_superadmin` · `test_superadmin_visible` · `test_superadmin_provision` · `test_user_credentials_guard` · `test_settings_password` · `test_settings_password_callers` · `test_db_invariants` · `test_module_flags` · `test_module_flag_off` · `test_module_grandfathering` · `test_module_profile` · `test_production_regime_gate` · `test_screen_catalog` · `test_feature_flag_contract` · `test_shipping_flags` · `test_quality_batch_flags` · `test_rapor_kapisi` · `test_admin_guard_race` · `test_audit_followups` · `test_boss_overview` · `test_card_login` · `test_config_bundle` · `test_data_integrity_gaps` · `test_demo_mode` · `test_denetim_s2_paketi` · `test_depo_roll_cancel_permission` · `test_device_activity` · `test_direct_ship_api` · `test_field_address` · `test_finance_documents` · `test_finance_flag_off` · `test_finance_regime_gate` · `test_finance_reports` · `test_global_search` · `test_http_api` · `test_import_framework` · `test_import_permissions` · `test_item_price` · `test_login_access` · `test_login_lockout` · `test_login_lockout_coverage` · `test_login_methods` · `test_master_data_merge` · `test_mobile_item_permission` · `test_mobile_order_permission` · `test_mobile_screen_permissions` · `test_p2_api` · `test_p2_auth` · `test_p2_infra` · `test_permission_grant_source` · `test_permission_management` · `test_quickstart_dispatch_api` · `test_remote_access_guard` · `test_roll_edit_unified` · `test_session_duration_minutes` · `test_session_purge` · `test_session_registry` · `test_setup_ticaret` · `test_single_warehouse_parity` · `test_tambur_manual_produce` · `test_tambur_manual_roll` · `test_timed_permissions` · `test_totp` · `test_user_lifecycle` · `test_work_session` · `test_workorder_documents`

Panel: `auth.test.ts` · `superadmin-gate.test.ts` · `SystemHubPage.superadmin.test.tsx` · `settings-surface.test.ts` · `settings-scope-mirror.test.ts` · `tile-route-permission.test.ts` · `module-flags.test.ts` · `flag-modules.test.ts` · `ProtectedRoute.module.test.tsx` · `route-modules.test.ts` · `apiClient.test.ts`

Tablet: `usePermission.test.ts` · `useVisibleScreens.test.ts` · `screenModules.test.ts`

Gerekçe ve ölçüm hikâyesi: eski sürüm history dizininde.
