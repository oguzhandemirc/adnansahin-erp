import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { kuruluVersionName } from '../services/appVersion';

/**
 * Giriş ekranının altındaki sürüm satırı — sahada destek isteyen kişiye okutulan
 * ilk bilgi. Güncelleme durumu burada değil: Play kartı ve Ayarlar → Güncelleme.
 */
export function SurumRozeti() {
  return (
    <View style={s.kap} pointerEvents="none">
      <Text style={s.metin}>TeksERP v{kuruluVersionName()}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  kap: { position: 'absolute', bottom: 8, left: 0, right: 0, alignItems: 'center' },
  metin: { color: '#64748b', fontSize: 11, fontWeight: '600' },
});
