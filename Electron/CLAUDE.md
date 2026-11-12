# Adnan Şahin ERP — Panel

Electron 42 + React 19 + Vite yönetim paneli; saha akışı yoktur, backend'e (`Teks-Erp/`, port 4000) HTTP ile bağlanır. Çekirdek değişmezler kök `CLAUDE.md`de.

## Komutlar

```bash
npm run dev                  # electron-vite dev (renderer 5174 + main + preload)
npm run dev:web              # web paneli (build:web → dist-web, backend paketine girer)
npm run typecheck            # tsconfig.node + tsconfig.web; *:plain → grep'lenebilir
npm run lint
npm test                     # vitest run (commit kapısında koşar)
npm run electron:rebuild     # serialport, node-hid native yeniden derleme
# depo kökünden; önce surum-notlari.json'a not:
./deploy/electron-paketle.sh adnansahin            # paket (ham `npm run build:win` YASAK)
./deploy/electron-yayinla.sh --musteri=adnansahin  # yayın, manifest en son yüklenir
```

Ağır koşum `node ../scripts/agir-is.mjs -- <komut>` ile. Geliştirmede `VITE_API_BASE_URL=http://localhost:4000`.

## Mimari sınırlar

- `electron/` main süreç (`ipc/<domain>.ipc.ts`, `discovery/`) · `shared/` (IPC sözleşmesi, kanal, güncelleme adresi) · `src/` renderer. `src/router.tsx` yalnız oturum-dışı router; içerik route'ları `src/routes/content-routes.tsx`.
- Renderer `electron`/`fs`/`path`/`child_process`/`os` import etmez; native yetenek yalnız `window.api`. Yeni IPC kanalı dört adım: `shared/ipc-contract.ts` tip → `electron/ipc/<domain>.ipc.ts` → `preload.ts` köprüsü (yalnız serializable) → `window.api.<domain>.<action>`.
- Her HTTP çağrısı `services/apiClient.ts` üzerinden ve TAM yolla (`/api/...`); yanıt tipleri `src/types/api.ts`.
- Token `safeStorage` + `electron-store`'da; renderer `localStorage`a token yazmaz (tek istisna web build).
- Kanal kimliği (appId, ürün adı, güncelleme adresi, varsayılan sunucu) koda yazılmaz: `deploy/kanallar.json`dan derleme anında enjekte edilir; kodda `@shared/channel`. Kanal tektir: `adnansahin`.
- Yeni paket kullanıcı onayı + `docs/standart/KUTUPHANELER.md` karar kaydı ister; `bonjour-service` 1.4.4'te SABİTTİR ve `dependencies`te kalır.

## Tuzaklar

- Düz `npx tsc --noEmit` hiçbir şey denetlemez (kök tsconfig `files: []`); tip denetimi yalnız `npm run typecheck`.
- Backend master-data CRUD'unda Zod YOKTUR: panel `schema.ts` tek kapıdır ve `max(n)` Prisma `@db.VarChar(n)` ile birebir olur.
- Yeni route için backend `screen-catalog.ts` girdisi zorunlu; hub'ı varsa `tile-config.ts` karosu (izin listesi route'la birebir), yoksa `command-entries.ts` palet girişi. Sidebar'a satır eklenmez.
- `TabHost` sayfayı `absolute inset-0` sarar: `PageShell` + sabit `PageHeader` + TEK kaydırıcı `PageBody min-h-0` + sabit `PageFooter`; aksi hâlde bütün panel kayar ve butonlar ekrandan çıkar.
- Sekme geri gezinmesi `navigate(-1)`e güvenmez: tek yer `PageHeader`, derinlik `components/layout/tabs/history-depth.ts`; `location.key` ile çözülmez.
- `apiClient` hatayı zaten toast'lar: mutation `onError`'da ikinci toast yazma. Öneksiz yol 404'ü FilterBar'da "Sonuç yok" diye yutulur.
- Picker `loadAllForPicker(service)` ile yüklenir; inline `pageSize: N` backend `MAX_PAGE_SIZE` değişince 400 verir.
- Baskı iframe'i `sandbox="allow-same-origin allow-modals"` (`allow-scripts` YOK); belgede iç veri kolonu OPT-IN doğar.
- Yeni kullanıcı yalnız mobil istasyon izinleriyle doğar; masaüstü izni atanana kadar panele giremez (`canEnterApp`, login 403).
- Otomatik güncelleme: `artifactName`de `${productName}` yasak, `autoInstallOnAppQuit=false`, `nsis.perMachine`; `package.json > version` artmazsa hiçbir panel güncellenmez.

## Dokunmadan önce oku

| Konu | Belge |
|---|---|
| Sayfa kalıbı, iskelet, veri erişimi, izin, boyut, test | `docs/standart/ELECTRON.md` |
| Yeni sayfa, yeni IPC kanalı, yeni bağımlılık (reçete) | `docs/RECETELER.md` |
| İzin aynası, süperadmin, modül bayrağı paneli | `docs/kurallar/yetki-izin.md` |
| Filtre, liste, arama, rapor ekranı | `docs/kurallar/raporlar.md` |
| Belge, etiket, baskı | `docs/kurallar/belge-etiket.md` |
| Keşif, cihaz, uzak erişim | `docs/kurallar/genel.md` |
| Paketleme, yayın, otomatik güncelleme | `docs/kurallar/surum-yayin.md`, `docs/ops/ELECTRON-OTOMATIK-GUNCELLEME.md` |
