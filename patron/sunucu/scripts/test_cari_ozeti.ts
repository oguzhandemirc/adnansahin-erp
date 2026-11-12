// =============================================================================
// CARİ ÖZETİ BEKÇİSİ (M2a, Adnan'a özgü genişletme) — bulutun üç yeni okuma yolu, gerçek HTTP:
//   §1 `GET /api/veri/iade?cariKartId=` yalnız o müşterinin iadeleri; `siparisId=` yalnız o siparişin; başka tesis sızmaz
//   §2 `GET /api/veri/siparis?cariKartId=&suzgec=ACIK` yalnız fabrikanın `acik:true` dediği siparişler (alanı
//      taşımayan ESKİ satır açık sayılmaz)
//   §3 `GET /api/cari-ozeti/:cariKartId` — anlık yokken 404 · oturumsuz 401 · izinsiz hesap 403 · biçimsiz id 400 ·
//      bilinmeyen müşteri 200 + `ozet:null` (anlık var, müşterinin girdisi yok) · ⭐ yanıt saklanan anlığın o müşteriye
//      ait girdisiyle kanonik EŞİT (bulut hesap yapmaz) · başka müşteri/tesis girdisi sızmaz
//   §4 statik: servis yalnız `data->'cariler'->id` ve `data->>'son12AyBaslangic'` seçer (toplama/aritmetik yok)
// ⭐ NEGATİF SONDA (ölçüldü 2026-11-12): servis `ozet` yerine bütün `data->'cariler'`i döndü → §3d/§3e/§3f/§3g/§4a ❌;
//    LIST_ID_FILTERS.cariKartId'den `iade` çıkarıldı → §1a/§1c ❌ (400); geri alındı → yeşil (15/0).
// Koşum: npx tsx scripts/test_cari_ozeti.ts
// =============================================================================
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROLE_TEMPLATES } from "../src/catalog/permissions";
import { api, girdi, hesapKur, imzali, kanonik, kontrol, ortamKur, paket, sonuc, temizleTesis, tesisKur, type Ortam, type TestHesabi, type TestKurulumu } from "./lib/test-ortam";

type Liste = { kayitlar: { id: string }[]; sonraki: string | null };
const SUNUCU = join(__dirname, "..");
const DIGEST = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

interface Ids {
  readonly musteri: string;
  readonly baska: string;
  readonly siparisAcik: string;
  readonly siparisKapali: string;
  readonly siparisEski: string;
  readonly siparisBaska: string;
  readonly iade: readonly string[];
  readonly iadeBaska: string;
}

function ozetGirdisi(siparis: number, metre: number) {
  const donem = {
    siparisSayisi: siparis, kalemSayisi: siparis * 2, siparisMiktari: [{ birim: "KG", miktar: 20 }, { birim: "MT", miktar: metre }],
    sevk: { metre: metre / 2, top: 3, kg: 0, tartiliCuval: 0, cuval: 1 }, iade: { adet: 1, metre: 12.5 },
    enCokUrun: [{ urunId: randomUUID(), urunAdi: "Örnek Kumaş", renkId: null, renkAdi: null, birim: "MT", miktar: metre, siparisSayisi: siparis }],
  };
  return { tumZamanlar: donem, son12Ay: donem, acik: { siparisSayisi: 1, kalemSayisi: 2, acikMiktar: [{ birim: "MT", miktar: 40 }] }, sonSiparisTarihi: "2026-11-01T08:00:00.000Z", sonSevkTarihi: null };
}

