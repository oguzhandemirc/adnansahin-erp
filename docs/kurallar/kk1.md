# KK1 · İdempotency · Kurşun planlama

KK1 (RAW_QC) topun sisteme ilk girdiği istasyondur; burada çift basış, ağ kopması ve tekrar deneme bir topu iki kez doğurabilir, bu yüzden alan idempotency (`clientToken`) ve mükerrer tuzağının da evidir. Kurşun planlama, kurşun+KK2 adımlarının makinelere dağıtımı ve bypass rejimidir. Kapsadığı kod: `Teks-Erp/src/services/{inventory,kursun-qc,kursun-bypass}.service.ts`, `services/helpers/{duplicate-guard,token-replay,kursun-bypass-eligibility}.helper.ts`, `constants/kk1-entry-sources.ts`, tablet `mobil/src/offline/` ve `mobil/src/screens/Modules/KK1/`, panel `Electron/src/pages/Operations/KursunDagitim/`, `Electron/src/lib/attemptToken.ts`.

## Kurallar

### KK1 ve idempotency

- "KK1'in işi olan top" kümesi tek sabittir: backend `KK1_ENTRY_SOURCES` ↔ mobil `KK1_LIST_ENTRY_SOURCES` birebir; SQL kaynak listesini elle yazmaz (`Prisma.join`). [bekçi: test_kk1_entry_sources]
- Kayıt yaratan uç `clientToken` (`String? @unique @db.Uuid`) taşır; yeni kayıt yaratan uç da aynı sözleşmeyle doğar. [inceleme]
- İstemci token'ı MANTIKSAL DENEME başına bir kez üretir ve tekrar denemede aynısını gönderir; `mutationFn` içinde gönderim anında token üretme. Panel `Electron/src/lib/attemptToken.ts` ve tablet `mobil/src/offline/attemptToken.ts` özdeş durum makinesidir. [bekçi: test_istemci_token_uretimi]
- Token yalnız sonucu belirsiz bırakan hatada (ağ · zaman aşımı · 5xx) yapışır; kesin 4xx'te yenilenir — yapışırsa aynı yükü sonsuza dek gönderen döngü kurulur. [bekçi: entryAttempt.test.ts]
- Token replay'i tek boğazdan geçer (`tokenReplay`, `helpers/token-replay.helper.ts`); token yazan/okuyan her birim `scripts/lib/token-replay-beyan.ts`te beyanlıdır ve borç sayısı yalnız düşer. [bekçi: test_token_replay_bogaz]
- Replay'li yolda kaybeden deneme hangi hatayla düşerse düşsün cevap token'dan gelir; farklı gövdeyle aynı token 409 `CLIENT_TOKEN_COLLISION`. [bekçi: test_token_replay_zorlanmis_sira]
- Token ön-okuması ile insert arasında kazananın yazdığını okuyan bir iş kuralı varsa token okuması `lockClientTokenTx` (8036) altında yapılır ve kilit tx'in ilk ifadesidir. [bekçi: test_cek_bordro_taslak_token]
- KK1 mükerrer tuzağı tx içinde koşar ve tx'in İLK ifadesi `pg_advisory_xact_lock(8021, hashtext(anahtar))`'dır: kilit `findFirst`'ten önce (TOCTOU) ve `generateRollBarcode`'dan önce (ABBA deadlock). [bekçi: test_kk1_duplicate_guard]
- Mükerrer penceresi operatörün bastığı anla (`Roll.clientEnteredAt`) ve iki yönlü (since/until) ölçülür; damgasız eski kayıt `createdAt`'e düşer. [bekçi: test_kk1_duplicate_guard]
- Advisory kilit uzayları ayrıdır (8021 mükerrer · 8022 parti no · 8036 token); yeni uzay almadan önce `period-guard.helper.ts` envanterine bak. [bekçi: test_advisory_lock_namespaces]
- `kk1.duplicateGuardEnabled` varsayılan kapalıdır ve engellemez, onaylatır: 409 `POSSIBLE_DUPLICATE` → `confirmDuplicate:true`; `createInitialEntry`'de `opts.duplicateGuard` ile opt-in, dahili çağıran etkilenmez. [bekçi: test_feature_flag_contract]
- İlk girişte kalite çift kolondur (`qualityGrade` + `qualityGradeId`) ve birlikte dolar/boşalır; boş değer NULL kalır (sabit "1.KALITE" varsayılanı yazılmaz), bilinmeyen/pasif kod 400 ve top doğmaz. [bekçi: test_initial_entry_quality]
- Retry formu/makineyi yeniden okumaz, düşen yükü birebir gönderir; uçuşta aynı yük gelirse uçuştaki kimlik yeniden kullanılır, farklı yük yeni top sayılır (`INFLIGHT_REUSE_WINDOW_MS = 90_000`, backend penceresiyle aynı). [bekçi: entryAttempt.test.ts]
- Çevrimdışı sebebi `'link'` ise uçuş kimliği bırakılır, `'server'` ise korunur; ayrım saf `shouldReleaseInFlight`'ta yaşar, ekrandaki bir `if`'te değil. [bekçi: entryAttempt.test.ts]
- Kalıcı düşüş köprüsü `MutationCache.onError`'da kalır; `setMutationDefaults`'a taşıma (component `onError` ezer). [bekçi: mutations.test.ts]
- Kalıcı düşen kayıt anlık toast ile duyurulur (`announceFailure`), kalıcı kuyruğa/kutuya yazılmaz; ölü mektup kutusunu geri getirme. [bekçi: announceFailure.test.ts]
- Çakışma 409'u ekran ayaktayken yalnız modalda görünür, EKRANSIZ replay'de duyurulur; belirsizlikte duyur. [bekçi: announceWire.test.ts]
- Toast metni "kayıt oluşmadı" diyemez (zaman aşımında sunucu commit etmiş olabilir); önce doğrulatır: "Listede yoksa tekrar girin". [bekçi: announceFailure.test.ts]
- `onMutate`'te yeşil "kaydedildi" basma; yeşil yalnız `onSuccess`'te. [inceleme]
- Çevrimdışı hükmü yalnız yanıtsız düşen istekle verilir; 5xx "sunucuya ulaşılamadı" değildir. Yoklama adresi her çağrıda canlı okunur (`getCurrentBaseUrl`). [bekçi: serverReachability.test.ts]
- Çok top okutan yüzey `trigger="tap"`, tek okuyup kapanan yüzey `auto`; ölçüt ekran adı değil yüzeydir. [bekçi: BarcodeScannerView.test.tsx]
- Metraj kaynağı (elle ↔ makine) cihaz ayarıdır (`kk1ManualEntry`, `tamburCutMode`), oturum değil; bozuk disk değeri güvenli varsayılana düşer. [bekçi: deviceSettingsStore.test.ts]
- Yazıcı kuyruğu (`printQueue`) kayıt kuyruğundan ayrıdır ve kaldırılmaz: "top kayıtlı, etiketi çıkmadı" kalıcı bir yüzeydir. [bekçi: printQueue.test.ts]

