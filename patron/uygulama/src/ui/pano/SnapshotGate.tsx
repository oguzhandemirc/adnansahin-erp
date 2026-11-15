// Anlık kapısı: yükleniyor → iskelet · hata → "Tekrar dene" · veri yok → ikonlu boş · veri → içerik.
// 404 hata DEĞİLDİR: fabrika anlığı henüz yayınlamadı (ya da eski fabrika üretmiyor) → aynı boş durum (D4-KUC3c).
// Bayat (önbellek) veri çizilir. Tazelik YALNIZ başlıktaki tek göstergededir (2026-11-16): eski "Fabrika verisi HH:MM"
// satırı kaldırıldı — anlığın `surum`u içeriğin son DEĞİŞTİĞİ turdur (içerik özeti aynıysa fabrika yeniden
// göndermez), verinin yaşı değildir; başlıktaki ikinci saat kullanıcıyı yanıltıyordu.
import type { ReactNode } from "react";
import { View } from "react-native";
import type { Snapshot } from "../../api/wire";
import type { Remote } from "../../state/useRemote";
import { BosDurum, HataDurumu, Iskelet } from "../ortak";
import type { Domain } from "../tokens";
import { EMPTY_ICON } from "../icons";

export function SnapshotGate({ remote, variant = "kpi", rows, empty, children, testID }: {
  readonly remote: Remote<Snapshot>;
  /** Eski çağıranlar için; boş durum simgesi artık alan renginde değil. */
  readonly domain?: Domain;
  readonly variant?: "kpi" | "list";
  readonly rows?: number;
  readonly empty?: string;
  readonly children: (veri: unknown, snap: Snapshot) => ReactNode;
  readonly testID?: string;
}) {
  if (remote.data) return <View testID={testID}>{children(remote.data.veri, remote.data)}</View>;
  if (remote.loading) return <Iskelet bicim={variant === "kpi" ? "kpi" : "liste"} satir={rows ?? (variant === "kpi" ? 2 : 3)} testID={testID ? `${testID}-yukleniyor` : undefined} />;
  if (remote.error && !remote.notFound) return <HataDurumu mesaj={remote.error} onTekrar={remote.reload} testID={testID ? `${testID}-hata` : undefined} />;
  return <BosDurum baslik={empty ?? "Fabrikadan bu özet henüz gelmedi"} icon={EMPTY_ICON.bekliyor} testID={testID ? `${testID}-bos` : undefined} />;
}
