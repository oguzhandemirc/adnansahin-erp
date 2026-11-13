// =============================================================================
// DIŞA AKTARMA + SÜRESİZ HİZMET BEKÇİSİ (eski `test_hizmet_sonu`; ayıklama D5 2026-11-13: Adnan bulutu tek tesisli ve
// süresizdir — salt okuma/kapalı hizmet aşaması, abonelik bitişi ve lisans sınıfı YOK):
//   §1 hizmet hep ACIK: oturum şeridi + dışa aktarma manifesti `{asama: ACIK, bitis: null, saltOkunurBitis: null}`;
//      saat 10 yıl ilerlese de giriş, okuma, yazma ve fabrika kanalı açık (eski +365 gün bitiş + 90 gün sınırı yok)
//   §2 kanal kapısı: fabrikanın kurulum kaydı PASİF → gelen kutusu/rapor yazması 403 PATRON_BULUT_KAPALI, fabrika
//      kanalı 403 KURULUM_IPTAL; okuma ve giriş açık kalır
//   §5 dışa aktarma: yalnız hesap yöneticisi · manifest · JSON + CSV (BOM, başlık, formül öneki) · izinsiz alt
//      satır dökümde YOK · başka tesisin verisi YOK · alt satır/bilinmeyen küme 404 · anlık CSV 400 · sırsız
//      hesap görünümü · ayak izi DISA_AKTARIM
// NEGATİF SONDA (2026-11-13, dosya DIŞI, geri alındı): `OPEN_SERVICE` SALT_OKUNUR + kapı aktiflik süzgeçsiz →
//   §1a §1b §2a §2b §2d ❌ (23/28).
// Koşum: npx tsx scripts/test_disa_aktarma.ts
// =============================================================================
import { randomUUID } from "node:crypto";
import { withTesis } from "../src/lib/tenant";
import { api, girdi, girisYap, hesapKur, imzali, kontrol, ortamKur, paket, sonuc, temizleTesis, tesisKur, type Ortam, type TestHesabi, type TestKurulumu } from "./lib/test-ortam";

const GUN = 86_400_000;
const TUM_OKUMA = ["bulut:siparis:oku", "bulut:cari:oku", "bulut:ozet:oku", "bulut:hesap:yonet", "bulut:siparis:yaz", "bulut:cari:yaz", "bulut:rapor:oku"];
const ACIK = JSON.stringify({ asama: "ACIK", bitis: null, saltOkunurBitis: null });

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

async function hepAcik(o: Ortam, k: TestKurulumu, yonetici: TestHesabi): Promise<void> {
  console.log("\n§1 hizmet hep ACIK (süresiz)");
  const oturum = await api(o, "GET", "/api/oturum", { belirtec: yonetici.belirtec });
  kontrol("§1a oturum şeridi: hizmet sabit ACIK, bitiş yok", JSON.stringify((oturum.json.data as { hizmet: unknown }).hizmet) === ACIK, JSON.stringify((oturum.json.data as { hizmet: unknown }).hizmet));
  const m = await api(o, "GET", "/api/disa-aktar", { belirtec: yonetici.belirtec });
  kontrol("§1b dışa aktarma manifesti: hizmet sabit ACIK", JSON.stringify((m.json.data as { hizmet: unknown }).hizmet) === ACIK);
  // Eski düzende kurulum bitişi +365 gündü ve 90 gün salt okuma sonra giriş kapanıyordu: 10 yıl sonra her şey açık olmalı.
  o.saat.ilerlet(3650 * GUN);
  const taze = await girisYap(o, yonetici).then((b) => b, () => null);
  kontrol("§1c 10 yıl sonra giriş AÇIK (eski 90 gün sınırı yok)", taze !== null);
  const oku = await api(o, "GET", "/api/veri/siparis", { belirtec: taze ?? "" });
  kontrol("§1d 10 yıl sonra okuma AÇIK", oku.status === 200, String(oku.status));
  const yaz = await api(o, "POST", "/api/gelen-kutusu", { belirtec: taze ?? "", govde: { mesajId: randomUUID(), tur: "CARI", govde: { ad: "On Yıl Sonra", roller: { musteri: true, tedarikci: false } } } });
  kontrol("§1e 10 yıl sonra gelen kutusu yazması AÇIK (201)", yaz.status === 201, `${yaz.status} ${yaz.json.details?.code ?? ""}`);
  const fabrika = await imzali(o, k, "/v1/esitle", { govde: paket(k, { ufuk: new Date(o.saat.simdi() - 60_000) }) });
  kontrol("§1f 10 yıl sonra fabrika kanalı AÇIK (200)", fabrika.status === 200, `${fabrika.status} ${fabrika.json.details?.code ?? ""}`);
}

