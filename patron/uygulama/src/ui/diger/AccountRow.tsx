// Hesap satırı (tek satır ListeSatiri): ad · son giriş; sağda durum rozeti (aktif değilse) ya da Yönetici rozeti.
// Rol ölçütü `roleOf` (`bulut:hesap:yonet` → Yönetici); yalnız gösterir, karar sunucudadır.
import type { LegacyAccount as Account } from "../../api/eski-uyelik";
import { formatAgo } from "../../lib/format";
import { statusEntry } from "../../lib/labels";
import { ListeSatiri, Rozet, STATUS_ROZET_TONU } from "../ortak";
import { ROLE_LABEL, roleOf } from "../RoleBadge";

export function lastSeen(a: Pick<Account, "sonGiris" | "durum" | "davetBitis">): string {
  if (a.sonGiris) return `Son giriş ${formatAgo(a.sonGiris)}`;
  return a.durum === "DAVETLI" ? "Daveti henüz kabul etmedi" : "Henüz giriş yapmadı";
}

export function AccountRow({ a, onPress, ayrac }: { readonly a: Account; readonly onPress: () => void; readonly ayrac?: boolean }) {
  const rol = roleOf(a.izinler);
  const durum = statusEntry(a.durum);
  const rozet = a.durum !== "AKTIF" ? <Rozet label={durum.label} tone={STATUS_ROZET_TONU[durum.tone]} />
    : rol === "yonetici" ? <Rozet label={ROLE_LABEL.yonetici} tone="primary" />
    : undefined;
  return (
    <ListeSatiri
      birincil={a.ad}
      ikincil={lastSeen(a)}
      icon={rol === "yonetici" ? "shield-checkmark-outline" : "person-outline"}
      ton={rol === "yonetici" ? "primary" : "sky"}
      rozet={rozet}
      ayrac={ayrac}
      onPress={onPress}
      testID={`hesap-${a.id}`}
      accessibilityLabel={`${a.ad}, ${ROLE_LABEL[rol]}, ${durum.label}, ${lastSeen(a)}`}
    />
  );
}
