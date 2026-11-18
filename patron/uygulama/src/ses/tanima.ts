// Sesli sipariş — konuşma tanıma sarmalayıcısı. Telefonun KENDİ tanıma hizmeti (Android Google, iOS Apple), dil tr-TR,
// `expo-speech-recognition` üstünden. Ses kaydı tutulmaz (`recordingOptions` verilmez); `requiresOnDeviceRecognition`
// verilmez → tanıma AĞ tabanlı olabilir (iOS Apple, Android Google sunucuları; gizlilik politikası § izinler bunu söyler).
// Çıkan metin yalnız telefonda formu doldurur; bulutumuza ses gitmez. Yerel modül yoksa (web, Expo Go, eski paket) motor "kullanılamaz" döner — düğme çizilmez.
// Testte ve geliştirme önizlemesinde sahte motor enjekte edilir (`sesMotoruAyarla`).
import { Platform } from "react-native";

export type SesHatasi = "izin-yok" | "desteklenmiyor" | "ag-yok" | "duyulmadi" | "mesgul" | "bilinmeyen";

/** Kullanıcıya gösterilen sade Türkçe açıklamalar. */
export const SES_HATA_METNI: Readonly<Record<SesHatasi, string>> = {
  "izin-yok": "Mikrofon izni verilmedi. Telefonun Ayarlar > Uygulamalar bölümünden bu uygulamaya mikrofon izni verebilirsiniz. Formu elle de doldurabilirsiniz.",
  desteklenmiyor: "Bu telefonda Türkçe ses tanıma kullanılamıyor. Formu elle doldurabilirsiniz.",
  "ag-yok": "Ses tanıma için internet bağlantısı gerekiyor. Bağlantıyı kontrol edip yeniden deneyin.",
  duyulmadi: "Sesinizi duyamadım. Mikrofon düğmesine basıp yeniden söyleyin.",
  mesgul: "Ses tanıma şu an meşgul. Birkaç saniye sonra yeniden deneyin.",
  bilinmeyen: "Ses tanıma bir hata verdi. Yeniden deneyin ya da formu elle doldurun.",
};

/** Kütüphanenin hata kodu → bizim hata türümüz; "aborted" (kullanıcı durdurdu) hata değildir → null. */
export function hataEsle(kod: string | undefined): SesHatasi | null {
  switch (kod) {
    case "aborted":
      return null;
    case "not-allowed":
      return "izin-yok";
    case "service-not-allowed":
    case "language-not-supported":
      return "desteklenmiyor";
    case "network":
      return "ag-yok";
    case "no-speech":
    case "speech-timeout":
      return "duyulmadi";
    case "busy":
      return "mesgul";
    default:
      return "bilinmeyen";
  }
}

export interface SesOlaylari {
  /** Ara sonuç (konuşurken canlı metin). */
  ara(metin: string): void;
  /** Kesin sonuç. */
  son(metin: string): void;
  hata(h: SesHatasi): void;
  /** Dinleme bitti (sonuç, hata ya da durdurma sonrası HER durumda bir kez). */
  bitti(): void;
}

export interface SesMotoru {
  /** Bu cihazda ses tanıma kullanılabilir mi (yerel modül var ve hizmet açık). */
  mevcut(): boolean;
  /** İzin ister, dinlemeyi başlatır; dönen işlev dinlemeyi durdurur. Asla fırlatmaz: hata `hata` olayıyla gelir. */
  baslat(o: SesOlaylari): Promise<() => void>;
}

interface Abonelik { remove(): void }
interface YerelModul {
  isRecognitionAvailable(): boolean;
  requestPermissionsAsync(): Promise<{ granted: boolean }>;
  start(o: Record<string, unknown>): void;
  stop(): void;
  abort(): void;
  addListener(ad: string, f: (e: never) => void): Abonelik;
}

