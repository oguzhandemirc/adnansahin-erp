// İş emri ayrıntısı (soru-cevap tasarımı §3.3; 2026-11-16 "üretimdeki toplar nerede?"): üstte dört net satır —
// Kimin (müşteri → cari kartı) · Hangi sipariş ("İş emrinin siparişi" → sipariş; çokluysa hepsi; bağsızsa
// "Siparişsiz (stok)") · Ne (kumaş · renk) · Nerede (aşama; boyahanedeyse firma + "N gündür" küçük ve renksiz; top · metre).
// Altında KAPALI gelen "Üretim ayrıntıları": no, tür, durum, açılış, hedef, en, giren/üretilen/sipariş metresi, aşama
// başına top · metre. Hepsi fabrikanın alanları; ekran yalnız etikete çevirir (yeniden hesap yok; termin/gecikme yok).
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";
import { moduleVisible } from "../../../src/lib/access";
import { formatNumber } from "../../../src/lib/format";
import { useSession } from "../../../src/state/session";
import { useRemote } from "../../../src/state/useRemote";
import { Screen } from "../../../src/ui/Frame";
import { KademeliGiris } from "../../../src/ui/hareket";
import { acik, asamaSayilari, detailRows, fasonFirmCell, fasonGunu, gunMetni, isEmriNo, kumasMetni, NO_ORDER_TEXT, siparisIdleri, siparisNolari, siparissiz, stageAmount, topMetreMetni, whereText, type Kayit } from "../../../src/ui/is-emri/gorunum";
import { AcilirKart, HataDurumu, Iskelet, ListeBlogu, ListeSatiri } from "../../../src/ui/ortak";
import { StaleNote } from "../../../src/ui/siparis/parts";
import { makeStyles } from "../../../src/ui/theme-context";
import { space, typography } from "../../../src/ui/tokens";

const metin = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const metinler = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x !== "") : []);

