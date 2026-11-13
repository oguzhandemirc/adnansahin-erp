// Liste ekranının veri tablosu: profil tercihi (`useTabloTercihi`) + sunucu yeteneği + sunucu listesi (`useRemoteList`).
// Arama gecikmeli istek; süzgeç ve sıralama tercihten SUNUCU parametresine çevrilir — istemci listeyi süzmez/sıralamaz.
// Ekran `TabloUstu`nü `Screen.sticky`ye, `TabloListesi`ni gövdeye koyar; ikisi aynı sütun tanımından çizilir.
import { useMemo, useState } from "react";
import { useWindowDimensions, View } from "react-native";
import type { ProjectionRecord, ViewPrefKey } from "../../api/wire";
import type { IconName } from "../icons";
import { useDebounced } from "../Picker";
import { useListCapability } from "../siparis/capabilities";
import { ListStates } from "../siparis/parts";
import { useRemoteList, type RemoteList } from "../siparis/useRemoteList";
import { useSession } from "../../state/session";
import type { ListQuery } from "../siparis/useRemoteList";
import { azamiSutun, etkinSuzgecSayisi, gruplar, sonrakiSiralama, sunucuSorgusu, sutunDegistir, sutunTasi, suzgecSec, tercihiTemizle, type Siralama, type SutunTanimi, type SuzgecGrubu, type TabloTercihi } from "./model";
import { SutunSecici, SuzgecSecici } from "./Seciciler";
import { useTabloTercihi } from "./useTabloTercihi";
import { TabloAraclari, TabloBasligi, TabloGovdesi, TabloSatiri } from "./VeriTablosu";

export interface VeriTablosuAyari {
  readonly projeksiyon: string;
  readonly anahtar: ViewPrefKey;
  readonly sutunlar: readonly SutunTanimi<ProjectionRecord>[];
  readonly varsayilan: readonly string[];
  readonly aramaIpucu: string;
  /** Çizilmeyen süzgeç alanları (ör. termin/gecikme). */
  readonly haricAlanlar?: readonly string[];
  readonly testID: string;
}

export interface VeriTablosu {
  readonly ayar: VeriTablosuAyari;
  readonly tercih: TabloTercihi;
  readonly gorunur: readonly SutunTanimi<ProjectionRecord>[];
  readonly gruplar: readonly SuzgecGrubu[];
  readonly siralanabilir: readonly string[];
  readonly aramaVar: boolean;
  readonly terim: string;
  setTerim(v: string): void;
  readonly azami: number;
  readonly list: RemoteList;
  readonly suzuldu: boolean;
  degistir(f: (t: TabloTercihi) => TabloTercihi): void;
}

/**
 * Ekranın tercihten bağımsız koşulu: `suzgec` sabit değer(ler) tercihin önüne eklenir (ör. açık/kapanan sekmesi),
 * `siralama` verilirse tercihin sıralamasını ezer, `kimlik` kimlik/üyelik süzgeçleridir (beyanlıysa gönderilir).
 */
export interface TabloEki {
  readonly suzgec?: string;
  readonly siralama?: Siralama;
  readonly kimlik?: Pick<ListQuery, "cariKartId" | "siparisId" | "fasonFirmaId">;
}

export function useVeriTablosu(ayar: VeriTablosuAyari, ek: TabloEki = {}): VeriTablosu {
  const { facility } = useSession();
  const { width } = useWindowDimensions();
  const azami = azamiSutun(width);
  const spec = useListCapability().search(ayar.projeksiyon);
  const siralanabilir = facility?.liste?.siralama?.[ayar.projeksiyon] ?? [];
  const cokluSuzgec = !!facility?.liste?.siralama;
  const gs = useMemo(() => gruplar(spec, cokluSuzgec, ayar.haricAlanlar), [spec, cokluSuzgec, ayar.haricAlanlar]);
  const keys = useMemo(() => ayar.sutunlar.map((c) => c.key), [ayar.sutunlar]);
  const varsayilan: TabloTercihi = useMemo(() => ({ surum: 1, sutunlar: ayar.varsayilan, siralama: null, suzgec: {} }), [ayar.varsayilan]);
  const temizle = useMemo(() => (ham: unknown) => tercihiTemizle(ham, { varsayilan, sutunlar: keys, azami }), [varsayilan, keys, azami]);
  const pref = useTabloTercihi(ayar.anahtar, temizle);
  const [terim, setTerim] = useState("");
  const ara = useDebounced(terim.trim(), 300);
  // Ekranın sabit değeri bir grubu doldurduysa tercihin o gruptaki değeri gönderilmez (sunucu grup başına tek değer alır).
  const ekDegerler = ek.suzgec ? ek.suzgec.split(",") : [];
  const dolu = gs.filter((g) => g.secenekler.some((o) => ekDegerler.includes(o.deger))).map((g) => g.anahtar);
  const etkin: TabloTercihi = {
    ...pref.tercih,
    suzgec: Object.fromEntries(Object.entries(pref.tercih.suzgec).filter(([g]) => !dolu.includes(g))),
    ...(ek.siralama ? { siralama: ek.siralama } : {}),
  };
  const temel = sunucuSorgusu(etkin, spec ? ara : "", gs, siralanabilir);
  const suzgec = [ek.suzgec, temel.suzgec].filter(Boolean).join(",") || undefined;
  const sorgu: ListQuery = { ...temel, suzgec, ...ek.kimlik };
  const list = useRemoteList(ayar.projeksiyon, sorgu, { enabled: pref.hazir });
  const gorunur = pref.tercih.sutunlar.flatMap((k) => ayar.sutunlar.filter((c) => c.key === k));
  return {
    ayar, tercih: pref.tercih, gorunur, gruplar: gs, siralanabilir, aramaVar: !!spec, terim, setTerim, azami, list,
    suzuldu: !!sorgu.ara || !!temel.suzgec || Object.values(ek.kimlik ?? {}).some(Boolean),
    degistir: pref.degistir,
  };
}

