# Kod Kuralları — teknik desenler (backend · panel · tablet)

> **Üç belge katmanının ortadakidir:** "Bu tuzak neden var?" — olaydan doğan desen ve yasaklar. Rutin "nasıl yazılır" soruları `docs/standart/`, alan kararları `docs/kurallar/<alan>.md`. Üçü birbirine **bağlanır, kopyalanmaz**.
>
> Her madde tek cümle, emir kipi; gerekçe ve olay anlatısı arşivde. Kısaltılmadan önceki tam sürüm (kaynak atıfları, ölçüm hikâyeleri, dokuma/finans maddeleri dahil): `docs/history/KOD-KURALLARI-2026-09.md`. Yeni desen eklerken: kural buraya, hikâye `docs/history/CLAUDE-NOT-ARSIVI.md`'ye.
>
> Maddenin başındaki etiket alan dosyasını gösterir (`docs/kurallar/`): **defter** (defter · numaralandırma · mükerrer · sebep) · **sevkiyat** (sevkiyat · parti · yarı mamul) · **fason** · **is-emri** (iş emri · rota · renk · kalite) · **kk1** (KK1 · kurşun) · **tambur** (tambur · top düzeltme · refakat) · **belge** · **raporlar** (raporlar · filtre/liste) · **yetki** (yetki · süperadmin · modül bayrağı) · **surum** (sürüm · deploy) · **genel** (genel · keşif/cihaz).

## Mekanik olarak zorlananlar (yalnız hatırlatma)

Liste burada ELLE SAYILMAZ; tek kaynak `Teks-Erp/eslint.config.mjs` (`error`), `npm run lint` düşer:

- `tx.*` + `Promise.all/allSettled` yasak [lint] · `notIn: []` yasak [lint] · `orderBy: { batchNumber }` yasak, `createdAt` ile sırala [lint]
- Jenerik `requireModule("x")` yasak, adlandırılmış `require<Alan>Enabled` [lint] · yeni `kind === "PROCESS_QC"` yasak, `stepCanApplyQuality` / `QUALITY_STATION_WHERE` [lint]
- `!== "mobile"` yasak [lint] · `body.code` okumak yasak, kod `details.code` altında [lint] · `applied_steps_count` ile migration doğrulamak yasak [lint]
- Çıplak `DATE_TRUNC` yasak · `'Europe/Istanbul'` literali yasak, `FACTORY_TIMEZONE` [lint] · `now() AT TIME ZONE 'UTC'` yasak, çıplak `now()` + gerekçeli `-- tz-ok:` [lint]
- Türkçe karakterli tanımlayıcı yasak [lint] · route/controller'da `lib/prisma` import yasak [lint] · `naming-convention`, `no-explicit-any`, `no-floating-promises` [lint]
- Electron renderer'da `electron`/`fs`/`path`/`child_process`/`os` import yasak [lint: Electron]

Bekçiyle zorlanan sınıflar: kütüphane `test_dependency_contract.ts` · kilit uzayı `test_advisory_lock_namespaces.ts` · uç ↔ `@openapi` `test_swagger_spec.ts` · SystemLog sorgu kapısı `test_system_log_query_gate.ts`. Tam liste `Teks-Erp/docs/BEKCI-HARITASI.md`.

**Yeni kural ölçütü** (tek kaynak `docs/standart/README.md` § Kural yazma ölçütü): kural önce ESLint'e girer — YALNIZ AST'den kesin yakalanabiliyorsa; ölçülen ihlal 0 → `error` · ≤15 → düzelt, sonra `error` · >15 → `warn` + tavan (`lint-baseline.json`, yalnız düşer) · ölçüm kuralı çürütüyorsa kural yazılmaz. Emsal red: `toLocaleUpperCase("tr")` yasağı DARDIR (koşullu etiket elemanı ↔ `QualityGrade.code`), genel lint kuralı yazılmadı.

## Değişmezler

