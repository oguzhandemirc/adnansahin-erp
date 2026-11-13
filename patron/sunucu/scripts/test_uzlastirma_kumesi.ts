// =============================================================================
// UZLAŞTIRMA KÜMESİ BEKÇİSİ (sözleşme §4.4, S44–S46) — bulut, fabrikayla AYNI kuralla sayar (tel sözleşmesi
// `RECONCILE_PARENTS` başlığı); fabrika tarafı burada o kuralla elle hesaplanır, saat ENJEKTE:
//   §1 ⭐ kalem ebeveyn kuralı: ufuktan eski siparişin yeni kalemi · yaşlanan siparişin kalemi — budama öncesi,
//      gün 1 budaması sonrası ve gün 2 (eski siparişte yeni kalem + sipariş yaşlanması) uzlaştırmalarında TAM YOK
//   §2 ⭐ ebeveynli kalemin (siparis-kalemi) saklama ufku yanıtta (yoksa fabrika onu hiç süzemez)
//   §3 ⭐ bekleyen: fabrikanın bekleyen listesindeki satır bulut kümesinden dışlanır; listesiz aynı girdi TAM ister;
//      paket toplam tavanı aşılırsa 400
//   §4 ⭐ D4: `ISTEK_ZAMAN` yanıtı `details.sunucuSaati` taşır; o saate göre yeniden imzalanan istek geçer
// NEGATİF SONDA (dosya dışı, cp + shasum ile geri): P1 uzlaştırmanın ebeveyn süzgeci düştü → §1 · P2 ufuk yalnız
//   `retentionFields`li projeksiyona → §2 · P3 bekleyen dışlaması düştü → §3 · P4 `sunucuSaati` eki düştü → §4
// Ölçüm (eski kod, finans çiftleriyle): gün 1 budamasından sonra kalem projeksiyonları TAM; TAM'dan sonra gün 2'de yine.
// Adnan'da ebeveynli tek çift `siparis-kalemi → siparis` (çek/fatura/teklif kesildi, D3).
// Koşum: npx tsx scripts/test_uzlastirma_kumesi.ts
// =============================================================================
import { createHash, randomUUID } from "node:crypto";
import { MAX_RECONCILE_PENDING } from "../src/wire/esitleme";
import { runDaily } from "../src/services/maintenance";
import { girdi, imzali, kontrol, ortamKur, paket, sonuc, temizleTesis, tesisKur, type Ortam, type TestKurulumu } from "./lib/test-ortam";

const GUN = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const ozet = (ids: string[]) => createHash("md5").update([...ids].sort().join(",")).digest("hex");
type Istenen = { istenen?: Array<{ projeksiyon: string }>; ufukTarihi?: Record<string, string> };

class Fabrika {
  private k = 0;
  private readonly zincir = new Map<string, { t: string; k: string }>();
  ufuk: Record<string, string> = {};
  constructor(
    private readonly o: Ortam,
    private readonly t: TestKurulumu,
  ) {}
  async gonder(g: { kayitlar?: Array<[string, Record<string, unknown>[]]>; uzl?: Array<[string, string[], string[]?]>; tur?: string }) {
    const ufuk = new Date(this.o.saat.simdi() - 60_000);
    const kayitlar = (g.kayitlar ?? []).map(([p, yaz]) => {
      const yeni = { t: ufuk.toISOString(), k: String(++this.k).padStart(12, "0") };
      const e = girdi(p, { yaz, yeni, onceki: this.zincir.get(p) ?? null });
      this.zincir.set(p, yeni);
      return e;
    });
    const uzlastirma = (g.uzl ?? []).map(([p, ids, bekleyen]) => ({ projeksiyon: p, adet: ids.length, ozet: ozet(ids), ufukTarihi: this.ufuk[p] ?? null, ...(bekleyen ? { bekleyen } : {}) }));
    const r = await imzali(this.o, this.t, "/v1/esitle", { govde: paket(this.t, { ufuk, kayitlar, uzlastirma, tur: g.tur ?? (kayitlar.length ? "ARTIMLI" : "UZLASTIRMA") }) });
    const j = r.json as unknown as Istenen;
    if (r.status === 200 && j.ufukTarihi) this.ufuk = j.ufukTarihi;
    return { status: r.status, tam: (j.istenen ?? []).map((i) => i.projeksiyon), json: r.json };
  }
}

