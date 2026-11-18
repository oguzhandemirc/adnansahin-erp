// Sevkiyat ayrıntısının künye ÖZETİ (2026-11-19, kullanıcı: "compact yap, yormasın"): tek küçük kart, en çok iki satır.
// 1. satır: müşteri adı (kalın, tek satır) · durum rozeti · künyeyi genişlet/daralt oku. 2. satır: birimli kısa değerler
// "18.11.2026 · 3.386 m · 142 top · 12 çuval · 680 kg" (tarih başta). Her değer `sevkiyat` kaydının KENDİ alanıdır
// (metre/top BRÜT, fabrikanın saydığı); burada hesap yok. Değeri gelmeyen parça hiç yazılmaz ("— kg" yok); kg yalnız
// sıfırdan büyükse yazılır (tartılmamış sevkiyatın `toplamKg`sı 0 gelir — sıfır kg bir ölçüm değildir).
import Ionicons from "@expo/vector-icons/Ionicons";
import { Text, View } from "react-native";
import { formatDate, formatNumber } from "../../lib/format";
import { Basilabilir } from "../hareket";
import { Rozet } from "../ortak";
import { num, qty, str, type Obj } from "../pano/read";
import { makeStyles, useTokens } from "../theme-context";
import { FONT_SCALE, TOUCH, space, typography } from "../tokens";
import { sevkDurumu } from "./durum";

const AYLAR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"] as const;

/** "18.11.2026" → "18 Kasım" (okuma etiketi; gün tesis diliminden, `formatDate` üzerinden). */
function okunurGun(iso: unknown): string | null {
  const m = /^(\d{2})\.(\d{2})\.\d{4}$/.exec(formatDate(iso));
  if (!m) return null;
  return `${Number(m[1])} ${AYLAR[Number(m[2]) - 1] ?? ""}`.trim();
}

export interface KunyeOzetParcasi {
  readonly key: "tarih" | "metre" | "top" | "cuval" | "kg";
  readonly metin: string;
  readonly okunus: string;
}

export interface KunyeOzeti {
  readonly musteri: string;
  readonly durum: ReturnType<typeof sevkDurumu>;
  readonly parcalar: readonly KunyeOzetParcasi[];
  /** Tek cümlelik okuma etiketi. */
  readonly okuma: string;
}

/** SAF: kayıttan özet satırları. Sıra sabit: tarih · metre · top · çuval · kg. */
export function sevkKunyeOzeti(k: Obj): KunyeOzeti {
  const durum = sevkDurumu(k.durum);
  const musteri = str(k.musteriAdi) ?? str(k.sevkNo) ?? "—";
  const parcalar: KunyeOzetParcasi[] = [];
  const tarih = str(k.cikisTarihi);
  if (tarih) parcalar.push({ key: "tarih", metin: formatDate(tarih), okunus: okunurGun(tarih) ?? formatDate(tarih) });
  const metre = num(k.toplamMetre);
  if (metre !== null) parcalar.push({ key: "metre", metin: `${qty(metre)} m`, okunus: `${qty(metre)} metre` });
  const top = num(k.topSayisi);
  if (top !== null) parcalar.push({ key: "top", metin: `${formatNumber(top, 0)} top`, okunus: `${formatNumber(top, 0)} top` });
  const cuval = num(k.cuvalSayisi);
  if (cuval !== null) parcalar.push({ key: "cuval", metin: `${formatNumber(cuval, 0)} çuval`, okunus: `${formatNumber(cuval, 0)} çuval` });
  const kg = num(k.toplamKg);
  if (kg !== null && kg > 0) parcalar.push({ key: "kg", metin: `${qty(kg)} kg`, okunus: `${qty(kg)} kilogram` });
  const okuma = [durum.label, musteri, ...parcalar.map((p) => p.okunus)].join(", ");
  return { musteri, durum, parcalar, okuma };
}

export function KunyeOzeti({ kayit, acik, onDegistir }: { readonly kayit: Obj; readonly acik: boolean; readonly onDegistir: () => void }) {
  const t = useTokens();
  const s = useStyles();
  const o = sevkKunyeOzeti(kayit);
  return (
    <View style={s.kart} testID="sevk-kunye-ozet">
      <View style={s.ust}>
        <View style={s.sol} accessible accessibilityLabel={o.okuma} testID="sevk-kunye-okuma">
          <Text style={s.musteri} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title} testID="sevk-kunye-musteri">{o.musteri}</Text>
          <Rozet label={o.durum.label} tone={o.durum.ton} icon={o.durum.icon} testID="sevk-kunye-durum" />
        </View>
        <Basilabilir
          onPress={onDegistir}
          style={s.ok}
          accessibilityRole="button"
          accessibilityLabel={acik ? "Künyeyi daralt" : "Künyeyi genişlet"}
          accessibilityState={{ expanded: acik }}
          testID="sevk-kunye-genislet"
        >
          <Ionicons name={acik ? "chevron-up" : "chevron-down"} size={18} color={t.color.textMuted} />
        </Basilabilir>
      </View>
      {o.parcalar.length > 0 ? (
        <Text style={s.degerler} numberOfLines={2} maxFontSizeMultiplier={FONT_SCALE.title} testID="sevk-kunye-degerler" importantForAccessibility="no">
          {o.parcalar.map((p, i) => (
            <Text key={p.key} testID={`sevk-kunye-${p.key}`}>{i > 0 ? <Text style={s.ayrac}>{"  ·  "}</Text> : null}{p.metin}</Text>
          ))}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  kart: {
    backgroundColor: t.color.card, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.cardBorder,
    paddingLeft: space.m, paddingRight: space.xs, paddingVertical: 10, marginTop: space.xs,
  },
  ust: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, minHeight: 28 },
  sol: { flex: 1, minWidth: 0, flexDirection: "row" as const, alignItems: "center" as const, gap: space.s },
  musteri: { ...typography.headline, color: t.color.text, flexShrink: 1 },
  // Görsel ok küçük; dokunma alanı TOUCH (kart yüksekliğini şişirmemek için negatif dikey pay).
  ok: { width: TOUCH, height: TOUCH, marginVertical: -10, alignItems: "center" as const, justifyContent: "center" as const },
  degerler: { ...typography.footnote, color: t.color.text, marginTop: 2, paddingRight: space.s },
  ayrac: { color: t.color.textMuted },
}));
