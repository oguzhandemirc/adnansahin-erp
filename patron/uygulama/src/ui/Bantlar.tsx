// Durum bantları: çevrimdışı / salt-okunur / bağlanıyor / bayat fabrika verisi. `Banner` üstüne kurulur; testID'ler sabit.
import { Banner } from "./kit";

export function OfflineBand({ text, testID = "bant-cevrimdisi" }: { readonly text: string; readonly testID?: string }) {
  return <Banner tone="off" icon="cloud-offline-outline" text={text} testID={testID} />;
}

export function ReadOnlyBand({ text, testID = "bant-salt-okunur" }: { readonly text: string; readonly testID?: string }) {
  return <Banner tone="warn" icon="lock-closed-outline" text={text} testID={testID} />;
}

/** Fabrika buluta henüz bağlanmadı (hiç eşitleme yok): sakin bilgi bandı, uyarı rengi değil. */
export function PendingConnectionBand({ text, testID = "bant-baglaniyor" }: { readonly text: string; readonly testID?: string }) {
  return <Banner tone="off" icon="sync-outline" text={text} testID={testID} />;
}

/** Fabrika verisi uzun süredir güncellenmedi (`lib/tazelik.ts` eşiği): tazelik başlıkta olmadığı için gizlenmez. */
export function StaleFactoryBand({ text, testID = "bant-bayat" }: { readonly text: string; readonly testID?: string }) {
  return <Banner tone="warn" icon="time-outline" text={text} testID={testID} />;
}
