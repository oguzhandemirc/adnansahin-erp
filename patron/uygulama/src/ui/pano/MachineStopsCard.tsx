// Üretim sekmesi "Makineler neden durdu?" kartı (D4-A4b, ister 5.5): fabrikanın `rapor-katalogu` anlığında
// `production/makine-duruslari` varsa rapor isteme ekranını açar; yoksa (eski fabrika sürümü ya da duruş takibi
// kapalı) nötr boş durum; katalog hatası ayrı metin + "Tekrar dene". İzin yoksa kart hiç çizilmez ve katalog çekilmez (koşulsuz 403 sorgusu atılmaz).
import { useRouter } from "expo-router";
import { reportTitle } from "../../lib/labels/finans";
import { catalogEntries, requestable } from "../../lib/reports";
import { useSession } from "../../state/session";
import { useRemote } from "../../state/useRemote";
import { ReportTile } from "../raporlar/parts";
import { BlokBasligi, BosDurum, Iskelet } from "../ortak";
import { EMPTY_ICON } from "../icons";

export const MACHINE_STOPS_REPORT_KEY = "production/makine-duruslari";

export function MachineStopsCard() {
  const { api, permissions } = useSession();
  const router = useRouter();
  const allowed = requestable(MACHINE_STOPS_REPORT_KEY, permissions);
  const catalog = useRemote(allowed ? "anlik:rapor-katalogu" : null, () => api.snapshot("rapor-katalogu"));
  if (!allowed) return null;
  const entry = catalogEntries(catalog.data?.veri).find((e) => e.anahtar === MACHINE_STOPS_REPORT_KEY);
  const title = entry?.baslik ?? reportTitle(MACHINE_STOPS_REPORT_KEY);
  const rawQuestion: unknown = entry ? (entry as { soru?: unknown }).soru : undefined;
  const question = typeof rawQuestion === "string" && rawQuestion !== "" ? rawQuestion : undefined;

  return (
    <>
      <BlokBasligi baslik="Makineler neden durdu?" testID="bolum-makine-duruslari" />
      {catalog.loading && !catalog.data ? <Iskelet bicim="liste" satir={1} /> : null}
      {entry ? (
        <ReportTile
          anahtar={MACHINE_STOPS_REPORT_KEY}
          baslik={title}
          soru={question}
          onPress={() => router.push({ pathname: "/raporlar/yeni", params: { anahtar: MACHINE_STOPS_REPORT_KEY } } as never)}
        />
      ) : catalog.error && !catalog.data ? (
        <BosDurum
          baslik="Fabrikadan rapor kataloğu henüz gelmedi"
          icon={EMPTY_ICON.bekliyor}
          eylem="Tekrar dene"
          onEylem={catalog.reload}
          testID="makine-duruslari-katalog-hata"
        />
      ) : catalog.data ? (
        <BosDurum
          baslik="Makine duruşları raporu bu fabrikada açık değil ya da fabrika güncellenince gelir"
          icon={EMPTY_ICON.bekliyor}
          testID="makine-duruslari-yok"
        />
      ) : null}
    </>
  );
}
