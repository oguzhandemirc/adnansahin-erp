# Adnan Şahin ERP — Backend

Express 5 + Prisma 7 + PostgreSQL API sunucusu (port 4000); panel ve tablet buna HTTP ile bağlanır. Çekirdek değişmezler kök `CLAUDE.md`de, burada tekrarlanmaz.

## Komutlar

```bash
npm install && npm run prisma:generate          # şema değişince generate ZORUNLU
npm run prisma:migrate                          # migrate deploy: pull'lanan migration'ı BU uygular
npm run dev                                     # nodemon; bayat Prisma istemcisini önce üretir
npm run typecheck                               # src/ · typecheck:scripts → scripts/+prisma/ · *:plain → grep'lenebilir
npm run lint                                    # src + scripts + prisma
npx tsx scripts/run-all-tests.ts <ad-parçası>   # tek bekçi; tam paket (npm test) CI'da
npx tsx scripts/apply-migration.ts <ad> [--apply]   # elle migration, varsayılan dry-run
npm run check:migrations && npm run check:docs
```

Ağır koşum `node ../scripts/agir-is.mjs -- <komut>` ile. Prisma komutları `Teks-Erp/` içinden koşulur. Bu klonda `.env` yok; DB isteyen iş oturumun kendi `_test` veritabanında yapılır.

## Mimari sınırlar

- Routes → (Controller) → Service → Prisma; route/controller `prisma` import etmez, tx açmaz. Yeni uç varsayılan olarak controller'sız ince handler'dır: Zod parse → servis → `res.json`.
- İş kuralı, `$transaction`, atomik claim ve `AuditService.log()` (tx dışında) yalnız serviste; `services/reports/` salt okur.
- Yeni izin = `src/constants/permission-catalog.ts`e tek satır; boot uzlaştırması DB'ye getirir, kimseye ATAMAZ; izin için migration yazılmaz. Rol şablonları `role-template-catalog.ts`.
- Mobil ucun kapısı `requireAnyPermission('<web-izni>', ...MOBILE_X)`; `mobil/src/types/permissions.ts` union'ı elle güncellenir.
- Modül kapısı adlandırılmış middleware'dir (`module.middleware.ts`, `finance.middleware.ts`); jenerik `requireModule("x")` yazılmaz.
- Test altyapısı `scripts/test_*.ts` + `run-all-tests.ts`; jest/vitest kurulmaz. Paylaşılan fixture `fixture-*.ts` adını taşır.
- Yeni paket kullanıcı onayı + `docs/standart/KUTUPHANELER.md` karar kaydı ister; `bonjour-service` 1.4.4'te SABİTTİR.

## Veritabanı kuralları

Büyük tabloda (`Roll`, `RollMovement`, `RollOperation`, `SystemLog`, `TravelerCardScan`) cursor pagination, `MAX_OFFSET=10000` · `include` değil `select` · ağır aggregation `$queryRaw` · toplu yazım `createMany` · tx kısa, içinde dış I/O yok · büyük tabloya değen yeni uçta `EXPLAIN ANALYZE` · listede snapshot JSON çekilmez · canlıda index migration'ı vardiya dışında. Index, enum, model ve migration kuralları `docs/standart/VERITABANI.md`.

## Tuzaklar

- `migrate dev` her diff'te iki DEFERRABLE composite FK'yı düşürmek ister: yalnız `--create-only` koş ve `DropForeignKey` satırlarını sil.
- Uygulanmış migration dosyası yorum dahil değişmez (checksum `migrate deploy`u kilitler); `migrate resolve --applied` SQL'in koştuğunu kanıtlamaz, `apply-migration.ts` kullan.
- Şema-dışı nesne (partial index, CHECK, trigger, DEFERRABLE FK…) kuran migration aynı commit'te `scripts/test_db_invariants.ts` envanterine yazılır; kırmızıya cevap nesneyi silmek değil satırı yazmaktır.
- `BaseController` gövdeyi Zod'suz servise geçirir: modele eklenen her skaler kolon o uçtan yazılabilir olur; istenmiyorsa açıkça kapat.
- `PG_SESSION_OPTIONS` (`-c timezone=UTC`) silinmez ve `new Pool(` kuran her dosya onu geçirir; fabrika günü yalnız `src/constants/time.ts`ten.
- Decimal kolonda JS float yok: `Prisma.Decimal` ya da DB-side increment/decrement.
- Depo çuvalı içeriğine dokunan yazım `touchWarehouseSackTx`, PLANNED sevkiyat kümesi `touchShipmentPlannedTx`, içerik değişimi `markSackContentChangedTx`'ten geçer; `Sack.notes` bu kapının dışındadır.
- `@unique` numara/barkod üreten yazım `withBarcodeRetry` kullanır ve sıra okuması tx İÇİNDEdir.
- Sözleşme kıran değişiklikte (uç kaldırma · alan adı · tip/birim · zorunlu parametre · enum · izin) eski istemcinin ne yapacağı yazılır; `src/config/client-version-policy.ts` `minVersion` sahadakinden büyük olamaz, mobilde ikinci eksen `minPaketTarihi`.
- Tek bekçi de `run-all-tests.ts <ad>` ile koşulur: `productionDbGate` koşucunun kapısıdır, `npx tsx scripts/test_x.ts` onu atlar. Ayrı sunucu isteyen bekçi sunucu yoksa bölümünü atlar — atlanan kontrol yeşil sayılmaz.

## Dokunmadan önce oku

| Konu | Belge |
|---|---|
| Katman, servis anatomisi, zarf/hata, boyut | `docs/standart/BACKEND.md`, `docs/standart/BACKEND-HTTP.md` |
| Atomik claim, advisory kilit, idempotency | `docs/standart/ESZAMANLILIK.md` |
| Model, index, migration, şema-dışı nesne | `docs/standart/VERITABANI.md`, `docs/standart/VERITABANI-MIGRATION.md` |
| Bekçi yazımı, kadans, commit kapısı | `docs/standart/TEST-VE-DERLEME-BEKCI.md`, `docs/standart/TEST-VE-DERLEME.md` |
| Yeni uç, bayrak, enum değeri, izin (reçete) | `docs/RECETELER.md` |
| İzin, rol, modül bayrağı, süperadmin | `docs/kurallar/yetki-izin.md` |
| Migration, deploy, sürüm | `docs/kurallar/surum-yayin.md` |
| Alan → bekçi haritası | `Teks-Erp/docs/BEKCI-HARITASI.md` |
