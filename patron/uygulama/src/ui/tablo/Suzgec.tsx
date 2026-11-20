// Süzgeç (2026-11-19 yeniden tasarım, kullanıcının sözü: "filtreye tıklayınca alanlar tek tek çıkar, tıklayınca kendi
// seçenekleri açılır, seçenekler arasından da arayabilirim"). Bütün tablolarda TEK bileşen; alanlar tabloya göre VERİ
// olarak gelir (`SuzgecGrubu[]`):
//   1. düzey — sade ALAN LİSTESİ: alan adı · sağında seçili değer özeti ("PANOS, KREP" / "Tümü") · ok. Üstte "Temizle",
//      altta sabit "Sonuçları göster (N)" (N yalnız sayı bilinirse: istemcide süzülen tam belge) ya da "Uygula".
//   2. düzey — alanın SEÇENEKLERİ aynı sayfada: geri oku, otomatik odaklı arama (Türkçe harf katlamalı `katla`), seçili
//      olanlar başta, uzun liste sanallaştırılır (FlatList). Tek seçimli alanda seçim alan listesine döner.
// Seçim TASLAKTIR: "Uygula"/"Sonuçları göster" işler; dışarı dokunmak/aşağı çekmek/geri tuşu vazgeçer. Süzme sayfanın işi değildir
// (sunucu listesi `?suzgec=`, anlık belge istemcide). Etkin süzgeçler tablonun üstünde çip (`EtkinSuzgecler`), sonuç
// yoksa `SuzgecBos`. Geçiş animasyonsuz (Hareketi azalt'a kendiliğinden uyar).
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useMemo, useState } from "react";
import { Animated, FlatList, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { Tutamak, useAsagiCekKapat } from "../AsagiCekKapat";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { katla } from "../../ses/metin";
import { haptic } from "../haptics";
import { BASMA } from "../hareket/sabitler";
import { BosDurum } from "../ortak/Durumlar";
import { SearchField } from "../siparis/parts";
import { makeStyles, useTokens } from "../theme-context";
import { FONT_SCALE, space, tabularNums, typography } from "../tokens";
import { gecerliDegerler, gecerliSecim, secenekDegistir, secenekleriSuz, secimOzeti, suzgecAta, type SuzgecGrubu } from "./model";
import { TarihSecenekleri } from "./TarihSuzgeci";

/** Dokunma hedefi (≥ 44). */
const SATIR = 48;
/** Bu kadar seçenekten azsa arama kutusu gösterilmez (iki-üç seçenekte arama gürültüdür). */
export const ARAMA_ESIGI = 8;

export function SuzgecSayfasi(p: {
  readonly visible: boolean;
  readonly gruplar: readonly SuzgecGrubu[];
  /** Saklı seçim (anahtar → değer(ler)); yalnız `gruplar`daki geçerli değerler okunur. */
  readonly secim: Readonly<Record<string, string>>;
  /** Taslağı işler (yalnız bu gruplar; dönen nesnede olmayan grup kaldırılmıştır). */
  readonly onUygula: (secim: Readonly<Record<string, string>>) => void;
  readonly onClose: () => void;
  /** Taslağın sonuç sayısı — yalnız istemci tam belgeyi süzüyorsa (anlık); sunucu listesinde verilmez → "Uygula". */
  readonly sayac?: (taslak: Readonly<Record<string, string>>) => number;
  readonly testID: string;
}) {
  const t = useTokens();
  const s = useStyles();
  const insets = useSafeAreaInsets();
  // Tutma çubuğu + başlıktan aşağı çekince kapanır (liste kaydırması bozulmaz).
  const cek = useAsagiCekKapat(p.onClose, p.visible);
  const [taslak, setTaslak] = useState<Readonly<Record<string, string>>>({});
  const [alan, setAlan] = useState<string | null>(null);
  const [ara, setAra] = useState("");
  // Her açılışta taslak saklı seçimden başlar, alan listesinden açılır.
  useEffect(() => {
    if (!p.visible) return;
    setTaslak(gecerliSecim(p.gruplar, p.secim));
    setAlan(null);
    setAra("");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız açılışta
  }, [p.visible]);
  const grup = alan ? p.gruplar.find((g) => g.anahtar === alan) ?? null : null;
  const herhangi = Object.keys(gecerliSecim(p.gruplar, taslak)).length > 0;
  const n = p.sayac ? p.sayac(gecerliSecim(p.gruplar, taslak)) : null;
  const uygula = () => {
    haptic("selection");
    p.onUygula(gecerliSecim(p.gruplar, taslak));
    p.onClose();
  };
  const geri = () => {
    setAlan(null);
    setAra("");
  };
  return (
    <Modal visible={p.visible} transparent animationType="fade" onRequestClose={grup ? geri : p.onClose}>
      <View style={s.backdrop}>
        <Pressable style={[s.scrim, { backgroundColor: t.color.scrim, opacity: t.scheme === "dark" ? 0.7 : 0.4 }]} onPress={p.onClose} accessibilityRole="button" accessibilityLabel="Vazgeç" testID={`${p.testID}-kapat`} />
        <Animated.View style={[s.sheet, cek.kayma, { paddingBottom: insets.bottom + space.m }]} accessibilityViewIsModal testID={p.testID}>
          <View {...cek.panHandlers}><Tutamak onClose={p.onClose} testID={`${p.testID}-tutamak`} /></View>
          <View style={s.head} {...cek.panHandlers}>
            {grup ? (
              <Pressable onPress={geri} hitSlop={8} style={s.geri} accessibilityRole="button" accessibilityLabel="Alanlara dön" testID={`${p.testID}-geri`}>
                <Ionicons name="chevron-back" size={24} color={t.tint} />
              </Pressable>
            ) : (
              <Pressable onPress={p.onClose} hitSlop={8} style={s.geri} accessibilityRole="button" accessibilityLabel="Vazgeç" testID={`${p.testID}-vazgec`}>
                <Ionicons name="close" size={24} color={t.textSecondary} />
              </Pressable>
            )}
            <Text style={s.title} accessibilityRole="header" numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{grup ? grup.etiket : "Süzgeç"}</Text>
            {herhangi && !grup ? (
              <Pressable onPress={() => setTaslak({})} hitSlop={8} style={s.ustDugme} accessibilityRole="button" testID={`${p.testID}-temizle`}>
                <Text style={[s.ustYazi, { color: t.tint }]}>Temizle</Text>
              </Pressable>
            ) : grup && gecerliDegerler(grup, taslak[grup.anahtar]).length > 0 ? (
              <Pressable onPress={() => setTaslak((x) => suzgecAta(x, grup.anahtar, []))} hitSlop={8} style={s.ustDugme} accessibilityRole="button" accessibilityLabel={`${grup.etiket} seçimini temizle`} testID={`${p.testID}-${grup.anahtar}-temizle`}>
                <Text style={[s.ustYazi, { color: t.tint }]}>Temizle</Text>
              </Pressable>
            ) : <View style={s.ustDugme} />}
          </View>
          {grup?.tur === "tarih" ? (
            <TarihSecenekleri
              key={grup.anahtar} secili={gecerliDegerler(grup, taslak[grup.anahtar])[0]} testID={`${p.testID}-${grup.anahtar}`}
              onSec={(v) => {
                setTaslak((x) => suzgecAta(x, grup.anahtar, v ? [v] : []));
                geri();
              }}
            />
          ) : grup ? (
            <Secenekler
              grup={grup} secili={gecerliDegerler(grup, taslak[grup.anahtar])} ara={ara} setAra={setAra} testID={p.testID}
              onSec={(xs) => {
                setTaslak((x) => suzgecAta(x, grup.anahtar, xs));
                // Tek seçimli alanda seçim yapılınca alan listesine dönülür (bir dokunuş az).
                if (!grup.coklu) geri();
              }}
            />
          ) : (
            <ScrollView style={s.list} contentContainerStyle={s.listInner} testID={`${p.testID}-alanlar`}>
              {p.gruplar.map((g, i) => {
                const ozet = secimOzeti(g, taslak[g.anahtar]);
                const dolu = ozet !== "Tümü";
                return (
                  <Pressable
                    key={g.anahtar}
                    onPress={() => {
                      haptic("selection");
                      setAlan(g.anahtar);
                    }}
                    style={({ pressed }) => [s.alanSatiri, i > 0 && s.rowSep, pressed && { opacity: BASMA.opaklik }]}
                    accessibilityRole="button"
                    accessibilityLabel={`${g.etiket}: ${ozet}`}
                    accessibilityHint="Seçenekleri açar"
                    testID={`${p.testID}-alan-${g.anahtar}`}
                  >
                    <Text style={s.alanAdi} numberOfLines={1}>{g.etiket}</Text>
                    <Text style={[s.alanOzet, dolu && { color: t.tint, fontWeight: "600" as const }]} numberOfLines={1} testID={`${p.testID}-alan-${g.anahtar}-ozet`}>{ozet}</Text>
                    <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <Pressable onPress={uygula} style={({ pressed }) => [s.uygula, { backgroundColor: t.tint }, pressed && { opacity: BASMA.opaklik }]} accessibilityRole="button" testID={`${p.testID}-uygula`}>
            <Text style={[s.uygulaYazi, { color: t.onTint }]} maxFontSizeMultiplier={FONT_SCALE.title}>{n === null ? "Uygula" : `Sonuçları göster (${n})`}</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

function Secenekler(p: {
  readonly grup: SuzgecGrubu;
  readonly secili: readonly string[];
  readonly ara: string;
  readonly setAra: (v: string) => void;
  readonly onSec: (xs: string[]) => void;
  readonly testID: string;
}) {
  const t = useTokens();
  const s = useStyles();
  const { grup } = p;
  // Seçili olanların başa alınması açılış anındaki seçime göre: dokundukça satırlar yer değiştirmesin.
  const [ilkSecili] = useState(p.secili);
  const liste = useMemo(() => secenekleriSuz(grup, ilkSecili, p.ara, katla), [grup, ilkSecili, p.ara]);
  const aramali = grup.secenekler.length >= ARAMA_ESIGI;
  const tumu = p.secili.length === 0;
  return (
    <View style={s.secenekKap}>
      {aramali ? (
        <View style={s.aramaKap}>
          <SearchField value={p.ara} onChangeText={p.setAra} placeholder={`${grup.etiket} ara`} autoFocus testID={`${p.testID}-${grup.anahtar}-ara`} />
        </View>
      ) : null}
      <FlatList
        style={s.list}
        contentContainerStyle={s.listInner}
        data={liste}
        keyExtractor={(o) => o.deger}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        windowSize={7}
        testID={`${p.testID}-${grup.anahtar}-liste`}
        ListHeaderComponent={p.ara.trim() ? null : (
          <SecenekSatiri etiket="Tümü" on={tumu} coklu={!!grup.coklu} onPress={() => p.onSec([])} testID={`${p.testID}-${grup.anahtar}-tumu`} />
        )}
        ListEmptyComponent={<Text style={s.eslesmeYok} testID={`${p.testID}-${grup.anahtar}-eslesme-yok`}>{`"${p.ara.trim()}" ile eşleşen yok`}</Text>}
        renderItem={({ item, index }) => (
          <SecenekSatiri
            etiket={item.etiket} on={p.secili.includes(item.deger)} coklu={!!grup.coklu} ayrac={index > 0 || !p.ara.trim()}
            onPress={() => p.onSec(secenekDegistir(grup, p.secili, item.deger))}
            testID={`${p.testID}-${grup.anahtar}-${item.deger}`}
          />
        )}
      />
      {grup.coklu ? <Text style={[s.not, { color: t.textMuted }]}>Birden çok seçebilirsiniz</Text> : null}
    </View>
  );
}

export function SecenekSatiri(p: { readonly etiket: string; readonly on: boolean; readonly coklu: boolean; readonly ayrac?: boolean; readonly onPress: () => void; readonly testID: string }) {
  const t = useTokens();
  const s = useStyles();
  const isaret = p.coklu ? (p.on ? "checkbox" : "square-outline") : p.on ? "checkmark" : null;
  return (
    <Pressable
      onPress={() => {
        haptic("selection");
        p.onPress();
      }}
      style={({ pressed }) => [s.secenek, p.ayrac && s.rowSep, pressed && { opacity: BASMA.opaklik }]}
      accessibilityRole={p.coklu ? "checkbox" : "radio"}
      accessibilityState={p.coklu ? { checked: p.on } : { selected: p.on }}
      accessibilityLabel={p.etiket}
      testID={p.testID}
    >
      <Text style={[s.secenekYazi, p.on && { color: t.tint, fontWeight: "600" as const }]} numberOfLines={2}>{p.etiket}</Text>
      <View style={s.isaret}>{isaret ? <Ionicons name={isaret} size={22} color={p.on ? t.tint : t.textMuted} /> : null}</View>
    </Pressable>
  );
}

/**
 * Tablonun üstündeki etkin süzgeç çipleri: "Kumaş: PANOS ✕" (✕ o alanı kaldırır); birden çoksa yatay kayan tek satır ve
 * sonda "Temizle". Süzgeç yoksa hiç yer kaplamaz.
 */
export function EtkinSuzgecler(p: {
  readonly gruplar: readonly SuzgecGrubu[];
  readonly secim: Readonly<Record<string, string>>;
  readonly onKaldir: (anahtar: string) => void;
  readonly onTemizle: () => void;
  readonly testID: string;
}) {
  const t = useTokens();
  const s = useStyles();
  const etkin = p.gruplar.filter((g) => gecerliDegerler(g, p.secim[g.anahtar]).length > 0);
  if (etkin.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.ciplerKap} contentContainerStyle={s.cipler} keyboardShouldPersistTaps="handled" testID={`${p.testID}-etkin`}>
      {etkin.map((g) => {
        const ozet = secimOzeti(g, p.secim[g.anahtar]);
        return (
          <Pressable
            key={g.anahtar}
            onPress={() => {
              haptic("selection");
              p.onKaldir(g.anahtar);
            }}
            hitSlop={{ top: 6, bottom: 6 }}
            style={({ pressed }) => [s.cip, { borderColor: t.tint, backgroundColor: t.tintContainer }, pressed && { opacity: BASMA.opaklik }]}
            accessibilityRole="button"
            accessibilityLabel={`${g.etiket}: ${ozet} süzgecini kaldır`}
            testID={`${p.testID}-etkin-${g.anahtar}`}
          >
            <Text style={[s.cipYazi, { color: t.text }]} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>
              <Text style={{ color: t.textSecondary }}>{`${g.etiket}: `}</Text>
              {ozet}
            </Text>
            <Ionicons name="close" size={16} color={t.tint} />
          </Pressable>
        );
      })}
      {etkin.length > 1 ? (
        <Pressable onPress={p.onTemizle} hitSlop={{ top: 6, bottom: 6 }} style={s.cipTemizle} accessibilityRole="button" accessibilityLabel="Bütün süzgeçleri temizle" testID={`${p.testID}-etkin-temizle`}>
          <Text style={[s.cipYazi, { color: t.tint, fontWeight: "600" as const }]}>Temizle</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

/** Süzgece uyan kayıt yoksa: açık söz + tek dokunuşla süzgeci temizleme. */
export function SuzgecBos(p: { readonly onTemizle: () => void; readonly testID: string }) {
  return <BosDurum baslik="Bu süzgece uyan kayıt yok" icon="funnel-outline" eylem="Süzgeci temizle" onEylem={p.onTemizle} testID={p.testID} />;
}

const useStyles = makeStyles((t) => ({
  backdrop: { flex: 1, justifyContent: "flex-end" as const },
  scrim: { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 },
  // Telefonda neredeyse tam yükseklik alt sayfa (arama + uzun liste sığsın); tablette ortada en çok 560 pt.
  sheet: {
    backgroundColor: t.surface,
    borderTopLeftRadius: t.radius.sheet,
    borderTopRightRadius: t.radius.sheet,
    paddingHorizontal: space.l,
    paddingTop: space.s,
    height: "92%" as const,
    width: "100%" as const,
    maxWidth: 560,
    alignSelf: "center" as const,
    ...t.floatShadow,
  },
  grabber: { alignSelf: "center" as const, width: 36, height: 5, borderRadius: 3, backgroundColor: t.separator, marginBottom: space.xs },
  head: { flexDirection: "row" as const, alignItems: "center" as const, minHeight: SATIR, gap: space.s },
  geri: { width: 44, height: 44, alignItems: "center" as const, justifyContent: "center" as const, marginLeft: -space.s },
  title: { ...typography.headline, color: t.text, flex: 1 },
  ustDugme: { minWidth: 44, minHeight: 44, justifyContent: "center" as const, alignItems: "flex-end" as const },
  ustYazi: { ...typography.callout, fontWeight: "600" as const },
  list: { flex: 1, backgroundColor: t.surfaceAlt, borderRadius: t.radius.cardInner },
  listInner: { paddingVertical: space.xs },
  rowSep: { borderTopWidth: 1, borderTopColor: t.separator },
  alanSatiri: { minHeight: SATIR, flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, paddingLeft: space.l, paddingRight: space.m },
  alanAdi: { ...typography.body, color: t.text, flexShrink: 0, maxWidth: "45%" as const },
  alanOzet: { ...typography.body, color: t.textMuted, flex: 1, textAlign: "right" as const },
  secenekKap: { flex: 1, gap: space.s },
  aramaKap: {},
  secenek: { minHeight: SATIR, flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, paddingLeft: space.l, paddingRight: space.m },
  secenekYazi: { ...typography.body, color: t.text, flex: 1 },
  isaret: { width: 24, alignItems: "center" as const },
  eslesmeYok: { ...typography.footnote, color: t.textMuted, padding: space.l, textAlign: "center" as const },
  not: { ...typography.footnote },
  uygula: { minHeight: SATIR, borderRadius: t.radius.control, alignItems: "center" as const, justifyContent: "center" as const, marginTop: space.m },
  uygulaYazi: { ...typography.callout, fontWeight: "700" as const, ...tabularNums },
  ciplerKap: { flexGrow: 0, marginBottom: space.s },
  cipler: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.s, paddingRight: space.s },
  cip: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.xs, minHeight: 32, paddingHorizontal: space.m, borderRadius: 16, borderWidth: 1, maxWidth: 280 },
  cipYazi: { ...typography.footnote, flexShrink: 1 },
  cipTemizle: { minHeight: 32, justifyContent: "center" as const, paddingHorizontal: space.s },
}));
