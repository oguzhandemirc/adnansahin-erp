// Liste yetenekleri SUNUCUDAN (`GET /oturum` `liste`): eski sunucu alanı göndermez ve tanımadığı süzgeç parametresini
// yok sayar (süzülmemiş liste döner) — bu yüzden kimlik süzgeci ve yeni arama yalnız sunucu beyan ettiyse kullanılır.
// Süzgeç DEĞERLERİ (2026-11-19): tanınmayan `?suzgec=` değeri bulutta FAIL-CLOSED 400'dür ⇒ sunucu `suzgecDegerleri`
// beyan ediyorsa seçenekler yalnız beyanlı değerlerdir; beyan etmeyen eski bulutta ters eşitlik (`degil`, ör. "İptaller
// hariç") seçenekleri hiç çizilmez ve gönderilmez. Saklı tercih silinmez; `sunucuSorgusu` seçenekte olmayanı göndermez.
import { LIST_DATE_RANGES, LIST_SEARCH, LIST_VALUE_FILTERS, type FacilityStatus, type ListDateRange, type ListFilterOption, type ListIdFilterKey, type ListMemberFilterKey, type ListSearchSpec, type ListValueFilter } from "../../api/wire";
import { useSession } from "../../state/session";

export interface ListCapability {
  /** Sunucu `projection` listesinde `key` kimlik süzgecini kabul ediyor mu. */
  idFilter(projection: string, key: ListIdFilterKey): boolean;
  /** Sunucu bu listede arama + süzgeç kabul ediyorsa beyan (uygulamanın tel aynasından, sunucunun tanıdığı değerlere süzülü); yoksa null. */
  search(projection: string): ListSearchSpec | null;
  /** Sunucu `projection` listesinde üyelik süzgecini (kimlik dizisi) kabul ediyor mu; eski sunucu: hayır. */
  memberFilter(projection: string, key: ListMemberFilterKey): boolean;
  /** (2026-11-20) Sunucunun bu listede kabul ettiği değer süzgeci alanları (`?secim=`); eski sunucu: yok. */
  valueFilters(projection: string): readonly ListValueFilter[];
  /** (2026-11-20) Sunucunun bu listede kabul ettiği tarih aralığı alanları (`?aralik=`); eski sunucu: yok. */
  dateRanges(projection: string): readonly ListDateRange[];
  /** (2026-11-20) Toplam ucu alanları (boş dizi = yalnız sayı); eski sunucu: null (şerit yok). */
  totals(projection: string): readonly string[] | null;
}

// Süzülmüş beyanın kopyası kararlı tutulur (kancalar `spec` kimliğine göre yeniden hesaplar).
const onbellek = new Map<string, ListSearchSpec>();

/** Beyanı sunucunun tanıdığı süzgeç değerlerine indirir (bkz. dosya başı). */
export function suzgecDegerleriyle(projection: string, spec: ListSearchSpec, beyan: readonly string[] | undefined): ListSearchSpec {
  const gecer = (o: ListFilterOption) => (beyan ? beyan.includes(o.deger) : !o.degil);
  const tumu = [...(spec.suzgec?.secenekler ?? []), ...(spec.ekSuzgecler ?? []).flatMap((g) => g.secenekler)];
  if (tumu.every(gecer)) return spec;
  const anahtar = `${projection}|${beyan ? beyan.join(",") : "-"}`;
  const hazir = onbellek.get(anahtar);
  if (hazir) return hazir;
  const yeni: ListSearchSpec = {
    ...spec,
    suzgec: spec.suzgec ? { ...spec.suzgec, secenekler: spec.suzgec.secenekler.filter(gecer) } : null,
    ...(spec.ekSuzgecler ? { ekSuzgecler: spec.ekSuzgecler.map((g) => ({ ...g, secenekler: g.secenekler.filter(gecer) })) } : {}),
  };
  onbellek.set(anahtar, yeni);
  return yeni;
}

export function listCapability(facility: FacilityStatus | null): ListCapability {
  const liste = facility?.liste;
  return {
    idFilter: (projection, key) => !!liste?.kimlikSuzgecleri[key]?.includes(projection),
    search: (projection) => {
      if (!liste?.aranabilir.includes(projection) || !Object.prototype.hasOwnProperty.call(LIST_SEARCH, projection)) return null;
      const spec = LIST_SEARCH[projection];
      return spec ? suzgecDegerleriyle(projection, spec, liste.suzgecDegerleri?.[projection]) : null;
    },
    memberFilter: (projection, key) => !!liste?.uyelikSuzgecleri?.[key]?.includes(projection),
    // Beyan ile tel aynasının KESİŞİMİ: sunucu beyan etse de uygulamanın tanımadığı alan çizilmez (ve tersi).
    valueFilters: (projection) => {
      const beyan = liste?.degerSuzgecleri?.[projection];
      const tanim = Object.hasOwn(LIST_VALUE_FILTERS, projection) ? LIST_VALUE_FILTERS[projection]! : [];
      return beyan ? tanim.filter((f) => beyan.includes(f.alan)) : [];
    },
    dateRanges: (projection) => {
      const beyan = liste?.tarihAraliklari?.[projection];
      const tanim = Object.hasOwn(LIST_DATE_RANGES, projection) ? LIST_DATE_RANGES[projection]! : [];
      return beyan ? tanim.filter((f) => beyan.includes(f.alan)) : [];
    },
    totals: (projection) => liste?.toplamlar?.[projection] ?? null,
  };
}

export function useListCapability(): ListCapability {
  return listCapability(useSession().facility);
}
