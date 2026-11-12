# Genel, uzak erişim, keşif ve cihaz

Birden çok alanı kesen konvansiyonlar (audit, katman sırası, hata/mesaj sözleşmesi), uzak erişim (Cloudflare tüneli, uzak/LAN ayrımı, TOTP), sunucu keşfi, cihaz onayı ve donanım (kantar, metre, yazıcı). Kod: `Teks-Erp/src/middlewares/` (remote-access, web-hardening, client-info), `Teks-Erp/src/server.ts`, `Teks-Erp/src/services/audit*`, `Electron/shared/discovery.ts`, `Electron/electron/` (ipc, discovery), `mobil/src/lib/discovery.ts`, `mobil/src/services/` (discovery, hal), `mobil/src/navigation/pairingGate.ts`.

## Kurallar

### Konvansiyon ve audit
- Her CUD `AuditService.log()` ile yazılır; istisna yalnız `AUDIT_EXEMPT_MODELS`te kapalı sınıf kümesinden biriyle beyanlıdır, beyansız sessizlik kırmızıdır. [bekçi: test_audit_muafiyeti]
- Audit best-effort ve transaction DIŞINDADIR; hata isteği düşürmez, sayacı `/api/admin/health`tedir — `/health`in alan kümesi dondurulmuştur. [inceleme]
- Audit yalnız ayak izidir: çalışan kod `SystemLog`dan karar, sayı, durum ya da join türetmez; okuyabilen yalnız insana gösteren yüzeylerdir. [bekçi: test_audit_okuma_kaynagi]
- Katman sırası Routes → Controllers → Services → Prisma; route/controller `lib/prisma` import etmez. [lint]
- P2002'nin hangi kolondan geldiği yalnız `src/utils/p2002.ts` yardımcılarıyla okunur; `meta.target` doğrudan okunmaz (pg adaptörü onu vermez). [bekçi: test_p2002_hedef_tek_kaynak]
- Validation mesajları Türkçedir; i18n kurulmaz. [inceleme]
- Firma adı koda gömülmez: ekran, belge ve etiket bağlanılan sunucunun `company.name` ayarını okur, yedek nötr `DEFAULT_COMPANY_NAME`dir. [bekçi: test_musteri_adi_kodda_yok]
- Backend'e yeni npm paketi kullanıcı onayı olmadan eklenmez; önce "kendin yaz" denenir. `bonjour-service` `1.4.4` sabit (`^` yok) kalır, tembel `require` + try/catch ile yüklenir ve Electron'da `dependencies`te durur. [bekçi: discovery-ipc-contract.test.ts]
- İndirilen içe aktarım şablonunun başlığı dondurulmuş sözleşmedir: mevcut sütun adı değiştirilmez, bilgi yeni sütunla eklenir. [inceleme]
- Ölü kumanda yasak: o kurulumda etkisiz olan ayar panelde düzenlenebilir görünmez, devre dışı bırakılıp sebebi yazılır; uç ile zamanlayıcı aynı yüklemi kullanır. [bekçi: test_backup]
- Offsite yedek hedefi göreli olamaz (`isAcceptableTarget`): yazarken 400, okurken `configured:false`; aynı makinedeki hedef işaretlenir. [bekçi: test_offsite_sweep]
- Hedefi ancak iş koşunca bilinen kontrol, uyarısını açılışta tahminle değil o koşumdan basar. [bekçi: test_offsite_sweep]
- Node süreç uyarıları yığın iziyle log'a düşer (`lib/process-warnings.ts`); canlıda `--trace-deprecation` için yeniden başlatılmaz. [bekçi: test_process_warnings]
- Electron `webPreferences`: `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`; renderer `electron`/`fs`/`path`/`child_process` import etmez, native API'ye yalnız `window.api` ile ulaşır. [inceleme]
- Electron renderer'ında token localStorage'a yazılmaz (`safeStorage` + `electron-store`); tek istisna `window.api` olmayan web derlemesidir. [inceleme]
- Süperadmin kapısı yalnız `Electron/src/lib/superadmin-gate.ts`ten import edilir, kopyası yazılmaz. [inceleme]

