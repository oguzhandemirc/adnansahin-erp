// BEKÇİ — her veri tablosunda dört özellik (kullanıcı kuralı 2026-11-20, ui-tercihleri 13): (a) sütun seçimi, (b) arama,
// (c) süzgeç, (d) sütun başlığından sıralama. `app/` + `src/` altındaki her tablo kullanımı taranır (ortak katman
// `src/ui/tablo/` hariç — dördü orada bağlanır):
//   • `useVeriTablosu(` / `useCihazVeriTablosu(` (sunucu tablosu) → dosya `<TabloUstu` (arama · süzgeç · sütunlar) ve
//     `<TabloListesi` (başlık sıralaması) çizer.
//   • `useYerelTablo(` → `<YerelTablo ` ya da parçalar (`<YerelTabloAraclari` + `<YerelTabloBasligi` + `<YerelTabloGovdesi`);
//     `simgeDisarida` ise `<YerelTabloSimgeleri` de.
//   • `<KisaTablo` → her kullanımda `anahtar=` (cihaz tercihi: sütun seçimi + sıralama).
//   • Yerel/kısa tablo dosyası süzgeç alanı beyan eder (`suzgec` ya da `ozel`); yoksa süzgeç düğmesi hiç çizilmez.
//   • Ortak katman dışında doğrudan `<TabloBasligi` (elle bağlanmış tablo) → dosya `ELLE_BAGLI` listesinde olmalı ve
//     `SutunSecici` + `SuzgecSayfasi` + `<TabloAraclari` (`ara=`, `onSuzgec=`) taşımalı; her `<TabloBasligi` bloğu
//     `onSirala=` + `siralanabilir=` verir.
//   • Her yerde yasak: `siralanabilir={[]}` · `onSirala={() => undefined}` (sıralamayı söken iki kalıp).
//   • Listeden tabloya çevrilmiş yüzeyler (`ZORUNLU_TABLOLAR`) kendi anahtarlı tablosunu taşır (düz listeye dönüş kırmızı).
// Muafiyet yalnız `MUAF` listesinden ve gerekçeyle (şu an boş). Tarayıcı saftır; negatif sondalar sentetik kaynakla.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const KOK = join(__dirname, "..");
const KATMAN = "src/ui/tablo/";

/** Elle bağlanmış (ortak katmanı kullanmayan) tablolar: dördü dosyada açıkça bağlı. */
const ELLE_BAGLI: readonly string[] = [
  "app/(app)/fason/index.tsx", // fason tablosu: firma/işlem süzgeci + fabrika paylarının toplamı alana özel
  "app/(app)/cuvallar.tsx", // çuval deposu: açılır top satırı + parti süzgeci alana özel
  "src/ui/stok/StokKalemBolumu.tsx", // kalem/top listesi: alt toplam satırı aynı süzgeç durumunu okur (stokSuzgecDurumu)
];
/** Dört özellikten muaf tablo dosyaları (dosya → gerekçe). Boş olması beklenir. */
const MUAF: Readonly<Record<string, string>> = {};

/**
 * Listeden tabloya çevrilmiş yüzeyler (2026-11-20, kullanıcı: "Dördünü de çevir"): dosya → cihaz tercihi anahtarı. Dosya
 * bu anahtarla bir `<KisaTablo>` (ya da `useYerelTablo`) taşımalı — düz listeye geri dönüş kırmızıdır.
 */
export const ZORUNLU_TABLOLAR: Readonly<Record<string, string>> = {
  "src/ui/siparis/OrderLines.tsx": "tablo.siparis-kalem", // sipariş ayrıntısı · kalemler
  "src/ui/siparis/OrderWorkOrders.tsx": "tablo.siparis-is-emri", // sipariş ayrıntısı · siparişin iş emirleri
  "src/ui/cari/OzetBolumleri.tsx": "tablo.cari-iade", // cari ayrıntısı · iadeler
  "app/(app)/is-emirleri/[id].tsx": "tablo.is-emri-asama", // iş emri ayrıntısı · aşama sayıları
};

/** SAF: zorunlu tablo dosyası o anahtarlı tabloyu taşıyor mu (yoksa bulgu). */
export function zorunluTabloDenetimi(dosya: string, kaynak: string, anahtar: string): Bulgu[] {
  const kisa = JSX_BLOK(kaynak, "<KisaTablo").some((b) => b.includes(`anahtar="${anahtar}"`));
  const yerel = new RegExp(`useYerelTablo[\\s\\S]*?anahtar:\\s*"${anahtar.replace(/[.]/g, "\\.")}"`).test(kaynak);
  return kisa || yerel ? [] : [{ dosya, neden: `${anahtar} tablosu yok (düz listeye dönmüş)` }];
}

export interface Bulgu {
  readonly dosya: string;
  readonly neden: string;
}

