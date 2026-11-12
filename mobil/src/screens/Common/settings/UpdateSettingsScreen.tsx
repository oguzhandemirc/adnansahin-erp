// =============================================================================
// Ayarlar → Güncelleme
// =============================================================================
// Sahadaki "hangi sürüm çalışıyor" sorusunun cevap yeri + Play'de elle denetim.
// Güncellemenin tek yolu Google Play'dir; otomatik denetim `UpdateGate`te,
// burası yalnız operatörün "şimdi bak" isteğidir.
// =============================================================================

import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Icon } from 'react-native-paper';
import Toast from 'react-native-toast-message';

import { kuruluVersionCode, kuruluVersionName } from '../../../services/appVersion';
import {
  installedFromPlay,
  manualCheckOutcome,
  queryPlay,
  startPlayUpdate,
} from '../../../services/playUpdate';
import { withSystemDialog } from '../../../store/lockStore';
import { useBusyAction } from '../../../hooks/useBusyAction';
import {
  SETTINGS_COLORS as COLORS,
  SettingsActionButton,
  SettingsPage,
  settingsStyles,
} from './settingsUi';

/** `14:07` — "denetledim ama hiçbir şey olmadı" hissine karşı zaman damgası. */
function saatSimdi(): string {
  const d = new Date();
  const iki = (n: number) => String(n).padStart(2, '0');
  return `${iki(d.getHours())}:${iki(d.getMinutes())}`;
}

export default function UpdateSettingsScreen() {
  const playdenKurulu = installedFromPlay();
  const [sonuc, setSonuc] = useState<string | null>(null);

  const { busy: denetleniyor, tetikle: denetle } = useBusyAction(
    useCallback(async () => {
      setSonuc(null);
      const q = playdenKurulu ? await queryPlay() : ({ kind: 'hata' } as const);
      return manualCheckOutcome(playdenKurulu, q);
    }, [playdenKurulu]),
    {
      bitince: (o) => {
        if (o.action === 'baslat') {
          setSonuc(`Play güncelleme akışı açıldı · ${saatSimdi()}`);
          void withSystemDialog(() => startPlayUpdate(o.flow));
          return;
        }
        setSonuc(`${o.text} · ${saatSimdi()}`);
        Toast.show({ type: o.action === 'hata' ? 'error' : 'info', text1: o.text });
      },
    },
  );

  return (
    <SettingsPage title="Güncelleme">
      <View style={settingsStyles.card}>
        <View style={settingsStyles.headRow}>
          <View style={settingsStyles.iconBox}>
            <Icon source="cellphone-arrow-down" size={26} color={COLORS.accentLight} />
          </View>
          <View style={settingsStyles.headText}>
            <Text style={settingsStyles.title}>Çalışan sürüm</Text>
            <Text style={settingsStyles.subtitle}>
              Sahada &quot;hangi sürüm var&quot; sorusunun cevabı.
            </Text>
          </View>
        </View>

        <Satir etiket="Uygulama" deger={kuruluVersionName()} />
        <Satir etiket="Sürüm kodu" deger={String(kuruluVersionCode() || '—')} />
        <Satir etiket="Kurulum kaynağı" deger={playdenKurulu ? 'Google Play' : 'Play dışı'} />
      </View>

      <View style={settingsStyles.card}>
        <Text style={settingsStyles.label}>GOOGLE PLAY</Text>
        <Text style={settingsStyles.subtitle}>
          Yeni sürümler Google Play’den gelir; hazır olunca uygulama ana menüde bildirir.
        </Text>
        {sonuc && <Text style={styles.durum}>{sonuc}</Text>}
        <SettingsActionButton
          tone="primary"
          icon="google-play"
          label="Play’de güncelleme denetle"
          busyLabel="Denetleniyor…"
          busy={denetleniyor}
          onPress={denetle}
          style={styles.dugme}
        />
      </View>
    </SettingsPage>
  );
}

function Satir({ etiket, deger }: { etiket: string; deger: string }) {
  return (
    <View style={styles.satir}>
      <Text style={styles.satirEtiket}>{etiket}</Text>
      <Text style={[styles.satirDeger, settingsStyles.mono]} numberOfLines={2}>
        {deger}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  satir: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 7,
  },
  satirEtiket: { color: COLORS.subtext, fontSize: 13, fontWeight: '600' },
  // `minWidth: 0` — uzun değer etiketi ezmesin (saran esnek kutuda taşma dersi).
  satirDeger: { flex: 1, minWidth: 0, fontSize: 13, textAlign: 'right' },
  durum: { color: COLORS.text, fontSize: 13, marginTop: 10 },
  dugme: { marginTop: 16, borderRadius: 10 },
});
