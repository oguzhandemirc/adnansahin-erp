// BULUT PROJEKSİYON KATALOĞU — projeksiyon → izin eşlemesinin TEK KAYNAĞI (sözleşme §3, §9.5, §10).
// Kolon listesinin tek kaynağı FABRİKADADIR (`Teks-Erp/src/cloud-sync/projections.ts`); bulut kolon
// bilmez, satırı jsonb saklar. Burada yalnız bulutun kendi kararları durur:
//   · izin (alt satır: `.kisisel`) — eşlenmeyen projeksiyon RED (fail-closed); finans/teklif/maliyet adları
//     Adnan kapsamında YOK (fabrika göndermez; gelirse tanınmayan ad olarak o girdi RED)
//   · saklama tarihi alanı (OLGU; BOYUT ve durum-benzeri OLGU budanmaz) + sıralama alanı
//   · kök satırda BULUNAMAYACAK alan adları (KISISEL sınıflı kolonlar alt satıra bölünür; finans kolonu
//     hiç gelmez — fabrika hatası kök satıra tutar sızdırırsa bulut o girdiyi REDDEDER)
//   · alt kaydın ebeveyni (ebeveyni budanan kalem öksüz kalmaz) — bağ TEL SÖZLEŞMESİNDEN (`RECONCILE_PARENTS`)
import { RECONCILE_PARENTS } from "../wire/esitleme";
import type { CloudPermission } from "./permissions";

export type ProjectionKind = "BOYUT" | "OLGU" | "ANLIK";
export type SubRow = "kisisel";

export interface RootProjection {
  readonly name: string;
  readonly kind: ProjectionKind;
  /** Kök satırı okumak için gereken izinlerin HEPSİ. */
  readonly permissions: readonly CloudPermission[];
  /** Saklama tarihi: ilk dolu alan (ISO) — fabrika kataloğunun `retention.wireFields`iyle BİREBİR (uzlaştırma iki ucu aynı tarihle süzer; bekçi `test_bulut_tel_aynasi`). */
  readonly retentionFields?: readonly string[];
  /** Liste sıralaması: ilk dolu alan (ISO); yoksa paketin ufku. */
  readonly sortFields?: readonly string[];
  readonly subRows?: readonly SubRow[];
  /** Kök satırda YASAK tel alanları (FINANS/KISISEL sınıfı — alt satıra aittir). */
  readonly forbiddenRootFields?: readonly string[];
  /** Kalem → üst belge: üstü canlı değilse kalem öksüzdür (bakım budar). */
  readonly parent?: { readonly projection: string; readonly field: string };
}

const OTURUM: readonly CloudPermission[] = ["bulut:oturum"];

/** Kalem → üst belge bağı sözleşmeden: budama ile uzlaştırma AYNI bağla çalışır (S45). */
function parentOf(name: string): { readonly projection: string; readonly field: string } {
  const rule = RECONCILE_PARENTS[name];
  if (!rule) throw new Error(`Uzlaştırma sözleşmesinde ebeveyn yok: ${name}`);
  return { projection: rule.parent, field: rule.field };
}
const KISISEL_KOLONU: CloudPermission = "bulut:cari:oku";

export const ROOT_PROJECTIONS: readonly RootProjection[] = [
  // ---- BOYUT (sözlükler; her hesap) ----
  { name: "urun", kind: "BOYUT", permissions: OTURUM },
  { name: "renk", kind: "BOYUT", permissions: OTURUM },
  { name: "depo", kind: "BOYUT", permissions: OTURUM },
  { name: "istasyon", kind: "BOYUT", permissions: OTURUM },
  { name: "cari-kart", kind: "BOYUT", permissions: OTURUM, subRows: ["kisisel"], forbiddenRootFields: ["yetkili", "telefon"] },
  { name: "sube", kind: "BOYUT", permissions: OTURUM },
  { name: "fason-firma", kind: "BOYUT", permissions: OTURUM },
  // ---- OLGU ----
  {
    name: "siparis",
    kind: "OLGU",
    permissions: ["bulut:siparis:oku"],
    retentionFields: ["siparisTarihi"],
    sortFields: ["siparisTarihi", "olusturulma"],
    forbiddenRootFields: ["tutar"],
  },
  {
    name: "siparis-kalemi",
    kind: "OLGU",
    permissions: ["bulut:siparis:oku"],
    retentionFields: ["olusturulma"],
    sortFields: ["olusturulma"],
    forbiddenRootFields: ["birimFiyat"],
    parent: parentOf("siparis-kalemi"),
  },
  { name: "sevkiyat", kind: "OLGU", permissions: ["bulut:sevkiyat:oku"], retentionFields: ["cikisTarihi", "olusturulma"], sortFields: ["cikisTarihi", "olusturulma"] },
  { name: "dogrudan-sevk", kind: "OLGU", permissions: ["bulut:sevkiyat:oku"], retentionFields: ["cikisTarihi", "olusturulma"], sortFields: ["cikisTarihi", "olusturulma"] },
  { name: "cuval", kind: "OLGU", permissions: ["bulut:sevkiyat:oku"], retentionFields: ["olusturulma"], sortFields: ["olusturulma"] },
  { name: "is-emri", kind: "OLGU", permissions: ["bulut:uretim:oku"], retentionFields: ["olusturulma"], sortFields: ["olusturulma"] },
  // M2a (Adnan'a özgü): iade satırı (top başına); sevkten düşülmez, ayrı belge.
  { name: "iade", kind: "OLGU", permissions: ["bulut:sevkiyat:oku"], retentionFields: ["olusturulma"], sortFields: ["olusturulma"] },
  // ---- ANLIK (tek satır; her turda bütünüyle yeniden hesaplanır) ----
  { name: "ozet.stok", kind: "ANLIK", permissions: ["bulut:ozet:oku", "bulut:stok:oku"] },
  { name: "ozet.siparis", kind: "ANLIK", permissions: ["bulut:ozet:oku", "bulut:siparis:oku"] },
  { name: "ozet.uretim", kind: "ANLIK", permissions: ["bulut:ozet:oku", "bulut:uretim:oku"] },
  { name: "ozet.sevkiyat", kind: "ANLIK", permissions: ["bulut:ozet:oku", "bulut:sevkiyat:oku"] },
  { name: "ozet.fason", kind: "ANLIK", permissions: ["bulut:ozet:oku", "bulut:uretim:oku"] },
  { name: "fason-acik", kind: "ANLIK", permissions: ["bulut:uretim:oku"] },
  { name: "stok-karnesi", kind: "ANLIK", permissions: ["bulut:stok:oku"] },
  // Adnan'a özgü: stok kalem listesi + raftaki toplar (ham · bitmiş); uygulama Stok ekranında okur.
  { name: "stok-kalem", kind: "ANLIK", permissions: ["bulut:stok:oku"] },
  { name: "acik-siparis-karsilama", kind: "ANLIK", permissions: ["bulut:siparis:oku"] },
  { name: "rapor-katalogu", kind: "ANLIK", permissions: OTURUM },
  { name: "uretim-akisi", kind: "ANLIK", permissions: ["bulut:uretim:oku"] },
  { name: "tesis", kind: "ANLIK", permissions: OTURUM },
  // M2a (Adnan'a özgü): müşteri → özet haritası; uygulama tek müşteriyi `GET /api/cari-ozeti/:cariKartId` ile okur.
  { name: "cari-ozeti", kind: "ANLIK", permissions: ["bulut:siparis:oku"] },
];

