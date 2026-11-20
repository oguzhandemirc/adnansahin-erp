// Örnek veri istemcisi: `ApiClient`in yerine oturur (endpoints/kancalar aynen çalışır), ağa hiç çıkmaz.
// Okumalar `veri.ts`ten gelir; yazmalar reddedilir. Kısa gecikme iskelet ve yenileme durumlarını gösterir.
import { ApiError, type ApiClient, type DownloadedFile, type Query } from "../api/client";
import { LIST_MEMBER_FILTERS, LIST_SEARCH, LIST_SORT, LIST_SORT_FLAGS, LIST_SORT_SUBROW, LIST_TOTALS, LIST_VALUE_FILTERS, type SyncNowResponse } from "../api/wire";
import { factoryDayKey } from "../lib/factory-time";
import { SYNC_NOW_GAP_MS } from "../lib/simdi-guncelle";
import { ORNEK_ANLIK, ORNEK_BILDIRIM, ORNEK_BILDIRIMLER, ORNEK_FABRIKA_TERCIH, ORNEK_CARI_OZETI, ORNEK_GELEN, ORNEK_LISTE, ORNEK_RAPORLAR, ornekGiris, ornekOturum } from "./veri";

const GECIKME_MS = 350;

const bekle = <T,>(v: () => T): Promise<T> =>
  new Promise((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(v());
      } catch (e) {
        reject(e);
      }
    }, GECIKME_MS),
  );

const yok = () => new ApiError(404, "ORNEK_YOK", "Örnek veride bu kayıt yok");

/** Değer süzgeci (`secim`) ve tarih aralığı (`aralik`) sunucudaki gibi: dizi üyeliği / metin eşitliği, fabrika günü (İstanbul). */
function genisSuz<T extends { kayit: unknown }>(kayitlar: T[], q: Query | undefined): T[] {
  const json = (v: unknown): Record<string, unknown> => (typeof v === "string" ? (JSON.parse(v) as Record<string, unknown>) : {});
  let out = kayitlar;
  for (const [alan, degerler] of Object.entries(json(q?.secim))) {
    const xs = degerler as string[];
    out = out.filter((r) => {
      const v = (r.kayit as Record<string, unknown>)[alan];
      return (Array.isArray(v) ? v : v === null || v === undefined ? [] : [v]).some((x) => xs.includes(String(x)));
    });
  }
  for (const [alan, ar] of Object.entries(json(q?.aralik))) {
    const [bas, son] = ar as [string | null, string | null];
    out = out.filter((r) => {
      const v = (r.kayit as Record<string, unknown>)[alan];
      if (typeof v !== "string" || !v) return false;
      const gun = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : factoryDayKey(v);
      return (!bas || gun >= bas) && (!son || gun <= son);
    });
  }
  return out;
}

/** `/liste/:p/secenekler` — beyanlı alanların tekil değerleri (Türkçe sıralı). */
function secenekler(projeksiyon: string) {
  const hepsi = ORNEK_LISTE()[projeksiyon] ?? [];
  const alanlar = (LIST_VALUE_FILTERS[projeksiyon] ?? []).map((f) => {
    const set = new Set<string>();
    for (const r of hepsi) {
      const v = (r.kayit as Record<string, unknown>)[f.alan];
      for (const x of Array.isArray(v) ? v : v === null || v === undefined ? [] : [v]) if (String(x) !== "") set.add(String(x));
    }
    return [f.alan, { degerler: [...set].sort((a, b) => a.localeCompare(b, "tr")), kesildi: false }] as const;
  });
  return { alanlar: Object.fromEntries(alanlar) };
}

/** `/liste/:p/toplam` — listeyle aynı süzgeç; satır sayısı + beyanlı alanların toplamı (metin). */
function toplam(projeksiyon: string, q: Query | undefined) {
  const alanlar = LIST_TOTALS[projeksiyon];
  if (!alanlar) throw new ApiError(400, "ORNEK_YOK", "Bu listede toplam yok");
  const { kayitlar } = listele(projeksiyon, q);
  const topla = (a: string) => kayitlar.reduce((n, r) => n + (Number((r.kayit as Record<string, unknown>)[a]) || 0), 0);
  return { adet: kayitlar.length, toplamlar: Object.fromEntries(alanlar.map((a) => [a, String(topla(a))])) };
}

