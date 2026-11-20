// Alt sayfayı AŞAĞI ÇEKEREK kapatma (2026-11-20; kullanıcının sözü: "yukarıdan tuttum aşağı çektim kapansın; her zaman
// çarpıya basmak zorunda olmayayım"). Yeni paket yok: RN `PanResponder` + `Animated` (transform, yerel sürücü).
// Kullanım (2026-11-21, sayfanın HER YERİNDEN çekme; kullanıcı iPhone'da süzgeci gövdeden çekti, kapanmadı):
//   const cek = useAsagiCekKapat(onClose, visible);
//   <Animated.View style={[..., cek.kayma]} {...cek.govde}>        ← sayfa kabı: gövdenin her yerinden çekme
//     <View {...cek.tutamak}><Tutamak …/></View> + başlık {...cek.tutamak}  ← her zaman çeker
//     <ScrollView {...cek.liste}> / <FlatList {...cek.liste}>       ← sayfanın dikey listesi (varsa)
// Gövde çekmesi yalnız liste EN ÜSTTEYKEN (kaydırma ≤ 0) başlar; liste aşağıdayken hareket listenin kaydırmasıdır.
// Kaydırması olmayan sayfada `liste` bağlanmaz, bütün gövde çeker. Klavye açıkken gövdeden çekiş önce klavyeyi kapatır
// (o hareket sayfayı taşımaz). Eşik: `CEKME.mesafe` kadar çekiş YA DA hızlı fiske (`CEKME.hiz`) → kapanır; altında
// yerine yaylanır. Dokunmalar (düğmeler), yatay kaydırma ve metin girişi çalınmaz: yalnız belirgin, dikey baskın, aşağı
// hareket (`CEKME.baslangic`) çekmeyi başlatır. Karartıya dokunmak her sayfada ayrıca kapatır (sayfanın kendi işi).
// iOS'ta liste üstteyken sıçrama kapalıdır ve çekme sürerken liste kaydırması durur (sayfa ile liste birlikte kaymasın).
// Yeni Modal/alt sayfa bu kancaya bağlanır; bekçi `__tests__/asagi-cek-kapat.test.tsx` §8 (istisnalar açık listede).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated, Keyboard, PanResponder, Platform, View,
  type GestureResponderHandlers, type NativeScrollEvent, type NativeSyntheticEvent, type PanResponderGestureState,
} from "react-native";
import { useHareketAzalt } from "./hareket/azalt";
import { SURE, YAY } from "./hareket/sabitler";
import { makeStyles } from "./theme-context";
import { space } from "./tokens";

/** Eşikler: mesafe (pt) · fiske hızı (pt/ms) + en az fiske mesafesi · çekmeyi başlatan dikey hareket · çıkışta kalan yol (pt). */
export const CEKME = { mesafe: 96, hiz: 0.6, fiske: 24, baslangic: 6, cikis: 600 } as const;

/**
 * Tam sayfa (`presentationStyle="pageSheet"`) alt sayfalar: iOS'ta sistemin KENDİ aşağı çekme hareketi
 * (`allowSwipeDismissal`, RN 0.81; `onRequestClose` çağrılır; UIKit sayfası içerik listesi en üstteyken listeden çekişi de
 * sayfaya verir) — iki hareket çakışmasın diye kancamız orada kapalı ve listeye dokunmaz (sıçrama/kaydırma iOS'un);
 * Android'de sayfa tam ekrandır, kancamız gövdeden (liste üstteyken) ve tutma çubuğu + başlıktan çalışır.
 */
export const SISTEM_CEKMESI = Platform.OS === "ios";

/** SAF: bırakınca kapanır mı. Yukarı çekiş (dy ≤ 0) hiçbir zaman kapatmaz. */
export function kapanirMi(dy: number, vy: number): boolean {
  if (dy <= 0) return false;
  return dy >= CEKME.mesafe || (dy >= CEKME.fiske && vy >= CEKME.hiz);
}

