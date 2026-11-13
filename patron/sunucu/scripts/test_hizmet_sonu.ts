// =============================================================================
// HİZMET SONU BEKÇİSİ (Ek-6/A §4.1–4.5) — aşama tek kaynak (`service-lifecycle.ts`), saat ENJEKTE:
//   §1 saf aşama: sözleşme açık → ACIK · bitiş = en genç geçmiş bitiş · 90. gün sınırı (−1 ms SALT_OKUNUR,
//      tam 90 gün KAPALI) · tesis PASIF → bitiş şimdi · donmuş damga NULL bitişi taşır · DR devri hizmeti bitirmez
//   §2 damga: tek yazar kapanışta yazar (bitiş = kira bitişi), tekrar etkisiz, yeniden açılışta siler; ayak izi
//   §3 SALT_OKUNUR: oturum şeridi aşamayı taşır · okuma AÇIK · giriş AÇIK · gelen kutusu/rapor yazması 403 ·
//      fabrika kanalı 403 · tesis PASIF (abonelik sürerken) fabrika kanalını da kapatır
//   §4 KAPALI: 90. gün dolunca oturum 401 · giriş 403 HIZMET_KAPANDI · sınırdan 1 sn önce hâlâ açık
//   §5 dışa aktarma: yalnız hesap yöneticisi · manifest · JSON + CSV (BOM, başlık, formül öneki) · izinsiz alt
//      satır dökümde YOK · başka tesisin verisi YOK · alt satır/bilinmeyen küme 404 · anlık CSV 400 · sırsız
//      hesap görünümü · ayak izi DISA_AKTARIM · SALT_OKUNUR'da açık
// Koşum: npx tsx scripts/test_hizmet_sonu.ts
// =============================================================================
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { withTesis } from "../src/lib/tenant";
import { cloudEntitlementError } from "../src/services/installation-auth";
import type { InstallationRecord } from "../src/services/installation-directory";
import { READ_ONLY_DAYS, SURESIZ_BITIS, parseCloudUntilArg, refreshServiceEnd, serviceState, type ServiceFacts } from "../src/services/service-lifecycle";
import { setFacilityStatus } from "../src/services/vendor-admin.service";
import { TEST_PAROLASI, api, girdi, girisYap, hesapKur, imzali, kontrol, ortamKur, paket, sonuc, temizleTesis, tesisKur, tesisUrl, totpKodu, type Ortam, type TestKurulumu } from "./lib/test-ortam";

const GUN = 86_400_000;
const TUM_OKUMA = ["bulut:siparis:oku", "bulut:cari:oku", "bulut:ozet:oku", "bulut:hesap:yonet", "bulut:siparis:yaz", "bulut:cari:yaz", "bulut:rapor:oku"];

