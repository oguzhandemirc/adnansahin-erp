# Tambur · Top düzeltme · Refakat kartı

Topun rotadaki son adımı (finalize, kesim, geri alma), toplar üzerindeki elle düzeltmeler (iptal, fire, metraj, taşıma) ve iş emrinin refakat kartı. Kod: `Teks-Erp/src/services/tambur*.ts`, `tambur-undo.service.ts`, `inventory.service.ts`, `workorder-manual-move.service.ts`, `traveler-card*.ts`, `helpers/tambur-plan-gate.helper.ts`, `helpers/cancel-reason.helper.ts`; mobil `mobil/src/screens/Modules/Tambur/`; panel `Electron/src/pages/Operations/Rolls/`.

## Kurallar

### Tambur, finalize, kesim
- Her rotanın SON adımı topu finalize eder (`finalizeRollsAtLastStep`); Tambur özel değildir, `qualityGrade` nullable kalır. [bekçi: test_finalize_last_step]
- Finalize iş emrini topun `currentStep`'inden çözer, `producedInStepId`'den değil (depo kesimi ve fason kısmi sevk çocuğu `producedInStepId=null` doğar). [bekçi: test_tambur_finalize_wo_guard]
- İş emrini yalnız terminal korumalı `completeWorkOrderIfStepsDone` kapatır; CANCELLED/SUPERSEDED iş emri COMPLETED'a dirilmez ve adımındaki top finalize/kesilemez. [bekçi: test_wo_terminal_guard]
- Bölme (split) beş yoldan doğar — Tambur finalize · `cutOpenFabric` · `finalizeOpenFabric` · Top Kesme (`cutWarehouseRoll`/`finalizeWarehouseCut`) · fason kısmi sevk; çocuk `parentRollId` + yeni barkod + `entrySource=TAMBUR_SPLIT` alır, parti/depo miras, giriş istasyonu/kat miras değildir. [bekçi: test_tambur_cut_idempotency]
- Kesim yalnız `currentQty` düşürür; `initialQty` üretim anı görüntüsüdür, yalnız aşımda `max(0, yeniCurrent − initial)` kadar yukarı çekilir — düz `+len` yazma. [bekçi: test_stock_ledger_tambur_undo]
- Aşım kesim anında ebeveyne `TAMBUR_OVERCUT` olarak, kaynağı çocuk `sourceRollId` adıyla yazılır; geri almanın sapma satırı yalnız bu keşifle karşılanmayan kısım için doğar. [bekçi: test_tambur_undo]
- Restore toplamına (`computeRestoredQty`) giren her kaynak FULL geri almanın tersleme adımına da eklenir; eklenmezse dönem raporu aynı metrajı iki kez sayar. [bekçi: test_tambur_undo]
- İki kesim yolunda ebeveyn çocuk `create`'inden önce `FOR UPDATE` ile alınır ve karar ön okumadaki niyetle verilir; değişmişse 409 `ROLL_CHANGED_DURING_CUT`, sessizce aşıma dönülmez. [bekçi: test_tambur_cut_concurrency]
- Aşım dallarının claim WHERE'ine `currentQty > 0` konmaz; normal dal `gte` ile durur. [bekçi: test_tambur_over_quantity]
- Renk/en hedeften sapan top depoya yalnız onayla iner (409 `PLAN_MISMATCH` → `confirmMismatch`); üç yol tek helper `tambur-plan-gate.helper`'dan geçer, fason kabulünde onaylanmış sapma tekrar sorulmaz. [bekçi: test_tambur_plan_gate]
- Hedef renk değişikliği tek bekçi `assertTargetColorChange`'den geçer; kilit adıma değil mala bakar. [bekçi: test_wo_target_color_guard]
- Tambur okutması dağıtılmamış kurşunu da kapatır; makine atfı uydurulmaz (`machineId=null`). [bekçi: test_kursun_unassigned_close]
- Açık kumaş çocuğu, finalize kalanı ve kurtarılan top stok defterine depoya giriş yazar (`TAMBUR_CUT` · `RESCUE`); çocuğun geri alınması bu satırı `TAMBUR_UNDO` ile bağlı tersler. [bekçi: test_stock_ledger_production_entry]
- İş emri üretim çıktısı kümesi tek kaynak `workorder.service.producedOutputWhere`; liste ve detay aynı kümeyi kullanır. [bekçi: test_produced_buckets]
- Hareket kapanışında `qtyOut = qtyIn`; finalize öncesi kesimler hacimden düşmez, WIP raporu farkı "kayıp" basmaz. [inceleme]
- Kat `Roll.foldType` kalıcı kolondur ve miras alınmaz: kesimde seçilen yazılır, değer `resolveFoldTypeForWrite`/`normalizeFoldType`'tan geçer. [bekçi: test_roll_fold_and_reason]
- Etikete katalog KODU basılır (ad değil); değeri olmayan alan `present:false` ile atlanır. [bekçi: test_fold_edit_and_label]
- Elle eklenen top partisiz doğmaz: tek açık parti → bağla · birden çok → 400 `BATCH_REQUIRED` + liste · hiç yok → NULL (`batch.autoCreateEnabled` açıksa sunucu açar). [bekçi: test_tambur_manual_batch]
- `quality.gradeRequiredEnabled` dar kapsamlıdır (KK1 · Tambur kalan · depo kesimi · iş emri kapanışının satılabilir dalları); kapsamı genişletme. [bekçi: test_quality_batch_flags]
- `RollOperation` ve `RollMovement` satırı geri alınırken silinmez, `revokedAt`/`revokedById` ile damgalanır; okuyan her yol `ACTIVE_OPERATION` ile süzer. [bekçi: test_roll_operation_revoke, test_roll_movement_revoke]
- Ölü top kümesi tek kaynak `K18_DEAD_STATUSES`; `SCRAP` bilerek dışındadır (fire partiyi kapatmaz, karneden düşmez); filtrelerde elle statü listesi yazma. [bekçi: test_quality_scorecard]
- `finalizedAt`/`statusChangedAt` damgasını DB trigger'ı yazar; uygulama kodundan yazma. [bekçi: test_db_invariants]