/** SAF: bu hareket çekmeyi başlatır mı (dikey, aşağı, yatay kaymadan baskın). */
export function cekmeBaslarMi(g: Pick<PanResponderGestureState, "dx" | "dy">): boolean {
  return g.dy > CEKME.baslangic && Math.abs(g.dy) > Math.abs(g.dx);
}

/** SAF: liste en üstte mi (iOS'ta üstten taşma eksi değerdir; o da "üstte"). */
export function listeUstteMi(kaydirmaY: number): boolean {
  return kaydirmaY <= 0;
}

/**
 * SAF: GÖVDEDEN (tutamak/başlık dışı) çekme başlar mı: çekme hareketi (aşağı, dikey baskın) ∧ liste en üstte ∧ klavye
 * kapalı. Liste aşağıdayken hareket listenin kaydırmasıdır; klavye açıkken önce klavye kapanır.
 */
export function govdeCekmesiBaslarMi(g: Pick<PanResponderGestureState, "dx" | "dy">, d: { readonly listeUstte: boolean; readonly klavye: boolean }): boolean {
  return !d.klavye && d.listeUstte && cekmeBaslarMi(g);
}

/** Sayfanın dikey listesine (`ScrollView`/`FlatList`) yayılır: kaydırma konumunu kancaya bildirir. */
export interface ListeBaglari {
  readonly ref: (r: unknown) => void;
  readonly onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  readonly scrollEventThrottle: number;
  readonly bounces?: boolean;
  readonly scrollEnabled?: boolean;
}

export interface AsagiCek {
  /** Tutma çubuğu + başlık: her zaman çeker (liste aşağıdayken de). */
  readonly tutamak: GestureResponderHandlers;
  /** Sayfa kabı: gövdenin her yerinden çeker — liste üstteyse ve klavye kapalıysa. */
  readonly govde: GestureResponderHandlers;
  /** Sayfanın dikey listesi (yoksa bağlanmaz; o zaman bütün gövde çeker). */
  readonly liste: ListeBaglari;
  /** Sayfa kabının stiline eklenir (çekilirken parmağı izler). */
  readonly kayma: { readonly transform: readonly [{ readonly translateY: Animated.AnimatedInterpolation<number> }] };
}

/**
 * `etkin: false` (ör. iOS sistem çekmeli tam sayfa) → hiçbir hareket yakalanmaz ve listeye dokunulmaz.
 * `acik` her açılışta kaymayı sıfırlar (kapanırken aşağıda kalan sayfa yeniden açılınca yerinde başlar).
 */
