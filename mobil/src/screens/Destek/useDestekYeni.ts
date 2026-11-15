// Yeni destek talebi — ekran-hook.
// clientToken form açılınca BİR KEZ üretilir; belirsiz hatada (ağ/5xx/504) aynı
// token korunur ve form AÇIK kalır; başarı ya da kesin 4xx sonrası yenilenir
// (kurallar `destekForm.ts`). Çift dokunuş ikinci istek atmaz (uçuş kilidi).
// ÇEVRİMDIŞI KUYRUK YOK (bu sürümün kararı): bağlantı yoksa istek hiç
// çıkmaz, açık mesaj gösterilir. Kayıt merkezde doğar; tablette yerel kayıt yok.
import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Toast from 'react-native-toast-message';
import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { destekService, type DestekTalep, type TalepAcGovde } from '../../services/destek.service';
import { kuruluVersionCode, kuruluVersionName } from '../../services/appVersion';
import { sonHata } from '../../services/sonHata';
import { useDeviceType } from '../../hooks/useDeviceType';
import { useDestekTaslakStore } from '../../store/destekTaslakStore';
import type { RootStackParamList } from '../../navigation/types';
import { destekBaglami } from './destekBaglam';
import {
  dataUriBase64,
  formuDogrula,
  hataSonrasiToken,
  hataYokMu,
  talepGovdesi,
  yeniToken,
  type DestekFormDegeri,
  type FormHatalari,
} from './destekForm';
import { destekHataMetni } from './destekMetin';
import { destekKeys } from './useDestek';

export const CEVRIMDISI_METNI =
  'Sunucuya bağlantı yok. Talep kaydedilmedi; bağlantı gelince tekrar "Gönder"e basın.';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function govdeKur(form: DestekFormDegeri, clientToken: string, cihaz: 'tablet' | 'phone'): TalepAcGovde {
  const t = useDestekTaslakStore.getState();
  const baglam = destekBaglami({
    ekranAdi: t.ekranAdi,
    ekranAnahtari: t.ekranAnahtari,
    surum: kuruluVersionName(),
    yapiKodu: kuruluVersionCode(),
    platform: {
      os: Platform.OS,
      version: Platform.Version,
      constants: Platform.constants as unknown as Record<string, unknown>,
    },
    cihazTuru: cihaz,
    sonHata: sonHata(),
  });
  const ekran = t.sonuc?.base64 ?? dataUriBase64(t.ekran?.uri);
  return talepGovdesi({ form, clientToken, baglam, ekranJpegBase64: ekran });
}

export function useDestekYeni() {
  const nav = useNavigation<Nav>();
  const qc = useQueryClient();
  const cihaz = useDeviceType();
  const [form, setForm] = useState<DestekFormDegeri>({ tur: null, konu: '', mesaj: '' });
  const [hatalar, setHatalar] = useState<FormHatalari>({});
  const [gonderHatasi, setGonderHatasi] = useState<string | null>(null);
  const [gonderiliyor, setGonderiliyor] = useState(false);
  // Mantıksal deneme kimliği: ilk render'da BİR KEZ (useState başlatıcısı).
  const [ilkToken] = useState(() => yeniToken());
  const tokenRef = useRef(ilkToken);
  const ucusta = useRef(false);

  const basarili = useCallback(
    (t: DestekTalep) => {
      tokenRef.current = yeniToken();
      void qc.invalidateQueries({ queryKey: destekKeys.kok });
      useDestekTaslakStore.getState().ekraniKaldir();
      Toast.show({ type: 'success', text1: `Talep alındı: ${t.number}`, visibilityTime: 3000 });
      nav.replace('DestekDetay', { id: t.id, number: t.number });
    },
    [nav, qc],
  );

  const gonder = useCallback(() => {
    if (ucusta.current) return;
    const h = formuDogrula(form);
    setHatalar(h);
    if (!hataYokMu(h)) return;
    if (!onlineManager.isOnline()) {
      setGonderHatasi(CEVRIMDISI_METNI);
      return;
    }
    ucusta.current = true;
    setGonderiliyor(true);
    setGonderHatasi(null);
    destekService
      .talepAc(govdeKur(form, tokenRef.current, cihaz))
      .then(basarili, (e: unknown) => {
        tokenRef.current = hataSonrasiToken(tokenRef.current, e);
        setGonderHatasi(destekHataMetni(e));
      })
      .finally(() => {
        ucusta.current = false;
        setGonderiliyor(false);
      });
  }, [form, cihaz, basarili]);

  return { form, setForm, hatalar, gonderHatasi, gonderiliyor, gonder };
}
