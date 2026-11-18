// Yerinde sesli giriş parçaları (2026-11-18): ayrı ses ekranı YOK. Her adımın araç satırında aynı yerde aynı mikrofon
// düğmesi; basınca aynı ekranda küçük dinleme şeridi (durum, canlı metin, ses düzeyi); liste alanında söylenen ad
// düzeltilebilir kutuda görünür ve adaylar en benzerden sıralanır (en iyisi vurgulu, seçim kullanıcının dokunuşu).
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { Sirali } from "../../ses/eslestir";
import { SES_HATA_METNI } from "../../ses/tanima";
import { BASMA } from "../hareket/sabitler";
import { ListeBlogu, ListeSatiri, SecimCipi } from "../ortak";
import { SearchField } from "../siparis/parts";
import { makeStyles, useTokens } from "../theme-context";
import { FONT_SCALE, TOUCH, space, typography } from "../tokens";
import type { Dinleme } from "./useYerindeSes";

/** Mikrofon düğmesi: her adımda aynı görünüm; dinlerken "Durdur"a döner. */
export function MikrofonDugmesi(p: { readonly dinliyor: boolean; readonly onPress: () => void; readonly etiket: string; readonly disabled?: boolean; readonly testID?: string }) {
  const t = useTokens();
  const s = useStyles();
  return (
    <Pressable
      onPress={p.onPress}
      disabled={p.disabled}
      accessibilityRole="button"
      accessibilityLabel={p.dinliyor ? "Dinlemeyi durdur" : `Sesle söyle: ${p.etiket}`}
      accessibilityState={{ disabled: !!p.disabled }}
      testID={p.testID ?? "ses-mikrofon"}
      hitSlop={6}
      style={({ pressed }) => [s.mik, { backgroundColor: p.dinliyor ? t.color.danger.fg : t.tint, opacity: p.disabled ? 0.5 : pressed ? BASMA.opaklik : 1 }]}
    >
      <Ionicons name={p.dinliyor ? "stop" : "mic"} size={20} color={t.onTint} />
      <Text style={[s.mikYazi, { color: t.onTint }]} maxFontSizeMultiplier={FONT_SCALE.title}>{p.dinliyor ? "Durdur" : "Sesle söyle"}</Text>
    </Pressable>
  );
}

export interface HedefSecenegi<K extends string> {
  readonly key: K;
  readonly label: string;
}

/**
 * Adımın araç satırı: solda neyin söyleneceği (tek alanlı adımda yazı, çok alanlı adımda alan çipleri), sağda mikrofon.
 * `children` dinleme şeridi ve sonuç paneli için (satırın hemen altında).
 */
export function SesAraci<K extends string>(p: {
  readonly ipucu: string;
  readonly secenekler?: readonly HedefSecenegi<K>[];
  readonly hedef?: K;
  readonly onHedef?: (k: K) => void;
  readonly dinliyor: boolean;
  readonly onMikrofon: () => void;
  readonly hazir: boolean;
  readonly mikrofonTestID?: string;
  readonly children?: ReactNode;
}) {
  const s = useStyles();
  const etiket = p.secenekler?.find((x) => x.key === p.hedef)?.label ?? p.ipucu;
  return (
    <View style={s.arac} testID="ses-arac">
      <View style={s.aracSatir}>
        <View style={s.flex}>
          <Text style={s.ipucu} numberOfLines={2} testID="ses-ipucu">{p.ipucu}</Text>
          {p.secenekler && p.secenekler.length > 1 ? (
            <View style={s.cipler} accessibilityRole="radiogroup" accessibilityLabel="Sesle doldurulacak alan">
              {p.secenekler.map((o) => (
                <SecimCipi key={o.key} label={o.label} on={o.key === p.hedef} rol="radio" onPress={() => p.onHedef?.(o.key)} testID={`ses-hedef-${o.key}`} />
              ))}
            </View>
          ) : null}
        </View>
        <MikrofonDugmesi dinliyor={p.dinliyor} onPress={p.onMikrofon} etiket={etiket} disabled={!p.hazir && !p.dinliyor} testID={p.mikrofonTestID} />
      </View>
      {p.children}
    </View>
  );
}