function saf(): void {
  console.log("\n§1 saf aşama (tek kaynak)");
  const t0 = Date.UTC(2026, 9, 1);
  const kurulum = (bitis: number | null, g: Partial<{ active: boolean; modules: string[] }> = {}) => ({ active: g.active ?? true, modules: g.modules ?? ["patron-bulut"], cloudUntil: bitis === null ? null : new Date(bitis) });
  const f = (g: Partial<ServiceFacts>): ServiceFacts => ({ status: "AKTIF", serviceEndedAt: null, installations: [kurulum(t0 + GUN)], ...g });
  kontrol("§1a bitiş gelecekte → ACIK", serviceState(f({}), t0).phase === "ACIK");
  const bitti = serviceState(f({ installations: [kurulum(t0)] }), t0);
  kontrol("§1b bitiş = şimdi → SALT_OKUNUR, bitiş anı kira bitişi", bitti.phase === "SALT_OKUNUR" && bitti.endedAt?.getTime() === t0);
  const sinir = t0 + READ_ONLY_DAYS * GUN;
  kontrol("§1c 90. günden 1 ms önce SALT_OKUNUR (pozitif sınır)", serviceState(f({ installations: [kurulum(t0)] }), sinir - 1).phase === "SALT_OKUNUR");
  kontrol("§1d tam 90. gün KAPALI (negatif sınır)", serviceState(f({ installations: [kurulum(t0)] }), sinir).phase === "KAPALI");
  const iki = serviceState(f({ installations: [kurulum(t0 - 5 * GUN), kurulum(t0 - 2 * GUN)] }), t0);
  kontrol("§1e birden çok kurulum: bitiş = en genç geçmiş bitiş", iki.endedAt?.getTime() === t0 - 2 * GUN);
  const pasif = serviceState(f({ status: "PASIF" }), t0);
  kontrol("§1f tesis PASIF (abonelik sürerken) → SALT_OKUNUR, bitiş şimdi", pasif.phase === "SALT_OKUNUR" && pasif.endedAt?.getTime() === t0);
  const donmus = serviceState(f({ serviceEndedAt: new Date(t0 - 100 * GUN), installations: [kurulum(null, { modules: [] })] }), t0);
  kontrol("§1g hak düştü (bitiş NULL) → donmuş damga süreyi taşır (KAPALI)", donmus.phase === "KAPALI" && donmus.endedAt?.getTime() === t0 - 100 * GUN);
  kontrol("§1h damgasız hak düşmesi → bitiş şimdi (süre sayılmaya başlar)", serviceState(f({ installations: [kurulum(null, { modules: [] })] }), t0).endedAt?.getTime() === t0);
  kontrol("§1i pasif kurulum sözleşmeyi açık tutmaz", serviceState(f({ installations: [kurulum(t0 + GUN, { active: false })] }), t0).phase === "SALT_OKUNUR");
  // `kurulum-kaydet --bitis=yok`: lisanssız fabrikada hak SÜRESİZDİR (NULL'a düşerse her istek 403 alıyordu).
  const suresiz = parseCloudUntilArg("yok");
  kontrol("§1j --bitis=yok → süresiz uzak tarih (NULL DEĞİL)", suresiz.getTime() === SURESIZ_BITIS.getTime());
  kontrol("§1k süresiz kurulum → ACIK", serviceState(f({ installations: [kurulum(suresiz.getTime())] }), t0).phase === "ACIK");
  const kayit = (cloudUntil: Date | null) => ({ licenseClass: "URETIM", modules: ["patron-bulut"], cloudUntil, handedOver: false }) as unknown as InstallationRecord;
  kontrol("§1l süresiz kurulum eşitleme kapısından geçer", cloudEntitlementError(kayit(suresiz), t0) === null);
  const gecmis = parseCloudUntilArg("2026-01-01T00:00:00.000Z");
  kontrol("§1m geçmiş tarihli bitiş → 403 PATRON_BULUT_KAPALI", cloudEntitlementError(kayit(gecmis), t0)?.code === "PATRON_BULUT_KAPALI");
  kontrol("§1n NULL bitiş (satıcı kipinde hak dondu) kapalı kalır", cloudEntitlementError(kayit(null), t0)?.code === "PATRON_BULUT_KAPALI");
  let red = false;
  try { parseCloudUntilArg("2099-13"); } catch { red = true; }
  kontrol("§1o biçimsiz --bitis reddedilir", red);
}

