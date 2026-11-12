// Gönderilen kaydın ayrıntısı + iptal (yalnız yazar, yalnız BEKLIYOR; iki adımlı onay). Fabrika işlemeye başladıysa
// sunucu 409 döner ve ekran taze durumu gösterir. Hata alan kayıtta ret nedeni ilk blokta açıkça okunur.
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { errorMessage } from "../../../src/api/client";
import { formatDateTime } from "../../../src/lib/format";
import { canCancel, resultText } from "../../../src/lib/inbox";
import { useSession } from "../../../src/state/session";
import { retGoruldu } from "../../../src/state/okunmamis-ret";
import { useRemote } from "../../../src/state/useRemote";
import { Fields } from "../../../src/ui/data";
import { inboxRowText } from "../../../src/ui/diger/InboxRow";
import { inboxBody, inboxOverdue, inboxPending } from "../../../src/ui/diger/inbox-format";
import { GroupNote } from "../../../src/ui/diger/parts";
import { useSettlePoll } from "../../../src/ui/diger/useSettlePoll";
import { Screen } from "../../../src/ui/Frame";
import { KademeliGiris } from "../../../src/ui/hareket";
import { Banner, ConfirmButton } from "../../../src/ui/kit";
import { HataDurumu, IconTile, Iskelet, ListeBlogu, ListeSatiri, Rozet } from "../../../src/ui/ortak";
import { makeStyles } from "../../../src/ui/theme-context";
import { DOMAIN_TONE, FONT_SCALE, space, typography } from "../../../src/ui/tokens";

export default function InboxDetail() {
  const { mesajId } = useLocalSearchParams<{ mesajId: string }>();
  const { api, facility, permissions, offline } = useSession();
  const r = useRemote(mesajId ? `mesaj:${mesajId}` : null, () => api.inboxGet(String(mesajId)), { tags: ["gelen-kutusu"] });
  const s = useStyles();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const m = r.data;
  const me = { ad: facility?.hesap.ad ?? "", admin: permissions.includes("bulut:hesap:yonet") };
  useSettlePoll(!!m && inboxPending(m.durum), r.reload);
  // Ret nedeni bu ekranda okunur: okunmamış rozeti burada söner.
  useEffect(() => {
    if (m) retGoruldu(m);
  }, [m]);

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      await api.inboxCancel(String(mesajId));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
      r.reload();
    }
  }

  const x = m ? inboxRowText(m, true) : null;
  const body = m ? inboxBody(m) : null;
  const result = m ? resultText(m.sonuc) : null;
  return (
    <Screen title={x?.kind.ad ?? "Kayıt"} module="gelen-kutusu" back onRefresh={r.reload} refreshing={r.refreshing}>
      {r.loading && !m ? <Iskelet bicim="metin" satir={3} /> : null}
      {r.error && !m ? <HataDurumu mesaj={r.error} onTekrar={r.reload} /> : null}
      {m && x ? (
        <>
          <KademeliGiris sira={0}>
            <View style={s.kart} testID="mesaj-baslik">
              <IconTile icon={x.kind.icon} tone={x.neden ? "danger" : DOMAIN_TONE[x.kind.domain]} size="md" />
              <View style={s.flex}>
                <Text style={s.title} numberOfLines={2} maxFontSizeMultiplier={FONT_SCALE.title}>{x.birincil}</Text>
                <Text style={s.sub} numberOfLines={1} maxFontSizeMultiplier={FONT_SCALE.title}>{m.hesapAdi}</Text>
              </View>
              {x.rozet ? <Rozet label={x.rozet.label} tone={x.rozet.tone} testID="mesaj-durum" /> : null}
            </View>
          </KademeliGiris>
          {m.durum === "REDDEDILDI" ? <Banner tone="error" text={result ? `Fabrika kabul etmedi: ${result}` : "Fabrika bu kaydı kabul etmedi."} testID="mesaj-ret" /> : null}
          {m.durum === "ISLENDI" && result ? <Banner tone="off" icon="checkmark-circle" text={result} testID="mesaj-sonuc" /> : null}
          {m.durum !== "ISLENDI" && m.durum !== "REDDEDILDI" && result ? <Banner tone="off" text={result} /> : null}
          {inboxOverdue(m) ? <Banner tone="warn" icon="time-outline" text="Bu kayıt 24 saattir fabrikaya ulaşmadı. Fabrikanın bağlı ve eşitlemenin çalıştığını kontrol edin." /> : null}

          <ListeBlogu baslik="Zaman çizelgesi" testID="mesaj-zaman">
            <ListeSatiri birincil="Gönderildi" icon="paper-plane-outline" deger={formatDateTime(m.olusturulma)} ayrac={false} />
            {m.islenme ? <ListeSatiri birincil={m.durum === "REDDEDILDI" ? "Yanıtlandı" : "İşlendi"} icon="checkmark-done-outline" deger={formatDateTime(m.islenme)} /> : null}
            {m.iptal ? <ListeSatiri birincil="İptal edildi" icon="close-circle-outline" deger={formatDateTime(m.iptal)} /> : null}
          </ListeBlogu>

          {body && body.rows.length > 0 ? (
            <ListeBlogu baslik="İçerik" testID="mesaj-icerik">
              {body.rows.map((row, i) => (
                <View key={row.label} style={[s.kv, i > 0 && s.ayrac]}>
                  <Text style={s.k}>{row.label}</Text>
                  <Text style={s.v} selectable>{row.value}</Text>
                </View>
              ))}
            </ListeBlogu>
          ) : null}
          {body && body.lines.length > 0 ? (
            <>
              <ListeBlogu baslik="Kalemler" sayi={body.lines.length} testID="mesaj-kalemler">
                {body.lines.map((l, i) => (
                  <ListeSatiri key={i} birincil={l.title} ikincil={l.detail || undefined} deger={l.amount} ayrac={i > 0} />
                ))}
              </ListeBlogu>
              <GroupNote>Ürün ve cari adları fabrika kaydı işleyince sipariş kaydında görünür.</GroupNote>
            </>
          ) : null}
          {!body ? (
            <ListeBlogu baslik="İçerik">
              <View style={s.kv}><Fields value={m.govde} /></View>
            </ListeBlogu>
          ) : null}

          {error ? <Banner tone="error" text={error} /> : null}
          {canCancel(m, me) ? (
            <View style={s.cancel}>
              <ConfirmButton label="Kaydı iptal et" question="Bu kayıt fabrikaya iletilmeden iptal edilsin mi?" busy={busy} disabled={offline} onConfirm={() => void cancel()} testID="mesaj-iptal" />
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  kart: { flexDirection: "row" as const, alignItems: "center" as const, gap: space.m, padding: space.l, marginTop: space.xs, backgroundColor: t.color.card, borderRadius: t.radius.card, borderWidth: 1, borderColor: t.color.cardBorder, ...t.shadow.card },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  title: { ...typography.headline, color: t.color.text },
  sub: { ...typography.subhead, color: t.color.textMuted },
  kv: { flexDirection: "row" as const, justifyContent: "space-between" as const, gap: space.m, paddingHorizontal: space.l, paddingVertical: space.m, minHeight: 48, alignItems: "center" as const },
  ayrac: { borderTopWidth: 1, borderTopColor: t.color.cardBorder },
  k: { ...typography.subhead, color: t.color.textMuted },
  v: { ...typography.callout, color: t.color.text, flexShrink: 1, textAlign: "right" as const },
  cancel: { marginTop: space.l },
}));
