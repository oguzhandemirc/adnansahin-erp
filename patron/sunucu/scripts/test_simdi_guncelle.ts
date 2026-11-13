// =============================================================================
// "ŞİMDİ GÜNCELLE" BEKÇİSİ (kullanıcı kararı 2026-11-13) — hesap tesis başına TEK bekleyen işaret açar; fabrika
// işareti kendi imzalı `/v1/rapor/al` yoklamasının yanıtında alır ve bulut onu atomik tüketir; boş yoklama
// uzun yoklamadır (zil gelince erken döner). Bulut hesap yapmaz, yanıt veri taşımaz.
//   §1 oturumsuz 401 · oturumlu → BEKLIYOR + sonrakiMumkun = an + 60 sn · denetim izi · `/oturum` beyanı · katı gövde
//   §2 TEK işaret: bekleyen varken ikinci/eşzamanlı istek yeni işaret açmaz (aynı yanıt)
//   §3 tüketim atomik: eşzamanlı iki claim'den YALNIZ biri `esitlemeIstegi: true` alır; sonra işaret yok
//   §4 60 sn penceresi: tüketilmiş işaretten sonra pencere içinde YAKIN_ZAMANDA (işaret yok) · pencere dolunca yeni işaret
//   §5 uzun yoklama: boş claim bekler; işaret açılınca saniyeler içinde döner · `ozet` zili uyandırmaz
//   §6 fabrika bağlantıyı keserse bekleyen claim işareti TÜKETMEZ
//   §7 zil birimi: süre dolunca false · tesis başına bekleyici tavanı
// Koşum: npx tsx scripts/run-all-tests.ts simdi_guncelle
// =============================================================================
import { setTimeout as uyu } from "node:timers/promises";
import { REQUEST_HEADER, signRequest } from "../src/lisans-protokol";
import { MAX_LISTENERS_PER_FACILITY, WaitingDoorbell } from "../src/services/doorbell";
import { withTesis } from "../src/lib/tenant";
import { SYNC_NOW_MIN_GAP_MS } from "../src/wire/esitleme";
import { api, hesapKur, imzali, kontrol, ortamKur, sonuc, temizleTesis, tesisKur, type Ortam, type TestKurulumu } from "./lib/test-ortam";

type Durum = { durum?: string; sonrakiMumkun?: string };
type Claim = { istekler?: unknown[]; esitlemeIstegi?: boolean; uzunYoklama?: boolean };

async function isaret(o: Ortam, tesisId: string): Promise<{ pending: Date | null; accepted: Date | null; n: number }> {
  const rows = await withTesis(o.goc, { tesisId }, (tx) => tx.syncRequest.findMany({ where: { tesisId } }));
  return { pending: rows[0]?.pendingAt ?? null, accepted: rows[0]?.acceptedAt ?? null, n: rows.length };
}

/** İptal edilebilir imzalı claim (uzun yoklamayı kesmek için). */
function iptalliClaim(o: Ortam, k: TestKurulumu, signal: AbortSignal): Promise<Response> {
  const ham = Buffer.from(JSON.stringify({ v: 1, enFazla: 1 }), "utf8");
  const baslik = signRequest({ installationId: k.kurulumId, purpose: "esitle", body: ham, key: { privateKey: k.privateKey, nowMs: o.saat.simdi() } });
  return fetch(`${o.adres}/v1/rapor/al`, { method: "POST", headers: { [REQUEST_HEADER]: baslik, "Content-Type": "application/json" }, body: new Uint8Array(ham), signal });
}

