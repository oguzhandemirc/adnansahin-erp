// Sesli giriş — konuşma tanıma sarmalayıcısı. Telefonun KENDİ tanıma hizmeti (Android Google, iOS Apple), dil tr-TR,
// `expo-speech-recognition` üstünden. Ses kaydı tutulmaz (`recordingOptions` verilmez); `requiresOnDeviceRecognition`
// verilmez → tanıma AĞ tabanlı olabilir (iOS Apple, Android Google sunucuları; gizlilik politikası § izinler bunu söyler).
// Çıkan metin yalnız telefonda formu doldurur; bulutumuza ses gitmez. Yerel modül yoksa (web, Expo Go, eski paket) motor "kullanılamaz" döner — düğme çizilmez.
// Testte ve geliştirme önizlemesinde sahte motor enjekte edilir (`sesMotoruAyarla`).
//
// DİNLEME DÜZENİ (2026-11-18, tablette erken kesilme şikâyeti): `continuous: false` Android'de İLK kesin sonuçta, yani
// konuşmadaki ilk kısa duraksamada biter ("Ahmet Tekstil'e … [nefes] … yüz metre lacivert" yarım kalırdı). Artık
// `continuous: true` + KENDİ sessizlik sayacımız: son sonuçtan SESSIZLIK_MS sonra `stop()`; hiç konuşulmazsa ILK_MS;
// en çok EN_UZUN_MS. Android sürekli kipte her kesin sonuç YENİ bir bölüttür (README "Speech Recognition Events");
// bölütler birleştirilir. iOS'ta ara sonuçlar birikimlidir; iOS 18 duraksamadan sonra ara metni sıfırlayabilir —
// sıfırlanma sezilince önceki metin korunur. `stop()` sonrası `end` gelmezse KAPANIS_MS sonra `abort()` + kapanış.
import { Platform } from "react-native";

export type SesHatasi = "izin-yok" | "desteklenmiyor" | "ag-yok" | "duyulmadi" | "mesgul" | "mikrofon" | "kesildi" | "bilinmeyen";

/** Kullanıcıya gösterilen sade Türkçe açıklamalar (ne oldu + ne yapmalı). */
export const SES_HATA_METNI: Readonly<Record<SesHatasi, string>> = {
  "izin-yok": "Mikrofon izni verilmedi. Telefonun Ayarlar > Uygulamalar bölümünden bu uygulamaya mikrofon izni verebilirsiniz. Formu elle de doldurabilirsiniz.",
  desteklenmiyor: "Bu telefonda Türkçe ses tanıma kullanılamıyor (Google ses hizmeti kapalı ya da Türkçe yüklü değil). Formu elle doldurabilirsiniz.",
  "ag-yok": "Ses tanıma için internet gerekiyor; bağlantı yok ya da zayıf. Bağlantıyı kontrol edip “Tekrar dene”ye dokunun.",
  duyulmadi: "Sesinizi duyamadım. Mikrofona yakın konuşun ve “Tekrar dene”ye dokunun.",
  mesgul: "Ses tanıma şu an meşgul. Birkaç saniye bekleyip “Tekrar dene”ye dokunun.",
  mikrofon: "Mikrofon açılamadı; başka bir uygulama (arama, kayıt) kullanıyor olabilir. Onu kapatıp “Tekrar dene”ye dokunun.",
  kesildi: "Dinleme bir arama ya da uyarı yüzünden kesildi. “Tekrar dene”ye dokunun.",
  bilinmeyen: "Ses tanıma bir hata verdi. “Tekrar dene”ye dokunun ya da formu elle doldurun.",
};

/** Kütüphanenin hata kodu → bizim hata türümüz; "aborted" (biz durdurduk) hata değildir → null. */
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
    case "too-many-requests":
      return "mesgul";
    case "audio-capture":
      return "mikrofon";
    case "interrupted":
      return "kesildi";
    default:
      return "bilinmeyen";
  }
}

/** Metin alındıktan SONRA gelirse yok sayılan kodlar (durdurma sonrası Android "no-speech"/"client" verebilir). */
const METINDEN_SONRA_ONEMSIZ = new Set(["no-speech", "speech-timeout", "client", "unknown"]);