async function paketGonder(o: Ortam, k: TestKurulumu, ad: string): Promise<{ siparisId: string; cariId: string }> {
  const ufuk = new Date(o.saat.simdi() - 60_000);
  const w = { t: ufuk.toISOString(), k: "000000000001" };
  const siparisId = randomUUID();
  const cariId = randomUUID();
  const kayitlar = [
    girdi("siparis", { yaz: [{ id: siparisId, siparisNo: `S-${ad}`, durum: "ACIK", siparisTarihi: ufuk.toISOString() }], yeni: w }),
    girdi("cari-kart", { yaz: [{ id: cariId, ad: `=HYPERLINK("x") ${ad}`, kod: `C-${ad}` }], yeni: w }),
    girdi("cari-kart.kisisel", { yaz: [{ id: cariId, yetkili: "Ayşe Yılmaz", telefon: "0555 000 00 00" }], yeni: w }),
  ];
  const anliklar = [{ projeksiyon: "ozet.siparis", icerikOzeti: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", veri: { acikSiparis: 3 } }];
  const r = await imzali(o, k, "/v1/esitle", { govde: paket(k, { ufuk, kayitlar, anliklar }) });
  if (r.status !== 200 || (r.json as unknown as { ret: unknown[] }).ret.length > 0) throw new Error(`fikstür paketi: ${r.status} ${JSON.stringify(r.json)}`);
  return { siparisId, cariId };
}

/** Ham bayt da döner: `Response.text()` UTF-8 BOM'unu yutar, BOM ölçümü baytla yapılır. */
async function indir(o: Ortam, belirtec: string, yol: string): Promise<{ status: number; text: string; bom: boolean; headers: Headers }> {
  const res = await fetch(`${o.adres}${yol}`, { headers: { Authorization: `Bearer ${belirtec}` } });
  const bytes = Buffer.from(await res.arrayBuffer());
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  return { status: res.status, text: bytes.subarray(bom ? 3 : 0).toString("utf8"), bom, headers: res.headers };
}

async function damga(o: Ortam, k: TestKurulumu): Promise<void> {
  console.log("\n§2 damga — tek yazar");
  const bitis = o.saat.simdi() + 2 * GUN;
  await withTesis(o.goc, { tesisId: k.tesisId }, (tx) => tx.installation.update({ where: { installationId: k.kurulumId }, data: { cloudUntil: new Date(bitis) } }));
  kontrol("§2a açıkken damga yazılmaz", (await refreshServiceEnd(o.ctx, k.tesisId, o.saat.simdi())) === null);
  o.saat.ayarla(bitis + 60_000);
  kontrol("§2b kapanınca DAMGALANDI", (await refreshServiceEnd(o.ctx, k.tesisId, o.saat.simdi())) === "DAMGALANDI");
  const f = await withTesis(o.goc, { tesisId: k.tesisId }, (tx) => tx.facility.findUnique({ where: { tesisId: k.tesisId } }));
  kontrol("§2c damga = kira bitişi (gözlem anı değil)", f?.serviceEndedAt?.getTime() === bitis, f?.serviceEndedAt?.toISOString());
  kontrol("§2d tekrar tur etkisiz", (await refreshServiceEnd(o.ctx, k.tesisId, o.saat.simdi())) === null);
  const iz = await withTesis(o.goc, { tesisId: k.tesisId }, (tx) => tx.accountAudit.count({ where: { tesisId: k.tesisId, event: "HIZMET_SONA_ERDI" } }));
  kontrol("§2e ayak izi HIZMET_SONA_ERDI (bir kez)", iz === 1);
}

async function saltOkunur(o: Ortam, k: TestKurulumu, yonetici: { belirtec: string; eposta: string; sir: string }): Promise<void> {
  console.log("\n§3 SALT_OKUNUR — okuma açık, yazma kapalı");
  const oturum = await api(o, "GET", "/api/oturum", { belirtec: yonetici.belirtec });
  const hizmet = (oturum.json.data as { hizmet: { asama: string; saltOkunurBitis: string } }).hizmet;
  kontrol("§3a oturum şeridi: aşama SALT_OKUNUR + salt okuma bitişi", hizmet.asama === "SALT_OKUNUR" && Date.parse(hizmet.saltOkunurBitis) > o.saat.simdi(), JSON.stringify(hizmet));
  const oku = await api(o, "GET", "/api/veri/siparis", { belirtec: yonetici.belirtec });
  kontrol("§3b veri okuma AÇIK", oku.status === 200 && (oku.json.data as { kayitlar: unknown[] }).kayitlar.length === 1);
  const yaz = await api(o, "POST", "/api/gelen-kutusu", { belirtec: yonetici.belirtec, govde: { mesajId: randomUUID(), tur: "CARI", govde: { ad: "Yeni Cari", roller: { musteri: true, tedarikci: false } } } });
  kontrol("§3c gelen kutusu yazması 403 PATRON_BULUT_KAPALI (aşama detayda)", yaz.status === 403 && yaz.json.details?.code === "PATRON_BULUT_KAPALI" && yaz.json.details?.asama === "SALT_OKUNUR", JSON.stringify(yaz.json.details));
  const rapor = await api(o, "POST", "/api/raporlar", { belirtec: yonetici.belirtec, govde: { clientToken: randomUUID(), raporAnahtari: "sales/order-intake", parametreler: {} } });
  kontrol("§3d rapor isteği 403", rapor.status === 403 && rapor.json.details?.code === "PATRON_BULUT_KAPALI");
  const fabrika = await imzali(o, k, "/v1/esitle", { govde: paket(k, { ufuk: new Date(o.saat.simdi() - 60_000) }) });
  kontrol("§3e fabrika kanalı 403 (eşitleme durdu)", fabrika.status === 403 && fabrika.json.details?.code === "PATRON_BULUT_KAPALI");
  const giris = await girisYap(o, yonetici).then(() => true, () => false);
  kontrol("§3f giriş AÇIK (salt okuma süresince)", giris);
}

async function pasifTesis(o: Ortam): Promise<void> {
  console.log("\n§3' tesis kapanışı (PASIF) abonelik sürerken");
  const k = await tesisKur(o);
  try {
    const h = await hesapKur(o, k.tesisId, TUM_OKUMA);
    const once = await imzali(o, k, "/v1/esitle", { govde: paket(k, { ufuk: new Date(o.saat.simdi() - 60_000) }) });
    kontrol("§3g kapanıştan önce fabrika kanalı açık (kontrol)", once.status === 200, String(once.status));
    await setFacilityStatus(o.goc, { tesisId: k.tesisId, status: "PASIF" });
    const sonra = await imzali(o, k, "/v1/esitle", { govde: paket(k, { ufuk: new Date(o.saat.simdi() - 30_000) }) });
    kontrol("§3h tesis PASIF → fabrika kanalı 403 (kira hâlâ geçerli olsa da)", sonra.status === 403 && sonra.json.details?.code === "PATRON_BULUT_KAPALI", String(sonra.status));
    const oturum = await api(o, "GET", "/api/oturum", { belirtec: h.belirtec });
    kontrol("§3i tesis PASIF → oturum salt okunur sürer (eskiden tamamen kapanıyordu)", oturum.status === 200 && (oturum.json.data as { hizmet: { asama: string } }).hizmet.asama === "SALT_OKUNUR");
  } finally {
    await temizleTesis(o, k.tesisId);
  }
}

async function kapali(o: Ortam, k: TestKurulumu, yonetici: { belirtec: string; eposta: string; sir: string }): Promise<void> {
  console.log("\n§4 KAPALI — 90. gün sınırı");
  const f = await withTesis(o.goc, { tesisId: k.tesisId }, (tx) => tx.facility.findUnique({ where: { tesisId: k.tesisId } }));
  const sinir = f!.serviceEndedAt!.getTime() + READ_ONLY_DAYS * GUN;
  // Oturumun kendi ömrü (30 gün) aşımı karıştırmasın: sınırdan hemen önce taze giriş (giriş saati 31 sn ilerletir).
  o.saat.ayarla(sinir - 60_000);
  const taze = await girisYap(o, yonetici);
  o.saat.ayarla(sinir - 1_000);
  const once = await api(o, "GET", "/api/oturum", { belirtec: taze });
  kontrol("§4a sınırdan 1 sn önce oturum AÇIK (pozitif)", once.status === 200, String(once.status));
  o.saat.ayarla(sinir);
  const sonra = await api(o, "GET", "/api/oturum", { belirtec: taze });
  kontrol("§4b tam 90. gün: oturum 401 (negatif)", sonra.status === 401 && sonra.json.details?.code === "OTURUM_YOK", String(sonra.status));
  const disa = await indir(o, taze, "/api/disa-aktar/siparis");
  kontrol("§4c KAPALI'da dışa aktarma da kapalı (401)", disa.status === 401);
  o.saat.ilerlet(31_000);
  const g = await api(o, "POST", "/api/oturum/ac", { govde: { eposta: yonetici.eposta, parola: TEST_PAROLASI, totp: totpKodu(yonetici.sir, o.saat.simdi()) } });
  kontrol("§4d giriş 403 HIZMET_KAPANDI", g.status === 403 && g.json.details?.code === "HIZMET_KAPANDI", `${g.status} ${g.json.details?.code}`);
}

async function disaAktarma(o: Ortam, a: TestKurulumu, ids: { siparisId: string }, yonetici: { belirtec: string }, sinirli: { belirtec: string }, digerAd: string): Promise<void> {
  console.log("\n§5 dışa aktarma");
  const m = await api(o, "GET", "/api/disa-aktar", { belirtec: yonetici.belirtec });
  const kumeler = (m.json.data as { kumeler: { ad: string; tur: string; adet: number; bicimler: string[] }[] }).kumeler;
  const ad = (x: string) => kumeler.find((k) => k.ad === x);
  kontrol("§5a manifest: siparis (1) · cari-kart · ozet.siparis yalnız JSON · bulut kümeleri", ad("siparis")?.adet === 1 && !!ad("cari-kart") && JSON.stringify(ad("ozet.siparis")?.bicimler) === '["json"]' && ["gelen-kutusu", "hesaplar", "hesap-denetimi"].every((x) => ad(x)?.tur === "BULUT"), kumeler.map((k) => `${k.ad}:${k.adet}`).join(" "));
  kontrol("§5b manifest alt satırı ayrı küme saymaz", !kumeler.some((k) => k.ad.includes(".finans") || k.ad.includes(".kisisel")));
  const json = await indir(o, yonetici.belirtec, "/api/disa-aktar/siparis?bicim=json");
  const govde = JSON.parse(json.text) as { kume: string; tesisId: string; kayitlar: { id: string; kayit: { siparisNo: string } }[] };
  kontrol("§5c JSON: tek kayıt, finans alt satırı YOK (Adnan'da kesildi)", json.status === 200 && govde.kume === "siparis" && govde.kayitlar.length === 1 && !("finans" in govde.kayitlar[0]!) && govde.kayitlar[0]!.id === ids.siparisId);
  kontrol("§5d dosya olarak iner (Content-Disposition ek + no-store)", /attachment; filename="patron-.*-siparis-.*\.json"/.test(json.headers.get("content-disposition") ?? "") && json.headers.get("cache-control") === "no-store");
  const csv = await indir(o, yonetici.belirtec, "/api/disa-aktar/siparis?bicim=csv");
  const satirlar = csv.text.split("\r\n");
  kontrol("§5e CSV: BOM + başlık (id · alanlar · surum) + 1 satır", csv.bom && satirlar[0] === "id,durum,siparisNo,siparisTarihi,surum" && satirlar.filter((l) => l.length > 0).length === 2, satirlar[0]);
  const cari = await indir(o, yonetici.belirtec, "/api/disa-aktar/cari-kart?bicim=csv");
  kontrol("§5f CSV formül enjeksiyonu önlendi (= ile başlayan metin ' önekli)", cari.text.includes(`"'=HYPERLINK(""x"") `), cari.text.split("\r\n")[1]);
  const sinirliCsv = await indir(o, sinirli.belirtec, "/api/disa-aktar/cari-kart?bicim=csv");
  const sinirliJson = await indir(o, sinirli.belirtec, "/api/disa-aktar/cari-kart?bicim=json");
  kontrol("§5g0 yetkili yönetici: cari CSV'de kisisel.* başlığı ve değeri var", cari.text.split("\r\n")[0]!.includes("kisisel.yetkili") && cari.text.includes("Ayşe Yılmaz"), cari.text.split("\r\n")[0]);
  kontrol("§5g cari izni olmayan yönetici: CSV'de kisisel.* YOK, JSON'da kişisel değer YOK (RLS)", sinirliCsv.status === 200 && !sinirliCsv.text.split("\r\n")[0]!.includes("kisisel.") && !sinirliJson.text.includes("Ayşe Yılmaz"), sinirliCsv.text.split("\r\n")[0]);
  kontrol("§5h başka tesisin verisi dökümde YOK", !json.text.includes(digerAd) && !csv.text.includes(digerAd) && !cari.text.includes(digerAd));
  kontrol("§5i alt satır doğrudan istenemez (404)", (await indir(o, yonetici.belirtec, "/api/disa-aktar/cari-kart.kisisel")).status === 404);
  kontrol("§5j bilinmeyen küme 404", (await indir(o, yonetici.belirtec, "/api/disa-aktar/yok-boyle")).status === 404);
  kontrol("§5k anlık özet CSV istenemez (400)", (await indir(o, yonetici.belirtec, "/api/disa-aktar/ozet.siparis?bicim=csv")).status === 400);
  const anlik = JSON.parse((await indir(o, yonetici.belirtec, "/api/disa-aktar/ozet.siparis")).text) as { veri: { acikSiparis: number } };
  kontrol("§5l anlık özet JSON", anlik.veri.acikSiparis === 3);
  const hesaplar = await indir(o, yonetici.belirtec, "/api/disa-aktar/hesaplar?bicim=json");
  kontrol("§5m hesaplar sırsız (parola/TOTP/davet alanı yok)", hesaplar.status === 200 && !/password|totp|invite|parola|sirri|belirtec/i.test(hesaplar.text), hesaplar.text.slice(0, 120));
  const yetkisiz = await api(o, "GET", "/api/disa-aktar", { belirtec: (await hesapKur(o, a.tesisId, ["bulut:siparis:oku"])).belirtec });
  kontrol("§5n hesap yöneticisi olmayan 403", yetkisiz.status === 403 && yetkisiz.json.details?.code === "YETKISIZ");
  const iz = await withTesis(o.goc, { tesisId: a.tesisId }, (tx) => tx.accountAudit.count({ where: { tesisId: a.tesisId, event: "DISA_AKTARIM" } }));
  kontrol("§5o her tamamlanan döküm ayak izi (DISA_AKTARIM)", iz >= 6, String(iz));
}

async function main(): Promise<void> {
  saf();
  const o = await ortamKur();
  const a = await tesisKur(o);
  const b = await tesisKur(o);
  try {
    const yonetici = await hesapKur(o, a.tesisId, TUM_OKUMA);
    const sinirli = await hesapKur(o, a.tesisId, ["bulut:siparis:oku", "bulut:hesap:yonet"]);
    const ids = await paketGonder(o, a, "tesisA");
    await paketGonder(o, b, "tesisB-GIZLI");
    const mesaj = await api(o, "POST", "/api/gelen-kutusu", { belirtec: yonetici.belirtec, govde: { mesajId: randomUUID(), tur: "CARI", govde: { ad: "Açıkken Cari", roller: { musteri: true, tedarikci: false } } } });
    kontrol("§0 hizmet açıkken gelen kutusu yazılır (kontrol)", mesaj.status === 201, String(mesaj.status));
    await disaAktarma(o, a, ids, yonetici, sinirli, "tesisB-GIZLI");
    await damga(o, a);
    await saltOkunur(o, a, yonetici);
    await pasifTesis(o);
    await kapali(o, b, await hesapKapaliIcin(o, b));
  } finally {
    await temizleTesis(o, a.tesisId);
    await temizleTesis(o, b.tesisId);
    await o.kapat();
  }
  sonuc();
}

/** B tesisini kapanışa götür (kira bitişi geçmiş + damga) ve bir yönetici oturumu aç. */
async function hesapKapaliIcin(o: Ortam, b: TestKurulumu) {
  const h = await hesapKur(o, b.tesisId, TUM_OKUMA);
  await withTesis(o.goc, { tesisId: b.tesisId }, (tx) => tx.installation.update({ where: { installationId: b.kurulumId }, data: { cloudUntil: new Date(o.saat.simdi() - 1_000) } }));
  await refreshServiceEnd(o.ctx, b.tesisId, o.saat.simdi());
  return h;
}

main().catch((err: Error) => {
  console.error(`❌ bekçi çöktü: ${err.stack ?? err.message}`);
  process.exit(1);
});