async function main(): Promise<void> {
  const zil = new WaitingDoorbell();
  const o = await ortamKur({}, undefined, zil);
  const k = await tesisKur(o);
  try {
    const h = await hesapKur(o, k.tesisId, ["bulut:ozet:oku"]);
    const istek = () => api(o, "POST", "/api/esitleme/simdi", { belirtec: h.belirtec, govde: {} });

    console.log("\n§1 uç");
    const anon = await api(o, "POST", "/api/esitleme/simdi", { govde: {} });
    kontrol("§1a oturumsuz → 401, işaret yok", anon.status === 401 && (await isaret(o, k.tesisId)).n === 0, `${anon.status}`);
    const t0 = o.saat.simdi();
    const r1 = await istek();
    const d1 = r1.json.data as Durum;
    const s1 = await isaret(o, k.tesisId);
    kontrol("§1b oturumlu (yalnız örtük bulut:oturum + ozet) → 200 BEKLIYOR, sonrakiMumkun = an + 60 sn", r1.status === 200 && d1.durum === "BEKLIYOR" && d1.sonrakiMumkun === new Date(t0 + SYNC_NOW_MIN_GAP_MS).toISOString(), JSON.stringify(r1.json));
    kontrol("§1c yanıt yalnız {durum, sonrakiMumkun} taşır (veri/sır yok)", Object.keys(d1).sort().join(",") === "durum,sonrakiMumkun", Object.keys(d1).join(","));
    kontrol("§1d DB: tek satır, işaret bekliyor", s1.n === 1 && s1.pending !== null && s1.accepted?.getTime() === t0);
    const iz = await withTesis(o.goc, { tesisId: k.tesisId }, (tx) => tx.accountAudit.count({ where: { tesisId: k.tesisId, event: "ESITLEME_ISTEGI" } }));
    kontrol("§1e denetim izi ESITLEME_ISTEGI (1)", iz === 1, `${iz}`);
    const ot = await api(o, "GET", "/api/oturum", { belirtec: h.belirtec });
    kontrol("§1f /oturum `simdiGuncelle: true` beyan eder", (ot.json.data as { simdiGuncelle?: boolean }).simdiGuncelle === true);
    const fazla = await api(o, "POST", "/api/esitleme/simdi", { belirtec: h.belirtec, govde: { tesisId: k.tesisId } });
    kontrol("§1g gövde katı: tanınmayan alan 400", fazla.status === 400, `${fazla.status}`);

    console.log("\n§2 tek işaret");
    o.saat.ilerlet(90_000);
    const coklu = await Promise.all([istek(), istek(), istek(), istek()]);
    const s2 = await isaret(o, k.tesisId);
    kontrol("§2a bekleyen varken (pencere dolmuş olsa da) istekler BEKLIYOR alır, sonrakiMumkun değişmez", coklu.every((r) => r.status === 200 && (r.json.data as Durum).durum === "BEKLIYOR" && (r.json.data as Durum).sonrakiMumkun === d1.sonrakiMumkun), coklu.map((r) => JSON.stringify(r.json.data)).join(" "));
    kontrol("§2b yeni işaret AÇILMADI (kabul anı aynı, tek satır)", s2.n === 1 && s2.accepted?.getTime() === t0);

    console.log("\n§3 tüketim atomik");
    const [ca, cb] = [iptalliClaim(o, k, AbortSignal.timeout(30_000)), iptalliClaim(o, k, AbortSignal.timeout(30_000))];
    // Biri işareti alır ve hemen döner; öteki boş kalıp bekler — `rapor` zili onu bırakır.
    await uyu(800);
    zil.ring(k.tesisId, "rapor");
    const [ja, jb] = (await Promise.all([ca.then((r) => r.json()), cb.then((r) => r.json())])) as Claim[];
    const alan = [ja, jb].filter((j) => j.esitlemeIstegi === true).length;
    kontrol("§3a eşzamanlı iki claim'den YALNIZ biri işareti alır", alan === 1, JSON.stringify([ja, jb]));
    kontrol("§3b yeni bulut uzun yoklamayı beyan eder", ja.uzunYoklama === true && jb.uzunYoklama === true);
    kontrol("§3c işaret tüketildi (pending NULL)", (await isaret(o, k.tesisId)).pending === null);

    console.log("\n§4 60 sn penceresi");
    const t4 = o.saat.simdi();
    o.saat.ilerlet(1_000);
    const r4 = await istek();
    // Önceki kabul t0'daydı ve pencere dolmuştu: tüketilmiş işaretten sonra ilk istek YENİ işaret açar.
    kontrol("§4a pencere dolmuşsa yeni işaret açılır (BEKLIYOR)", (r4.json.data as Durum).durum === "BEKLIYOR" && (await isaret(o, k.tesisId)).pending !== null, JSON.stringify(r4.json.data));
    const c4 = (await imzali(o, k, "/v1/rapor/al", { govde: { v: 1, enFazla: 1 } })).json as unknown as Claim;
    kontrol("§4b fabrika alır", c4.esitlemeIstegi === true);
    o.saat.ilerlet(10_000);
    const r5 = await istek();
    const d5 = r5.json.data as Durum;
    kontrol("§4c kabulden 10 sn sonra → YAKIN_ZAMANDA, reddedilmez (200), işaret açılmaz", r5.status === 200 && d5.durum === "YAKIN_ZAMANDA" && d5.sonrakiMumkun === new Date(t4 + 1_000 + SYNC_NOW_MIN_GAP_MS).toISOString() && (await isaret(o, k.tesisId)).pending === null, JSON.stringify(d5));
    o.saat.ilerlet(SYNC_NOW_MIN_GAP_MS);
    const r6 = await istek();
    kontrol("§4d pencere dolunca yeni işaret", (r6.json.data as Durum).durum === "BEKLIYOR" && (await isaret(o, k.tesisId)).pending !== null);
    const iz2 = await withTesis(o.goc, { tesisId: k.tesisId }, (tx) => tx.accountAudit.count({ where: { tesisId: k.tesisId, event: "ESITLEME_ISTEGI" } }));
    kontrol("§4e denetim yalnız AÇILAN işarette (3)", iz2 === 3, `${iz2}`);
    await imzali(o, k, "/v1/rapor/al", { govde: { v: 1, enFazla: 1 } });

    console.log("\n§5 uzun yoklama");
    o.saat.ilerlet(SYNC_NOW_MIN_GAP_MS);
    const basla = Date.now();
    const bekleyen = iptalliClaim(o, k, AbortSignal.timeout(30_000)).then(async (r) => ({ j: (await r.json()) as Claim, ms: Date.now() - basla }));
    await uyu(500);
    kontrol("§5a boş claim bekliyor (açık bekleyici 1)", zil.listenerCount(k.tesisId) === 1, `${zil.listenerCount(k.tesisId)}`);
    zil.ring(k.tesisId, "ozet");
    await uyu(300);
    kontrol("§5b `ozet` zili (ekran odağı) yoklamayı uyandırmaz", zil.listenerCount(k.tesisId) === 1);
    await istek();
    const b5 = await bekleyen;
    kontrol("§5c işaret açılınca bekleyen claim saniyeler içinde döner ve işareti taşır", b5.j.esitlemeIstegi === true && b5.ms < 5_000, `${b5.ms} ms ${JSON.stringify(b5.j)}`);

    console.log("\n§6 kesilen bağlantı");
    o.saat.ilerlet(SYNC_NOW_MIN_GAP_MS);
    const kes = new AbortController();
    const kesilen = iptalliClaim(o, k, kes.signal).catch(() => null);
    await uyu(500);
    kes.abort();
    await kesilen;
    await uyu(200);
    await istek();
    await uyu(300);
    kontrol("§6a fabrika bağlantıyı kesince bekleyici kapanır ve işaret TÜKETİLMEZ", zil.listenerCount(k.tesisId) === 0 && (await isaret(o, k.tesisId)).pending !== null);

    console.log("\n§7 zil birimi");
    const z = new WaitingDoorbell();
    const l = z.listen("t", ["esitleme"])!;
    const t7 = Date.now();
    const sonuc7 = await l.wait(150);
    l.close();
    kontrol("§7a süre dolunca false (≈150 ms)", sonuc7 === false && Date.now() - t7 >= 140);
    const onceden = z.listen("t", ["rapor"])!;
    z.ring("t", "rapor");
    kontrol("§7b claim ile bekleme arasında çalan zil kaybolmaz", (await onceden.wait(5_000)) === true);
    onceden.close();
    const dolu = Array.from({ length: MAX_LISTENERS_PER_FACILITY }, () => z.listen("t", ["rapor"]));
    kontrol("§7c tesis başına bekleyici tavanı: tavanın üstü null", dolu.every((x) => x !== null) && z.listen("t", ["rapor"]) === null);
    dolu.forEach((x) => x?.close());
    kontrol("§7d kapanınca kayıt düşer", z.listenerCount("t") === 0);
  } finally {
    await temizleTesis(o, k.tesisId);
    await o.kapat();
  }
  sonuc();
}

main().catch((err: Error) => {
  console.error(`❌ bekçi çöktü: ${err.stack ?? err.message}`);
  process.exit(1);
});