### Kurşun planlama

- `production.kursunBypassEnabled` REJİM anahtarıdır, görünürlük anahtarı değil: karo izinle ve `production.enabled` modül kapısıyla süzülür. [bekçi: production-regime.test.ts]
- Bayrak yalnız yeni atama oluşturmayı kapılar; rejim atama satırında kalıcıdır, dağıtılmış iş emri bayrak kapansa da bypass ile biter. [bekçi: test_kursun_bypass]
- Kurşun tableti bayrak açıkken yalnız dağıtıma UYGUN adımda salt-okunurdur; tek kapı `assertKursunTabletMayWrite` beş yazma yolunu kapsar ve UI'ya güvenmez (offline kuyruk bayrak çevrildikten sonra gelebilir). [bekçi: test_kursun_regime_lock]
- Uygunluk kuralı tek kaynak `resolveBypassBlockReason` + `loadBypassEligibilitySignals`; liste toplu, tablet tekil çağırır, kopyalanmaz. [bekçi: test_kursun_regime_lock]
- Tablet salt-okunur kararını sunucu verir (`StepSummary.tabletReadOnly`); istemci yalnız uygular. [inceleme]
- Dağıtım işin ön koşulu değildir: Tambur okutması dağıtılmamış kurşun adımını da kapatır; kapsam "bayrak açık VE adım uygun", tek kapı `resolveUnassignedTamburClosure` ve `assertKursunTabletMayWrite` ile aynı kaynaktan beslenir. [bekçi: test_kursun_unassigned_close]
- Dağıtımsız kapanışta `RollMovement.machineId` NULL kalır — atıf uydurulmaz; boşluk `listDistribution.unassignedClosures` bandıyla görünür kılınır. [bekçi: test_kursun_unassigned_close]
- Dağıtımsız kapanış marker'ı `KURSUN_BYPASS_MARKER_PREFIX`'ten türetilir, elle yazılmaz; idempotent tekrar `findCompletedUnassignedClosure` ile tanınır (o dal yoksa offline replay 404 alır). [bekçi: test_kursun_unassigned_close]
- Makine içi sıra `listDistribution` içinde JS ile (`sortByPlanOrder`) kurulur; sıralama `WorkOrderStep.priority` üzerinden iki kümede (bekleyen · makine içi) yaşar, yeniden numaralama yalnız kendi kümesine dokunur. [bekçi: test_kursun_machine_order · queue-reorder.test.ts]
- Kuyruk sıralaması planlama kararıdır: `PATCH /kursun-qc/queue/reorder` `quality:write` ∨ `workorder:distribute` ∨ `mobile:kursun-dagitim` kabul eder; daraltma. [inceleme]
- Kurşun bypass ataması istasyon özelliğinde mod `AUTO` arar; satırın varlığı yetmez. [bekçi: test_station_property_mode]
- Kapanış dispozisyonu TRANSFER'de bekleyen bypass ataması yeni iş emrine taşınır, split'te void edilir; force-void'den önce koşar. [bekçi: test_kursun_bypass_repoint]
- Kurşun sırası ve dağıtımı tek ekrandadır (`/operations/kursun-dagitim`); ikinci kurşun ekranı açılmaz. [inceleme]
- Sekme şeridi makine listesinden doğar: işsiz makinenin de sekmesi var, pasif ama açık işli makine `(pasif)` etiketiyle çizilir. [bekçi: machine-tabs.test.ts]
- Yeni izin `permission-catalog.ts`'e yazılır, migration ile eklenmez; boot uzlaştırması yalnız ekler, kimseye atamaz. [bekçi: test_permission_catalog]