async function fikstur(o: Ortam, k: TestKurulumu, anlik: boolean): Promise<{ ids: Ids; veri: Record<string, unknown> }> {
  const w = { t: new Date(o.saat.simdi() - 60_000).toISOString(), k: "000000000001" };
  const ids: Ids = {
    musteri: randomUUID(), baska: randomUUID(),
    siparisAcik: randomUUID(), siparisKapali: randomUUID(), siparisEski: randomUUID(), siparisBaska: randomUUID(),
    iade: [randomUUID(), randomUUID()], iadeBaska: randomUUID(),
  };
  const gun = (i: number) => new Date(o.saat.simdi() - (i + 1) * 86_400_000).toISOString();
  const sip = (id: string, no: string, cari: string, durum: string, acik?: boolean) => ({
    id, siparisNo: no, cariKartId: cari, durum, siparisTarihi: gun(1), olusturulma: gun(1), ...(acik !== undefined ? { acik } : {}),
  });
  const iade = (id: string, no: string, cari: string, siparis: string | null, i: number) => ({
    id, iadeNo: no, cariKartId: cari, siparisId: siparis, sevkiyatId: null, urunId: randomUUID(), renkId: null, en: null, metre: "12.50", grupId: null, iptalTarihi: null, olusturulma: gun(i),
  });
  const veri = { son12AyBaslangic: "2025-11-11T21:00:00.000Z", cariler: { [ids.musteri]: ozetGirdisi(2, 100), [ids.baska]: ozetGirdisi(5, 900) } };
  const r = await imzali(o, k, "/v1/esitle", {
    govde: paket(k, {
      ufuk: new Date(o.saat.simdi() - 60_000),
      kayitlar: [
        girdi("siparis", { yaz: [sip(ids.siparisAcik, "SP-1", ids.musteri, "APPROVED", true), sip(ids.siparisKapali, "SP-2", ids.musteri, "COMPLETED", false), sip(ids.siparisEski, "SP-3", ids.musteri, "APPROVED"), sip(ids.siparisBaska, "SP-4", ids.baska, "APPROVED", true)], yeni: w, katalogSurum: 2 }),
        girdi("iade", { yaz: [iade(ids.iade[0]!, "IA-1", ids.musteri, ids.siparisAcik, 1), iade(ids.iade[1]!, "IA-2", ids.musteri, null, 2), iade(ids.iadeBaska, "IA-3", ids.baska, ids.siparisBaska, 3)], yeni: w }),
      ],
      anliklar: anlik ? [{ projeksiyon: "cari-ozeti", icerikOzeti: DIGEST, veri }] : [],
    }),
  });
  if (r.status !== 200 || (r.json as unknown as { ret: unknown[] }).ret.length > 0) throw new Error(`fikstür: ${r.status} ${JSON.stringify(r.json)}`);
  return { ids, veri };
}

async function liste(o: Ortam, h: TestHesabi, p: string, sorgu: Record<string, string>) {
  const r = await api(o, "GET", `/api/veri/${p}?${new URLSearchParams(sorgu).toString()}`, { belirtec: h.belirtec });
  const d = r.json.data as Liste | undefined;
  return { status: r.status, ids: new Set((d?.kayitlar ?? []).map((x) => x.id)) };
}
const ayni = (a: Set<string>, b: readonly string[]): boolean => a.size === b.length && b.every((x) => a.has(x));

async function listeler(o: Ortam, h: TestHesabi, ids: Ids, yabanci: Ids): Promise<void> {
  console.log("\n§1 iade listesi · §2 açık sipariş süzgeci");
  const a = await liste(o, h, "iade", { cariKartId: ids.musteri });
  kontrol("§1a ⭐ iade?cariKartId= yalnız o müşterinin 2 iadesi", a.status === 200 && ayni(a.ids, ids.iade), `${a.status} ${a.ids.size}`);
  const b = await liste(o, h, "iade", { siparisId: ids.siparisAcik });
  kontrol("§1b iade?siparisId= yalnız o siparişin iadesi", b.status === 200 && ayni(b.ids, [ids.iade[0]!]), `${b.status} ${b.ids.size}`);
  const c = await liste(o, h, "iade", { cariKartId: yabanci.musteri });
  kontrol("§1c ⭐ başka tesisin müşterisinin iadesi görünmez (tesis yalıtımı)", c.status === 200 && c.ids.size === 0, `${c.status} ${c.ids.size}`);
  const d = await liste(o, h, "siparis", { cariKartId: ids.musteri, suzgec: "ACIK" });
  kontrol("§2a ⭐ siparis?cariKartId=&suzgec=ACIK yalnız acik:true olan (tamamlanan ve alanı taşımayan eski satır dışarıda)", d.status === 200 && ayni(d.ids, [ids.siparisAcik]), `${d.status} ${[...d.ids].join(",")}`);
  const e = await liste(o, h, "siparis", { cariKartId: ids.musteri });
  kontrol("§2b süzgeçsiz müşteri listesi 3 siparişin hepsi (var olan davranış değişmedi)", e.status === 200 && e.ids.size === 3, `${e.ids.size}`);
}