### Top düzeltme, iptal, fire
- İptal ≠ fire: iptal (CANCELLED) "hiç olmamalıydı" — stok düşmez, açık hareket `qtyOut=0`; fire (SCRAP) "vardı, gitti" — stok düşer, fire oranına girer, uç `POST /rolls/:id/scrap` + `roll:manual-adjust`. [bekçi: test_roll_cancel_undo]
- İkinci iptal motoru yazılmaz: bütün iptal/fire yolları `InventoryService.softDelete(CANCEL|SCRAP)`'ten geçer; hareket notu ezilmez, öne `CANCELLED (…)` eklenir. [bekçi: test_manual_roll_undo]
- İptal edilmiş topun `clientToken`'ı replay edilmez → 409 `ENTRY_CANCELLED` (`assertRollReplayAlive`). [bekçi: test_token_replay_cancelled]
- İptali geri almanın tek yüklemi `resolveRollRestoreBlockReason`'dır; ekran ve uç aynı fonksiyonu çağırır, Tambur geri almasının ürünü olan parça (`TAMBUR_GERI_ALMA`) diriltilmez. [bekçi: test_roll_cancel_undo]
- Toplu iptal/fire arayüzü backend önizlemesindeki her topu adıyla listeler, kayıt bazlı seçim sunar, engeli backend cümlesiyle basar; izinsiz şık çizilmez. [bekçi: BulkCancelRollsDialog.test.tsx]
- İptalde sebep zorunluluğu tek helper `assertCancelReasonTx`'ten geçer (`production.cancelReasonRequired`, varsayılan kapalı); istemci zorunluluğu önizlemedeki `reasonRequired`'dan okur, tahmin etmez. [bekçi: test_cancel_reason_required]
- Giriş/iptal sebebi topun kolonundan okunur (`entryReason[Code]`, `cancelReason[Code]`); audit yalnız eski kayıt için yedektir. [bekçi: test_roll_fold_and_reason]
- Top düzeltmede kapsam topun durumundan çıkar: fason/kartela/emekli/sevk her yolla red · STOCK/WAREHOUSE/A1_STOCK sebepsiz · gerisi sebep + `roll:manual-adjust`; kapsam `Boolean(reason)` ile genişletilmez. [bekçi: test_roll_edit_unified]
- Elle metraj düzeltmesi stok defterine `ADJUST`/`MANUAL_ADJUST` yazar ve sapma satırına `rollVarianceId` ile bağlanır; geri alma yolu yoktur, ters düzeltme yeni olgudur. [bekçi: test_roll_qty_adjust, test_stok_defteri_bag_olcumu]
- Tambur geri alma dört moddur: SINGLE · SINGLE_RESTORE (tek top dirilir, kardeşlere ve kapanış sapmalarına dokunulmaz) · FULL (`roll:manual-adjust` + sebep) · MANUAL. [bekçi: test_tambur_undo]
- FULL geri alma kapanış sapmasını damgalarken ona bağlı stok çıkışını da bugüne tersler; kapanışın `scrap` kalanına yalnız FULL sunulur (409 `UNDO_SCRAP_REMAINDER_FULL_ONLY`). [bekçi: test_stock_ledger_tambur_undo]
- Elle eklenen topun geri alınması (MANUAL) yalnız hiç işlem görmemiş elle eklenmiş topa açıktır. [bekçi: test_manual_roll_undo]
- İş emri kapatma "işlemde top var" diye reddetmez; kalan her top için altı karardan biri alınır (STOCK · WAREHOUSE · A1_STOCK · SCRAP · CANCELLED · TRANSFER); fason topu sert engeldir, kapsam birebir kontrol edilir. [bekçi: test_wo_cancel_fason, test_wo_cancel_disposition]
- IN_PRODUCTION'da takılı top için tek yol "Kurtar" (`rescueStuckRoll`, WAREHOUSE'a çeker); "Durum Düzelt" geri getirilmez. [bekçi: test_rescue_stuck]
- "Konumu Düzelt" topu hedef adıma koyar; geri taşımada hedef sonrası kalite/kurşun kararları VOID, hareketler damgalanır (silinmez). CANCELLED/SUPERSEDED iş emrinde reddedilir, tek kaynak `manualMoveWoBlockReason`. [bekçi: test_manual_move_field_continuity, test_manual_move]
- Fason adımına elle taşıma topu `AT_SUBCONTRACTOR` yapmaz; mal içeride bekler, çıkış Fason Sevk ile olur. [bekçi: test_manual_move]
- Mutabakat (`test_consistency`) salt okunurdur; kırmızısı kod hatası, iş kararı bekleyen veri ya da sorgu kör noktası olabilir — eski sapma toplu UPDATE ile düzeltilmez. [bekçi: test_consistency]