## Tuzaklar

- Token'ı mutate çağrısı başına üretmek korumayı tamamen boşa düşürür ve hiçbir hata vermez.
- Timeout "yazılmadı" demek değildir; otomatik modda retry'da yeniden ölçmek metrajı değiştirip gereksiz 409 üretir.
- Kilitsiz token ön-okumasında kaybeden deneme replay yerine iş kuralı 409'u alır; panel token'ı bırakır ve ikinci kaydı keser.
- Uçuştaki iki basışı körü körüne birleştirmek sıradaki gerçek topu düşürür.
- `NumpadHost` `autoActivate`'i aynı ekranda iki alana verilirse kazananı mount sırası belirler; metraj beklerken tuşlar En'i değiştirir. Modal içinde sayı girişi `NumpadInput` + `useNativeKeyboard` ister.
- Makine içi sıralama satırı düşerse sürükleme DB'ye doğru yazar ama ekran değişmez: tek belirti "geri zıplıyor".
- `listOpenCards` filtresini uygunlukla genişletme: tablet 5 sn'de bir yoklar, uygun olmayan adım listede kalıp sebebini kartta söylemelidir.
- Her makine panelinin kendi `DndContext`'i vardır; makine değiştirmek sürükleme değil yeniden atamadır.
- `GET /kursun-bypass/visibility` yalnız eski APK'lar için duruyor; Swagger'ındaki görünürlük kuralı bayattır, yeni yüzey ondan beslenmez.
- Script çıkışında `$disconnect()` tek başına yetmez (havuz event loop'u 10 dk açık tutar); `process.exit(...)` ya da `$disconnect()` + `pool.end()`.

## Bekçiler

test_kk1_entry_sources · test_istemci_token_uretimi · test_token_replay_bogaz · test_token_replay_zorlanmis_sira · test_cek_bordro_taslak_token · test_kk1_duplicate_guard · test_advisory_lock_namespaces · test_feature_flag_contract · test_initial_entry_quality · test_kursun_bypass · test_kursun_regime_lock · test_kursun_unassigned_close · test_kursun_machine_order · test_kursun_bypass_repoint · test_station_property_mode · test_permission_catalog · test_qc2_idempotency · istemci: entryAttempt.test.ts · attemptToken.test.ts · mutations.test.ts · announceFailure.test.ts · announceWire.test.ts · serverReachability.test.ts · BarcodeScannerView.test.tsx · deviceSettingsStore.test.ts · printQueue.test.ts · production-regime.test.ts · queue-reorder.test.ts · machine-tabs.test.ts

Gerekçe ve ölçüm hikâyesi: eski sürüm history dizininde.