/** Dinleme evresi: izin/başlatma bekleniyor · mikrofon açık · durduruldu, son metin bekleniyor. */
export type SesEvresi = "hazirlaniyor" | "dinliyor" | "isliyor";

export interface SesOlaylari {
  /** Konuşurken canlı metin (o ana kadar duyulanın TAMAMI). */
  ara(metin: string): void;
  /** Dinleme bitince duyulanın tamamı (metin varsa, `bitti`den hemen önce bir kez). */
  son(metin: string): void;
  hata(h: SesHatasi): void;
  /** Dinleme bitti (sonuç, hata ya da durdurma sonrası HER durumda bir kez). */
  bitti(): void;
  evre?(e: SesEvresi): void;
  /** Ses düzeyi 0–1 (konuşma göstergesi). */
  duzey?(d: number): void;
}

export interface SesSecenekleri {
  /** Tanımaya yön veren adlar (müşteri, ürün, renk); en çok IPUCU_SINIRI tanesi gönderilir. */
  readonly ipuclari?: readonly string[];
}

/** Durdurma işlevi; `iptal` → sonuç işlenmeden kapat (ekran kapanırken). */
export type SesDurdur = (iptal?: boolean) => void;

export interface SesMotoru {
  /** Bu cihazda ses tanıma kullanılabilir mi (yerel modül var ve hizmet açık). */
  mevcut(): boolean;
  /** İzin ister, dinlemeyi başlatır; dönen işlev dinlemeyi durdurur. Asla fırlatmaz: hata `hata` olayıyla gelir. */
  baslat(o: SesOlaylari, s?: SesSecenekleri): Promise<SesDurdur>;
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

/** Son sonuçtan sonra bu kadar sessizlik → konuşma bitti sayılır. Adım içi tek alanlık kısa söz için 1,8 sn (2026-11-18; tek cümle kipinde 3 sn idi). */
export const SESSIZLIK_MS = 1800;
/** Başladıktan sonra hiç sonuç gelmezse. */
export const ILK_MS = 8000;
/** Tek dinlemenin üst sınırı. */
export const EN_UZUN_MS = 60000;
/** `stop()` sonrası `end` beklenen süre. */
export const KAPANIS_MS = 5000;
/** Apple `contextualStrings` için önerilen üst sınır 100 ifade; Android `EXTRA_BIASING_STRINGS` (13+) aynı listeyi alır. */
export const IPUCU_SINIRI = 100;

const birlestir = (parcalar: readonly string[]) => parcalar.map((x) => x.trim()).filter(Boolean).join(" ");
const ilkSozcuk = (x: string) => x.trim().split(/\s+/)[0]?.toLowerCase() ?? "";

/** Yerel motor (tr-TR, ara sonuçlu, sürekli + kendi sessizlik sayacı, ses kaydı YOK). */
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
    async baslat(o, secenek) {
      const m = modul();
      let bitti = false;
      let iptalEdildi = false;
      let durduruluyor = false;
      const abonelikler: Abonelik[] = [];
      const kesin: string[] = [];
      let arada = "";
      let sayac: ReturnType<typeof setTimeout> | null = null;
      let kapanis: ReturnType<typeof setTimeout> | null = null;
      let enUzun: ReturnType<typeof setTimeout> | null = null;
      const metin = () => birlestir([...kesin, arada]);
      const temizle = () => {
        for (const t of [sayac, kapanis, enUzun]) if (t) clearTimeout(t);
        sayac = kapanis = enUzun = null;
      };
      const kapat = () => {
        if (bitti) return;
        bitti = true;
        temizle();
        abonelikler.forEach((a) => a.remove());
        const t = metin();
        if (t && !iptalEdildi) o.son(t);
        o.bitti();
      };
      if (!m) {
        o.hata("desteklenmiyor");
        kapat();
        return () => {};
      }
      const durdur = () => {
        if (bitti || durduruluyor) return;
        durduruluyor = true;
        if (sayac) clearTimeout(sayac);
        o.evre?.("isliyor");
        try {
          m.stop();
        } catch {
          kapat();
          return;
        }
        kapanis = setTimeout(() => {
          try {
            m.abort();
          } catch {
            /* zaten kapalı */
          }
          kapat();
        }, KAPANIS_MS);
      };
      const sayacKur = (ms: number) => {
        if (durduruluyor || bitti) return;
        if (sayac) clearTimeout(sayac);
        sayac = setTimeout(durdur, ms);
      };
      try {
        const izin = await m.requestPermissionsAsync();
        if (!izin.granted) {
          o.hata("izin-yok");
          kapat();
          return () => {};
        }
        o.evre?.("hazirlaniyor");
        abonelikler.push(
          m.addListener("start", (() => {
            o.evre?.("dinliyor");
            sayacKur(ILK_MS);
          }) as (e: never) => void),
          m.addListener("result", ((e: { isFinal?: boolean; results?: { transcript?: string }[] }) => {
            const t = (e.results?.[0]?.transcript ?? "").trim();
            if (e.isFinal) {
              if (t) kesin.push(t);
              arada = "";
            } else if (t) {
              // iOS 18: duraksamadan sonra ara metin sıfırlanabilir → öncekini koru.
              if (arada && t.length < arada.length * 0.6 && ilkSozcuk(t) !== ilkSozcuk(arada)) kesin.push(arada);
              arada = t;
            }
            const tum = metin();
            if (tum) o.ara(tum);
            sayacKur(tum ? SESSIZLIK_MS : ILK_MS);
          }) as (e: never) => void),
          m.addListener("volumechange", ((e: { value?: number }) => {
            const v = typeof e.value === "number" ? e.value : -2;
            o.duzey?.(Math.max(0, Math.min(1, v / 10)));
          }) as (e: never) => void),
          m.addListener("error", ((e: { error?: string }) => {
            if (metin() && METINDEN_SONRA_ONEMSIZ.has(e.error ?? "unknown")) return;
            const h = hataEsle(e.error);
            if (h && !iptalEdildi) o.hata(h);
          }) as (e: never) => void),
          m.addListener("end", (() => kapat()) as (e: never) => void),
        );
        const ipuclari = [...new Set((secenek?.ipuclari ?? []).map((x) => x.trim()).filter(Boolean))].slice(0, IPUCU_SINIRI);
        m.start({
          lang: "tr-TR",
          interimResults: true,
          continuous: true,
          maxAlternatives: 1,
          addsPunctuation: false,
          volumeChangeEventOptions: { enabled: true, intervalMillis: 150 },
          ...(ipuclari.length ? { contextualStrings: ipuclari } : {}),
        });
        // `start` olayı gelmeyen eski hizmetlerde de ilk sayaç kurulur; üst sınır her durumda.
        sayacKur(ILK_MS + 2000);
        enUzun = setTimeout(durdur, EN_UZUN_MS);
      } catch {
        o.hata("bilinmeyen");
        kapat();
        return () => {};
      }
      return (iptal) => {
        if (bitti) return;
        if (iptal) {
          iptalEdildi = true;
          try {
            m.abort();
          } catch {
            /* zaten kapalı */
          }
          kapat();
          return;
        }
        durdur();
      };
    },
  };
}

/**
 * Sahte motor (test ve geliştirme önizlemesi): her `baslat` sıradaki metni önce ara sonuç (ilk yarısı), sonra kesin
 * sonuç olarak verir. Metin `SesHatasi` adıyla `!` önekliyse (ör. "!izin-yok") o hata üretilir. Son çağrının
 * seçenekleri `sonSecenek`te okunur (ipucu testi).
 */
export function sahteMotor(sira: () => string | undefined, mevcut = true): SesMotoru & { sonSecenek?: SesSecenekleri } {
  const motor: SesMotoru & { sonSecenek?: SesSecenekleri } = {
    mevcut: () => mevcut,
    async baslat(o, s) {
      motor.sonSecenek = s;
      const metin = sira();
      let durdu = false;
      o.evre?.("dinliyor");
      const t = setTimeout(() => {
        if (durdu) return;
        durdu = true;
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
  return motor;
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
