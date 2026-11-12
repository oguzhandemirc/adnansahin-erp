// Örnek veri istemcisi: `ApiClient`in yerine oturur (endpoints/kancalar aynen çalışır), ağa hiç çıkmaz.
// Okumalar `veri.ts`ten gelir; yazmalar reddedilir. Kısa gecikme iskelet ve yenileme durumlarını gösterir.
import { ApiError, type ApiClient, type DownloadedFile, type Query } from "../api/client";
import { ORNEK_ANLIK, ORNEK_GELEN, ORNEK_HESAPLAR, ORNEK_LISTE, ORNEK_RAPORLAR, ornekGiris, ornekOturum } from "./veri";

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
const BOS_SAYFA = { kayitlar: [], sonraki: null };

function listele(projeksiyon: string, q: Query | undefined) {
  const hepsi = ORNEK_LISTE()[projeksiyon] ?? [];
  const suz = (alan: string) => (q?.[alan] ? hepsi.filter((r) => (r.kayit as Record<string, unknown>)[alan] === q[alan]) : null);
  let kayitlar = suz("cariKartId") ?? suz("siparisId") ?? hepsi;
  const ara = typeof q?.ara === "string" ? q.ara.toLowerCase() : "";
  if (ara) kayitlar = kayitlar.filter((r) => String((r.kayit as { ad?: unknown }).ad ?? "").toLowerCase().includes(ara));
  return { kayitlar, sonraki: null };
}

function oku(path: string, q: Query | undefined): unknown {
  const p = path.split("/").filter(Boolean).map(decodeURIComponent);
  if (path === "/oturum") return ornekOturum();
  if (path === "/oturum/tesisler") return ornekGiris().tesisler;
  if (p[0] === "anlik" && p[1]) {
    const veri = ORNEK_ANLIK()[p[1]];
    if (veri === undefined) throw yok();
    return { projeksiyon: p[1], veri, surum: new Date(Date.now() - 180_000).toISOString() };
  }
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
  if (path === "/bildirimler") return BOS_SAYFA;
  if (path === "/hesaplar") return ORNEK_HESAPLAR();
  if (path === "/cihazlar") return [];
  throw yok();
}

function yaz(path: string): unknown {
  if (path === "/oturum/ac" || path === "/oturum/gecis") return ornekGiris();
  if (path === "/oturum/kapat") return null;
  if (path === "/tazele") return { zil: false, sonrakiMs: 60_000 };
  throw new ApiError(403, "ORNEK_VERI", "Örnek veri kipinde fabrikaya yazılmaz");
}

export function createOrnekClient(): ApiClient {
  return {
    get: <T,>(path: string, query?: Query) => bekle(() => oku(path, query) as T),
    post: <T,>(path: string) => bekle(() => yaz(path) as T),
    patch: <T,>() => bekle<T>(() => {
      throw new ApiError(403, "ORNEK_VERI", "Örnek veri kipinde fabrikaya yazılmaz");
    }),
    download: (): Promise<DownloadedFile> => Promise.reject(new ApiError(403, "ORNEK_VERI", "Örnek veri kipinde dışa aktarma yok")),
  };
}