async function ebeveynBolumu(o: Ortam, t: TestKurulumu): Promise<void> {
  console.log("\n§1–§2 kalem ebeveyn kuralı + saklama ufku");
  const f = new Fabrika(o, t);
  const s = o.saat.simdi();
  const [S1, S2, S3, K1, K2, K3, K4] = Array.from({ length: 7 }, (): string => randomUUID());
  const siparis = new Map<string, number>([[S1!, s - 150 * GUN], [S2!, s - 91 * GUN], [S3!, s - GUN]]);
  const kalemler: Array<{ id: string; sip: string; tarih: number }> = [{ id: K1!, sip: S1!, tarih: s - GUN }, { id: K2!, sip: S2!, tarih: s - GUN }, { id: K3!, sip: S3!, tarih: s - GUN }];
  // Fabrikanın kuralı (sözleşme): kalem ∈ küme ⇔ kendi tarihi ∧ üst belgenin tarihi ufuk içinde.
  const ic = (ms: number) => !f.ufuk["siparis-kalemi"] || ms >= Date.parse(f.ufuk["siparis-kalemi"]!);
  const kume = () => [["siparis-kalemi", kalemler.filter((l) => ic(l.tarih) && ic(siparis.get(l.sip)!)).map((l) => l.id)]] as Array<[string, string[]]>;
  const r0 = await f.gonder({
    kayitlar: [
      ["siparis", [...siparis].map(([id, t]) => ({ id, siparisTarihi: iso(t) }))],
      ["siparis-kalemi", kalemler.map((l) => ({ id: l.id, siparisId: l.sip, olusturulma: iso(l.tarih) }))],
    ],
  });
  const u = Object.keys(f.ufuk);
  kontrol("§2a ⭐ ebeveynli kalemin saklama ufku yanıtta (siparis-kalemi)", r0.status === 200 && u.includes("siparis-kalemi"), u.join(","));
  const turlar: string[][] = [];
  const kalem0 = kume()[0]![1];
  turlar.push((await f.gonder({ uzl: kume() })).tam);
  o.saat.ilerlet(GUN);
  await runDaily(o.ctx, o.saat.simdi());
  turlar.push((await f.gonder({ uzl: kume() })).tam);
  o.saat.ilerlet(GUN);
  kalemler.push({ id: K4!, sip: S1!, tarih: o.saat.simdi() - 60_000 });
  await f.gonder({ kayitlar: [["siparis", [{ id: S1, siparisTarihi: iso(siparis.get(S1!)!) }]], ["siparis-kalemi", [{ id: K4, siparisId: S1, olusturulma: iso(kalemler[3]!.tarih) }]]] });
  await runDaily(o.ctx, o.saat.simdi());
  turlar.push((await f.gonder({ uzl: kume() })).tam);
  kontrol("§1a ⭐ budama öncesi uzlaştırma eşit", turlar[0]!.length === 0, turlar[0]!.join(",") || "eşit");
  kontrol("§1b ⭐ gün 1 budamasından sonra TAM YOK (eski sipariş budandı, kalemi iki uçta da dışarıda)", turlar[1]!.length === 0, turlar[1]!.join(",") || "eşit");
  kontrol("§1c ⭐ gün 2: eski siparişte yeni kalem + siparişin yaşlanması → yine TAM YOK", turlar[2]!.length === 0, turlar[2]!.join(",") || "eşit");
  kontrol("§1d fikstür: güncel siparişin kalemi kümede kaldı; S2 gün 2'de yaşlandı (K2 gün 0'da vardı, gün 2'de yok)", kume()[0]![1].includes(K3!) && kalem0.includes(K2!) && !kume()[0]![1].includes(K2!) && !kalem0.includes(K1!));
}

async function bekleyenBolumu(o: Ortam, t: TestKurulumu): Promise<void> {
  console.log("\n§3 bekleyen kimlikler");
  const f = new Fabrika(o, t);
  const x = randomUUID();
  await f.gonder({ kayitlar: [["renk", [{ id: x, ad: "Bekleyen renk" }]]] });
  const a = await f.gonder({ uzl: [["renk", [], [x]]] });
  kontrol("§3a ⭐ fabrikanın bekleyen listesindeki satır bulut kümesinden dışlanır → TAM yok", a.status === 200 && a.tam.length === 0, a.tam.join(",") || "eşit");
  const b = await f.gonder({ uzl: [["renk", []]] });
  kontrol("§3b listesiz aynı girdi (eski fabrika) satırı sayar → TAM", b.tam.includes("renk"), b.tam.join(","));
  const yarim = Math.floor(MAX_RECONCILE_PENDING / 2) + 1;
  const cok = (n: number) => Array.from({ length: n }, () => randomUUID());
  const c = await f.gonder({ uzl: [["renk", [], cok(yarim)], ["urun", [], cok(yarim)]] });
  kontrol("§3c paket toplam bekleyen tavanı aşılırsa 400", c.status === 400, String(c.status));
}

async function saatBolumu(o: Ortam, t: TestKurulumu): Promise<void> {
  console.log("\n§4 D4 — bulut saati");
  const govde = paket(t, { ufuk: new Date(o.saat.simdi() - 60_000), tur: "UZLASTIRMA" });
  const duvar = o.saat.simdi() - 2 * 3_600_000;
  const a = await imzali(o, t, "/v1/esitle", { govde, nowMs: duvar });
  const saat = a.json.details?.sunucuSaati;
  kontrol("§4a ⭐ ISTEK_ZAMAN yanıtı bulutun saatini taşır (details.sunucuSaati)", a.status === 401 && a.json.details?.code === "ISTEK_ZAMAN" && saat === iso(o.saat.simdi()), `${a.status} ${a.json.details?.code} ${String(saat)}`);
  const pay = duvar - Date.parse(String(saat));
  const b = await imzali(o, t, "/v1/esitle", { govde, nowMs: duvar - pay });
  kontrol("§4b o saate göre yeniden imzalanan istek geçer", b.status === 200, String(b.status));
}

async function main(): Promise<void> {
  const o = await ortamKur();
  const t = await tesisKur(o, { saklamaAy: 3 });
  const t2 = await tesisKur(o, { saklamaAy: 3 });
  try {
    await ebeveynBolumu(o, t);
    await bekleyenBolumu(o, t2);
    await saatBolumu(o, t2);
  } catch (e) {
    kontrol("beklenmeyen hata", false, e instanceof Error ? `${e.message}\n${e.stack}` : String(e));
  } finally {
    await temizleTesis(o, t.tesisId);
    await temizleTesis(o, t2.tesisId);
    await o.kapat();
  }
  sonuc();
}

void main();