export interface ProjectionDef {
  /** Tam ad (`siparis` · `cari-kart.kisisel` · `ozet.stok`). */
  readonly name: string;
  readonly root: RootProjection;
  /** Alt satırsa türü; kök ya da ANLIK ise null. */
  readonly subRow: SubRow | null;
  readonly permissions: readonly CloudPermission[];
}

/** Alt satır (`.kisisel`) kökün izinleri + kişisel kolon izni ister. */
function subRowPermissions(root: RootProjection): readonly CloudPermission[] {
  return [...new Set<CloudPermission>([...root.permissions, KISISEL_KOLONU])];
}

function buildCatalog(): ReadonlyMap<string, ProjectionDef> {
  const out = new Map<string, ProjectionDef>();
  for (const root of ROOT_PROJECTIONS) {
    if (out.has(root.name)) throw new Error(`Projeksiyon kataloğunda tekrar: ${root.name}`);
    if (root.permissions.length === 0) throw new Error(`Projeksiyon izinsiz: ${root.name}`);
    out.set(root.name, { name: root.name, root, subRow: null, permissions: root.permissions });
    for (const sub of root.subRows ?? []) {
      const name = `${root.name}.${sub}`;
      out.set(name, { name, root, subRow: sub, permissions: subRowPermissions(root) });
    }
  }
  for (const def of out.values()) {
    const parent = def.root.parent;
    if (parent && !out.has(parent.projection)) throw new Error(`Ebeveyn projeksiyon katalogda yok: ${parent.projection}`);
    if (!def.subRow && Boolean(parent) !== (def.root.name in RECONCILE_PARENTS)) throw new Error(`Ebeveyn bağı sözleşmeyle uyuşmuyor: ${def.root.name}`);
  }
  // Sözleşme (fabrikayla bayt-eşit) Adnan'da olmayan finans/teklif çiftlerini de taşır: çocuk ancak ebeveyniyle
  // BİRLİKTE katalog dışı olabilir; ebeveyni katalogda olan çocuğun eksikliği tutarsızlıktır.
  for (const [child, rule] of Object.entries(RECONCILE_PARENTS)) {
    if (!out.has(child) && out.has(rule.parent)) throw new Error(`Sözleşmedeki çocuk katalogda yok: ${child}`);
  }
  return out;
}

/** Açılışta kurulur: tutarsız katalog sunucuyu KALDIRMAZ (fail-closed). */
export const PROJECTION_CATALOG: ReadonlyMap<string, ProjectionDef> = buildCatalog();

export function projectionDef(name: string): ProjectionDef | undefined {
  return PROJECTION_CATALOG.get(name);
}

/** Hesabın okuyabileceği projeksiyon adları (izin kümesi ⊇ gereken). */
export function readableProjections(permissions: ReadonlySet<CloudPermission>): string[] {
  const out: string[] = [];
  for (const def of PROJECTION_CATALOG.values()) if (def.permissions.every((p) => permissions.has(p))) out.push(def.name);
  return out;
}

/** Katalogdaki bütün adlar (bakım/eşitleme kapsamı; `*` yerine açık liste). */
export function allProjectionNames(): string[] {
  return [...PROJECTION_CATALOG.keys()];
}

/** Satırın ilk dolu ISO alanı (saklama/sıralama tarihi); biçimsizse yok sayılır. */
export function firstDate(data: Readonly<Record<string, unknown>>, fields: readonly string[] | undefined): Date | null {
  for (const f of fields ?? []) {
    const v = data[f];
    if (typeof v !== "string" || v.length === 0) continue;
    const ms = Date.parse(v);
    if (Number.isFinite(ms)) return new Date(ms);
  }
  return null;
}
