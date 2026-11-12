// Play uygulama içi güncellemenin durum kancası — sorar, olayları dinler, kararı verir.
// Karar saf yüklemdedir (`services/playUpdate.ts`); ekranı `UpdateGate` seçer (tek karar noktası).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { rootNavigationRef } from '../navigation/navigationRef';
import { bekleyenYazimSayisi } from '../offline/pendingStationWrites';
import {
  PLAY_CHECK_INTERVAL_MS,
  isIdle,
  offeredFlow,
  startPlayUpdate,
  decidePlayUpdate,
  onPlayEvent,
  queryPlay,
  completePlayUpdate,
  installedFromPlay,
  type PlayDecision,
  type PlayQuery,
} from '../services/playUpdate';
import { withSystemDialog } from '../store/lockStore';
import { useAuthStore } from '../store/authStore';

/** Oturum açılışı ayrı tetiktir ve aralığı sıfırlar: vardiya değişiminde giren kişi taze denetim alır. */
function useCheckOnLogin(check: (force?: boolean) => Promise<void>) {
  const token = useAuthStore((st) => st.token);
  const prevToken = useRef<string | null>(null);
  useEffect(() => {
    const loggedIn = !prevToken.current && !!token;
    prevToken.current = token;
    if (loggedIn) void check(true);
  }, [token, check]);
}

export interface PlayUpdateState {
  decision: PlayDecision;
  /** "Sonra" denmiş öneri — bir sonraki sorguya kadar gösterilmez. */
  dismissed: boolean;
  dismiss: () => void;
  /** Kullanıcı "Güncelle" dedi: zorunluysa tam ekran, değilse izinli akış. */
  update: (mandatory: boolean) => void;
  restart: () => void;
}

export function usePlayUpdate(mandatory: boolean): PlayUpdateState {
  const enabled = useRef(installedFromPlay()).current;
  const [query, setQuery] = useState<PlayQuery | null>(null);
  const [online, setOnline] = useState<boolean | null>(null);
  const [screen, setScreen] = useState<string | undefined>(undefined);
  const [dismissed, setDismissed] = useState(false);
  const lastCheck = useRef(0);
  const autoStarted = useRef(false);

  const check = useCallback(
    async (force = false) => {
      if (!enabled) return;
      if (!force && Date.now() - lastCheck.current < PLAY_CHECK_INTERVAL_MS) return;
      lastCheck.current = Date.now();
      const net = await NetInfo.fetch().catch(() => null);
      const connected = net?.isConnected ?? null;
      setOnline(connected);
      if (connected === false) return;
      const s = await queryPlay();
      autoStarted.current = false;
      setDismissed(false);
      setQuery(s);
    },
    [enabled],
  );

  // Açılış + ön plana dönüş (aralıklı) + giriş (aralık sıfırlanır).
  useEffect(() => {
    if (!enabled) return;
    void check(true);
    const sub = AppState.addEventListener('change', (d) => {
      if (d === 'active') void check();
    });
    return () => sub.remove();
  }, [enabled, check]);

  useCheckOnLogin(check);

  // Play olayları: indirme ilerledi/bitti, akış iptal edildi/başarısız → taze sorgu.
  useEffect(() => {
    if (!enabled) return;
    return onPlayEvent((event) => {
      if (event === 'indiriliyor') setQuery((o) => (o?.kind === 'indiriliyor' ? o : { kind: 'indiriliyor' }));
      else if (event === 'indirildi') setQuery({ kind: 'indirildi' });
      else if (event === 'iptal' || event === 'basarisiz') void check(true);
    });
  }, [enabled, check]);

  // Boşta mı: odaktaki ekran (iç içe yığının en derini).
  useEffect(() => {
    if (!enabled) return;
    const read = () => setScreen(rootNavigationRef.isReady() ? rootNavigationRef.getCurrentRoute()?.name : undefined);
    read();
    return rootNavigationRef.addListener('state', read);
  }, [enabled]);

  const decision = decidePlayUpdate({
    moduleAvailable: enabled,
    installedFromPlay: enabled,
    online,
    query,
    mandatory,
    idle: isIdle(screen, bekleyenYazimSayisi()),
  });

  // Zorunlu güncelleme boşta bir kez kendiliğinden açılır; operatör kapatırsa kilit örtüsü kalır.
  useEffect(() => {
    if (decision !== 'hemen' || autoStarted.current) return;
    autoStarted.current = true;
    void withSystemDialog(() => startPlayUpdate('hemen'));
  }, [decision]);

  const update = useCallback(
    (mandatoryFlow: boolean) => {
      const kind = mandatoryFlow || query?.kind === 'suruyor' ? 'hemen' : offeredFlow(query);
      if (!kind) return;
      void withSystemDialog(() => startPlayUpdate(kind));
    },
    [query],
  );

  return {
    decision,
    dismissed,
    dismiss: () => setDismissed(true),
    update,
    restart: () => {
      completePlayUpdate();
    },
  };
}
