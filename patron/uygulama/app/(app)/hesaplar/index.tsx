// Hesaplar (yalnız tesis yöneticisi): tesisin bulut hesapları (tek satır; durum/Yönetici rozeti) · davet (başlık
// kapsülü) · verinin dışa aktarımı (Ek-6/A §4.2).
import { useRouter } from "expo-router";
import { useSession } from "../../../src/state/session";
import { useRemote } from "../../../src/state/useRemote";
import { AccountRow } from "../../../src/ui/diger/AccountRow";
import { GroupNote } from "../../../src/ui/diger/parts";
import { Screen } from "../../../src/ui/Frame";
import { EMPTY_ICON } from "../../../src/ui/icons";
import { BosDurum, HataDurumu, Iskelet, ListeBlogu, ListeSatiri } from "../../../src/ui/ortak";
import { CapsuleButton } from "../../../src/ui/siparis/parts";

export default function Accounts() {
  const { api, offline } = useSession();
  const router = useRouter();
  const r = useRemote("hesaplar", () => api.accountList());
  return (
    <Screen module="hesaplar" onRefresh={r.reload} refreshing={r.refreshing}
      headerRight={<CapsuleButton label="Davet et" icon="person-add" disabled={offline} onPress={() => router.push("/hesaplar/yeni")} testID="hesap-davet" />}
    >
      {r.loading && !r.data ? <Iskelet bicim="liste" satir={3} /> : null}
      {r.error && !r.data ? <HataDurumu mesaj={r.error} onTekrar={r.reload} /> : null}
      {r.data && r.data.length === 0 ? <BosDurum icon={EMPTY_ICON.hesap} baslik="Henüz hesap yok" aciklama="Ekibinizi davet edin." /> : null}
      {r.data && r.data.length > 0 ? (
        <ListeBlogu baslik="Ekip" sayi={r.data.length} testID="hesap-listesi">
          {r.data.map((a, i) => (
            <AccountRow key={a.id} a={a} ayrac={i > 0} onPress={() => router.push({ pathname: "/hesaplar/[id]", params: { id: a.id } } as never)} />
          ))}
        </ListeBlogu>
      ) : null}
      <GroupNote>Yönetici rozeti hesap yönetimi izni olanlardadır; izinleri hesaba dokunarak değiştirin.</GroupNote>
      <ListeBlogu baslik="Veri">
        <ListeSatiri birincil="Verileri dışa aktar" ikincil="JSON ya da CSV döküm" icon="download-outline" ton="sky" ayrac={false}
          onPress={() => router.push("/hesaplar/disa-aktar")} testID="hesap-disa-aktar" />
      </ListeBlogu>
    </Screen>
  );
}