/** Yapışkan şerit: araçlar + sütun başlığı (+ seçici alt sayfaları). */
export function TabloUstu({ tablo }: { readonly tablo: VeriTablosu }) {
  const [sutunAcik, setSutunAcik] = useState(false);
  const [suzgecAcik, setSuzgecAcik] = useState(false);
  const { ayar, tercih, degistir } = tablo;
  return (
    <View>
      <TabloAraclari
        testID={ayar.testID}
        ara={tablo.aramaVar ? { value: tablo.terim, onChangeText: tablo.setTerim, placeholder: ayar.aramaIpucu } : undefined}
        suzgecSayisi={etkinSuzgecSayisi(Object.fromEntries(tablo.gruplar.flatMap((g) => (tercih.suzgec[g.anahtar] ? [[g.anahtar, tercih.suzgec[g.anahtar]!]] : []))))}
        onSuzgec={tablo.gruplar.length > 0 ? () => setSuzgecAcik(true) : undefined}
        onSutun={() => setSutunAcik(true)}
      />
      <TabloBasligi testID={ayar.testID} sutunlar={tablo.gorunur} siralama={tercih.siralama} siralanabilir={tablo.siralanabilir} onSirala={(alan) => degistir((t) => ({ ...t, siralama: sonrakiSiralama(t.siralama, alan) }))} />
      <SutunSecici
        visible={sutunAcik} testID={`${ayar.testID}-sutun-secici`} sutunlar={ayar.sutunlar} gorunur={tercih.sutunlar} azami={tablo.azami}
        onDegistir={(k) => degistir((t) => ({ ...t, sutunlar: sutunDegistir(t.sutunlar, k, tablo.azami) }))}
        onTasi={(k, yon) => degistir((t) => ({ ...t, sutunlar: sutunTasi(t.sutunlar, k, yon) }))}
        onVarsayilan={() => degistir((t) => ({ ...t, sutunlar: ayar.varsayilan }))}
        onClose={() => setSutunAcik(false)}
      />
      <SuzgecSecici
        visible={suzgecAcik} testID={`${ayar.testID}-suzgec-secici`} gruplar={tablo.gruplar} secim={tercih.suzgec}
        onSec={(g, d) => degistir((t) => ({ ...t, suzgec: suzgecSec(t.suzgec, g, d) }))}
        onTemizle={() => degistir((t) => ({ ...t, suzgec: {} }))}
        onClose={() => setSuzgecAcik(false)}
      />
    </View>
  );
}

/** Satırlar + ortak durumlar (iskelet · hata · boş · daha fazla). */
export function TabloListesi({ tablo, onPress, bos, bosSuzgecli, icon, goster }: {
  readonly tablo: VeriTablosu;
  readonly onPress: (r: ProjectionRecord) => void;
  readonly bos: string;
  readonly bosSuzgecli: string;
  readonly icon?: IconName;
  /** Görünüm penceresi (ör. "son 30 gün"): sunucunun sırasıyla gelen satırlardan yalnız bunlar çizilir. */
  readonly goster?: (r: ProjectionRecord) => boolean;
}) {
  const { list } = tablo;
  const satirlar = goster ? list.items.filter(goster) : list.items;
  // Sıra pencereyle aynı yöndeyse ilk dışarıdaki satır pencerenin bittiğini söyler: "Daha fazla" gösterilmez.
  const son = list.items[list.items.length - 1];
  const durum: RemoteList = goster ? { ...list, items: satirlar, hasMore: list.hasMore && !(son && !goster(son)) } : list;
  return (
    <View>
      {satirlar.length > 0 ? (
        <TabloGovdesi testID={`${tablo.ayar.testID}-govde`}>
          {satirlar.map((r, i) => <TabloSatiri key={r.id} sutunlar={tablo.gorunur} kayit={r} ayrac={i > 0} onPress={() => onPress(r)} testID={`${tablo.ayar.testID}-satir-${r.id}`} />)}
        </TabloGovdesi>
      ) : null}
      <ListStates list={durum} empty={tablo.suzuldu ? bosSuzgecli : bos} icon={icon} testID={tablo.ayar.testID} />
    </View>
  );
}