async function ozet(o: Ortam, h: TestHesabi, izinsiz: TestHesabi, ids: Ids, veri: Record<string, unknown>, yabanci: Ids): Promise<void> {
  console.log("\n§3 GET /api/cari-ozeti/:cariKartId");
  const yol = (id: string) => `/api/cari-ozeti/${id}`;
  const oturumsuz = await api(o, "GET", yol(ids.musteri));
  kontrol("§3a oturumsuz → 401", oturumsuz.status === 401, `${oturumsuz.status}`);
  const izin = await api(o, "GET", yol(ids.musteri), { belirtec: izinsiz.belirtec });
  kontrol("§3b `bulut:siparis:oku` izni olmayan hesap → 403", izin.status === 403, `${izin.status} ${izin.json.details?.code}`);
  const bicim = await api(o, "GET", yol("abc"), { belirtec: h.belirtec });
  kontrol("§3c biçimsiz id → 400", bicim.status === 400, `${bicim.status}`);
  const bilinmez = await api(o, "GET", yol(randomUUID()), { belirtec: h.belirtec });
  const bd = bilinmez.json.data as { ozet: unknown; son12AyBaslangic: unknown } | undefined;
  kontrol("§3d bilinmeyen müşteri → 200 + ozet:null (anlık var, girdi yok — 'hareket yok' boş durumu)", bilinmez.status === 200 && bd?.ozet === null && bd.son12AyBaslangic === veri.son12AyBaslangic, `${bilinmez.status} ${JSON.stringify(bd)}`);
  const r = await api(o, "GET", yol(ids.musteri.toUpperCase()), { belirtec: h.belirtec });
  const d = r.json.data as { cariKartId: string; ozet: unknown; son12AyBaslangic: string; surum: string } | undefined;
  const cariler = veri.cariler as Record<string, unknown>;
  kontrol("§3e ⭐ yanıt saklanan anlığın o müşteriye ait girdisiyle kanonik EŞİT (bulut hesap yapmaz; büyük harfli id küçültülür)",
    r.status === 200 && d?.cariKartId === ids.musteri && kanonik(d.ozet) === kanonik(cariler[ids.musteri]) && d.son12AyBaslangic === veri.son12AyBaslangic && typeof d.surum === "string", `${r.status}`);
  const govde = JSON.stringify(r.json);
  kontrol("§3f ⭐ başka müşterinin girdisi yanıtta yok", !govde.includes(ids.baska) && !govde.includes("\"miktar\":900"));
  const yab = await api(o, "GET", yol(yabanci.musteri), { belirtec: h.belirtec });
  kontrol("§3g ⭐ başka tesisin müşterisi → ozet:null (tesis yalıtımı)", yab.status === 200 && (yab.json.data as { ozet: unknown }).ozet === null, `${yab.status}`);
}

async function anlikYok(o: Ortam, h: TestHesabi, ids: Ids): Promise<void> {
  const r = await api(o, "GET", `/api/cari-ozeti/${ids.musteri}`, { belirtec: h.belirtec });
  kontrol("§3h anlık hiç gelmediyse → 404 ('henüz gelmedi' boş durumu)", r.status === 404, `${r.status}`);
}

function statik(): void {
  console.log("\n§4 bulut hesap yapmaz (statik)");
  const servis = readFileSync(join(SUNUCU, "src/services/data.service.ts"), "utf8");
  const govde = /export async function getCustomerSummary[\s\S]*?\n\}/.exec(servis)?.[0] ?? "";
  const select = /SELECT([\s\S]*?)FROM/.exec(govde)?.[1] ?? "";
  const kolonlar = select.split(",").map((x) => x.trim()).filter(Boolean);
  const beklenen = ["r.data->'cariler'->${id} AS ozet", "r.data->>'son12AyBaslangic' AS baslangic", "r.version_at"];
  kontrol("§4a ⭐ SELECT yalnız müşterinin girdisi + pencere başı + sürüm (toplama/aritmetik YOK)", kanonik(kolonlar) === kanonik(beklenen), kolonlar.join(" | "));
  kontrol("§4b servis sayısal işlem yapmaz (sum/count/avg/+)", govde !== "" && !/\b(sum|count|avg)\s*\(|reduce\(/i.test(govde));
}

async function main(): Promise<void> {
  statik();
  const o = await ortamKur();
  const k = await tesisKur(o);
  const k2 = await tesisKur(o);
  const k3 = await tesisKur(o);
  try {
    const { ids, veri } = await fikstur(o, k, true);
    const { ids: yabanci } = await fikstur(o, k2, true);
    const { ids: anliksiz } = await fikstur(o, k3, false);
    const h = await hesapKur(o, k.tesisId, ROLE_TEMPLATES.PATRON);
    const izinsiz = await hesapKur(o, k.tesisId, ROLE_TEMPLATES.MUHASEBE);
    await listeler(o, h, ids, yabanci);
    await ozet(o, h, izinsiz, ids, veri, yabanci);
    await anlikYok(o, await hesapKur(o, k3.tesisId, ROLE_TEMPLATES.PATRON), anliksiz);
  } finally {
    await temizleTesis(o, k.tesisId);
    await temizleTesis(o, k2.tesisId);
    await temizleTesis(o, k3.tesisId);
    await o.kapat();
  }
  sonuc();
}

main().catch((err: Error) => {
  console.error(`❌ bekçi çöktü: ${err.stack ?? err.message}`);
  process.exit(1);
});