const JSX_BLOK = (kaynak: string, etiket: string): string[] => {
  const out: string[] = [];
  let i = kaynak.indexOf(etiket);
  while (i >= 0) {
    const son = kaynak.indexOf("/>", i);
    out.push(kaynak.slice(i, son < 0 ? undefined : son));
    i = kaynak.indexOf(etiket, i + etiket.length);
  }
  return out;
};
const etiketVar = (kaynak: string, etiket: string) => new RegExp(`<${etiket}[\\s/>]`).test(kaynak);

/** SAF: bir dosyanın tablo kullanımlarını denetler. */
export function tabloDenetimi(dosya: string, kaynak: string, elleBagli: readonly string[] = ELLE_BAGLI): Bulgu[] {
  if (dosya.startsWith(KATMAN)) return [];
  const b: Bulgu[] = [];
  const ekle = (neden: string) => b.push({ dosya, neden });
  if (/siralanabilir=\{\s*\[\s*\]\s*\}/.test(kaynak)) ekle("siralanabilir={[]} sıralamayı söker");
  if (/onSirala=\{\s*\(\s*\)\s*=>\s*undefined\s*\}/.test(kaynak)) ekle("onSirala={() => undefined} sıralamayı söker");

  const sunucu = /\buse(Cihaz)?VeriTablosu\s*\(/.test(kaynak);
  if (sunucu) {
    if (!etiketVar(kaynak, "TabloUstu")) ekle("sunucu tablosu <TabloUstu> (arama · süzgeç · sütunlar) çizmiyor");
    if (!etiketVar(kaynak, "TabloListesi")) ekle("sunucu tablosu <TabloListesi> (başlık sıralaması) çizmiyor");
  }

  const yerel = /\buseYerelTablo\s*(<[^>]*>)?\s*\(/.test(kaynak);
  if (yerel && !etiketVar(kaynak, "YerelTablo")) {
    for (const p of ["YerelTabloAraclari", "YerelTabloBasligi", "YerelTabloGovdesi"]) if (!etiketVar(kaynak, p)) ekle(`useYerelTablo parçası eksik: <${p}>`);
    if (/simgeDisarida\s*:\s*true/.test(kaynak) && !etiketVar(kaynak, "YerelTabloSimgeleri")) ekle("simgeDisarida ama <YerelTabloSimgeleri> çizilmiyor");
  }

  const kisa = JSX_BLOK(kaynak, "<KisaTablo");
  for (const blok of kisa) if (!/\banahtar=/.test(blok)) ekle("<KisaTablo> anahtar= (cihaz tercihi) vermiyor");
  if ((yerel || kisa.length > 0) && !/\bsuzgec\b|\bozel\b/.test(kaynak)) ekle("yerel tablo süzgeç alanı beyan etmiyor (suzgec/ozel)");

  const basliklar = JSX_BLOK(kaynak, "<TabloBasligi");
  if (basliklar.length > 0) {
    if (!elleBagli.includes(dosya)) ekle("ortak katman dışında doğrudan <TabloBasligi>: useYerelTablo/KisaTablo kullan ya da ELLE_BAGLI'ya gerekçeyle ekle");
    else {
      for (const m of ["SutunSecici", "SuzgecSayfasi"]) if (!kaynak.includes(m)) ekle(`elle bağlı tabloda ${m} yok`);
      const araclar = JSX_BLOK(kaynak, "<TabloAraclari");
      if (araclar.length === 0 || !araclar.some((x) => /\bara=/.test(x) && /\bonSuzgec=/.test(x))) ekle("elle bağlı tabloda <TabloAraclari ara= onSuzgec=> yok");
    }
    for (const blok of basliklar) if (!/\bonSirala=/.test(blok) || !/\bsiralanabilir=/.test(blok)) ekle("<TabloBasligi> onSirala= + siralanabilir= vermiyor");
  }
  return b;
}

function dosyalar(dizin: string): string[] {
  return readdirSync(dizin).flatMap((ad) => {
    const yol = join(dizin, ad);
    if (statSync(yol).isDirectory()) return ad === "node_modules" ? [] : dosyalar(yol);
    return /\.(ts|tsx)$/.test(ad) ? [yol] : [];
  });
}

describe("bekçi: her veri tablosunda dört özellik", () => {
  const tum = [...dosyalar(join(KOK, "app")), ...dosyalar(join(KOK, "src"))].map((y) => relative(KOK, y).split("\\").join("/"));
  const kaynak = (d: string) => readFileSync(join(KOK, d), "utf8");

  it("app/ + src/ altındaki her tablo kullanımı dördünü bağlar (muafiyet dışında)", () => {
    const bulgular = tum.filter((d) => !(d in MUAF)).flatMap((d) => tabloDenetimi(d, kaynak(d)));
    expect(bulgular).toEqual([]);
  });

  it("tarama gerçekten tablo buluyor (boş geçmez) ve ELLE_BAGLI/MUAF bayat değil", () => {
    const tablolu = tum.filter((d) => !d.startsWith(KATMAN) && /<KisaTablo|useYerelTablo|use(Cihaz)?VeriTablosu\s*\(|<TabloBasligi/.test(kaynak(d)));
    expect(tablolu.length).toBeGreaterThanOrEqual(12);
    for (const d of ELLE_BAGLI) expect(kaynak(d)).toMatch(/<TabloBasligi/);
    for (const d of Object.keys(MUAF)) expect(tum).toContain(d);
    expect(Object.keys(MUAF)).toEqual([]);
  });

  it("listeden tabloya çevrilen dört yüzey tablo olarak kalır (sipariş kalemleri · siparişin iş emirleri · cari iadeleri · aşama sayıları)", () => {
    const bulgular = Object.entries(ZORUNLU_TABLOLAR).flatMap(([d, a]) => zorunluTabloDenetimi(d, kaynak(d), a));
    expect(bulgular).toEqual([]);
  });

  describe("negatif sondalar (sentetik kaynak)", () => {
    it("düz listeye dönen zorunlu yüzey yakalanır; anahtarı başka tablo da yakalanır", () => {
      const liste = `<ListeBlogu baslik="Kalemler">{xs.map((r) => <ListeSatiri birincil={r.ad} />)}</ListeBlogu>`;
      expect(zorunluTabloDenetimi("src/x.tsx", liste, "tablo.siparis-kalem").map((x) => x.neden)).toEqual(["tablo.siparis-kalem tablosu yok (düz listeye dönmüş)"]);
      expect(zorunluTabloDenetimi("src/x.tsx", `<KisaTablo anahtar="tablo.baska" />`, "tablo.siparis-kalem")).toHaveLength(1);
      expect(zorunluTabloDenetimi("src/x.tsx", `<KisaTablo sutunlar={S} anahtar="tablo.siparis-kalem" />`, "tablo.siparis-kalem")).toEqual([]);
    });

    it("siralanabilir={[]} ve onSirala={() => undefined} yakalanır", () => {
      const k = `<TabloBasligi testID="x" sutunlar={s} siralama={null} siralanabilir={[]} onSirala={() => undefined} />`;
      const n = tabloDenetimi("app/ornek.tsx", k, ["app/ornek.tsx"]).map((x) => x.neden).join("|");
      expect(n).toMatch(/siralanabilir=\{\[\]\}/);
      expect(n).toMatch(/onSirala=\{\(\) => undefined\}/);
    });

    it("anahtarsız KisaTablo yakalanır; anahtarlı geçer", () => {
      expect(tabloDenetimi("src/x.tsx", `<KisaTablo sutunlar={S} satirlar={r} testID="t" />; const c = { suzgec: true };`).map((x) => x.neden)).toEqual(["<KisaTablo> anahtar= (cihaz tercihi) vermiyor"]);
      expect(tabloDenetimi("src/x.tsx", `<KisaTablo sutunlar={S} satirlar={r} anahtar="tablo.x" testID="t" />; const c = { suzgec: true };`)).toEqual([]);
    });

    it("süzgeç alanı olmayan yerel tablo yakalanır", () => {
      expect(tabloDenetimi("src/x.tsx", `<KisaTablo sutunlar={S} anahtar="tablo.x" testID="t" />`).map((x) => x.neden)).toEqual(["yerel tablo süzgeç alanı beyan etmiyor (suzgec/ozel)"]);
    });

    it("ELLE_BAGLI dışında doğrudan TabloBasligi yakalanır; elle bağlıda eksik araç yakalanır", () => {
      const k = `<TabloBasligi testID="x" sutunlar={s} siralama={p} siralanabilir={A} onSirala={f} />`;
      expect(tabloDenetimi("app/yeni.tsx", k).map((x) => x.neden)[0]).toMatch(/ortak katman dışında/);
      const n = tabloDenetimi("app/yeni.tsx", k, ["app/yeni.tsx"]).map((x) => x.neden);
      expect(n).toEqual(expect.arrayContaining(["elle bağlı tabloda SutunSecici yok", "elle bağlı tabloda SuzgecSayfasi yok", "elle bağlı tabloda <TabloAraclari ara= onSuzgec=> yok"]));
    });

    it("TabloUstu çizmeyen sunucu tablosu ve parçası eksik useYerelTablo yakalanır", () => {
      expect(tabloDenetimi("app/x.tsx", `const t = useVeriTablosu(A); <TabloListesi tablo={t} />`).map((x) => x.neden)).toEqual(["sunucu tablosu <TabloUstu> (arama · süzgeç · sütunlar) çizmiyor"]);
      const y = `const t = useYerelTablo({ simgeDisarida: true, suzgec: true }, r); <YerelTabloBasligi tablo={t} /><YerelTabloGovdesi tablo={t} />`;
      expect(tabloDenetimi("app/x.tsx", y).map((x) => x.neden)).toEqual(["useYerelTablo parçası eksik: <YerelTabloAraclari>", "simgeDisarida ama <YerelTabloSimgeleri> çizilmiyor"]);
    });
  });
});
