// Örnek veri istemcisi: `ApiClient`in yerine oturur (endpoints/kancalar aynen çalışır), ağa hiç çıkmaz.
// Okumalar `veri.ts`ten gelir; yazmalar reddedilir. Kısa gecikme iskelet ve yenileme durumlarını gösterir.
import { ApiError, type ApiClient, type DownloadedFile, type Query } from "../api/client";
import { LIST_MEMBER_FILTERS, LIST_SEARCH, LIST_SORT } from "../api/wire";
import { ORNEK_ANLIK, ORNEK_BILDIRIM, ORNEK_CARI_OZETI, ORNEK_GELEN, ORNEK_LISTE, ORNEK_RAPORLAR, ornekGiris, ornekOturum } from "./veri";

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
    if (opt) kayitlar = kayitlar.filter((r) => (r.kayit as Record<string, unknown>)[opt.alan] === opt.esit);
  }
  const alanlar = spec?.alanlar ?? ["ad"];
  if (ara) kayitlar = kayitlar.filter((r) => alanlar.some((a) => String((r.kayit as Record<string, unknown>)[a] ?? "").toLocaleLowerCase("tr").includes(ara)));
  const sirala = typeof q?.sirala === "string" ? q.sirala : null;
  const tur = sirala ? LIST_SORT[projeksiyon]?.[sirala] : undefined;
  if (sirala && tur) {
    const yon = q?.yon === "azalan" ? -1 : 1;
    const deger = (r: (typeof kayitlar)[number]) => {
      const v = (r.kayit as Record<string, unknown>)[sirala];
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
  if (path === "/bildirim/ayarlar") return ORNEK_BILDIRIM();
  if (path === "/cihazlar") return [];
  throw yok();
}

function yaz(path: string): unknown {
  if (path === "/oturum/ac") return ornekGiris();
  if (path === "/oturum/kapat") return null;
  // Kurulum adımı gösterilebilsin diye örnek anahtar (RFC 6238 örneği; gerçek bir hesaba bağlı değil); onay yazılmaz.
  if (path === "/oturum/dogrulama/baslat") return { totpSirri: "JBSWY3DPEHPK3PXP", otpauth: "otpauth://totp/Adnan%20%C5%9Eahin%20Y%C3%B6netim:ornek.patron?secret=JBSWY3DPEHPK3PXP&issuer=Adnan%20%C5%9Eahin%20Y%C3%B6netim&algorithm=SHA1&digits=6&period=30" };
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
