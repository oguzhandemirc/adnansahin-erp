// Kayıt durumu rozeti: ton → ortak `Rozet` tonu + simge (durum asla yalnız renkle söylenmez). Dört durum tonu
// success/warning/danger/info, "etkin" tema rengi (oynat), "notr" bilgi (saat), "sonuk" gri (kapanmış/iptal).
// Ton eşlemesinin tek kaynağı `lib/labels/uretim.ts`.
import type { RecordStatusEntry, RecordTone } from "../../lib/labels/uretim";
import type { IconName } from "../icons";
import { Rozet, type RozetTonu } from "../ortak";

const TON: Readonly<Record<RecordTone, { readonly ton: RozetTonu; readonly icon: IconName }>> = {
  iyi: { ton: "success", icon: "checkmark-circle" },
  uyari: { ton: "warning", icon: "alert-circle" },
  kritik: { ton: "danger", icon: "close-circle" },
  bilgi: { ton: "info", icon: "information-circle" },
  etkin: { ton: "primary", icon: "play-circle" },
  notr: { ton: "info", icon: "time-outline" },
  sonuk: { ton: "soft", icon: "remove-circle-outline" },
};

export function RecordStatusBadge({ entry, testID }: { readonly entry: RecordStatusEntry; readonly testID?: string }) {
  const c = TON[entry.tone];
  return <Rozet label={entry.label} tone={c.ton} icon={c.icon} testID={testID} accessibilityLabel={`Durum: ${entry.label}`} />;
}
