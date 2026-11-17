// =============================================================================
// BİLDİRİM OKUNDU BEKÇİSİ (D5 2026-11-17) — hesap API'si `POST /api/bildirimler/:id/okundu` ·
// `POST /api/bildirimler/okundu-tumu` · liste `okunma` + `okunmamis`; köprüyle iki yönlü eşitleme.
//   §1 tek okundu: kendi satırı okunur (an yazılır, sayaç düşer) · tekrar etkisiz (0, an değişmez) ·
//      başkasının satırı 404 ve dokunulmaz · olmayan/biçimsiz kimlik 404 · oturumsuz 401.
//   §2 tümü: yalnız kendi okunmamışları (atlanan hariç) · tekrar 0 · başka hesabınki okunmamış kalır.
//   §3 köprü: telefonda okunan fabrika teslimi köprü yanıtında fabrikaya döner (`okunanlar`) · panelde (fabrikada)
//      okunan teslim telefonda okunmuş görünür (liste `okunma` dolu, sayaç düşer).
// NEGATİF SONDA (2026-11-17, dosya DIŞI, geri alındı, md5 aynı): tek okundu claim'inden `readAt: null` kaldırıldı → 1 ❌ (§1c);
// claim'den `accountId` kaldırıldı → 3 ❌ (§1e/§1f); okunmamış koşulundan `ATLANDI` hariç kaldırıldı → 2 ❌ (§2a/§2b).
// Koşum: npx tsx scripts/run-all-tests.ts bildirim_okundu   (kendi *_test DB'si)
// =============================================================================
import { randomUUID } from "node:crypto";
import { withTesis } from "../src/lib/tenant";
import { api, hesapKur, imzali, kontrol, ortamKur, sonuc, temizleTesis, tesisKur, type Ortam, type TestHesabi, type TestKurulumu } from "./lib/test-ortam";

interface Liste { kayitlar: { id: string; okunma?: string | null }[]; okunmamis?: number }
interface Okundu { guncellenen: number; okunmamis: number }

async function satirEkle(o: Ortam, h: TestHesabi, g: { status?: "GONDERILDI" | "ATLANDI"; factoryDeliveryId?: string } = {}): Promise<string> {
  const id = randomUUID();
  await withTesis(o.goc, { tesisId: h.tesisId }, (tx) =>
    tx.notification.create({
      data: {
        id, tesisId: h.tesisId, accountId: h.accountId, kind: "yeni-is-emri", dedupKey: `yeni-is-emri:${randomUUID()}`, title: "Yeni iş emri açıldı",
        body: "Ali · İş emri 12", route: null, status: g.status ?? "GONDERILDI", nextAttemptAt: new Date(), origin: g.factoryDeliveryId ? "fabrika" : "bulut",
        factoryDeliveryId: g.factoryDeliveryId ?? null, sentAt: (g.status ?? "GONDERILDI") === "GONDERILDI" ? new Date() : null, skipReason: g.status === "ATLANDI" ? "TUR_KAPALI" : null,
      },
    }),
  );
  return id;
}
const readAt = async (o: Ortam, tesisId: string, id: string) =>
  (await withTesis(o.goc, { tesisId }, (tx) => tx.notification.findFirst({ where: { tesisId, id }, select: { readAt: true } })))?.readAt ?? null;
const liste = async (o: Ortam, h: TestHesabi) => (await api(o, "GET", "/api/bildirimler", { belirtec: h.belirtec })).json.data as Liste;
const oku = (o: Ortam, h: TestHesabi, id: string) => api(o, "POST", `/api/bildirimler/${id}/okundu`, { belirtec: h.belirtec, govde: {} });
const tumu = (o: Ortam, h: TestHesabi) => api(o, "POST", "/api/bildirimler/okundu-tumu", { belirtec: h.belirtec, govde: {} });

