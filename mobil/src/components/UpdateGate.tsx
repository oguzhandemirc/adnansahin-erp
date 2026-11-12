// =============================================================================
// TeksERP Mobil — güncelleme kapısı (tek karar noktası)
// =============================================================================
// Görünmez bileşen. Güncellemenin TEK yolu Google Play'dir:
//  · Sunucu politikası (`/api/client-policy/mobil`) bu sürümü eski sayıyorsa
//    Play'in zorunlu (tam ekran) akışı açılır ve kilit örtüsü basılır.
//  · Değilse isteğe bağlı sürüm "Güncelle" kartıyla önerilir.
// İkisi de yalnız operatör boştayken (`usePlayUpdate`). Play dışı kurulumda
// Play yolu susar; politika şeridi yine görünür.
// =============================================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { useAuthStore } from '../store/authStore';

import { kuruluVersionName } from '../services/appVersion';
import { bekleyenYazimSayisi } from '../offline/pendingStationWrites';
import {
  kilitlenmeliMi,
  politikaDegerlendir,
  politikaOku,
  type PolitikaDurumu,
} from '../services/clientPolicy.service';
import { usePlayUpdate } from '../hooks/usePlayUpdate';
import PlayUpdateCard from './PlayUpdateCard';
import { installedFromPlay } from '../services/playUpdate';
import { colors } from '../theme/tokens';

export default function UpdateGate() {
  const [politikaDurum, setPolitikaDurum] = useState<PolitikaDurumu>({ eski: false, sebep: null });
  const play = usePlayUpdate(politikaDurum.eski);

  const politikaKontrol = useCallback(async () => {
    const politika = await politikaOku();
    setPolitikaDurum(politikaDegerlendir({ politika, apkSurumu: kuruluVersionName() }));
  }, []);

  useEffect(() => {
    void politikaKontrol();
    const sub = AppState.addEventListener('change', (durum) => {
      if (durum === 'active') void politikaKontrol();
    });
    return () => sub.remove();
  }, [politikaKontrol]);

  // Her girişte taze politika: vardiya değişiminde giren kişi eski sonucun gölgesinde kalmasın.
  const token = useAuthStore((st) => st.token);
  const oncekiToken = useRef<string | null>(null);
  useEffect(() => {
    const girisOldu = !oncekiToken.current && !!token;
    oncekiToken.current = token;
    if (girisOldu) void politikaKontrol();
  }, [token, politikaKontrol]);

  const bekleyen = bekleyenYazimSayisi();
  const kilit = kilitlenmeliMi({
    durum: politikaDurum,
    duzeltmeHazir: play.decision === 'hemen',
    bekleyenYazim: bekleyen,
  });

  // KİLİT — yalnız Play zorunlu akışı açılabilirken ve kuyruk boşken.
  if (kilit) {
    return (
      <View style={styles.ortu} pointerEvents="auto">
        <Text style={styles.baslik}>Güncelleme gerekli</Text>
        <Text style={styles.alt}>
          Sunucu daha yeni bir uygulama sürümü bekliyor. Google Play’den güncelleyin.
        </Text>
        <Button
          mode="contained"
          buttonColor={colors.brand}
          style={styles.dugme}
          onPress={() => play.update(true)}
        >
          Güncelle
        </Button>
      </View>
    );
  }

  // ŞERİT — sürüm eski ama kilit koşulu yok (iş ekranı, kuyruk, internet). Üretim durmaz.
  if (politikaDurum.eski) {
    return (
      <View style={styles.serit} pointerEvents="box-none">
        <Text style={styles.seritMetin}>
          {bekleyen > 0
            ? `Sürümünüz eski · ${bekleyen} kayıt gönderilince güncellenecek`
            : installedFromPlay()
              ? 'Sürümünüz eski · boşta olduğunuz ilk anda güncellenecek'
              : 'Sürümünüz eski · Google Play’den güncelleyin'}
        </Text>
      </View>
    );
  }

  // PLAY — isteğe bağlı sürüm; yalnız boştayken, dokunmayı yalnız kartın kendisi alır.
  if (play.decision === 'indiriliyor') {
    return (
      <View style={styles.serit} pointerEvents="none">
        <Text style={styles.seritMetin}>Yeni sürüm indiriliyor…</Text>
      </View>
    );
  }
  if (play.decision === 'yeniden-baslat' || (play.decision === 'oner' && !play.dismissed)) {
    return <PlayUpdateCard state={play} />;
  }

  return null;
}

const styles = StyleSheet.create({
  ortu: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(24,29,49,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 9999,
    elevation: 9999,
  },
  baslik: { color: '#fff', fontSize: 20, fontWeight: '700' },
  alt: { color: '#c7cbe0', fontSize: 15, textAlign: 'center', paddingHorizontal: 32 },
  dugme: { marginTop: 20, borderRadius: 10, minWidth: 200 },
  // Şerit ekranın ÜSTÜNDE ve dokunmayı geçirir (box-none): operatör çalışmaya
  // devam edebilmeli — bu, kilidin bilinçli olarak yumuşatılmış hâli.
  serit: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#7c5800',
    paddingVertical: 6,
    paddingHorizontal: 12,
    zIndex: 9998,
    elevation: 9998,
  },
  seritMetin: { color: '#fff', fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