function listele(projeksiyon: string, q: Query | undefined) {
  const hepsi = ORNEK_LISTE()[projeksiyon] ?? [];
  // Üyelik süzgeci sunucudaki gibi (fabrikanın kimlik dizisi değeri içeriyor mu); yoksa aynı adlı alanın eşitliği.
  const uyelik = (k: string): string | undefined => (LIST_MEMBER_FILTERS as Readonly<Record<string, Readonly<Record<string, string>>>>)[k]?.[projeksiyon];
  const suz = (k: string) => {
    const v = q?.[k];
    if (!v) return null;
    const dizi = uyelik(k);
    return hepsi.filter((r) => {
      const d = (r.kayit as Record<string, unknown>)[dizi ?? k];
      return dizi ? Array.isArray(d) && d.includes(v) : d === v;
    });
  };
  let kayitlar = suz("cariKartId") ?? suz("siparisId") ?? suz("fasonFirmaId") ?? hepsi;
  const ara = typeof q?.ara === "string" ? q.ara.toLocaleLowerCase("tr") : "";
  // Süzgeç sunucudaki gibi `LIST_SEARCH` beyanından (virgüllü değerler, alan = değer); ekran süzmez, sahte sunucu süzer.
  const spec = LIST_SEARCH[projeksiyon];
  const secenekler = [...(spec?.suzgec?.secenekler ?? []), ...(spec?.ekSuzgecler ?? []).flatMap((g) => g.secenekler)];
  for (const d of typeof q?.suzgec === "string" ? q.suzgec.split(",") : []) {
    const opt = secenekler.find((o) => o.deger === d);
    // `degil`: ters eşitlik (bulut `IS DISTINCT FROM`; alanı taşımayan kayıt da girer).
    if (opt) kayitlar = kayitlar.filter((r) => ((r.kayit as Record<string, unknown>)[opt.alan] === opt.esit) !== !!opt.degil);
  }
  const alanlar = spec?.alanlar ?? ["ad"];
  if (ara) kayitlar = kayitlar.filter((r) => alanlar.some((a) => String((r.kayit as Record<string, unknown>)[a] ?? "").toLocaleLowerCase("tr").includes(ara)));
  kayitlar = genisSuz(kayitlar, q);
  const sirala = typeof q?.sirala === "string" ? q.sirala : null;
  const tur = sirala ? LIST_SORT[projeksiyon]?.[sirala] : undefined;
  if (sirala && tur) {
    const yon = q?.yon === "azalan" ? -1 : 1;
    const deger = (r: (typeof kayitlar)[number]) => {
      // Bulutla aynı: bayrak = alanlar sırayla `true` → "0"; alt satır alanı `kisisel`den (2026-11-20).
      const bayraklar = tur === "bayrak" ? (LIST_SORT_FLAGS[projeksiyon]?.[sirala] ?? []) : [];
      if (bayraklar.length > 0) return bayraklar.map((f) => ((r.kayit as Record<string, unknown>)[f] === true ? "0" : "1")).join("");
      const kaynak = LIST_SORT_SUBROW[projeksiyon]?.[sirala] ? (r as { kisisel?: unknown }).kisisel : r.kayit;
      const v = ((kaynak ?? {}) as Record<string, unknown>)[sirala];
      if (v === null || v === undefined || v === "") return null;
      return tur === "sayi" ? Number(v) : String(v);
    };
    kayitlar = [...kayitlar].sort((a, b) => {
      const x = deger(a);
      const y = deger(b);
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "tr")) * yon;
    });
  }
  return { kayitlar, sonraki: null };
}

function oku(path: string, q: Query | undefined): unknown {
  const p = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (path === "/oturum") return ornekOturum();
  if (path === "/oturum/dogrulama") return { acik: false, acilis: null };
  if (path === "/disa-aktar") {
    return {
      hizmet: ornekOturum().hizmet,
      kumeler: [
        { ad: "siparis", tur: "KAYIT", adet: 128, bicimler: ["json", "csv"] },
        { ad: "cari-kart", tur: "KAYIT", adet: 46, bicimler: ["json", "csv"] },
        { ad: "ozet.siparis", tur: "ANLIK", adet: 1, bicimler: ["json"] },
        { ad: "hesaplar", tur: "BULUT", adet: 3, bicimler: ["json", "csv"] },
      ],
    };
  }
  if (p[0] === "anlik" && p[1]) {
    const veri = ORNEK_ANLIK()[p[1]];
    if (veri === undefined) throw yok();
    return { projeksiyon: p[1], veri, surum: new Date(Date.now() - 180_000).toISOString() };
  }
  if (p[0] === "cari-ozeti" && p[1]) {
    const o = ORNEK_CARI_OZETI(p[1]);
    if (!o) throw yok();
    return o;
  }
  if (p[0] === "liste" && p[1] && p[2] === "toplam") return toplam(p[1], q);
  if (p[0] === "liste" && p[1] && p[2] === "secenekler") return secenekler(p[1]);
  if (p[0] === "veri" && p[1] && p[2]) {
    const r = (ORNEK_LISTE()[p[1]] ?? []).find((x) => x.id === p[2]);
    if (!r) throw yok();
    return r;
  }
  if (p[0] === "veri" && p[1]) return listele(p[1], q);
  if (path === "/raporlar") return ORNEK_RAPORLAR();
  if (p[0] === "raporlar" && p[1]) {
    const r = ORNEK_RAPORLAR().kayitlar.find((x) => x.id === p[1]);
    if (!r) throw yok();
    return r;
  }
  if (path === "/gelen-kutusu") return { ...ORNEK_GELEN(), kayitlar: ORNEK_GELEN().kayitlar.filter((m) => !q?.durum || m.durum === q.durum) };
  if (p[0] === "gelen-kutusu" && p[1]) {
    const m = ORNEK_GELEN().kayitlar.find((x) => x.mesajId === p[1]);
    if (!m) throw yok();
    return m;
  }
  if (path === "/bildirimler") return ornekBildirimler();
  if (path === "/bildirim/ayarlar") return ornekBildirimAyarlari();
  if (path === "/cihazlar") return [];
  throw yok();
}