### Uzak erişim
- Uzak/LAN ayrımı soketten (`req.socket.localPort`) çözülür; `clientType` güvenlik sınırı değildir, soket okunamazsa istek LAN sayılır. [bekçi: test_remote_access_guard]
- Tünel dinleyicisi yalnız `127.0.0.1`e bağlanır, `0.0.0.0`a açılmaz; iki dinleyici aynı process'tir, ikinci Node süreci açılmaz. [bekçi: test_remote_access_guard]
- Uzakta kapalı yollar (PIN/kart girişi, `mobile-users`, `/api/devices`, `/api/discovery`, `/api/mobile`, `/api-docs`) 404 döner, 403 değil; modül kapısı ise her yerde 403 `MODULE_DISABLED`dır. [bekçi: test_remote_access_guard]
- Uzak `/api` isteğinde Cloudflare Access JWT fail-closed'dır; JWKS önbelleğinde TTL tazeliktir — bayat anahtar döner ve tazelenir, hiç dolmadıysa reddedilir. [bekçi: test_remote_access_guard]
- `CLIENT_IP_HEADER` yalnız uzak istekte okunur, `TRUST_PROXY` app-wide açılmaz (LAN'dan sahte `CF-Connecting-IP` giriş kilidini deler). [bekçi: test_remote_access_guard]
- `quickPin` 6 hane, düz metin, sistem genelinde `@unique` ve tek başına kimliktir; log, sürüm notu, audit yükü ve uzak uçtan sızmaz. [bekçi: test_remote_access_guard]
- TOTP kurulumu yalnız yöneticinin açtığı 15 dakikalık tek kullanımlık pencereden yapılır; ikinci faktör `issueToken`den önce koşar. [bekçi: test_totp]
- helmet iki ayrı örnek kurulur (HSTS LAN'a sızmaz) ve dispatcher fonksiyonunun adı `helmetMiddleware`dır. [bekçi: test_middleware_order]
- `X-Client-*` künye başlıkları hiçbir kapıya girmez; yalnız gözlem olarak `Session.clientVersion`a yazılır, dolu satır değişmez. [bekçi: test_client_registry]
- Bağlı Cihazlar (`GET /api/sessions/active`) açık oturumları salt okur; yanıta jti/token girmez, cihaz kimliği yalnız 8 haneyle döner, sürümsüz satır "ölçülemedi"dir, eski değil. [bekçi: test_active_sessions]
- `GET /api/boss/overview` izin süzmesini serviste yapar (yetkisiz bölümün sorgusu koşmaz) ve yeni izin kodu açmaz. [bekçi: test_boss_overview]

### Keşif ve cihaz
- Keşifte bir satır = bir sunucu: tekilleştirme `installationId` ile (`groupByInstallation`), önce tekilleştir sonra sırala. [bekçi: discovery-logic.test.ts]
- Keşif kuralı `KEŞİF-İKİZ` bloğunda tek metin olarak Electron ve mobilde birebir durur; biri değişirse öbürü aynı commit'te değişir. [bekçi: discovery.contract.test.ts]
- `DISCOVERY_PORTS = [4000, 5000, 3000, 8080]` tek kaynaktır, varsayılan port ondan türer; yedek portlar yalnız mDNS + varsayılan port sıfır aday verirse ve bulunan ilk portta durarak taranır. [bekçi: discovery-logic.test.ts]
- Yedek portta kimlik zorunludur (`identityRequiredForPort`); çıplak `/health` `UP` aday saymaya yetmez. [bekçi: discovery-logic.test.ts]
- Mobilde yedek portlar yalnız kullanıcının "Ağda Ara" yolunda açılır; arka plan self-heal turu açmaz. [bekçi: discovery.service.test.ts]
- Yeni cihazın doğuş durumu `devicePairingRequired`dan türer (kapalıysa APPROVED); bayrak sonradan açılınca onaylı cihaz düşürülmez, PENDING ya da revoke edilmiş cihaz APPROVED'a yükselmez. [bekçi: test_device_pairing_flag]
- Cihaz onayı kararını sunucu verir; mobilde tek yüklem `navigation/pairingGate.ts`, oradaki `??` `||`'ya çevrilmez. [bekçi: pairingGate.test.ts]
- Bluetooth tek sokettir: okuma sürerken ikinci dokunuş `busyRef` ile sessizce yok sayılır, ikinci bağlantı açılmaz. [inceleme]
- Backend'e seri port / donanım polling girmez; sürücüler istemcide yaşar (Electron main IPC, mobil HAL), simülasyon per-cihaz `PeripheralDevice.simulate` verisidir. [inceleme]
- Donanım fail-closed: cihaz yok / okunamadı / değer ≤ 0 → net Türkçe toast, mutasyon çağrılmaz, varsayılana sapılmaz. [bekçi: useSackWeigh.test.tsx]
- Uydurulmuş değer `source:'SIMULATED'` beyanıyla gider ve kararı backend verir (`shipping.simulatedWeightEnabled` kapalıyken 400); elle giriş `MANUAL`dır. [bekçi: test_sack_weigh_source]
- Kamera `initialFacing` verildiğinde cihaz tercihi ne okunur ne yazılır. [bekçi: BarcodeScannerView.test.tsx]
- Kısa kesim → otomatik A1 kuralının tamamı `shortCutQuality.ts`te, geçerli ayarın tek cevabı `resolveShortCutConfig`tedir; kopyalanmaz. [bekçi: shortCutQuality.test.ts]
- Mobil modal primitifi `AppModal`dır; `react-native-modal` geri getirilmez, `SimplePortal`ın mikrotask ertelemesi kaldırılmaz. [inceleme]

## Tuzaklar
- `X-Client-*` göndermeyen eski istemci de envanterde görünür (sürüm User-Agent'tan, `declared:false`); `okhttp` sürümü uygulama sürümü değildir.
- Kapanış 5 sn zorla-çıkışa düşerse log fazı ve açık bağlantı sayısını basar; asılı istek erişim log'unda iz bırakmaz.
- Electron route haritası `src/router.tsx`te değil `src/routes/content-routes.tsx`tedir.
- `BossShell` sekme sistemini atlar ama router altyapısını kullanır; kendi memory router'ını kurmak geri okunu ve modal portalını sessizce bozar.
- Ekran manifestosu okunamazsa "gizlenecekler" listesi hiç çizilmez; boş liste "hiçbir şey gizlenmez" yalanıdır.
- `ModalTextInput`ta eşitleme koşulu `value` prop'unun değişmesidir, "taslaktan farklı olması" değil.
- Komut kancası (`bash-guard.mjs`) yasağı yalnız çalıştırılan kabuk komutunda arar; dosyaya yazılıp çalıştırılan script kapsam dışıdır. Kanca yolu göreli yazılırsa kanca sessizce ölür.
- Yeni ekran görünmüyorsa sırayla bak: izin satırı DB'de mi, kullanıcıya atanmış mı, kullanıcı yeniden giriş yaptı mı (JWT bayat).

## Bekçiler
Backend: `test_audit_muafiyeti` · `test_audit_depth` · `test_audit_okuma_kaynagi` · `test_p2002_hedef_tek_kaynak` · `test_musteri_adi_kodda_yok` · `test_firma_adi_dondur` · `test_backup` · `test_offsite_sweep` · `test_process_warnings` · `test_remote_access_guard` · `test_totp` · `test_middleware_order` · `test_client_registry` · `test_active_sessions` · `test_session_registry` · `test_boss_overview` · `test_device_pairing_flag` · `test_sack_weigh_source` · `test_bash_guard_scope` · `test_hook_config` · `test_patron_bulut_imza` · `test_patron_bulut_uygunluk`

İstemci: `discovery-logic.test.ts` · `connected-devices-utils.test.ts` · `discovery-ipc-contract.test.ts` · `boss-shell.test.ts` · `BackupScheduleCard.test.tsx` · `discovery.contract.test.ts` · `discovery.test.ts` · `discovery.service.test.ts` · `pairingGate.test.ts` · `useSackWeigh.test.tsx` · `BarcodeScannerView.test.tsx` · `shortCutQuality.test.ts` · `resolveShortCutConfig.test.ts` · `ModalTextInput.test.tsx`

Gerekçe ve ölçüm hikâyesi: eski sürüm history dizininde.
