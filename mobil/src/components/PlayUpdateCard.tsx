// Play'den gelen isteğe bağlı sürüm kartı — "Güncelle" / "Yeniden başlat". Yalnız boştayken
// görünür (karar `UpdateGate`te); altta küçük kart, ekranın geri kalanı dokunmaya açık kalır.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';

import type { PlayUpdateState } from '../hooks/usePlayUpdate';
import { colors } from '../theme/tokens';

export default function PlayUpdateCard({ state }: { state: PlayUpdateState }) {
  const ready = state.decision === 'yeniden-baslat';
  return (
    <View style={styles.kap} pointerEvents="box-none">
      <View style={styles.kart}>
        <Text style={styles.metin}>{ready ? 'Yeni sürüm indirildi' : 'Yeni sürüm hazır'}</Text>
        {!ready && (
          <Button mode="text" textColor={colors.textOnDarkMuted} onPress={state.dismiss}>
            Sonra
          </Button>
        )}
        <Button
          mode="contained"
          buttonColor={colors.brand}
          onPress={ready ? state.restart : () => state.update(false)}
        >
          {ready ? 'Yeniden başlat' : 'Güncelle'}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  kap: { position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center', zIndex: 9998, elevation: 9998 },
  kart: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(24,29,49,0.96)',
    borderRadius: 12,
    paddingVertical: 6,
    paddingLeft: 16,
    paddingRight: 8,
  },
  metin: { color: colors.textOnDark, fontSize: 15, fontWeight: '600', marginRight: 4 },
});
