// Play uygulama içi güncellemenin durum kancası — sorar, olayları dinler, kararı verir.
// Karar saf yüklemdedir (`services/playUpdate.ts`); ekranı `UpdateGate` seçer (tek karar noktası).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';

import { rootNavigationRef } from '../navigation/navigationRef';
import { bekleyenYazimSayisi } from '../offline/pendingStationWrites';
import {
  isIdle,
  playCheckDue,
  type PlayCheckTrigger,
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
import { getLastActivity, withSystemDialog } from '../store/lockStore';
import { useAuthStore } from '../store/authStore';

/** Oturum açılışı ayrı tetiktir ve aralığı sıfırlar: vardiya değişiminde giren kişi taze denetim alır. */
function useCheckOnLogin(check: (trigger: PlayCheckTrigger) => Promise<void>) {
  const token = useAuthStore((st) => st.token);
  const prevToken = useRef<string | null>(null);
  useEffect(() => {
    const loggedIn = !prevToken.current && !!token;
    prevToken.current = token;
    if (loggedIn) void check('giris');
  }, [token, check]);
}

/** Kalp atışı: boşta kararını tazeler; Play sorgusu yine yalnız 15 dk dolunca. */
const PLAY_HEARTBEAT_MS = 10_000;

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
  // Kalp atışı: zamanlayıcı denetimi + "≥ 90 sn etkileşimsizlik" boşta kararının yeniden okunması.
  const [now, setNow] = useState(() => Date.now());
  // Kartın gösterildiği ekran: kartın kendisine dokunmak onu gizlemesin; başka ekrana geçince düşer.
  const [shownOn, setShownOn] = useState<string | undefined>(undefined);
  const lastCheck = useRef(0);
  const autoStarted = useRef(false);

  const check = useCallback(
    async (trigger: PlayCheckTrigger) => {
      if (!enabled) return;
      if (!playCheckDue(trigger, lastCheck.current, Date.now())) return;
      lastCheck.current = Date.now();
      const net = await NetInfo.fetch().catch(() => null);
      const connected = net?.isConnected ?? null;
      setOnline(connected);
      if (connected === false) return;
      const s = await queryPlay();
      autoStarted.current = false;
      setDismissed(false);
      setShownOn(undefined);
      setQuery(s);
    },
    [enabled],
  );

  // Açılış + ön plana dönüş hemen sorar; öndeyken 15 dk'da bir; arka planda zamanlayıcı durur.
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      setNow(Date.now());
      void check('zamanlayici');
    };
    const start = () => {
      if (!timer) timer = setInterval(tick, PLAY_HEARTBEAT_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    void check('acilis');
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (d) => {
      if (d === 'active') {
        void check('on-plan');
        start();
      } else {
        stop();
      }
    });
    return () => {
      sub.remove();
      stop();
    };
  }, [enabled, check]);

  useCheckOnLogin(check);

  // Play olayları: indirme ilerledi/bitti, akış iptal edildi/başarısız → taze sorgu.
  useEffect(() => {
    if (!enabled) return;
    return onPlayEvent((event) => {
      if (event === 'indiriliyor') setQuery((o) => (o?.kind === 'indiriliyor' ? o : { kind: 'indiriliyor' }));
      else if (event === 'indirildi') setQuery({ kind: 'indirildi' });
      else if (event === 'iptal' || event === 'basarisiz') void check('olay');
    });
  }, [enabled, check]);

  // Boşta mı: odaktaki ekran (iç içe yığının en derini).
  useEffect(() => {
    if (!enabled) return;
    const read = () => setScreen(rootNavigationRef.isReady() ? rootNavigationRef.getCurrentRoute()?.name : undefined);
    read();
    return rootNavigationRef.addListener('state', read);
  }, [enabled]);

  const idleNow = isIdle(screen, bekleyenYazimSayisi(), now - getLastActivity());
  const decision = decidePlayUpdate({
    moduleAvailable: enabled,
    installedFromPlay: enabled,
    online,
    query,
    mandatory,
    idle: idleNow || (shownOn !== undefined && shownOn === screen),
  });
  const visible = decision === 'oner' || decision === 'yeniden-baslat' || decision === 'hemen';

  useEffect(() => {
    if (visible && shownOn !== screen) setShownOn(screen);
    else if (!visible && shownOn !== undefined && shownOn !== screen) setShownOn(undefined);
  }, [visible, screen, shownOn]);

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