let yerelOnbellek: YerelModul | null | undefined;
function yerelModul(): YerelModul | null {
  if (yerelOnbellek !== undefined) return yerelOnbellek;
  if (Platform.OS === "web") return (yerelOnbellek = null);
  try {
    const m = (require("expo-speech-recognition") as { ExpoSpeechRecognitionModule?: YerelModul }).ExpoSpeechRecognitionModule;
    yerelOnbellek = m ?? null;
  } catch {
    // Yerel modül pakette yok (Expo Go ya da modülsüz eski derleme): ses kapalı.
    yerelOnbellek = null;
  }
  return yerelOnbellek;
}

/** Yerel motor (tr-TR, ara sonuçlu, tek cümle, ses kaydı YOK). */
export function yerelMotor(modul: () => YerelModul | null = yerelModul): SesMotoru {
  return {
    mevcut() {
      try {
        const m = modul();
        return !!m && m.isRecognitionAvailable();
      } catch {
        return false;
      }
    },
    async baslat(o) {
      const m = modul();
      let bitti = false;
      const abonelikler: Abonelik[] = [];
      const kapat = () => {
        if (bitti) return;
        bitti = true;
        abonelikler.forEach((a) => a.remove());
        o.bitti();
      };
      if (!m) {
        o.hata("desteklenmiyor");
        kapat();
        return () => {};
      }
      try {
        const izin = await m.requestPermissionsAsync();
        if (!izin.granted) {
          o.hata("izin-yok");
          kapat();
          return () => {};
        }
        abonelikler.push(
          m.addListener("result", ((e: { isFinal?: boolean; results?: { transcript?: string }[] }) => {
            const metin = e.results?.[0]?.transcript ?? "";
            if (e.isFinal) o.son(metin);
            else o.ara(metin);
          }) as (e: never) => void),
          m.addListener("error", ((e: { error?: string }) => {
            const h = hataEsle(e.error);
            if (h) o.hata(h);
          }) as (e: never) => void),
          m.addListener("end", (() => kapat()) as (e: never) => void),
        );
        m.start({ lang: "tr-TR", interimResults: true, continuous: false, maxAlternatives: 1, addsPunctuation: false });
      } catch {
        o.hata("bilinmeyen");
        kapat();
        return () => {};
      }
      return () => {
        try {
          m.stop();
        } catch {
          kapat();
        }
      };
    },
  };
}

/**
 * Sahte motor (test ve geliştirme önizlemesi): her `baslat` sıradaki metni önce ara sonuç (ilk yarısı), sonra kesin
 * sonuç olarak verir. Metin `SesHatasi` adıyla `!` önekliyse (ör. "!izin-yok") o hata üretilir.
 */
export function sahteMotor(sira: () => string | undefined, mevcut = true): SesMotoru {
  return {
    mevcut: () => mevcut,
    async baslat(o) {
      const metin = sira();
      let durdu = false;
      const t = setTimeout(() => {
        if (durdu) return;
        if (metin === undefined || metin === "") o.hata("duyulmadi");
        else if (metin.startsWith("!")) o.hata(metin.slice(1) as SesHatasi);
        else {
          o.ara(metin.slice(0, Math.ceil(metin.length / 2)));
          o.son(metin);
        }
        o.bitti();
      }, 0);
      return () => {
        if (durdu) return;
        durdu = true;
        clearTimeout(t);
        o.bitti();
      };
    },
  };
}

let ayarli: SesMotoru | null = null;

/** Test/önizleme enjeksiyonu; null → varsayılana dön. */
export function sesMotoruAyarla(m: SesMotoru | null): void {
  ayarli = m;
}

/**
 * Etkin motor. Geliştirme önizlemesinde (yalnız `__DEV__` ∧ `EXPO_PUBLIC_ORNEK_VERI=1`, web) sahte motor
 * `globalThis.__sesDeneme` dizisinden okur; üretimde bu dal Metro tarafından katlanır.
 */
export function sesMotoru(): SesMotoru {
  if (ayarli) return ayarli;
  if (__DEV__ && process.env.EXPO_PUBLIC_ORNEK_VERI === "1" && Platform.OS === "web") {
    const g = globalThis as { __sesDeneme?: string[] };
    return sahteMotor(() => g.__sesDeneme?.shift());
  }
  return yerelMotor();
}
