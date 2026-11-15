// "Taleplerim" — ince kabuk (mantık `useTaleplerim`, satır `TalepSatiri`).
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, SegmentedButtons, Text } from 'react-native-paper';
import { FlashList } from '@shopify/flash-list';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '../../theme';
import type { RootStackParamList } from '../../navigation/types';
import type { DestekKapsam } from '../../services/destek.service';
import DestekBaslik from './DestekBaslik';
import TalepSatiri from './TalepSatiri';
import { AYDINLATMA, destekHataMetni } from './destekMetin';
import { useTaleplerim } from './useTaleplerim';
import { useYeniTalepBaslat } from './useSorunBildir';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function BosVeyaHata({ l, onYeni }: { l: ReturnType<typeof useTaleplerim>; onYeni: () => void }) {
  if (l.yukleniyor) return <ActivityIndicator style={styles.orta} />;
  if (l.hata) {
    return (
      <View style={styles.orta}>
        <Text style={styles.bilgi}>{destekHataMetni(l.hata)}</Text>
        <Button mode="outlined" icon="refresh" onPress={l.yenile} contentStyle={styles.buyuk}>
          Tekrar dene
        </Button>
      </View>
    );
  }
  return (
    <View style={styles.orta}>
      <Text style={styles.bilgi}>Henüz destek talebiniz yok.</Text>
      <Button mode="contained" icon="plus" onPress={onYeni} contentStyle={styles.buyuk}>
        Yeni talep
      </Button>
    </View>
  );
}

export default function DestekTaleplerimScreen() {
  const nav = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const l = useTaleplerim();
  const yeniTalep = useYeniTalepBaslat();
  const yeni = () => yeniTalep('Taleplerim');

  return (
    <View style={styles.kok}>
      <DestekBaslik
        baslik="Taleplerim"
        sag={
          <Button mode="contained" icon="plus" onPress={yeni} style={styles.yeni} contentStyle={styles.yeniIc}>
            Yeni
          </Button>
        }
      />
      {l.firmaSekmesi ? (
        <View style={styles.sekmeKap}>
          <SegmentedButtons
            value={l.kapsam}
            onValueChange={(v) => l.setKapsam(v as DestekKapsam)}
            buttons={[
              { value: 'mine', label: 'Benim' },
              { value: 'tenant', label: 'Firmanın' },
            ]}
          />
        </View>
      ) : null}
      <FlashList
        data={l.satirlar}
        keyExtractor={(t) => t.id}
        renderItem={({ item }) => (
          <TalepSatiri
            t={item}
            talepEdeniGoster={l.kapsam === 'tenant'}
            onPress={() => nav.navigate('DestekDetay', { id: item.id, number: item.number })}
          />
        )}
        onEndReached={l.dahaFazla}
        onRefresh={l.yenile}
        refreshing={l.yenileniyor}
        contentContainerStyle={{ padding: spacing.md, paddingBottom: spacing.xxl + insets.bottom }}
        ListEmptyComponent={<BosVeyaHata l={l} onYeni={yeni} />}
        ListFooterComponent={<Text style={styles.aydinlatma}>{AYDINLATMA}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  kok: { flex: 1, backgroundColor: colors.appBg },
  sekmeKap: { paddingHorizontal: spacing.md, paddingTop: spacing.md },
  orta: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.md },
  bilgi: { color: colors.textSecondary, fontSize: 15, textAlign: 'center' },
  buyuk: { height: 56 },
  yeni: { marginRight: spacing.sm },
  yeniIc: { height: 44 },
  aydinlatma: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: spacing.md },
});
