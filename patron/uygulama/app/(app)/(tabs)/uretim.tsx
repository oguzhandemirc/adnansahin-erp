// Üretim sekmesi (soru-cevap tasarımı §3.2): üç soru, hepsi ANLIK (dönem şeridi yok). İLK blok "Üretimdeki toplar
// nerede?" (2026-11-16, patronun en sık sorusu) — Kurşun + KK2 · Tambur · Boyahane + firmalar; satırlar TEK seçiciden
// (`ui/uretim/nerede` productionLocations: bugün `uretim-akisi` + `fason-acik`, ileride `uretim-toplar`); satır → o
// konumun iş emri listesi. "Bugün ne bitti?" — `ozet.uretim` bugün biten + KK1 girişi · "Açık iş emirleri" — ilk
// satırlar + Tümü. Ham stok ve depo Stok sekmesinde; ekran toplamaz.
// Kart seçimi (2026-11-17): başlıktaki simge → blokları aç/kapa (hepsi kapatılabilir). Eklenenler KAPALI gelir: üretim
// akışının bütün kolonları · istasyon tablosu (sütun seçicili) · fason özeti · hizmet kategorileri — hepsi aynı
// anlıkların (`uretim-akisi` · `fason-acik`) telde olup çizilmeyen alanları. Seçim `tablo.is-emri` tercihinde.
import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import { formatNumber } from "../../../src/lib/format";
import { isEmriTemizle } from "../../../src/ui/is-emri/sutunlar";
import { AZAMI_SUTUN, siganSutun, sutunDegistir, sutunTasi } from "../../../src/ui/tablo/model";
import { SutunSecici, VisibilityPicker } from "../../../src/ui/tablo/Seciciler";
import { useTabloTercihi, type TabloTercihiDurumu } from "../../../src/ui/tablo/useTabloTercihi";
import { AracDugmesi, TabloBasligi, TabloGovdesi, TabloSatiri, toplamGenislik, useYatayEksen } from "../../../src/ui/tablo/VeriTablosu";
import {
  ISTASYON_SUTUNLARI, ISTASYON_VARSAYILAN, URETIM_KARTLARI, akisSatirlari, istasyonSutunYaz, istasyonSutunlari, uretimKartDegistir, uretimKartSifirla, uretimKartlari,
  type UretimKartKey,
} from "../../../src/ui/uretim/kartlar";
import { can } from "../../../src/lib/access";
import { UNIT } from "../../../src/lib/labels/uretim";
import { useSession } from "../../../src/state/session";
import { Screen } from "../../../src/ui/Frame";
import { Basilabilir, KademeliGiris } from "../../../src/ui/hareket";
import { asamaMetni, kumasMetni, musteriMetni, topMetni, type Kayit } from "../../../src/ui/is-emri/gorunum";
import { openRecord } from "../../../src/ui/nav";
import { BlokBasligi, ListeBlogu, ListeSatiri, StatCard } from "../../../src/ui/ortak";
import { arr, num, obj, qty, str } from "../../../src/ui/pano/read";
import { SnapshotGate } from "../../../src/ui/pano/SnapshotGate";
import { combine, useSnapshot } from "../../../src/ui/pano/useSnapshot";
import { useListCapability } from "../../../src/ui/siparis/capabilities";
import { ListStates } from "../../../src/ui/siparis/parts";
import { useRemoteList } from "../../../src/ui/siparis/useRemoteList";
import { productionLocations } from "../../../src/ui/uretim/nerede";
import { Iskelet } from "../../../src/ui/ortak";
import { makeStyles, useTokens } from "../../../src/ui/theme-context";
import { TOUCH, space, typography } from "../../../src/ui/tokens";

/** KK1 (ham mal girişi) istasyon türü — fabrikanın `StationKind` kodu. */
const HAM_GIRIS_TURU = "RAW_QC";
/** Üretimde ilk bu kadar açık iş emri; gerisi "Tümü" (İş emirleri ekranı). */
const ILK_IS_EMRI = 10;