export default function WorkOrderDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, permissions } = useSession();
  const router = useRouter();
  const s = useStyles();
  const [ayrinti, setAyrinti] = useState(false);
  const r = useRemote(id ? `kayit:is-emri:${id}` : null, () => api.record("is-emri", String(id)));
  const k: Kayit = typeof r.data?.kayit === "object" && r.data?.kayit !== null ? (r.data.kayit as Kayit) : {};
  const cariIdleri = metinler(k.cariKartIdleri);
  const musteriAdlari = metinler(k.musteriAdlari);
  const cariAcik = moduleVisible(permissions, "cariler");
  const musteriler = cariIdleri.length > 0
    ? cariIdleri.map((cid, i) => ({ id: cid, ad: musteriAdlari[i] ?? (i === 0 ? metin(k.musteriAdi) : null) ?? "—" }))
    : [{ id: null as string | null, ad: metin(k.musteriAdi) ?? (siparissiz(k) ? "Stok için üretim" : "—") }];
  const sipNo = siparisNolari(k);
  const sipId = siparisIdleri(k);
  const sayilar = asamaSayilari(k);
  const firmaIdleri = metinler(k.fasonFirmaIdleri);
  const fasonda = acik(k) && k.asama === "fason" && metin(k.fasonFirmaAdi) !== null;
  const gun = fasonda ? fasonGunu(k) : null;
  const burada = acik(k) ? stageAmount(k, metin(k.asama)) : { top: null, metre: null };
  // Firma adı kesilmesin: büyük değer yalnız top; metre ve gün alt satırda (gün küçük, renksiz).
  const buradaTop = burada.top === null ? undefined : `${formatNumber(burada.top, 0)} top`;
  // Fasondayken başlık yalnız firma adı (dar ekranda kesilmesin); "Boyahanede" + metre + gün alt satırda.
  const yer = whereText(k);
  const buradaAlt = [fasonda ? yer.split(" – ")[0] : null, burada.metre === null ? null : `${formatNumber(burada.metre, 0)} m`, gun !== null ? gunMetni(gun) : null].filter(Boolean).join(" · ");

  return (
    <Screen title={r.data ? isEmriNo(k) : "İş emri"} module="uretim" back onRefresh={r.reload} refreshing={r.refreshing} subtitle={<StaleNote stale={r.stale} savedAt={r.savedAt} />}>
      {r.loading && !r.data ? <Iskelet bicim="kpi" satir={2} /> : null}
      {r.error && !r.data ? <HataDurumu mesaj={r.error} onTekrar={r.reload} /> : null}
      {r.data ? (
        <>
          <KademeliGiris sira={0}>
            <ListeBlogu baslik="Kimin" testID="is-emri-kim">
              {musteriler.map((m, i) => (
                <ListeSatiri
                  key={m.id ?? "yok"} birincil={m.ad} icon="person-outline" ton="primary" ayrac={i > 0}
                  onPress={m.id && cariAcik ? () => router.push({ pathname: "/cariler/[id]", params: { id: m.id! } } as never) : undefined}
                  testID={i === 0 ? "is-emri-musteri" : `is-emri-musteri-${i}`}
                />
              ))}
            </ListeBlogu>
          </KademeliGiris>

          <KademeliGiris sira={1}>
            <ListeBlogu baslik="İş emrinin siparişi" sayi={sipNo.length > 1 ? sipNo.length : undefined} testID="is-emri-siparisler">
              {sipNo.length === 0 ? (
                <ListeSatiri birincil={siparissiz(k) ? NO_ORDER_TEXT : "—"} icon="document-text-outline" ton="sky" ayrac={false} testID="is-emri-siparissiz" />
              ) : (
                sipNo.map((no, i) => {
                  const sid = sipId[i];
                  return (
                    <ListeSatiri
                      key={`${no}-${i}`} birincil={no} icon="document-text-outline" ton="blue" ayrac={i > 0}
                      onPress={sid ? () => router.push({ pathname: "/siparisler/[id]", params: { id: sid } } as never) : undefined}
                      testID={`is-emri-siparis-${i}`}
                    />
                  );
                })
              )}
            </ListeBlogu>
          </KademeliGiris>

          <KademeliGiris sira={2}>
            <ListeBlogu baslik="Ne" testID="is-emri-ne">
              <ListeSatiri birincil={kumasMetni(k)} icon="layers-outline" ton="teal" ayrac={false} testID="is-emri-kumas" />
            </ListeBlogu>
          </KademeliGiris>

          <KademeliGiris sira={3}>
            <ListeBlogu baslik="Nerede" testID="is-emri-nerede">
              <ListeSatiri
                birincil={fasonda ? fasonFirmCell(k) : yer}
                ikincil={buradaAlt || undefined}
                ikiSatir={!!buradaAlt}
                deger={buradaTop}
                icon={fasonda ? "business-outline" : "location-outline"} ton={fasonda ? "orange" : "violet"}
                ayrac={false}
                onPress={fasonda && firmaIdleri.length >= 1 ? () => router.push({ pathname: "/fason", params: { firma: firmaIdleri[0]! } } as never) : undefined}
                testID={fasonda ? "is-emri-fason-firma" : "is-emri-yer"}
              />
            </ListeBlogu>
          </KademeliGiris>

          <KademeliGiris sira={4} style={s.ayrinti}>
            <AcilirKart baslik="Üretim ayrıntıları" aciklama={topMetreMetni(k)} acik={ayrinti} onDegistir={() => setAyrinti((x) => !x)} testID="is-emri-ayrinti">
              {detailRows(k).map((b) => (
                <View key={b.key} style={s.bilgi} testID={`is-emri-bilgi-${b.key}`}>
                  <Text style={s.etiket} numberOfLines={1}>{b.etiket}</Text>
                  <Text style={s.deger} numberOfLines={1}>{b.deger}</Text>
                </View>
              ))}
              {sayilar.length > 0 ? <Text style={s.alt}>Toplar nerede?</Text> : null}
              {sayilar.map((a) => (
                <View key={a.anahtar} style={s.bilgi} testID={`is-emri-asama-${a.anahtar}`}>
                  <Text style={s.etiket} numberOfLines={1}>{a.etiket}</Text>
                  <Text style={s.deger} numberOfLines={1}>{`${formatNumber(a.top, 0)} top${a.metre !== null ? ` · ${formatNumber(a.metre, 0)} m` : ""}`}</Text>
                </View>
              ))}
            </AcilirKart>
          </KademeliGiris>
        </>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  ayrinti: { marginTop: space.l },
  bilgi: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, gap: space.m, minHeight: 40, borderTopWidth: 1, borderTopColor: t.color.cardBorder },
  etiket: { ...typography.label, color: t.color.textMuted, flexShrink: 1 },
  deger: { fontSize: 15, lineHeight: 20, fontWeight: "600" as const, color: t.color.text, flexShrink: 0, maxWidth: "65%" as const },
  alt: { ...typography.caption, color: t.color.textMuted, marginTop: space.m, marginBottom: space.xs },
}));
