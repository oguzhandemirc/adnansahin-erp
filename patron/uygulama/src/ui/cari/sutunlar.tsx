// Cariler tablosunun sütunları ve `tablo.cari-kart` tercihinin TEK temizleyicisi (liste ve cari kartı aynı tercihi tutar:
// liste sütunları + kartın `suzgec.detayKartlar` seçimi). Eklenen sütunlar (2026-11-17: sevk yönü · yetkili · telefon ·
// kayıt tarihi) seçicide KAPALI gelir — varsayılan görünüm değişmez. Hepsi telin kendi alanı; hesap yok. Bakiye/ödeme
// YOK (finans buluta gitmez). Yetkili/telefon kişisel alt satırdır: izni olmayana `kisisel` gelmez → "—".
import { Text, View } from "react-native";
import type { ProjectionRecord } from "../../api/wire";
import { formatDate } from "../../lib/format";
import { CARI_ROLES, cariRoles, destinationLabel } from "../../lib/labels/siparis";
import { Rozet, type RozetTonu } from "../ortak";
import { asObj, str } from "../siparis/OrderRow";
import { AZAMI_SUTUN, tercihiTemizle, type SutunTanimi, type TabloTercihi } from "../tablo/model";
import { useTokens } from "../theme-context";
import { space, typography } from "../tokens";

const k = (r: ProjectionRecord) => asObj(r.kayit);
const kisisel = (r: ProjectionRecord) => asObj(r.kisisel);
const ROL_TONU: Readonly<Record<string, RozetTonu>> = { musteriRolu: "primary", tedarikciRolu: "info", fasonRolu: "warning" };

/** Dar sütunda tek rozet: ilk rol + kalan rol sayısı ("+1"); tam liste erişilebilirlik etiketinde. */
function RolHucresi({ r }: { r: ProjectionRecord }) {
  const t = useTokens();
  const roller = cariRoles(k(r));
  if (roller.length === 0) return <Text style={[typography.subhead, { color: t.textSecondary }]}>—</Text>;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, minWidth: 0 }}>
      <Rozet label={roller[0]!.label} tone={ROL_TONU[roller[0]!.key] ?? "soft"} />
      {roller.length > 1 ? <Text style={[typography.caption, { color: t.textSecondary }]}>{`+${roller.length - 1}`}</Text> : null}
    </View>
  );
}

export const CARI_SUTUNLARI: readonly SutunTanimi<ProjectionRecord>[] = [
  { key: "ad", baslik: "Ad", ad: "Cari adı", agirlik: 2, sirala: "ad", hucre: (r) => str(k(r).ad) ?? "—" },
  { key: "kod", baslik: "Kod", ad: "Cari kodu", agirlik: 1, kirpilmaz: 13, sirala: "kod", hucre: (r) => str(k(r).kod) ?? "—" },
  { key: "il", baslik: "İl", agirlik: 1, sirala: "il", hucre: (r) => str(k(r).il) ?? "—" },
  { key: "ilce", baslik: "İlçe", agirlik: 1, sirala: "ilce", hucre: (r) => str(k(r).ilce) ?? "—" },
  { key: "ulke", baslik: "Ülke", agirlik: 1, sirala: "ulke", hucre: (r) => str(k(r).ulke) ?? "—" },
  // 2026-11-20: kalan sütunlar da SUNUCUDA sıralanır; başlık yalnız bulut `/oturum` `liste.siralama`da alanı beyan
  // ediyorsa açılır (eski bulut / kişisel izni olmayan hesap → o sütun sıralanmaz). Rol/Durum bulutta bayrak sırası.
  { key: "rol", baslik: "Rol", agirlik: 1.3, sirala: "rol", hucre: (r) => cariRoles(k(r)).map((x) => x.label).join(", ") || "—", ogeler: (r) => <RolHucresi r={r} />,
    // İlk rol rozeti + "+n" (aralık 4 + 12 pt iki karakter ≈ 20 pt pay).
    rozet: { etiketler: CARI_ROLES.map((x) => x.label), metin: (r) => cariRoles(k(r))[0]?.label ?? "—", ek: 20 } },
  { key: "durum", baslik: "Durum", agirlik: 0.9, sirala: "aktif", hucre: (r) => (k(r).aktif === false ? "Pasif" : "Aktif") },
  // 2026-11-17 eklenenler (KAPALI gelir).
  { key: "yon", baslik: "Sevk yönü", ad: "Varsayılan sevk yönü", agirlik: 1, sirala: "varsayilanYon", hucre: (r) => (str(k(r).varsayilanYon) ? destinationLabel(k(r).varsayilanYon) : "—") },
  { key: "yetkili", baslik: "Yetkili", agirlik: 1.4, satir: 2, sirala: "yetkili", hucre: (r) => str(kisisel(r).yetkili) ?? "—" },
  { key: "telefon", baslik: "Telefon", agirlik: 1.3, sirala: "telefon", hucre: (r) => str(kisisel(r).telefon) ?? "—" },
  { key: "kayit", baslik: "Kayıt", ad: "Kayıt tarihi", agirlik: 0.9, sirala: "olusturulma", hucre: (r) => (str(k(r).olusturulma) ? formatDate(k(r).olusturulma) : "—") },
];

export const CARI_VARSAYILAN_SUTUN: readonly string[] = ["ad", "il", "rol"];

export const CARI_TABLO_AYARI = {
  projeksiyon: "cari-kart",
  anahtar: "tablo.cari-kart",
  sutunlar: CARI_SUTUNLARI,
  varsayilan: CARI_VARSAYILAN_SUTUN,
  aramaIpucu: "Ad ya da kod",
  testID: "cari",
} as const;

const VARSAYILAN: TabloTercihi = { surum: 1, sutunlar: CARI_VARSAYILAN_SUTUN, siralama: null, suzgec: {} };
const ANAHTARLAR = CARI_SUTUNLARI.map((c) => c.key);
/** `useVeriTablosu`nun bu tablo için kurduğu temizleyiciyle AYNI (cari kartı sütunları bozmadan kart alanını yazar). */
export const cariTemizle = (ham: unknown): TabloTercihi => tercihiTemizle(ham, { varsayilan: VARSAYILAN, sutunlar: ANAHTARLAR, azami: AZAMI_SUTUN });