async function tek(o: Ortam, a: TestHesabi, b: TestHesabi): Promise<void> {
  console.log("\n§1 tek bildirimi okundu say");
  const n1 = await satirEkle(o, a);
  const n2 = await satirEkle(o, a);
  const bn = await satirEkle(o, b);
  const once = await liste(o, a);
  kontrol("§1a liste okunmamış sayısını ve okunma alanını taşır", once.okunmamis === 2 && once.kayitlar.every((k) => k.okunma === null), JSON.stringify(once.okunmamis));
  const r1 = await oku(o, a, n1);
  const d1 = r1.json.data as Okundu;
  kontrol("§1b kendi satırı okundu: 200 · 1 güncellenen · sayaç 1", r1.status === 200 && d1.guncellenen === 1 && d1.okunmamis === 1, `${r1.status} ${JSON.stringify(d1)}`);
  const an = await readAt(o, a.tesisId, n1);
  const r2 = await oku(o, a, n1);
  const an2 = await readAt(o, a.tesisId, n1);
  kontrol("§1c tekrar etkisiz: 200 · 0 güncellenen · an değişmez", r2.status === 200 && (r2.json.data as Okundu).guncellenen === 0 && an !== null && an2?.getTime() === an.getTime());
  const sonra = await liste(o, a);
  kontrol("§1d listede okunma dolu, diğeri boş", sonra.kayitlar.find((k) => k.id === n1)?.okunma === an?.toISOString() && sonra.kayitlar.find((k) => k.id === n2)?.okunma === null);
  const yabanci = await oku(o, a, bn);
  kontrol("§1e başkasının bildirimi 404 BULUNAMADI", yabanci.status === 404 && yabanci.json.details?.code === "BULUNAMADI", String(yabanci.status));
  kontrol("§1f başkasının satırına dokunulmadı", (await readAt(o, b.tesisId, bn)) === null);
  kontrol("§1g olmayan kimlik 404", (await oku(o, a, randomUUID())).status === 404);
  kontrol("§1h biçimsiz kimlik 404", (await oku(o, a, "x")).status === 404);
  const oturumsuz = await api(o, "POST", `/api/bildirimler/${n2}/okundu`, { govde: {} });
  kontrol("§1i oturumsuz 401 ve satır okunmamış", oturumsuz.status === 401 && (await readAt(o, a.tesisId, n2)) === null, String(oturumsuz.status));
}

async function hepsi(o: Ortam, a: TestHesabi, b: TestHesabi): Promise<void> {
  console.log("\n§2 tümünü okundu say");
  const atlanan = await satirEkle(o, a, { status: "ATLANDI" });
  const r = await tumu(o, a);
  const d = r.json.data as Okundu;
  kontrol("§2a kendi okunmamışları okundu (atlanan hariç), sayaç 0", r.status === 200 && d.guncellenen === 1 && d.okunmamis === 0, JSON.stringify(d));
  kontrol("§2b atlanan satıra dokunulmadı", (await readAt(o, a.tesisId, atlanan)) === null);
  kontrol("§2c tekrar etkisiz (0)", ((await tumu(o, a)).json.data as Okundu).guncellenen === 0);
  kontrol("§2d başka hesabın okunmamışı kalır", (await liste(o, b)).okunmamis === 1);
}

async function kopru(o: Ortam, k: TestKurulumu, a: TestHesabi): Promise<void> {
  console.log("\n§3 köprü: iki yönlü okundu");
  const YOL = "/v1/bildirimler";
  const gonder = async (okunanlar: { teslimId: string; okundu: string }[]) =>
    (await imzali(o, k, YOL, { govde: { v: 1, teslimler: [], okunanlar }, imzaYolu: YOL })).json as unknown as { okunanlar: { teslimId: string; okundu: string }[] };
  const t1 = randomUUID();
  const n1 = await satirEkle(o, a, { factoryDeliveryId: t1 });
  await oku(o, a, n1);
  const y1 = await gonder([]);
  kontrol("§3a telefonda okunan → köprü yanıtında fabrikaya döner", y1.okunanlar.some((x) => x.teslimId === t1));
  const y2 = await gonder(y1.okunanlar.filter((x) => x.teslimId === t1));
  kontrol("§3b fabrika teyit edince bir daha dönmez", !y2.okunanlar.some((x) => x.teslimId === t1));
  const t2 = randomUUID();
  const n2 = await satirEkle(o, a, { factoryDeliveryId: t2 });
  const once = (await liste(o, a)).okunmamis ?? -1;
  const panel = new Date(Date.now() - 5_000).toISOString();
  await gonder([{ teslimId: t2, okundu: panel }]);
  const l = await liste(o, a);
  kontrol("§3c panelde okunan → telefonda okunmuş (an korunur, sayaç düşer)", l.kayitlar.find((x) => x.id === n2)?.okunma === panel && l.okunmamis === once - 1, JSON.stringify(l.okunmamis));
}

async function main(): Promise<void> {
  const o = await ortamKur({ BILDIRIM_KIPI: "sahte" });
  const k = await tesisKur(o, { ad: "Bekçi Bildirim Okundu" });
  try {
    const a = await hesapKur(o, k.tesisId, ["bulut:uretim:oku"]);
    const b = await hesapKur(o, k.tesisId, ["bulut:uretim:oku"]);
    await tek(o, a, b);
    await hepsi(o, a, b);
    await kopru(o, k, a);
  } finally {
    await temizleTesis(o, k.tesisId);
    await o.kapat();
  }
  sonuc();
}

void main().catch((err) => {
  console.error("❌ bekçi çöktü:", (err as Error).message.slice(-500));
  process.exit(1);
});