### Refakat kartı
- Kart iş emri açılışında doğar; bir iş emri = tek kart (`workOrderId @unique`), kart no = barkod = iş emri no; Parti kart üretmez. [db]
- Önizleme, baskı ve sürüm numarası tek karar noktası `resolvePrintPlan`'dan beslenir; GET yan etkisizdir. ACTIVE kartın içeriği iş emrinin güncel planıdır, sunum (şablon/config/sayfa) her baskıda canlıdır; geçersiz kartta yalnız içerik donuktur. [bekçi: test_traveler_card_stale, test_traveler_template]
- `print-event` yalnız kâğıt baskısı başarıyla bitince çağrılır; içerik değiştiyse `version++`, aynı içerik sürüm artırmaz; basılan her sürüm aynı tx'te `printed_documents`'a arşivlenir. [bekçi: test_traveler_card_stale]
- `contentDirty`'nin tek yazarı `markTravelerCardDirtyTx`; `GET /html` bayrağı temizlemez. [bekçi: test_traveler_card_stale]
- `planKey` config/şablonu dışlar ve anahtar sırasından bağımsızdır; düz `JSON.stringify` kullanma. [bekçi: test_traveler_card_stale]
- Partiler snapshot'a yazılmaz, baskıda `resolveLiveBatches` canlı çözer; sıra `createdAt`, `orderBy batchNumber` yasak. [bekçi: test_traveler_card_a5_batches]
- Şablon çözümü fail-closed: verilen `templateId` silinmiş/pasifse 404, yerleşiğe sapmaz; gövdesi boş RAW_HTML yerleşiğe düşer. [bekçi: test_traveler_template]
- Generic donmuş belge yolları TRAVELER_CARD için kapalıdır (`SELF_MANAGED_DOC_TYPES` → 400); kart kendi sürümünü yönetir. [bekçi: test_traveler_card_stale]
- İş emri belgeleri tek uçtan gelir (`GET /api/work-orders/:id/documents`); liste izni baskı izniyle (`DOC_PERMISSIONS`) hizalı kalır, istemci liste kurmaz. [bekçi: test_workorder_documents]
- Sayfaya bağlı her ölçü `traveler-card.density.ts`'tedir; tek `transform: scale()` yasak, A4 çıktısı bayt bayt korunur. [bekçi: test_traveler_card_a5_batches]