/** "Şimdi güncelle" önizlemesi: bulutun 60 sn penceresini taklit eder; fabrika yok, veri değişmez. */
let ornekSonKabul = 0;
export function ornekSimdiGuncelle(nowMs: number): SyncNowResponse {
  if (nowMs - ornekSonKabul >= SYNC_NOW_GAP_MS) {
    ornekSonKabul = nowMs;
    return { durum: "BEKLIYOR", sonrakiMumkun: new Date(nowMs + SYNC_NOW_GAP_MS).toISOString() };
  }
  return { durum: "YAKIN_ZAMANDA", sonrakiMumkun: new Date(ornekSonKabul + SYNC_NOW_GAP_MS).toISOString() };
}

/** Örnek bildirimlerin okundusu yalnız bu oturumun belleğinde (fabrikaya/buluta gitmez). */
const ornekOkunan = new Set<string>();
function ornekBildirimler() {
  const kayitlar = ORNEK_BILDIRIMLER().map((b) => (b.okunma === null && ornekOkunan.has(b.id) ? { ...b, okunma: new Date().toISOString() } : b));
  return { kayitlar, sonraki: null, okunmamis: kayitlar.filter((b) => b.okunma === null).length };
}
function ornekOkundu(ids: readonly string[]) {
  const once = ornekBildirimler().okunmamis;
  ids.forEach((id) => ornekOkunan.add(id));
  const okunmamis = ornekBildirimler().okunmamis;
  return { guncellenen: once - okunmamis, okunmamis };
}

/** Örnek fabrika tercihi yalnız bu oturumun belleğinde; "fabrika" anında onaylar (bekliyor görünmez). */
const ornekFabrikaKapali: Record<string, boolean> = {};
function ornekBildirimAyarlari() {
  return { ...ORNEK_BILDIRIM(), fabrika: ORNEK_FABRIKA_TERCIH(ornekFabrikaKapali) };
}
function ornekFabrikaTercih(body: unknown) {
  const list = (body as { degisiklikler?: unknown } | undefined)?.degisiklikler;
  const atanmis = new Set(ORNEK_FABRIKA_TERCIH().turler.map((t) => t.tur));
  for (const c of Array.isArray(list) ? list : []) {
    const { tur, kapali } = (c ?? {}) as { tur?: unknown; kapali?: unknown };
    if (typeof tur === "string" && atanmis.has(tur) && typeof kapali === "boolean") ornekFabrikaKapali[tur] = kapali;
  }
  return ornekBildirimAyarlari();
}

function yaz(path: string, body?: unknown): unknown {
  if (path === "/bildirim/fabrika-tercih") return ornekFabrikaTercih(body);
  if (path === "/oturum/ac") return ornekGiris();
  if (path === "/oturum/kapat") return null;
  // Kurulum adımı gösterilebilsin diye örnek anahtar (RFC 6238 örneği; gerçek bir hesaba bağlı değil); onay yazılmaz.
  if (path === "/oturum/dogrulama/baslat") return { totpSirri: "JBSWY3DPEHPK3PXP", otpauth: "otpauth://totp/Adnan%20%C5%9Eahin%20Y%C3%B6netim:ornek.patron?secret=JBSWY3DPEHPK3PXP&issuer=Adnan%20%C5%9Eahin%20Y%C3%B6netim&algorithm=SHA1&digits=6&period=30" };
  if (path === "/tazele") return { zil: false, sonrakiMs: 60_000 };
  if (path === "/bildirimler/okundu-tumu") return ornekOkundu(ORNEK_BILDIRIMLER().map((b) => b.id));
  const okundu = /^\/bildirimler\/([0-9a-f-]{36})\/okundu$/.exec(path);
  if (okundu) return ornekOkundu([okundu[1]!]);
  if (path === "/esitleme/simdi") return ornekSimdiGuncelle(Date.now());
  throw new ApiError(403, "ORNEK_VERI", "Örnek veri kipinde fabrikaya yazılmaz");
}

export function createOrnekClient(): ApiClient {
  return {
    get: <T,>(path: string, query?: Query) => bekle(() => oku(path, query) as T),
    post: <T,>(path: string, body?: unknown) => bekle(() => yaz(path, body) as T),
    patch: <T,>() => bekle<T>(() => {
      throw new ApiError(403, "ORNEK_VERI", "Örnek veri kipinde fabrikaya yazılmaz");
    }),
    download: (): Promise<DownloadedFile> => Promise.reject(new ApiError(403, "ORNEK_VERI", "Örnek veri kipinde dışa aktarma yok")),
  };
}