export default function Production() {
  const { permissions } = useSession();
  const router = useRouter();
  const s = useStyles();
  const read = can(permissions, "bulut:uretim:oku");
  const summary = read && can(permissions, "bulut:ozet:oku");
  const today = useSnapshot("ozet.uretim", summary);
  const flow = useSnapshot("uretim-akisi", read);
  const fason = useSnapshot("fason-acik", read);
  // Açık süzgeci yalnız sunucu is-emri aramasını beyan ettiyse: eski sunucu süzgeci yok sayar, kapananları da döndürürdü.
  const ieArama = useListCapability().search("is-emri");
  const pref = useTabloTercihi("tablo.is-emri", isEmriTemizle);
  const [secici, setSecici] = useState(false);
  const shown = uretimKartlari(pref.tercih);
  const goster = (x: UretimKartKey) => shown.includes(x);
  // Blok kapalıysa liste istenmez; yerel tercih okunana dek beklenir (kapalı blok için boşa istek yok).
  const ieAcik = read && ieArama !== null && pref.hazir && goster("isEmirleri");
  const isEmirleri = useRemoteList("is-emri", { suzgec: "ACIK" }, { limit: ILK_IS_EMRI, enabled: ieAcik });
  const t = useTokens();
  const kartDugmesi = (
    <Basilabilir onPress={() => setSecici(true)} style={s.kartDugmesi} accessibilityRole="button" accessibilityLabel="Kartları seç" testID="uretim-kart-sec">
      <Ionicons name="options-outline" size={22} color={t.color.link} />
    </Basilabilir>
  );
  const fasonVeri = obj(fason.data?.veri);
  const kategoriler = arr(fasonVeri.kategoriler);
  const all = combine([today, flow, fason]);
  // Fason anlığı yüklenirken akışın kaba "Fasonda" satırı çizilip sonra firma satırlarına dönmesin: o sırada iskelet.
  const fasonLoading = fason.loading && !fason.data;

  const bugunBiten = today.data ? num(obj(today.data.veri).bugunTamamlananToplam) : null;
  const kk1 = flow.data ? arr(obj(flow.data.veri).istasyonlar).filter((x) => str(x.tur) === HAM_GIRIS_TURU) : [];
  const hamGiris = kk1.length > 0 ? kk1.reduce((n, x) => n + (num(x.bugunTamamlanan) ?? 0), 0) : null;

  return (
    <Screen module="uretim" onRefresh={() => { all.reload(); if (ieAcik) isEmirleri.reload(); }} refreshing={all.refreshing || isEmirleri.refreshing} headerRight={kartDugmesi}>
      {goster("nerede") ? (
      <KademeliGiris sira={0}>
        <SnapshotGate remote={flow} variant="list" rows={4} empty="Fabrikadan üretim verisi henüz gelmedi" testID="uretim-akisi">
          {(veri) => {
            const rows = productionLocations({ flow: veri, fason: fason.data?.veri }).filter((r) => !(fasonLoading && r.location === "fason"));
            return (
              <>
                <ListeBlogu baslik="Üretimdeki toplar nerede?" testID="bolum-nerede">
                  {rows.map((r, i) => (
                    <ListeSatiri
                      key={r.key}
                      birincil={r.label}
                      ikincil={r.detail ?? undefined}
                      ikiSatir={!!r.detail}
                      deger={r.value}
                      icon={r.icon}
                      ton={r.tone}
                      girinti={r.firm}
                      ayrac={i > 0}
                      onPress={() => router.push({ pathname: "/is-emirleri/konum", params: r.params } as never)}
                      testID={`nerede-${r.key}`}
                    />
                  ))}
                </ListeBlogu>
                {fasonLoading ? <Iskelet bicim="liste" satir={1} testID="nerede-fason-yukleniyor" /> : null}
              </>
            );
          }}
        </SnapshotGate>
      </KademeliGiris>
      ) : null}

      {(goster("bugunBiten") && bugunBiten !== null) || (goster("hamGiris") && hamGiris !== null) ? (
        <KademeliGiris sira={1} style={s.blok}>
          <BlokBasligi baslik="Bugün ne bitti?" testID="bolum-bugun" />
          <View style={s.ikili} testID="uretim-kpi">
            {goster("bugunBiten") && bugunBiten !== null ? (
              <View style={s.yarim}>
                <StatCard etiket="İstasyonlarda" icon="checkmark-done-outline" ton="violet" degerler={[{ deger: qty(bugunBiten), birim: UNIT.top }]} ipucu="bugün biten" testID="kpi-bugun-tamamlanan" />
              </View>
            ) : null}
            {goster("hamGiris") && hamGiris !== null ? (
              <View style={s.yarim}>
                <StatCard etiket="Ham mal girişi" icon="enter-outline" ton="teal" degerler={[{ deger: qty(hamGiris), birim: UNIT.top }]} ipucu="bugün KK1" testID="kpi-ham-giris" />
              </View>
            ) : null}
          </View>
        </KademeliGiris>
      ) : null}

      {ieAcik && !isEmirleri.forbidden ? (
        <KademeliGiris sira={2}>
          <ListeBlogu
            baslik="Açık iş emirleri"
            testID="bolum-is-emirleri"
            sag={
              <Basilabilir onPress={() => router.push("/is-emirleri" as never)} accessibilityRole="link" testID="is-emirleri-tumu">
                <Text style={[typography.footnote, s.tumu, { color: t.color.link }]}>Tümü</Text>
              </Basilabilir>
            }
          >
            {isEmirleri.items.slice(0, ILK_IS_EMRI).map((r, i) => {
              const k = (r.kayit ?? {}) as Kayit;
              return (
                <ListeSatiri
                  key={r.id}
                  birincil={musteriMetni(k)}
                  ikincil={`${topMetni(k)} top · ${kumasMetni(k)}`}
                  deger={asamaMetni(k)}
                  ayrac={i > 0}
                  onPress={() => openRecord(router, "is-emri", r.id)}
                  testID={`ie-${r.id}`}
                />
              );
            })}
            <ListStates list={{ ...isEmirleri, hasMore: false }} empty="Açık iş emri yok" iskeletSatir={3} testID="is-emirleri" />
          </ListeBlogu>
        </KademeliGiris>
      ) : null}

      {goster("akis") && flow.data ? (
        <KademeliGiris sira={3}>
          <ListeBlogu baslik="Üretim akışı" testID="bolum-akis">
            {akisSatirlari(flow.data.veri).map((x, i) => (
              <ListeSatiri key={x.key} birincil={x.etiket} ikincil={x.not ?? undefined} deger={x.deger} ayrac={i > 0} testID={`akis-${x.key}`} />
            ))}
          </ListeBlogu>
        </KademeliGiris>
      ) : null}

      {goster("istasyonlar") && flow.data ? (
        <KademeliGiris sira={4}>
          <IstasyonTablosu satirlar={arr(obj(flow.data.veri).istasyonlar)} pref={pref} />
        </KademeliGiris>
      ) : null}

      {goster("fasonOzet") && fason.data && num(fasonVeri.acikSevk) !== null ? (
        <KademeliGiris sira={5}>
          <ListeBlogu baslik="Fason özeti" testID="bolum-fason-ozet">
            {[
              { key: "sevk", etiket: "Açık fason sevki", deger: fasonVeri.acikSevk, birim: "sevk" },
              { key: "top", etiket: "Fasondaki top", deger: fasonVeri.acikTop, birim: "top" },
              { key: "boyahane", etiket: "Boyahanedeki top", deger: fasonVeri.boyahanedeTop, birim: "top" },
              { key: "metre", etiket: "Fasonda kalan metre", deger: fasonVeri.kalanMiktar, birim: "m" },
              { key: "isEmri", etiket: "İş emri", deger: fasonVeri.isEmriSayisi, birim: "iş emri" },
              { key: "musteri", etiket: "Müşteri", deger: fasonVeri.musteriSayisi, birim: "müşteri" },
            ].filter((x) => num(x.deger) !== null).map((x, i) => (
              <ListeSatiri key={x.key} birincil={x.etiket} deger={`${formatNumber(x.deger, 0)} ${x.birim}`} ayrac={i > 0} testID={`fason-ozet-${x.key}`} />
            ))}
          </ListeBlogu>
        </KademeliGiris>
      ) : null}

      {goster("fasonKategori") && kategoriler.length > 0 ? (
        <KademeliGiris sira={6}>
          <ListeBlogu baslik="Fason hizmet kategorileri" testID="bolum-fason-kategori">
            {kategoriler.map((x, i) => (
              <ListeSatiri
                key={str(x.kod) ?? String(i)} birincil={str(x.ad) ?? str(x.kod) ?? "—"}
                ikincil={num(x.kalanMiktar) !== null ? `${formatNumber(x.kalanMiktar, 0)} m` : undefined}
                deger={`${formatNumber(x.acikTop, 0)} top`} ayrac={i > 0} testID={`fason-kategori-${str(x.kod) ?? i}`}
              />
            ))}
          </ListeBlogu>
        </KademeliGiris>
      ) : null}

      <VisibilityPicker
        visible={secici} title="Kartları seç" testID="uretim-kart-secici"
        items={URETIM_KARTLARI} shown={shown} enAz={0}
        onToggle={(x) => pref.degistir((p) => uretimKartDegistir(p, x as UretimKartKey))}
        onDefault={() => pref.degistir(uretimKartSifirla)}
        onClose={() => setSecici(false)}
      />
    </Screen>
  );
}

