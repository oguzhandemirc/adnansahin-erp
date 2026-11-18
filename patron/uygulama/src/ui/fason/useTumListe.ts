// Bulut listesini BÜTÜN sayfalarıyla yükler (en büyük sayfa 200): istemcide süzülecek küme tam olmalı (yarım kümede
// süzgeç "kayıt yok" diye yalan söylerdi). `tam` yalnız son sayfa geldiğinde true; hata olursa durur (yeniden deneme
// ekranın yenilemesiyle).
import { useEffect } from "react";
import { useRemoteList, type ListQuery, type RemoteList } from "../siparis/useRemoteList";

export const TUM_LISTE_SAYFA = 200;

export function useTumListe(projeksiyon: string, sorgu: ListQuery, enabled: boolean): RemoteList & { readonly tam: boolean } {
  const list = useRemoteList(projeksiyon, sorgu, { limit: TUM_LISTE_SAYFA, enabled });
  const { loading, hasMore, loadingMore, error, loadMore } = list;
  useEffect(() => {
    if (enabled && !loading && hasMore && !loadingMore && !error) loadMore();
  }, [enabled, loading, hasMore, loadingMore, error, loadMore, list.items.length]);
  // Çevrimdışıyken yalnız saklı ilk sayfa var ve devamı olup olmadığı bilinmez ⇒ tam sayılmaz.
  return { ...list, tam: enabled && !loading && !hasMore && !loadingMore && !error && !list.offline };
}