- **belge** · `columns[tablo].labels` kullanıcı girdisidir, HTML olarak güvenli değil → `applyColumnCfg` TEK noktada kaçırır; boş dize = varsayılana dön, 40 karakterde kırpılır. · bekçi: `test_document_customization`
- **belge** · Müşteri belgesinde iç veri taşıyan kolon/bölüm OPT-IN doğar (`DocCol.defaultHidden` + `shown`, panel `DocSectionDef.defaultHidden`); `hidden`/`sections` blocklist'tir, yeni kolon sızar. · bekçi: `test_shipment_doc_batch_column`, `docRows.test.ts`
- **surum** · Paketin TAŞIMADIĞI yola bağımlı kod yazılmaz: paket `deploy/` ve `scripts/`yi almaz, `npm ci --omit=dev` tsx'i eler; sunucu araçları `scripts/build-araclar.mjs` ile `dist/tools/*.cjs`'e derlenir.
- **raporlar** · Liste sayfalamada varsayılan cursor (keyset) + sonsuz kaydırma; yüksek hacimli tablolar (Roll, RollMovement, RollOperation, SystemLog, TravelerCardScan) HER ZAMAN cursor; `skip > MAX_OFFSET (10000)` → 400.
- **raporlar** · Kapsam zorlaması SAF katmanda (`rollHistoryFilter.forcedCreatorFilter`), ekrandaki `if`te değil; KK1 bunu filters'a EN SON yayar; kimlik yüklenmemişse filtre üretilmez. · bekçi: `mobil rollHistoryFilter.test.ts`
- **is-emri** · Tip çevrimi atomik: `updateMany WHERE {id, type: eski}` + tx içinde taze bağ sayımı; değişim sessiz olmaz (yanıt `typeChanged`, audit `oldData.type/newData.type`). · bekçi: `test_workorder_order_link`
- **is-emri** · Kalite yüklemini çağıran her select `STEP_QUALITY_SELECT`'i spread eder; `STEP_CAPABILITY_SELECT` kaliteyle genişletilmez (dar select). · bekçi: `test_station_quality_capability`
- **kk1** · Token replay dört durumludur, tek kaynak `helpers/token-replay.helper.ts`: yazılmadı → yaz · aynı yük → cached · başka yük → 409 `CLIENT_TOKEN_COLLISION` · kayıt iptal/ölü → 409 `ENTRY_CANCELLED`.
- **yetki** · Kapalı modül HER ZAMAN 403 + `details.code="MODULE_DISABLED"` + `details.modul`; uzakta da 403 (404 yalnız `REMOTE_DENIED` listesi). · bekçi: `test_module_flag_off`
- **kk1** · Kurşun toplu uçları (`assign-bulk`/`cancel-bulk`, ≤100 satır) hepsi-ya-hiç tek tx'e ÇEVRİLMEZ: her satır kendi tx'inde, atlanan her satır sebebiyle `failed[]`de döner ve arayüz gösterir. · bekçi: `test_kursun_bulk`
- **defter** · Kalıcı sayaç/rapor `SystemLog`tan değil kalıcı izden (kolon/hareket satırı) okunur — audit 6 ayda arşivlenir, rapor sessizce sıfırlanır.
- **defter** · Bulanık ad eşleştirmede birim KELİMEdir, karakter değil (Jaro-Winkler/trigram isimde yanıltır); FIRM = gürültüsüz çift ortalaması, PRODUCT = kelime/numerik eşitliği + en düşük çift; `token_set_ratio` kullanılmaz (alt küme %100 verir). · bekçi: `test_duplicate_detection`
- **defter** · Bir kimlik değeri `IDENTITY_MAX_GROUP` (=4) kayıttan fazlasında geçiyorsa yer tutucu sayılır ve çift üretmez; bastırma yanıtta `suppressedIdentities` ile raporlanır. Renkte `hex` kimlik alanı değildir.
- **sevkiyat** · Kısa parti no iki hane dolguludur (`P01`), günlük parti no dolgusuzdur; diğer günlük kodlar (SIP/İE/CV/RK/FS) 4 hane dolgulu kalır. Eski dolgulu kayıtlar (`P0508260019`) olduğu gibi durur. · bekçi: `test_batch_number_format`
- **defter** · Sebep kataloğunda TTL yalnız tazeliği ölçer: bayat liste döner + arka planda tazeleme tetiklenir; önbellek HİÇ dolmadıysa kod kataloğuna düşülür, fabrika kodu reddedilir (fail-closed). · bekçi: `test_reason_presets`
- **yetki** · `router.use("/users/:id", verifyToken, requireAnyPermission(...), protectSystemAccountTarget)` önek kapısı silinmez; önek izin kümesi alt rotaların birleşimidir. · bekçi: `test_superadmin`
- **surum** · Dairesel kapı yasağı: beklenen değer gerçek değerle aynı kaynaktan alınmaz → `--musteri` her yayın/derleme komutunda zorunlu ve argümandan (`musteri.json`dan değil); kontrol artefakta bakar (manifest URL'leri, `app-update.yml`). · bekçi: `update-feed-url.test.ts`
- **tambur** · Sıra sözleşmesi: payload tutarlılığı (`ITEM_MISMATCH`/`COLOR_MISMATCH`) önce, bağlam çözümü (parti) sonra; ürün/renk/en operatöre sorulmaz, iş emrinden gelir. · bekçi: `test_tambur_manual_batch`
- **tambur** · İptal ve fire sebep katalogları ayrı kapılardan geçer: ROLL_CANCEL metin saklar → `resolveReasonCode` (async, tx dışında, kodu sunucu türetir) · ROLL_SCRAP → `validateVarianceReason` (senkron). · bekçi: `test_reason_presets`, `test_roll_cancel_undo`
- **sevkiyat** · Dar sekmeler `RAW_STOCK_PURE` ve `SEMI_FINISHED` kullanır; ayrım servis katmanında yaşar (negasyon istemciden söylenemez). `RAW_STOCK` "yarı mamul hariç" diye daraltılmaz — tablet Hızlı İş Emri onu kullanır. · bekçi: `test_semi_finished_surfaces`

## Yasaklar

- **belge** · Belge alan CSS'inde `calc()`/`var()` yasak (`scaleDocCss` punto regex'i görmez, ölçek sessizce ölür); override yoksa tek bayt CSS basılmaz; seçiciler `.sheet ` önekli. · bekçi: `test_doc_density_fields`, `test_document_style`
- **belge** · Belge şablonu template literal'inde (CSS yorumunda bile) BACKTICK yasak. [inceleme — derleme hatası]
- **belge** · Uzman modu (RAW_HTML) şablon dili değil metin ikamesidir (`{{alan}}` + `{{#liste}}…{{/liste}}`, iç içe yok); koşul/JS eklenmez, ihtiyaç `config/traveler-card-fields.ts`te yeni ALAN olur.
- **genel** · Tx kısa tutulur; dış I/O (HTTP, dosya) tx içinde yapılmaz (`idle_in_transaction_session_timeout=5min`).
- **genel** · Decimal kolonda JS float aritmetiği yok — DB-side `increment`/`decrement` ya da `Prisma.Decimal`.
- **raporlar** · Fabrika günü tek kaynak `src/constants/time.ts`; takvim günü tz'ye bağlı, mutlak pencere bağımsız (`-- tz-ok:`); `factoryDaySql` metni değişirse `sl_day_exact` istatistiği için yeni migration. · bekçi: `test_report_day_boundary`
- **fason** · Çekme/fazla sapmasının tersleme adresi `sourceRefId = receipt.id`; makbuz iptalinde sapma `rollId` ile silinmez, `reversedAt` damgalanır. · bekçi: `test_roll_variance`, `test_fason_partial_receive`
- **fason** · Tolerans/eşik okumasında `<= 0 → null` kalıbı yasak: 0 = "tolerans yok", null = "varsayılan". Sayısal ayarda 0'ın anlamı anahtar başına kararlaştırılır.
- **fason** · `FASON_CEKME` sistem sebebi `SCRAP_REASONS`/`RECORD_CORRECTION_REASONS`'a eklenmez. Çekme/fire farkı fasoncunun açık bakiyesine (`openQty`) girmez. · bekçi: `test_roll_variance`
- **raporlar** · "Daha Fazla Yükle" düğmesi ve sayfa pager'ı yok — dibe gelince otomatik yükleme (Electron `useDataTable`/`useInfiniteScroll`, mobil FlashList `onEndReached`). Listeye tarih seçici paketi eklenmez.
- **is-emri** · Saf yüklem Prisma WHERE'inin yerine konmaz ("oku, yüklemle kontrol et, update" atomik claim'i bozar). · bekçi: `test_station_quality_capability`
- **is-emri** · `QUALITY_STATION_WHERE` `satisfies` ile yazılır (`as const` değil), mutate edilmez; spread edildiği kapsamda ikinci `OR:` yazılmaz — gerekirse `AND: [{...WHERE}, {OR:[…]}]`. `assertWoAtStepKind(PROCESS_QC)`'e dokunulmaz (Tambur ile paylaşılıyor). · bekçi: `test_station_quality_capability`
- **genel** · Durum geçişi `findUnique → if → update` ile yazılmaz; atomik claim. · bekçi: `test_race_conditions`, `test_wo_terminal_race`
- **yetki** · Tek resolver (`resolveXEnabled = modülAçık && altBayrak`) yalnız ebeveyni olan bayrağa yazılır; ebeveynsiz bayrağa resolver yazılmaz. Modül kapısının bulunduğu dosyalarda dosya düzeyi `let`/mutable sabit/`Date.now` yok (gizli önbellek). · bekçi: `test_production_regime_gate`
- **yetki** · Davranış bayrağı yeni yazma ucuyla değil tek kapı `PATCH /feature-flags` ile yazılır; `prisma/seed.ts` davranış bayraklarını ezmez. Tasarım metnindeki `modul.*` adı koda girmez, DB anahtarı `finance.enabled` kalıbındadır. · bekçi: `test_module_flags`
- **raporlar** · Katalog değeri koda gömülmez: "en üst kalite" `quality_grades.sortOrder`dan çözülür, `code === '1.KALITE'` araması yeniden adlandırmada sessizce boş karne üretir. · bekçi: `test_quality_scorecard`
- **is-emri** · Rota adımı istemci sözleşmesi düz id dizisidir (`plannedPropertyIds`); `RouteService.ALLOWED_STEP_KEYS` nested write'ı reddeder. · bekçi: `test_route_step_targets`
- **defter** · Tek-uçuş (dedup) yalnız arka plan tazelemesine aittir; `refreshReasonPresetCache` o kapıdan geçmez (create/update kendi yazdığını görmeli).
- **defter** · Geçersiz sebep kodu/eksik metin istemci hatasıdır: `AppError.badRequest` + `details.code` (`REASON_CODE_INVALID`/`REASON_TEXT_REQUIRED`); düz `Error` 500'e döner, mobil kuyruk 5xx'i geçici sanıp yeniden dener. · bekçi: `test_reason_presets`
- **defter** · `ReasonPreset.code` rapor anahtarıdır, doğuşta yazılır ve ASLA düzenlenmez; sebep listesi boş bırakılmaz (Tambur çevrimdışı fire sebebi ister). · bekçi: `test_reason_presets`
- **raporlar** · İki değerli NOT NULL enum'a (`destination`, `WorkOrder.type`) çoklu seçim eklenmez; kapsam anahtarları (`processingStatus`, `rollScope`, `shipmentScope`, `invoiced`, `hasReturns`…) if/else dalıdır, OR yok. Aynı URL parametresine yazan iki filtre bulunmaz. · bekçi: `test_filter_multi_select`
- **raporlar** · Elle okunan her id filtresi `readIdCondition`/`readFilterList`'ten geçer (ham okuma uuid'de P2007, string'de sessiz 0 satır). · bekçi: `test_filter_multi_select`
- **genel** · Bekçi ortamdaki veriye bağımlı olmaz (`findFirst` ile "herhangi bir kayıt" yok); fixture'ı test kendisi yaratır, sabit adlar damgalanır. Test fason firması `scripts/fixture-subcontractor.ts`ten, silinmez. Fason kabulü yapan her cleanup `rollVariance.deleteMany` içerir (RESTRICT FK).
- **genel** · Backend'de ikinci Node süreci yok; `pkill -f "tsx src/server.ts"` yok — yalnız kendi DİNLEYEN sürecinin PID'i (`npx` iki kademe ekler, ata zinciri `ps` ile doğrulanır). · bekçi: `test_middleware_order`, `test_remote_access_guard`
- **genel** · Backend'e seri port / donanım polling konmaz; donanım okuma yolu istemcide HAL. Simülasyon per-cihaz veri bayrağıdır, uydurulmuş ölçüm `source:'SIMULATED'` beyanıyla gider.
- **genel** · Cihaz override'ı üç durumludur (`server|on|off`); iki durum "girilmemiş" ile "sunucuyu izle"yi birleştirir.
- **surum** · Cloudflare proxy'si DNS-only'ye çevrilmez (Origin CA, güncelleme sessizce durur); nginx uzun-cache kurallarında `add_header … always` yok (404'e eklenir, Cloudflare bir hafta tutar); yapılandırma repoda (`deploy/guncelleme-sunucusu/`).
- **surum** · Ham `npm run build:win` ve elle `gradlew assembleRelease` yasak: panel `deploy/electron-paketle.sh adnansahin`, tablet `scripts/build-apk.mjs`; `artifactName` ASCII, `${productName}` yok. · bekçi: `update-feed-url.test.ts`
- **surum** · Manifest (`latest.yml` / OTA manifesti) EN SON yüklenir; OTA turunda `android.versionCode`a dokunulmaz.
- **surum** · `minVersion` yalnız gerçek sözleşme kırılmasında yükselir ve sahadakinden büyük olamaz. · bekçi: `test_client_policy`
- **surum** · Sürüm notu yazılmadan sürüm çıkmaz (taslak Claude, onay kullanıcı). · bekçi: `check-surum-notlari.mjs`
- **surum** · Yeni izin kodu için migration yazılmaz (katalog koda, atama panele); yeni kolonda geriye dönük doldurma yapılmaz. · bekçi: `test_permission_catalog`
- **yetki** · Sır hijyeni: süperadmin parolası/PIN/TOTP ve ayar şifresi/hash repoya, log'a, sürüm notuna, audit yüküne, yanıt gövdesine girmez; `.env`teki `SUPERADMIN_*` için boot uyarısı yalnız anahtar adını basar. · bekçi: `test_superadmin`, `test_settings_password`, `test_superadmin_provision`
- **yetki** · Süperadmin kimliği JWT'ye konmaz (`req.isSystemAccount` tazelik okumasından); kurulum script'i TTY'siz koşmaz; sistem rolü sert silinmez, pasifleştirilir. · bekçi: `test_superadmin`, `test_role_template_catalog`
- **sevkiyat** · Parti kimliği yalnız `Batch.id`; `batchNumber` ile lookup yok; parti no üretiminde `pg_advisory_xact_lock(8022,…)` tx'in ilk ifadesidir. Sayaç sıfırlama düğmesi eklenmez. · bekçi: `test_batch_number_format`
- **sevkiyat** · Sevk stornosu iade sayılmaz (iade defterine girmez); sevki geri alırken tahsis silinmez, `shippedQty` yalnız DISPATCHED tahsisleri sayar. · bekçi: `test_shipment_undo_dispatch`
- **sevkiyat** · `Sack.notes` yazma yoluna `touchWarehouseSackTx` guard'ı eklenmez (bilinçli guard'sız). · bekçi: `test_sack_notes`
- **sevkiyat** · Mobil istemci brüt rakamı elle kurmaz (`rollCount + returnedCount` çift sayar).
- **sevkiyat** · İptal edilen sipariş kalemi `quantity` ile değil `shipped` ile sayılır. Termini olmayan sipariş zamanında-teslim oranına katılmaz, listeden de gizlenmez. · bekçi: `test_order_line_cancel`, `test_order_leadtime`
- **tambur** · Genel "X / stoktan kaldır" tuşu yok: stok kaydı silinmez, sebebi söyleyen TİPLİ olay yazılır (iptal · fire · storno · sayım farkı · tersleme) ve düğme olayın adını taşır; ön seçim yok. · bekçi: `test_roll_variance`
- **tambur** · Serbest olmayan statüdeki topu düzeltirken sebep zorunlu ve `roll:manual-adjust` aranır. · bekçi: `test_roll_edit_unified`
- **is-emri** · Siparişe bağlı iş emrinde hedef renge dokunulmaz; renk değişiminde uyum tamsa toplara dokunulmaz. Renk istasyon kısıtı değildir (`StationColor` deprecated), geri eklenmez. · bekçi: `test_wo_target_color_guard`, `test_wo_color_change_lock`
- **is-emri** · `CANCELLED`/`SUPERSEDED` iş emrinde manuel taşıma 409 (önizlemede `woBlocked`); fason adımına giden topa manuel taşımada `AT_SUBCONTRACTOR` yazılmaz. `PATCH /:id/attach-rolls` geri getirilmez. · bekçi: `test_manual_move`
- **is-emri** · `unlinkOrderLine`'da son bağ reddedilmez; aynı tx'te tip ORDER→STOCK çevrilir, yanıtta `typeChanged`. · bekçi: `test_workorder_order_link`
- **is-emri** · REQUIRED modlu istasyon özelliği işaretlenmeden adım kapanmaz; yeni `FabricProperty` `stationIds` olmadan yaratılmaz, `update`te `stationIds` yoksa bağa dokunulmaz. · bekçi: `test_station_property_mode`, `test_property_station_binding`
- **is-emri** · `quality.gradeRequiredEnabled` kapsamı dardır (fason kabulü ve son adım finalize dışarıda). · bekçi: `test_quality_batch_flags`
- **kk1** · Kurşun bypass marker'ı BASE ön ekiyle yazılır (`KURSUN_BYPASS_FINISHED:UNASSIGNED:`), makine atfı uydurulmaz (`machineId=null`); rejim açıkken tablet yazması tek kapıdan reddedilir (`assertKursunTabletMayWrite`). · bekçi: `test_kursun_bypass`, `test_kursun_regime_lock`
- **kk1** · Seri giriş ekranında token ref'te sabitlenmez (arka arkaya topları tek kayda çakıştırır). · bekçi: `mobil/src/offline/entryAttempt.test.ts`
- **is-emri** · Kalite/özellik/kat KODU kimliktir, ASCII yazılır (`TUP`); karşılaştırma `toUpperCase()`, `toLocaleUpperCase("tr")` yok; kat değeri `resolveFoldTypeForWrite` ile kanonikleşmeden yazılmaz. · bekçi: `test_fold_catalog`, `test_label_element_condition`
- **defter** · SQL fold fonksiyonunda ayırıcı sınıfı açık yazılır, `\s` yasak (ctype'a bağlı). · bekçi: `test_fold_contract`
- **defter** · Uygulama guard'ı olmayan tabloya (customer_branches · label_templates · permission_templates · subcontractor_categories · stations) nameFold seddi eklenmez — iş kararıdır. · bekçi: `test_master_data_name_dup`
- **genel** · İfade tabanlı UNIQUE eklerken `EXPRESSION_UNIQUES` envanterine girdi zorunlu. · bekçi: `test_db_invariants`, `test_schema_drift`
- **genel** · Mutabakat bekçisinin bir bölümü kırmızı diye daraltılmaz. · bekçi: `test_consistency`
- **genel** · Geri yükleme etki raporunda ölçülemeyen UPDATE hacmine 0 değil "ölçülemedi" yazılır. · bekçi: `test_backup`
- **genel** · `CLIENT_IP_HEADER` yalnız uzak istekte okunur (`clientIpHeaderRemoteOnly`); `ClientType.WEB` ayrı oturum türüdür, `clientType` `undefined` = mobil. · bekçi: `test_remote_access_guard`, `test_p2_auth`
- **genel** · Keşifte yedek portta kimlik doğrulaması atlanmaz (`identityRequiredForPort`); `installationId` NULL aday başka adayla birleşmez; `addressPreferenceRank` sıralamadır, eleme değil. KEŞİF-İKİZ bloğuna projeye özgü şey girmez. · bekçi: `test_discovery_identity`, `Electron/src/test/discovery-logic.test.ts`, `discovery.contract.test`
- **yetki** · Sistem geneli ayar kategorileri dar izinli kullanıcıya salt-okunur bile gösterilmez (`visibleSettingsCategories`). · bekçi: `settings-surface.test.ts`
- **yetki** · `ScreenEntry.modul` opsiyonel değildir; her ekran aidiyet beyanı taşır. · bekçi: `test_screen_catalog`
- **genel** · RN Paper `Card` `onPress` ile kullanılmaz (`Card.Content` dokunmayı yutar) — `TouchableRipple`. Electron geri hareketlerinde `preventDefault()`; `autoUpdater`a modül gövdesinde dokunulmaz (getter).

## Tuzaklar

- **genel** · İstek gövdesini ELLE kuran her katman (mobil `mutationFn`, offline `mutations.ts`, Zod `z.object`) sessiz allowlist'tir — alan eklerken ekran→tip→gövde üçü birlikte yazılır ve tabletten uçtan uca ölçülür. Tambur kapı alanında üç Zod şeması (`finalizeSchema`/`cutOpenFabricSchema`/`finalizeOpenFabricSchema`) birlikte güncellenir. · bekçi: `mobil mutations.test.ts`
- **genel** · Alanı eklemek yetmez, hangi YANITTA döndüğünü doğrula (liste satırı ≠ detay ucu).
- **genel** · "Altıncı enum değeri" sınıfı: enum'a değer eklerken tip-güvenli olmayan yüzeyleri elle ara — switch `default`, `Record<string,string>`, CSV literali, ham SQL, istemci string haritaları.
- **genel** · Seed migration'lardan SONRA boş tabloda koşar → yeni kolonun backfill'ine seed'de güvenilmez, değer seed'e açıkça yazılır.
- **belge** · `buildPlan` dizileri deterministik sıralanır (orderBy'sız ilişki sıra garanti etmez, planKey "değişti" der); planKey anahtar sırasından bağımsız, düz `JSON.stringify` yok.
- **belge** · Bayt-bayt korunan belge çıktısında kapalı blok tek bayt basmaz ve `${…}` kendi satırına konmaz; opsiyonel yeni alan eski donmuş snapshot'ta satır üretmez (tazeleme yalnız `reissue`). · bekçi: `test_traveler_card_a5_batches`
- **belge** · PPLB beklentisi emitter'ın kendi dönüşümüyle (`cleanCtlCp1254`) kurulur, `asciiFold` ile değil. Etiket alan→değer eşlemesi tek nokta `label-field-values.ts`. · bekçi: `test_label_canvas_equivalence`
- **belge** · "Katalogda yok" sondası kataloğa eklenebilecek gerçek bir kod kullanamaz (`${PROBE}-KAT`).
- **raporlar** · Generic `buildWhereClause` CSV'yi `{in:[…]}`e çevirir; `buildRollWhere`'de elle okunan id filtresi `readIdCondition` ister. · bekçi: `test_filter_multi_select`
- **raporlar** · `dateField` gönderilmez ya da whitelist dışıysa `applyDateRange` aralığı SESSİZCE yok sayar; `dateField` kolonunda index şart; `last7` bugünü içerir.
- **raporlar** · `resolveSortBy` whitelist dışı sortBy'ı sessizce `createdAt`e düşürür: `SortableHeader` basılan her kolon `ROLL_SORTABLE_FIELDS`'te olmalı; ilişki üzerinden sıralama yok.
- **raporlar** · Cursor'lu listede süzme sunucuda; istemci süzmesi yalnız o sayfayı süzer. BaseService sıralamaya her zaman `id` ekler → yeni sıralama index'i `(kolon, id)` bileşik.
- **sevkiyat** · `cancelledAt` yüklemi çağıranın `select`ine bağımlıdır: alan seçilmezse `undefined` gelir ve katı `=== null` tüm kalemleri iptal sayar.
- **sevkiyat** · Brüt: çuval satırı + özet + çeki tek gross kaynağından; iade sorgusu ayrı tx'te → canlı id kümesiyle DEDUP; `totalKg` değişmez; `prevSackId`siz eski iade atlanır. `attachTotals` üç sayımı tek anlık görüntüde (RepeatableRead) alır. · bekçi: `test_shipment_detail_gross`
- **sevkiyat** · `dispatchedAt` sıralamasında union'ın iki tarafında alan farklı (`Shipment.dispatchedAt` nullable ↔ `DirectShipment.shippedAt`): `orderBy` ve cursor `where` ayrı kurulur, nulls-last. · bekçi: `test_shipment_list_sort`
- **sevkiyat** · Sevk topun önceki rafını `Roll.preShipStatus`a yazar, storno oradan döner (körlemesine WAREHOUSE değil). `freezeForSource` versiyonu `max+1`; sabit `version:1` ikinci dondurmada 500 verir. · bekçi: `test_shipment_undo_dispatch`
- **sevkiyat** · Ürün Dengesi talepten doğar: bekçi fixture'ında önce talep, sonra ölçüm kurulur. · bekçi: `test_semi_finished_surfaces`
- **fason** · Kısmi kabulde kalan büyük toptan dağıtılır (`resolveReturns`), tamamı fasonda kalan top dönüş listesine girmez; mod değişiminde (`switchReceiveMode`) ön-dolu satır eklenmez. · bekçi: `test_fason_partial_receive`
- **fason** · "Açık + outstanding sevk" koşulu tek kaynak `helpers/fason-open-dispatch.helper.ts`. · bekçi: `test_fason_open_dispatch_single_source`
- **is-emri** · `setCapabilities` renge yalnız `colorIds` açıkça gönderilirse dokunur (`[]` hepsini siler). · bekçi: `test_station_capability`
- **kk1** · `completeUnassignedFromTambur`'un tx içi tazelemesi derinlik savunmasıdır, bekçi ona erişemez — silmeden önce yerine ne koyduğunu bil.
- **kk1** · Hata mesajı zenginleştirmesi yalnız gerçekten fırlatılacak dalda koşar (`explainTamburScanBlock`).
- **tambur** · Bir invariantı tek dalda ölçen bekçiye güvenme; koddaki "birebir ayna" yorumu kanıt değildir, iki dalı da sondayla ölç.
- **tambur** · F221 deseni: servis `opts.permissions` almazsa enforcement atlanır (güvenilen dahili çağrı); dış uçtan çağırırken permissions geçirilir.
- **defter** · Kapsamlı ad kuralı olan tabloda sed bileşiktir (`machines`: `(stationId, nameFold)`). Tombstone'a dokunan her yüzey onu dışlar (`assertNameAvailable`, import önizlemesi, `seed-fixtures`). · bekçi: `test_master_data_name_dup`
- **defter** · Sebep önbelleğinde `expireReasonPresetCacheForTest` (bayatlatır) ile `invalidateReasonPresetCache` (düşürür) karıştırılmaz; "kendini onarır" ölçümü önbelleğin görmediği satırla kurulur. Sebep kodu çözümü tx dışında, arka plan tazelemesi DB'ye ulaşamazsa eldeki liste korunur. · bekçi: `test_reason_presets`
- **yetki** · `*` jokerini her kapı tanır (`matchesPermission`): backend `includes("admin:*")` yok; mobil `has()` ilk satırı `set.has('*')`; mobil `usePermission` joker kestirmesi kaldırılmaz. Mobil izin union'ı (`mobil/src/types/permissions.ts`) elle güncellenir, bekçi taramaz.
- **yetki** · `SECRET_FIELDS` yalnız `changes`i maskeler ve tam ad eşler; payload/oldData/newData HAM, çağıranın yükü temiz olmalı.
- **yetki** · `SystemLog.userId` nullable — aktör süzgeçleri null-güvenli yazılır.
- **yetki** · Ayar şifresi kilit kovası girişten ayrıdır (`sp:` ön eki). Kapı kapsamı elle sayılmaz: `systemSettingService.set(`/`setFeatureFlags(` çağıran her route `requireSettingsPassword` taşır (AST tripwire). · bekçi: `test_settings_password`
- **yetki** · Bir kapıyı bayrağa bağlarken komşu kapının saydığı şeyi sıfırlıyor mu sor (`MAX_DEVICE_ROWS` rejimden bağımsız). · bekçi: `test_device_pairing_flag`
- **yetki** · Kapı tek yazarın içinde olur, çağıranlara ikinci kopya eklenmez; kapı taşıma ile bekçi güncellemesi aynı commit'te.
- **yetki** · Feature-flag sözleşmesi üç ayak (`aBool`/`aNum`/`aEnum`): API Zod + `SETTING_KEYS` + `setFeatureFlags` + panel; `FlagDef.numberField` iç adı `numberKey:` zorunlu; enum şeması kapalı küme. · bekçi: `test_feature_flag_contract`
- **genel** · "Yazmaz" kontrolü zorlanan değerle aynı başlatılırsa vakumdur — sondada başlangıç değerini bilerek ters seç.
- **genel** · Muaf/taban kontrolleri dosya bazlı değil SAYIM bazlı yazılır; kolon/kapsam bekçisi anahtar varlığını değil sayı semantiğini ölçer.
- **genel** · Script çıkışında `$disconnect()` tek başına yetmez (havuz 10 dk açık kalır): `process.exit(fail>0?1:0)` ya da `$disconnect()+pool.end()`.
- **genel** · Playwright `_electron.launch` görsel turunda temiz `--user-data-dir` kullan.
- **genel** · Derlenmiş paket üzerinden istemci çıkarımı paketin yaşını ölçmez (tablette eski bundle koşuyor olabilir).

## Reçeteler

- **belge** · Kat (foldType) yazımı üçlü sözleşme: `undefined` dokunma · `null` temizle · kod yaz; satırı yeniden adlandırmak yeni değer değildir. · bekçi: `test_fold_edit_and_label`
- **genel** · Partial index: şemada `@@index([col])`, migration'da DROP + CREATE … WHERE; partial UNIQUE için şemada `@@unique`. · bekçi: `test_db_invariants`
- **genel** · Davranış-koruyan veri migration'ı koşullu yazılır (`WHERE EXISTS (SELECT 1 FROM rolls LIMIT 1)`), değer = dünkü davranış.
- **genel** · Bekçi yazımı: aynı invariant'a ikinci bekçi yazılmaz · sayım kontrolüne körlük zemini · muaflar keşfedilir ve bayatlığa karşı denetlenir · negatif sonda zorunlu (cırcırda iki sonda). Yarış bekçisi elle açık tutulan tx ile kurulur; gate-tx promise'ine await öncesi no-op `.catch`.
- **raporlar** · Cursor sözleşmesi `mode=cursor&limit&cursor&withTotal`; toplam yalnız ilk sayfada ve yaklaşık (`totalEstimate`).
- **raporlar** · Toplu backfill HAM SQL yazar (Prisma update `updatedAt`i tazeler, envanter sıralaması bozulur); kural trigger ile birebir aynı.
- **genel** · Keşif grup içi adres sırası: tercih → `tieBreak` → rttMs → ad (son basamak determinizm için). · bekçi: `Electron/src/test/discovery-logic.test.ts`
- **genel** · Eşzamanlı aynı-`clientToken` çift gönderim: `withBarcodeRetry`'a `!isClientTokenP2002` + tx dışı catch → cached yanıt; cached yanıtın şekli normal yanıtla birebir.
- **genel** · Doğrulama kuralı kapının kendisinde yaşar; çağıranda elle try/catch sarmalayıcısı `details.code`'u yutar.
- **genel** · Bir giriş yüzeyi çıkışıyla birlikte kurulmazsa sıfır kullanım üretir — özellik giriş + çıkış + veri (rota/izin) üçlüsüyle kapanır.

## Ölçüm notları

- tsc çıktısı boruda renklidir: "temiz" hükmü çıkış kodundan (`npm run typecheck; echo $?`), metin süzülecekse `typecheck:plain`. Dosya adı büyük/küçük harf hatasını tsc TS2307 yakalar.
- Çıkış kodu ayrı yazdırılmadan `&&`/`||` zincirinden sonuç cümlesi kurulmaz: zincirin son cümlesi yalnız son adımı anlatır.
- Nullable kolon eklemek PG11+'ta metadata-only'dir; kolon yerine JSON seçmenin gerekçesi olamaz.
- `git pull` sonrası sıra: `npm install` → `prisma:generate` → `prisma:migrate` → `dev`.

## Yorum politikası

- Koddaki yorum 1–3 satırdır ve yalnız NEDEN'i ya da değişmezi söyler; koruduğu satırın hemen üstünde durur.
- Tarih, ölçüm anlatısı, "bekçi §3 kırmızı verdi" hikâyesi yoruma girmez; gerekirse tek satırlık arşiv çapası (`// bkz. arşiv 2026-08-05 kilit sırası`).
- Politika ileriye dönüktür: dokunulan dosyada eski hikâye yorumu çapaya indirilir; toplu temizlik yapılmaz.
- `NEDEN:` etiketi serbesttir; `ÖLÇÜLDÜ:` ve tarihli paragraf arşive gider.
- Sha atfı DAİMA backtick içinde (`5980ff06`) — `test_sha_atfi` yalnız backtick'li atıfı ölçer. Ayrıntı: `docs/standart/OLCUM-DISIPLINI-YAZIM.md` § SHA atfı.
