# Zorlanmayan kurallar

Bu liste küçülmek için vardır. Kök ve üç alt proje `CLAUDE.md`sindeki, bugün hiçbir araçla (lint · tip · bekçi · DB) zorlanmayan kurallar; her satır bir kapı önerisi taşır. Kapı inince satır silinir.

| Kural | Nasıl zorlanabilir |
|---|---|
| `findUnique→if→update` yazılmaz, durum geçişi atomik claim'dir (yarış bekçileri yalnız belirli siteleri ölçer) | AST bekçisi: servis fonksiyonunda `findUnique` sonucuna bağlı `if` + yalnız `id` WHERE'li `update`; devralınanlar tavanda donar |
| Advisory kilit tx'in İLK ifadesidir (bekçi yalnız 2 argümanlı formu ölçer) | AST: `pg_advisory_xact_lock` çağrısı `$transaction` gövdesinin ilk `await`i değilse kırmızı |
| Audit ve dış I/O tx DIŞINDA; tx kısa | AST: `$transaction` callback'i içinde `AuditService.log`, `fetch`, `axios`, `fs.*` çağrısı yasak |
| Yeni davranış bayrağının varsayılanı bugünkü davranıştır | Bekçi: her yeni bayrak anahtarının varsayılanı beyan listesinde gerekçeyle durur, liste dışı anahtar kırmızı |
| Yıkıcı işlem (iptal/sil/fire) önce preview ucu döner, arayüz her kaydı listeler | Route bekçisi: yıkıcı uç kümesi için kardeş `/preview` ucu var mı |
| Validation mesajları Türkçe | Bekçi: Zod `message`/`AppError` literallerinde yalnız ASCII İngilizce cümle yakalayan tarayıcı |
| Canlı sipariş ve müşteri yaratma kodu değiştirilmez | Commit kapısı: dondurulmuş dosya listesi (sipariş/müşteri yaratma yolları) değişince kırmızı, kaçış yalnız kullanıcı onayıyla |
| Sır repoya girmez (bugün yalnız `.env` takibi ve DB adı ölçülüyor) | Commit kapısında desen taraması: özel anahtar başlığı, keystore, IP/alan adı + parola kalıbı |
| Canlı sunucu komutu önce kullanıcıya gösterilir | `scripts/claude-hooks/bash-guard.mjs`: uzak kabuk / canlı DB bağlantısı içeren komutta durdur |
| Yeni npm paketi için kullanıcı onayı (bekçi yalnız karar kaydını ölçer) | Karar kaydına onay satırı zorunlu alan; `test_dependency_contract` onu da okusun |
| Decimal kolonda JS float yok | AST: Decimal alanına `Number(...)`/aritmetik yazımı; sunum çağrıları beyaz listede |
| Listede snapshot JSON çekilmez; `include` değil `select` | AST: `findMany` çağrısında `Json` kolonu `omit`siz seçen sorgular için tavan |
| Büyük tabloya değen yeni uçta `EXPLAIN ANALYZE` | Plan bekçisi: yüksek hacimli tablo listesine giren yeni sorgu için tohumlu EXPLAIN kontrolü |
| `BaseController` modeline eklenen skaler kolon yazılabilir alandır | Bekçi: `BaseController` modellerinin yazılabilir skaler kümesi beyan listesiyle birebir |
| Sözleşme kıran değişiklikte eski istemci sorusu cevaplanır | Commit kapısı: route şeması / enum / izin kataloğu farkında commit mesajında "eski istemci:" satırı aranır |
| Panel: yeni IPC kanalı dört adımda (sözleşme → handler → preload → `window.api`) | vitest: `window.api` yüzeyi ↔ `shared/ipc-contract.ts` ↔ `preload.ts` anahtar kümesi eşitliği |
| Panel: zod `max(n)` = Prisma `@db.VarChar(n)` | Bekçi: master-data `schema.ts` alanları ile şema kolon uzunluklarını eşleyen tablo |
| Tablet: `Card` + `onPress` yok; `ModalTextInput`; yalnız `ModuleSheet`/`PagedSheet` | mobil ESLint `no-restricted-syntax` JSX seçicileri |
| Tablet: sistem diyaloğu `withSystemDialog()` ile sarılır | jest guard: `Linking`/`IntentLauncher` çağrısı sarmalayıcı dışında kırmızı |
| Tablet: sensör değeri yoksa mutasyon çağrılmaz | Ekran-hook birim testi: okuma hatası dalında mutasyon mock'u çağrılmıyor |