/** Dinleme şeridi: durum + canlı metin + ses düzeyi; hata yerinde, "Tekrar dene"li. Kapalı ve hatasızken çizilmez. */
export function DinlemeSeridi(p: { readonly durum: Dinleme; readonly onTekrar: () => void; readonly onKapat: () => void }) {
  const t = useTokens();
  const s = useStyles();
  const d = p.durum;
  if (d.hata) {
    return (
      <View style={[s.serit, { backgroundColor: t.status.kritik.bg }]} testID="ses-hata" accessibilityRole="alert">
        <Text style={[s.seritMetin, { color: t.status.kritik.text }]}>{SES_HATA_METNI[d.hata]}</Text>
        <View style={s.seritEylem}>
          <Pressable onPress={p.onKapat} accessibilityRole="button" accessibilityLabel="Kapat" testID="ses-hata-kapat" hitSlop={6} style={s.metinDugme}>
            <Text style={[s.metinDugmeYazi, { color: t.textSecondary }]}>Kapat</Text>
          </Pressable>
          {d.hata !== "izin-yok" && d.hata !== "desteklenmiyor" ? (
            <Pressable onPress={p.onTekrar} accessibilityRole="button" accessibilityLabel="Tekrar dene" testID="ses-tekrar" hitSlop={6} style={s.metinDugme}>
              <Text style={[s.metinDugmeYazi, { color: t.tint }]}>Tekrar dene</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }
  if (d.evre === "kapali") return null;
  const metin = d.evre === "hazirlaniyor" ? "Hazırlanıyor…" : d.evre === "dinliyor" ? "Dinliyorum…" : "Anlıyorum…";
  return (
    <View style={[s.serit, { backgroundColor: t.color.primarySoft }]} testID="ses-serit" accessibilityLiveRegion="polite">
      <View style={s.seritBas}>
        {d.evre === "dinliyor" ? <Ionicons name="mic" size={18} color={t.color.danger.fg} /> : <ActivityIndicator size="small" />}
        <Text style={[s.durum, { color: t.color.onPrimarySoft }]} testID="ses-durum">{metin}</Text>
        {d.evre === "dinliyor" ? (
          <View style={[s.duzey, { backgroundColor: t.surface }]} testID="ses-duzey">
            <View style={[s.duzeyDolu, { width: `${Math.round(Math.max(0.05, d.duzey) * 100)}%`, backgroundColor: t.color.danger.fg }]} />
          </View>
        ) : null}
      </View>
      {d.ara ? <Text style={[s.seritMetin, { color: t.text }]} testID="ses-ara" numberOfLines={3}>{`“${d.ara}”`}</Text> : null}
    </View>
  );
}

/**
 * Liste alanının sesli sonucu: duyulan metin düzeltilebilir kutuda; adaylar en benzerden, en iyisi "En yakın" vurgulu.
 * Seçim yalnız dokunuşla. `alt`: aday listesinin altındaki kısayol (ör. "‘X’ adıyla yeni cari oluştur").
 */
export function SesAdaylari(p: {
  readonly baslik: string;
  readonly metin: string;
  readonly onMetin: (m: string) => void;
  readonly sirali: readonly Sirali[];
  readonly guclu: boolean;
  readonly onSec: (id: string, title: string) => void;
  readonly onKapat: () => void;
  readonly alt?: ReactNode;
  readonly bos?: string;
}) {
  const t = useTokens();
  const s = useStyles();
  return (
    <View style={[s.panel, { backgroundColor: t.surface, borderColor: t.separator }]} testID="ses-adaylar">
      <View style={s.panelBas}>
        <Text style={s.panelBaslik} accessibilityRole="header">{p.baslik}</Text>
        <Pressable onPress={p.onKapat} accessibilityRole="button" accessibilityLabel="Sesli sonucu kapat" testID="ses-adaylar-kapat" hitSlop={8} style={s.kapat}>
          <Ionicons name="close" size={22} color={t.textMuted} />
        </Pressable>
      </View>
      <SearchField value={p.metin} onChangeText={p.onMetin} placeholder="Duyulan ad (düzeltebilirsiniz)" testID="ses-duyulan" accessibilityLabel="Duyulan ad, düzeltilebilir" />
      {p.sirali.length > 0 ? (
        <ListeBlogu>
          {p.sirali.map((x, i) => {
            const enYakin = i === 0;
            return (
              <ListeSatiri
                key={x.aday.id}
                testID={`ses-aday-${x.aday.id}`}
                birincil={x.aday.title}
                ikincil={x.aday.kod}
                ayrac={i > 0}
                onPress={() => p.onSec(x.aday.id, x.aday.title)}
                accessibilityLabel={`${enYakin ? "En yakın: " : ""}${x.aday.title}, seçmek için dokunun`}
                rozet={enYakin ? (
                  <View style={[s.rozet, { backgroundColor: p.guclu ? t.status.iyi.bg : t.color.primarySoft }]} testID="ses-en-yakin">
                    <Text style={[s.rozetYazi, { color: p.guclu ? t.status.iyi.text : t.color.onPrimarySoft }]}>En yakın</Text>
                  </View>
                ) : undefined}
              />
            );
          })}
        </ListeBlogu>
      ) : (
        <Text style={[s.bos, { color: t.textSecondary }]} testID="ses-aday-yok">{p.bos ?? "Benzer kayıt bulunamadı. Adı düzeltin ya da yeniden söyleyin."}</Text>
      )}
      {p.alt}
    </View>
  );
}

/** Tek satırlık sesli sonuç bildirimi (yazıldı / neden yazılmadı); kapatılabilir. */
export function SesBildirimi(p: { readonly ton: "bilgi" | "uyari"; readonly metin: string; readonly onKapat: () => void; readonly children?: ReactNode }) {
  const t = useTokens();
  const s = useStyles();
  const c = p.ton === "uyari" ? t.status.uyari : t.status.iyi;
  return (
    <View style={[s.serit, { backgroundColor: c.bg }]} testID={p.ton === "uyari" ? "ses-uyari" : "ses-bilgi"} accessibilityLiveRegion="polite">
      <View style={s.seritBas}>
        <Ionicons name={p.ton === "uyari" ? "alert-circle" : "checkmark-circle"} size={18} color={c.fill} />
        <Text style={[s.seritMetin, s.flex, { color: c.text }]}>{p.metin}</Text>
        <Pressable onPress={p.onKapat} accessibilityRole="button" accessibilityLabel="Kapat" testID="ses-bildirim-kapat" hitSlop={8} style={s.kapat}>
          <Ionicons name="close" size={18} color={c.text} />
        </Pressable>
      </View>
      {p.children}
    </View>
  );
}

/** Sesle dolan alanın sade işareti (elle değişince kalkar). */
export function SesIsareti() {
  const s = useStyles();
  const t = useTokens();
  return (
    <View style={[s.isaret, { backgroundColor: t.color.primarySoft }]} testID="ses-isaret">
      <Ionicons name="mic" size={14} color={t.color.onPrimarySoft} />
      <Text style={[s.isaretYazi, { color: t.color.onPrimarySoft }]}>Sesle dolduruldu — kontrol edin</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  flex: { flex: 1 },
  arac: { gap: space.s, marginBottom: space.m },
  aracSatir: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m },
  ipucu: { ...typography.footnote, color: t.textSecondary },
  cipler: { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: space.s, marginTop: space.xs },
  mik: { minHeight: TOUCH, minWidth: 128, flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: space.xs, paddingHorizontal: space.m, borderRadius: TOUCH / 2 },
  mikYazi: { ...typography.headline },
  serit: { padding: space.m, borderRadius: 12, gap: space.xs },
  seritBas: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s },
  seritMetin: { ...typography.body },
  seritEylem: { flexDirection: "row" as const, justifyContent: "flex-end" as const, gap: space.m },
  durum: { ...typography.headline },
  duzey: { flex: 1, height: 8, borderRadius: 4, overflow: "hidden" as const },
  duzeyDolu: { height: 8, borderRadius: 4 },
  metinDugme: { minHeight: TOUCH - 8, justifyContent: "center" as const, paddingHorizontal: space.s },
  metinDugmeYazi: { ...typography.headline },
  panel: { borderWidth: 1, borderRadius: 12, padding: space.m, gap: space.s },
  panelBas: { flexDirection: "row" as const, alignItems: "center" as const },
  panelBaslik: { ...typography.headline, color: t.text, flex: 1 },
  kapat: { width: TOUCH - 12, height: TOUCH - 12, alignItems: "center" as const, justifyContent: "center" as const },
  rozet: { paddingHorizontal: space.s, paddingVertical: 2, borderRadius: 8 },
  rozetYazi: { ...typography.footnote, fontWeight: "700" as const },
  bos: { ...typography.body },
  isaret: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, alignSelf: "flex-start" as const, paddingHorizontal: space.s, paddingVertical: 2, borderRadius: 8, marginBottom: space.s },
  isaretYazi: { ...typography.footnote },
}));
