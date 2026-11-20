// Cari kartının Siparişler ve Sevkiyatlar sekmeleri (2026-11-20, kullanıcı kuralı: her veri tablosunda sütun seçimi +
// arama + süzgeç + başlıktan sıralama). Liste SUNUCU sayfalıdır (`cariKartId` kimlik süzgeci) ⇒ ortak sunucu tablosu
// (`useCihazVeriTablosu`): arama/süzgeç/sıralama bulutun beyanıyla sunucuda, istemci yarım kümeyi sıralamaz. Tercih
// yalnız cihazda (`tablo.cari-siparis` · `tablo.cari-sevkiyat`; bulut tercih anahtar listesi sabit, ana listelerin seçimi
// ezilmez). Müşteri sütunu ve Müşteri süzgeci yok (tek cari). Varsayılan sütunlar bugünküyle aynı.
import { useRouter } from "expo-router";
import { View } from "react-native";
import type { ProjectionRecord } from "../../api/wire";
import { MODULE_ICON } from "../icons";
import { openRecord } from "../nav";
import { CARI_SIPARIS_SUTUNLARI, SIPARIS_SUTUNLARI } from "../siparis/sutunlar";
import { CARI_SEVK_SUTUNLARI, SEVKIYAT_SUTUNLARI } from "../sevkiyat/sutunlar";
import type { Siralama, SutunTanimi } from "../tablo/model";
import { TabloListesi, TabloUstu, useCihazVeriTablosu } from "../tablo/useVeriTablosu";

/** Tek carinin tablosunda Müşteri sütunu yok. */
const tek = (xs: readonly SutunTanimi<ProjectionRecord>[]): readonly SutunTanimi<ProjectionRecord>[] => xs.filter((c) => c.key !== "musteri");

export const CARI_SIPARIS_AYARI = {
  projeksiyon: "siparis",
  // Profil anahtarı kullanılmaz (cihaz kancası); tip gereği ana listeninki.
  anahtar: "tablo.siparis",
  cihazAnahtari: "tablo.cari-siparis",
  sutunlar: tek(SIPARIS_SUTUNLARI),
  varsayilan: CARI_SIPARIS_SUTUNLARI,
  aramaIpucu: "Sipariş no ara",
  haricAlanlar: ["gecikmis", "musteriAdi"],
  testID: "cari-siparis-tumu",
} as const;

export const CARI_SEVK_AYARI = {
  projeksiyon: "sevkiyat",
  anahtar: "tablo.sevkiyat",
  cihazAnahtari: "tablo.cari-sevkiyat",
  sutunlar: tek(SEVKIYAT_SUTUNLARI),
  varsayilan: CARI_SEVK_SUTUNLARI,
  aramaIpucu: "Sevk no ara",
  haricAlanlar: ["musteriAdi"],
  testID: "cari-sevk-tumu",
} as const;

/** Siparişler sekmesi. `acik`: yalnız açık siparişler (sunucu `suzgec=ACIK`), varsayılan sıra `eskiOnce` (seçimi ezmez). */
export function CariSiparisTablosu({ cariKartId, acik, eskiOnce }: { readonly cariKartId: string; readonly acik: boolean; readonly eskiOnce?: Siralama }) {
  const router = useRouter();
  const tablo = useCihazVeriTablosu(
    { ...CARI_SIPARIS_AYARI, testID: acik ? "cari-siparis-acik" : "cari-siparis-tumu" },
    { kimlik: { cariKartId }, ...(acik ? { suzgec: "ACIK", varsayilanSiralama: eskiOnce } : {}) },
  );
  return (
    <View testID={tablo.ayar.testID}>
      <TabloUstu tablo={tablo} />
      <TabloListesi
        tablo={tablo} onPress={(r: ProjectionRecord) => openRecord(router, "siparis", r.id)} icon={MODULE_ICON.siparisler.icon}
        bos={acik ? "Açık sipariş yok" : "Bu cariye ait sipariş yok"} bosSuzgecli="Bu süzgeçte sipariş yok"
      />
    </View>
  );
}

export function CariSevkTablosu({ cariKartId }: { readonly cariKartId: string }) {
  const router = useRouter();
  const tablo = useCihazVeriTablosu(CARI_SEVK_AYARI, { kimlik: { cariKartId } });
  return (
    <View testID={tablo.ayar.testID}>
      <TabloUstu tablo={tablo} />
      <TabloListesi
        tablo={tablo} onPress={(r: ProjectionRecord) => openRecord(router, "sevkiyat", r.id)} icon={MODULE_ICON.sevkiyat.icon}
        bos="Bu cariye sevkiyat yok" bosSuzgecli="Bu süzgeçte sevkiyat yok"
      />
    </View>
  );
}
