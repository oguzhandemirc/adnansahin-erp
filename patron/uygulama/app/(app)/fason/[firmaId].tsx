// Eski fason firması rotası (2026-11-19'a dek ayrı ekran: Müşteriler | Kumaşlar | İş emirleri sekmeleri). Artık TEK fason
// tablosu var: bu rota, o firma ÖN SEÇİLİ süzgeçle `/fason`a yönlenir (eski bağlantılar kırılmasın).
import { Redirect, useLocalSearchParams } from "expo-router";

export default function SubcontractFirm() {
  const { firmaId } = useLocalSearchParams<{ firmaId: string }>();
  return <Redirect href={{ pathname: "/fason", params: firmaId ? { firma: String(firmaId) } : {} } as never} />;
}