async function pasifKurulum(o: Ortam): Promise<void> {
  console.log("\n§2 kanal kapısı — kurulum kaydı PASİF");
  const k = await tesisKur(o, { aktif: false });
  try {
    const h = await hesapKur(o, k.tesisId, TUM_OKUMA);
    const yaz = await api(o, "POST", "/api/gelen-kutusu", { belirtec: h.belirtec, govde: { mesajId: randomUUID(), tur: "CARI", govde: { ad: "Pasif Cari", roller: { musteri: true, tedarikci: false } } } });
    kontrol("§2a gelen kutusu yazması 403 PATRON_BULUT_KAPALI", yaz.status === 403 && yaz.json.details?.code === "PATRON_BULUT_KAPALI", `${yaz.status} ${yaz.json.details?.code ?? ""}`);
    const rapor = await api(o, "POST", "/api/raporlar", { belirtec: h.belirtec, govde: { clientToken: randomUUID(), raporAnahtari: "sales/order-intake", parametreler: {} } });
    kontrol("§2b rapor isteği 403 PATRON_BULUT_KAPALI", rapor.status === 403 && rapor.json.details?.code === "PATRON_BULUT_KAPALI", `${rapor.status} ${rapor.json.details?.code ?? ""}`);
    const fabrika = await imzali(o, k, "/v1/esitle", { govde: paket(k, { ufuk: new Date(o.saat.simdi() - 60_000) }) });
    kontrol("§2c fabrika kanalı 403 KURULUM_IPTAL", fabrika.status === 403 && fabrika.json.details?.code === "KURULUM_IPTAL");
    const oturum = await api(o, "GET", "/api/oturum", { belirtec: h.belirtec });
    kontrol("§2d okuma (oturum şeridi) açık, hizmet yine ACIK", oturum.status === 200 && JSON.stringify((oturum.json.data as { hizmet: unknown }).hizmet) === ACIK);
    const g = await girisYap(o, h).then(() => true, () => false);
    kontrol("§2e giriş açık", g);
  } finally {
    await temizleTesis(o, k.tesisId);
  }
}

async function disaAktarma(o: Ortam, a: TestKurulumu, ids: { siparisId: string }, yonetici: TestHesabi, sinirli: { belirtec: string }, digerAd: string): Promise<void> {
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
  kontrol("§5m hesaplar sırsız (parola özeti/TOTP/davet alanı yok)", hesaplar.status === 200 && !/password|totp|invite|parola|sirri|belirtec|\$2[aby]\$/i.test(hesaplar.text), hesaplar.text.slice(0, 120));
  const hesapCsv = await indir(o, yonetici.belirtec, "/api/disa-aktar/hesaplar?bicim=csv");
  const hesapBaslik = hesapCsv.text.split("\r\n")[0];
  kontrol("§5m2 hesaplar CSV başlığı fabrika hesabı sütunları (kullaniciAdi; eposta/davetBitis YOK)", hesapBaslik === "id,kullaniciAdi,ad,durum,izinler,sonGiris,olusturulma" && hesapCsv.text.includes(yonetici.kullaniciAdi), hesapBaslik);
  const yetkisiz = await api(o, "GET", "/api/disa-aktar", { belirtec: (await hesapKur(o, a.tesisId, ["bulut:siparis:oku"])).belirtec });
  kontrol("§5n hesap yöneticisi olmayan 403", yetkisiz.status === 403 && yetkisiz.json.details?.code === "YETKISIZ");
  const iz = await withTesis(o.goc, { tesisId: a.tesisId }, (tx) => tx.accountAudit.count({ where: { tesisId: a.tesisId, event: "DISA_AKTARIM" } }));
  kontrol("§5o her tamamlanan döküm ayak izi (DISA_AKTARIM)", iz >= 6, String(iz));
}

async function main(): Promise<void> {
  const o = await ortamKur();
  const a = await tesisKur(o);
  const b = await tesisKur(o);
  try {
    const yonetici = await hesapKur(o, a.tesisId, TUM_OKUMA);
    const sinirli = await hesapKur(o, a.tesisId, ["bulut:siparis:oku", "bulut:hesap:yonet"]);
    const ids = await paketGonder(o, a, "tesisA");
    await paketGonder(o, b, "tesisB-GIZLI");
    const mesaj = await api(o, "POST", "/api/gelen-kutusu", { belirtec: yonetici.belirtec, govde: { mesajId: randomUUID(), tur: "CARI", govde: { ad: "Açıkken Cari", roller: { musteri: true, tedarikci: false } } } });
    kontrol("§0 gelen kutusu yazılır (kontrol)", mesaj.status === 201, String(mesaj.status));
    await disaAktarma(o, a, ids, yonetici, sinirli, "tesisB-GIZLI");
    await pasifKurulum(o);
    await hepAcik(o, a, yonetici);
  } finally {
    await temizleTesis(o, a.tesisId);
    await temizleTesis(o, b.tesisId);
    await o.kapat();
  }
  sonuc();
}

main().catch((err: Error) => {
  console.error(`❌ bekçi çöktü: ${err.stack ?? err.message}`);
  process.exit(1);
});