export function useAsagiCekKapat(onClose: () => void, acik: boolean, etkin = true): AsagiCek {
  const azalt = useHareketAzalt();
  const y = useRef(new Animated.Value(0)).current;
  const kapat = useRef(onClose);
  kapat.current = onClose;
  const ayar = useRef({ etkin, azalt });
  ayar.current = { etkin, azalt };
  // Liste konumu: ref karar için (her kaydırma olayında render yok), durum yalnız "üstte" sınırı geçilince (iOS sıçraması).
  const ustte = useRef(true);
  const [ustteDurum, setUstteDurum] = useState(true);
  const [cekiliyor, setCekiliyor] = useState(false);
  // Bu harekette klavye kapatıldı: aynı hareket sayfayı taşımaz (her dokunuşun başında sıfırlanır).
  const klavyeKapatildi = useRef(false);
  const ustteAta = useCallback((u: boolean) => {
    if (ustte.current === u) return;
    ustte.current = u;
    setUstteDurum(u);
  }, []);
  useEffect(() => {
    if (!acik) return;
    y.setValue(0);
    ustteAta(true);
  }, [acik, y, ustteAta]);
  const [tutamakPan, govdePan] = useMemo(() => {
    // Eşik altı: yerine yaylanır (alttan açılan sayfanın yayı); hareket azaltılmışsa anında.
    const geriOtur = () => {
      setCekiliyor(false);
      if (ayar.current.azalt) y.setValue(0);
      else Animated.spring(y, { toValue: 0, useNativeDriver: true, ...YAY.modal }).start();
    };
    const kur = (baslar: (g: PanResponderGestureState) => boolean) => PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => {
        klavyeKapatildi.current = false;
        return false;
      },
      onMoveShouldSetPanResponder: (_e, g) => ayar.current.etkin && baslar(g),
      onMoveShouldSetPanResponderCapture: (_e, g) => ayar.current.etkin && baslar(g),
      onPanResponderGrant: () => setCekiliyor(true),
      onPanResponderMove: (_e, g) => y.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (!kapanirMi(g.dy, g.vy)) return geriOtur();
        setCekiliyor(false);
        // Önce kapat (durum anında doğru), sayfa kalan yolu aşağı kayarak çıkar.
        kapat.current();
        if (!ayar.current.azalt) Animated.timing(y, { toValue: Math.max(g.dy, 0) + CEKME.cikis, duration: SURE.kisa, useNativeDriver: true }).start();
      },
      onPanResponderTerminate: geriOtur,
      onPanResponderTerminationRequest: () => false,
    });
    const govde = (g: PanResponderGestureState) => {
      if (!cekmeBaslarMi(g) || klavyeKapatildi.current) return false;
      const klavye = Keyboard.isVisible();
      if (klavye) {
        klavyeKapatildi.current = true;
        Keyboard.dismiss();
      }
      return govdeCekmesiBaslarMi(g, { listeUstte: ustte.current, klavye });
    };
    return [kur(cekmeBaslarMi), kur(govde)] as const;
  }, [y]);
  // Liste değişince (ör. süzgeçte alan → seçenekler) yeni liste en üstte doğar.
  const listeRef = useRef<unknown>(null);
  const ref = useCallback((r: unknown) => {
    if (r === listeRef.current) return;
    listeRef.current = r;
    ustteAta(true);
  }, [ustteAta]);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => ustteAta(listeUstteMi(e.nativeEvent.contentOffset.y)), [ustteAta]);
  const liste = useMemo<ListeBaglari>(
    () => (etkin ? { ref, onScroll, scrollEventThrottle: 16, bounces: !ustteDurum, scrollEnabled: !cekiliyor } : { ref, onScroll, scrollEventThrottle: 16 }),
    [etkin, ref, onScroll, ustteDurum, cekiliyor],
  );
  // Yukarı çekiş sayfayı kaldırmaz (setValue 0 tabanlı; clamp yine de güvence).
  const kayma = useMemo(() => ({ transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolateLeft: "clamp" }) }] as const }), [y]);
  return { tutamak: tutamakPan.panHandlers, govde: govdePan.panHandlers, liste, kayma };
}

/**
 * Görünür tutma çubuğu: çekmenin başladığı yer olduğunu söyler. Ekran okuyucuda "Kapat" düğmesidir (çift dokunuş
 * kapatır) — hareketi yapamayan da kapatabilir.
 */
export function Tutamak({ onClose, testID }: { readonly onClose: () => void; readonly testID?: string }) {
  const s = useStyles();
  return (
    <View
      style={s.alan} accessible accessibilityRole="button" accessibilityLabel="Kapat" accessibilityHint="Aşağı çekerek de kapanır"
      onAccessibilityTap={onClose} testID={testID}
    >
      <View style={s.cubuk} />
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  // Dokunma payı geniş (çubuk ince, tutma bölgesi 24 pt yüksek, tam genişlik).
  alan: { alignSelf: "stretch" as const, alignItems: "center" as const, justifyContent: "center" as const, minHeight: 24, paddingTop: space.xs, paddingBottom: space.xs },
  cubuk: { width: 36, height: 5, borderRadius: 3, backgroundColor: t.separator },
}));