/** İstasyon başına kuyruk · aktif · bugün (fabrikanın sırasıyla; sıralama/süzme yok — tek belge). Sütunlar seçilir. */
function IstasyonTablosu({ satirlar, pref }: { readonly satirlar: readonly Readonly<Record<string, unknown>>[]; readonly pref: TabloTercihiDurumu }) {
  const [acik, setAcik] = useState(false);
  const eksen = useYatayEksen();
  const genislik = useWindowDimensions().width;
  const sutunlar = istasyonSutunlari(pref.tercih);
  const gorunur = sutunlar.flatMap((k) => ISTASYON_SUTUNLARI.filter((c) => c.key === k));
  const yatay = gorunur.length > siganSutun(genislik) ? eksen : null;
  const yaz = (f: (s: readonly string[]) => readonly string[]) => pref.degistir((t) => istasyonSutunYaz(t, f(istasyonSutunlari(t))));
  return (
    <View testID="bolum-istasyonlar">
      <BlokBasligi baslik="İstasyonlar" sayi={satirlar.length} sag={<AracDugmesi icon="grid-outline" label="Sütunlar" onPress={() => setAcik(true)} testID="istasyon-sutunlar" />} />
      <TabloBasligi testID="istasyon" sutunlar={gorunur} siralama={null} siralanabilir={[]} onSirala={() => undefined} yatay={yatay ?? undefined} />
      <TabloGovdesi testID="istasyon-govde" yatay={yatay ? { eksen: yatay, genislik: toplamGenislik(gorunur) } : undefined}>
        {satirlar.map((r, n) => <TabloSatiri key={str(r.id) ?? String(n)} yatay={!!yatay} sutunlar={gorunur} kayit={r} ayrac={n > 0} testID={`istasyon-satir-${str(r.id) ?? n}`} />)}
      </TabloGovdesi>
      <SutunSecici
        visible={acik} testID="istasyon-sutun-secici" sutunlar={ISTASYON_SUTUNLARI} gorunur={sutunlar} azami={AZAMI_SUTUN}
        onDegistir={(k) => yaz((s) => sutunDegistir(s, k, AZAMI_SUTUN))}
        onTasi={(k, yon) => yaz((s) => sutunTasi(s, k, yon))}
        onVarsayilan={() => yaz(() => ISTASYON_VARSAYILAN)}
        onClose={() => setAcik(false)}
      />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  kartDugmesi: { minWidth: TOUCH, minHeight: TOUCH, alignItems: "center" as const, justifyContent: "center" as const },
  ikili: { flexDirection: "row" as const, gap: space.m },
  yarim: { flex: 1, minWidth: 0, flexDirection: "row" as const },
  tumu: { fontWeight: "600" as const },
  blok: { marginTop: space.l },
}));
