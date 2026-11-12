// Okunmamış ret rozeti: telefondan gönderilen kaydı fabrika REDDETTİYSE "Diğer" sekmesinde ve "Gönderdiklerim"
// satırında sayı görünür; kullanıcı o kaydı AÇINCA söner (listeyi görmek nedeni okumak değildir). "Görüldü" bilgisi
// YALNIZ CİHAZDA (düz depo, hesap + tesis kapsamlı) — cihazlar arası tutarlılık bulut eki ister (sonraki adım).
// İşlenen kayıt rozet üretmez. Yönetici tesisin bütün mesajlarını görür; rozet yalnız KENDİ gönderdiklerini sayar.
import { useEffect, useState } from "react";
import type { InboxItem } from "../api/wire";
import { can } from "../lib/access";
import { useSession } from "./session";
import type { KeyValue } from "./browser-store";
import { useRemote } from "./useRemote";

const ANAHTAR = "patron.ret.goruldu";
/** Depoda tutulan en çok kimlik (eskiler düşer; ret listesi zaten ilk sayfayla sınırlı). */
const AZAMI = 200;
export const RET_SAYFA = 50;

/** 0 → null (rozet yok); 10+ → "9+". */
export function rozetMetni(n: number): string | null {
  return n <= 0 ? null : n > 9 ? "9+" : String(n);
}

export function okunmamisSay(items: readonly InboxItem[], goruldu: ReadonlySet<string>, me: { ad: string; admin: boolean }): number {
  return items.filter((m) => m.durum === "REDDEDILDI" && (!me.admin || m.hesapAdi === me.ad) && !goruldu.has(m.mesajId)).length;
}

// Modül düzeyi kayıt: sekme simgesi, Diğer satırı ve liste aynı kümeyi görür; açılan kayıt hepsini birden söndürür.
let kapsam: string | null = null;
let kume: Set<string> = new Set();
// Depo tembel yüklenir: `store.ts` yerel modül ister, oturumu taklit eden testler onu hiç yüklemez.
let depo: KeyValue | null = null;
const depoAl = (): KeyValue => (depo ??= (require("./store") as typeof import("./store")).plainStore);
const dinleyiciler = new Set<() => void>();
const yay = () => dinleyiciler.forEach((f) => f());

/** Testler için depo değişimi. */
export function okunmamisDeposu(d: KeyValue): void {
  depo = d;
  kapsam = null;
  kume = new Set();
}

async function yukle(yeni: string): Promise<void> {
  if (kapsam === yeni) return;
  kapsam = yeni;
  kume = new Set();
  try {
    const ham = await depoAl().get(`${ANAHTAR}:${yeni}`);
    const dizi: unknown = ham ? JSON.parse(ham) : [];
    if (kapsam === yeni && Array.isArray(dizi)) kume = new Set([...kume, ...dizi.filter((x): x is string => typeof x === "string")]);
  } catch {
    // Bozuk/erişilemeyen depo: hepsi okunmamış sayılır (sessiz kalmaktan iyidir).
  }
  yay();
}

/** Kayıt açıldı: ret görüldü. Yalnız REDDEDILDI kayıt işaretlenir (bekleyen kayıt sonra reddedilirse yine yanar). */
export function retGoruldu(m: Pick<InboxItem, "mesajId" | "durum">): void {
  if (m.durum !== "REDDEDILDI" || kume.has(m.mesajId) || kapsam === null) return;
  kume = new Set([...kume, m.mesajId]);
  const k = kapsam;
  depoAl().set(`${ANAHTAR}:${k}`, JSON.stringify([...kume].slice(-AZAMI))).catch(() => undefined);
  yay();
}

export function useGorulduKumesi(): ReadonlySet<string> {
  const { facility } = useSession();
  const yeni = facility ? `${facility.tesis.id}:${facility.hesap.id}` : null;
  const [, setSurum] = useState(0);
  useEffect(() => {
    const f = () => setSurum((n) => n + 1);
    dinleyiciler.add(f);
    if (yeni) void yukle(yeni);
    return () => {
      dinleyiciler.delete(f);
    };
  }, [yeni]);
  return kapsam === yeni ? kume : new Set();
}

/** Okunmamış ret sayısı; yazma izni yoksa (Gönderdiklerim görünmez) istek de yok, 0. */
export function useOkunmamisRet(): number {
  const { api, facility, permissions } = useSession();
  const yazar = can(permissions, "bulut:siparis:yaz") || can(permissions, "bulut:cari:yaz");
  const goruldu = useGorulduKumesi();
  // Anahtar Gönderdiklerim'in "Hata alanlar" sekmesiyle aynı: önbellek ve "gelen-kutusu" etiketi ortak.
  const r = useRemote(yazar && facility ? "gelen-kutusu:REDDEDILDI" : null, () => api.inboxList({ durum: "REDDEDILDI", limit: RET_SAYFA }), { tags: ["gelen-kutusu"] });
  if (!r.data) return 0;
  return okunmamisSay(r.data.kayitlar, goruldu, { ad: facility?.hesap.ad ?? "", admin: can(permissions, "bulut:hesap:yonet") });
}
