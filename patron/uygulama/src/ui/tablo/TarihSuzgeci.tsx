// Süzgeç sayfasının TARİH alanı (2026-11-20): hazır dönemler (Bugün · Bu hafta · Bu ay · Geçen ay) tek dokunuşla, ya da
// iki tarih arası elle (GG.AA.YYYY; uçlardan biri boş bırakılabilir). Yeni npm paketi yok: tarih seçici yerine sayısal
// klavyeli iki kısa alan. Seçim taslaktır; Süzgeç sayfasının "Uygula"sı işler.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { Button, Field } from "../kit";
import { makeStyles } from "../theme-context";
import { space, typography } from "../tokens";
import { aralikYaz, gunOku, TARIH_DONEMLERI } from "./genisSuzgec";
import { SecenekSatiri } from "./Suzgec";

const ARALIK = /^(\d{4}-\d{2}-\d{2})?\.\.(\d{4}-\d{2}-\d{2})?$/;
const yaziOf = (gun: string | undefined) => (gun ? `${gun.slice(8, 10)}.${gun.slice(5, 7)}.${gun.slice(0, 4)}` : "");

export function TarihSecenekleri(p: {
  readonly secili: string | undefined;
  readonly onSec: (v: string | null) => void;
  readonly testID: string;
}) {
  const s = useStyles();
  const elle = p.secili ? ARALIK.exec(p.secili) : null;
  const [bas, setBas] = useState(yaziOf(elle?.[1]));
  const [son, setSon] = useState(yaziOf(elle?.[2]));
  const [hata, setHata] = useState<string | null>(null);
  const uygula = () => {
    const b = gunOku(bas);
    const e = gunOku(son);
    if (b === undefined || e === undefined) return setHata("Tarihi GG.AA.YYYY biçiminde yazın (ör. 01.11.2026)");
    if (b === null && e === null) return setHata("En az bir tarih yazın");
    const v = aralikYaz(b, e);
    if (!v) return setHata("Başlangıç bitişten sonra olamaz");
    setHata(null);
    p.onSec(v);
  };
  return (
    <ScrollView style={s.kap} contentContainerStyle={s.ic} keyboardShouldPersistTaps="handled" testID={`${p.testID}-tarih`}>
      <View style={s.liste}>
        <SecenekSatiri etiket="Tümü" on={!p.secili} coklu={false} onPress={() => p.onSec(null)} testID={`${p.testID}-tumu`} />
        {TARIH_DONEMLERI.map((d) => (
          <SecenekSatiri key={d.deger} etiket={d.etiket} on={p.secili === d.deger} coklu={false} ayrac onPress={() => p.onSec(d.deger)} testID={`${p.testID}-${d.deger}`} />
        ))}
      </View>
      <Text style={s.baslik}>İki tarih arası</Text>
      <View style={s.ikili}>
        <View style={s.yarim}>
          <Field label="Başlangıç" value={bas} onChangeText={setBas} placeholder="GG.AA.YYYY" keyboardType="numbers-and-punctuation" maxLength={10} testID={`${p.testID}-bas`} />
        </View>
        <View style={s.yarim}>
          <Field label="Bitiş" value={son} onChangeText={setSon} placeholder="GG.AA.YYYY" keyboardType="numbers-and-punctuation" maxLength={10} testID={`${p.testID}-son`} />
        </View>
      </View>
      {hata ? <Text style={s.hata} testID={`${p.testID}-hata`}>{hata}</Text> : null}
      <Button label="Bu aralığı seç" onPress={uygula} testID={`${p.testID}-aralik`} />
    </ScrollView>
  );
}

const useStyles = makeStyles((t) => ({
  kap: { flex: 1 },
  ic: { gap: space.m, paddingBottom: space.l },
  liste: { backgroundColor: t.surfaceAlt, borderRadius: t.radius.cardInner, paddingVertical: space.xs },
  baslik: { ...typography.footnote, color: t.textSecondary, fontWeight: "600" as const, marginTop: space.s },
  ikili: { flexDirection: "row" as const, gap: space.m },
  yarim: { flex: 1, minWidth: 0 },
  hata: { ...typography.footnote, color: t.color.danger.fg },
}));
