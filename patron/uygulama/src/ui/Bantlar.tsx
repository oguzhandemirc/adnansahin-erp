// Durum bantları: çevrimdışı / salt-okunur / eşitleme gecikti. `Banner` üstüne kurulur; testID'ler sabit.
import { Banner } from "./kit";

export function OfflineBand({ text, testID = "bant-cevrimdisi" }: { readonly text: string; readonly testID?: string }) {
  return <Banner tone="off" icon="cloud-offline-outline" text={text} testID={testID} />;
}

export function ReadOnlyBand({ text, testID = "bant-salt-okunur" }: { readonly text: string; readonly testID?: string }) {
  return <Banner tone="warn" icon="lock-closed-outline" text={text} testID={testID} />;
}

export function SyncLateBand({ text, testID = "bant-gecikme" }: { readonly text: string; readonly testID?: string }) {
  return <Banner tone="warn" icon="time-outline" text={text} testID={testID} />;
}