## Tuzaklar
- Depo kesimi ve fason kısmi sevk çocuğunda `producedInStepId` NULL'dur; iş emrini oradan çözen yeni kod sessizce yanlış iş emrine yazar.
- Kesimde kat alanı istemci gövdesinde gönderilmezse parent→plan fallback'i devreye girer; bu miras değil sözleşme boşluğudur — `mutationFn` gövdesine alanı eklemeyi unutma.
- `restoreCancelledRoll` tx açmaz ve adım sayacını yeniden hesaplamaz, çünkü guard hareketli topu reddeder; guard gevşetilirse recompute eklemek zorunludur.
- İptali geri alma, iptal izi kolonlarını temizler; geçmiş yalnız audit `CANCEL_RESTORED`'dadır. Eski kayıtta (`preCancelStatus` NULL) raf STOCK'a döner.
- "Fire geri alınamaz" yalnız elle fire (`/scrap`) içindir; Tambur kalite kararıyla SCRAP olan çocuk kesim geri alınınca iptal edilir.
- Ölü etiket onayı (`confirmLabelPrinted`) kapı değildir; geri koyarken yalnız 409'u eklemek eski istemcileri kilitler.
- `resolveFrozenPageSize`'ın A4 dalı hiçbir baskı yolundan ulaşılamaz; eski kartın A4 basıldığını varsayan kod yazma.
- `TravelerCard.printedAt` yalnız baskı yolunda yazılır; eski satırlarda "printedAt var = basıldı" doğru değildir.
- Mobil `NumpadHost` `autoActivate` aynı ekranda tek alana verilir; ikisine verilirse kazananı mount sırası belirler. Modal içinde sayı girişi `NumpadInput` + `useNativeKeyboard` ister.
- Tambur ana kesim ve Top Kesme modalı aynı kesim modu tercihini paylaşır; birinde değiştirmek diğerini de değiştirir (bilinçli).

## Bekçiler
test_finalize_last_step, test_tambur_finalize_wo_guard, test_wo_terminal_guard, test_tambur_cut_idempotency, test_tambur_cut_concurrency, test_tambur_over_quantity, test_tambur_plan_gate, test_wo_target_color_guard, test_kursun_unassigned_close, test_tambur_undo, test_stock_ledger_tambur_undo, test_stock_ledger_production_entry, test_produced_buckets, test_roll_fold_and_reason, test_fold_edit_and_label, test_tambur_manual_batch, test_quality_batch_flags, test_roll_operation_revoke, test_roll_movement_revoke, test_quality_scorecard, test_db_invariants, test_roll_cancel_undo, test_manual_roll_undo, test_token_replay_cancelled, test_cancel_reason_required, test_roll_edit_unified, test_roll_qty_adjust, test_stok_defteri_bag_olcumu, test_wo_cancel_fason, test_wo_cancel_disposition, test_rescue_stuck, test_manual_move, test_manual_move_field_continuity, test_consistency, test_traveler_card_stale, test_traveler_template, test_traveler_card_a5_batches, test_workorder_documents · İstemci: BulkCancelRollsDialog.test.tsx, RollCancelModal.test.tsx, shortCutQuality.test.ts, resolveShortCutConfig.test.ts, ModalTextInput.test.tsx

Gerekçe ve ölçüm hikâyesi: eski sürüm history dizininde.
