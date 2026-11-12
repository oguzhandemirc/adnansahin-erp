// Gönderdiklerim (gelen kutusu): telefondan fabrikaya gönderilen sipariş/cari kayıtları. Kayıt onay beklemez; ekran
// ikincil bir denetim listesidir — yalnız HATA alan (fabrikanın reddettiği) kayıt rozetle ve nedeniyle öne çıkar.
// Süzme SUNUCUDA (`durum`); istemci süzmez. Bekleyen kayıt varken kısa yoklama; "gelen-kutusu" etiketiyle tazelenir.
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { errorMessage } from "../../../src/api/client";
import type { InboxItem, InboxStatus } from "../../../src/api/wire";
import { can } from "../../../src/lib/access";
import { useSession } from "../../../src/state/session";
import { useRemote } from "../../../src/state/useRemote";
import { inboxPending } from "../../../src/ui/diger/inbox-format";
import { InboxRow } from "../../../src/ui/diger/InboxRow";
import { useSettlePoll } from "../../../src/ui/diger/useSettlePoll";
import { Screen } from "../../../src/ui/Frame";
import { Banner, Button } from "../../../src/ui/kit";
import { AltSekmeler, BosDurum, HataDurumu, Iskelet, ListeBlogu } from "../../../src/ui/ortak";

type Filter = "HEPSI" | InboxStatus;
const FILTERS: readonly { key: Filter; etiket: string }[] = [
  { key: "HEPSI", etiket: "Tümü" },
  { key: "REDDEDILDI", etiket: "Hata alanlar" },
];
const EMPTY: Readonly<Record<Filter, { baslik: string; aciklama?: string }>> = {
  BEKLIYOR: { baslik: "Sırada kayıt yok" },
  ISLENIYOR: { baslik: "İşlenmekte olan kayıt yok" },
  ISLENDI: { baslik: "İşlenen kayıt yok" },
  REDDEDILDI: { baslik: "Hata alan kayıt yok", aciklama: "Fabrikanın kabul etmediği bir kayıt olursa nedeniyle burada görünür." },
  IPTAL: { baslik: "İptal edilen kayıt yok" },
  HEPSI: { baslik: "Henüz kayıt göndermediniz", aciklama: "Telefondan girdiğiniz sipariş ve cariler burada listelenir." },
};

export default function Inbox() {
  const { api, permissions, offline } = useSession();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("HEPSI");
  const durum = filter === "HEPSI" ? undefined : filter;
  const r = useRemote(`gelen-kutusu:${filter}`, () => api.inboxList({ durum, limit: 50 }), { tags: ["gelen-kutusu"] });
  // İlk sayfa `useRemote`ta (önbellek + etiket); "Daha fazla" sayfaları ilk sayfa tazelenince sıfırlanır.
  const [more, setMore] = useState<{ items: InboxItem[]; next: string | null } | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  useEffect(() => {
    setMore(null);
    setMoreError(null);
  }, [r.data]);

  const items = [...(r.data?.kayitlar ?? []), ...(more?.items ?? [])];
  const next = more ? more.next : r.offline ? null : (r.data?.sonraki ?? null);
  useSettlePoll(items.some((m) => inboxPending(m.durum)), r.reload);

  async function loadMore(cursor: string) {
    setMoreBusy(true);
    setMoreError(null);
    try {
      const p = await api.inboxList({ durum, imlec: cursor, limit: 50 });
      setMore((o) => ({ items: [...(o?.items ?? []), ...p.kayitlar], next: p.sonraki }));
    } catch (err) {
      setMoreError(errorMessage(err));
    } finally {
      setMoreBusy(false);
    }
  }

  const admin = can(permissions, "bulut:hesap:yonet");
  const bos = EMPTY[filter];
  return (
    <Screen module="gelen-kutusu" back onRefresh={r.reload} refreshing={r.refreshing}>
      <AltSekmeler sekmeler={FILTERS} secili={filter} onSec={setFilter} testID="sekme" />
      {r.loading && !r.data ? <Iskelet bicim="liste" satir={4} /> : null}
      {r.error && !r.data ? <HataDurumu mesaj={r.error} onTekrar={r.reload} /> : null}
      {r.data && items.length === 0 ? <BosDurum icon="paper-plane-outline" baslik={bos.baslik} aciklama={bos.aciklama} testID="gelen-bos" /> : null}
      {items.length > 0 ? (
        <ListeBlogu testID="gelen-liste">
          {items.map((m, i) => (
            <InboxRow key={m.mesajId} m={m} ayrac={i > 0} showAuthor={admin} onPress={() => router.push({ pathname: "/gelen-kutusu/[mesajId]", params: { mesajId: m.mesajId } } as never)} />
          ))}
        </ListeBlogu>
      ) : null}
      {moreError ? <Banner tone="error" text={moreError} /> : null}
      {next ? <Button label="Daha fazla" tone="plain" icon="chevron-down" busy={moreBusy} disabled={offline} onPress={() => void loadMore(next)} testID="gelen-daha" /> : null}
    </Screen>
  );
}
