// Oturum bağlamı: belirteç (gizli depo) + tesis durumu (`GET /oturum`) + izinler. Çevrimdışıyken son
// oturum görüntüsü önbellekten gelir ve YAZMA kapalıdır. 401 → belirteç silinir, giriş ekranı.
// Hesap fabrikanın malıdır (kullanıcı adı + fabrika parolası; bulut tek tesisli, tesis geçişi yok); çıkış ve yeni giriş
// bütün önbelleği siler.
// Tazelik (K1): öne gelince ve değişim akışında fabrika damgası değişince `refresh()`; "Son eşitleme" = fabrika
// veri anı (`esitleme.ufuk`, paketin ufku), bulutun alım anı değil. Belirteç yenileme ucu sunucuda yok — dokunulmaz.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, createClient } from "../api/client";
import { createApi, type Api } from "../api/endpoints";
import type { FacilityStatus, LoginResponse } from "../api/wire";
import { apiBaseUrl } from "../lib/config";
import { clearCache, createCache, openingCacheHygiene, type Cache } from "./cache";
import { createFeedFetcher, useChangeFeed, type FeedMode } from "./changes";
import { useForeground } from "./useForeground";
import { legacyPlainStore, plainStore, secretStore } from "./store";
import { applyServerFactoryTimezone } from "../lib/factory-time";
import { ornekIstemci } from "../ornek/kapi";

const TOKEN_KEY = "patron.belirtec";
const SCOPE_KEY = "patron.kapsam";

export type Phase = "yukleniyor" | "giris" | "hazir";

export interface SessionValue {
  readonly phase: Phase;
  readonly api: Api;
  readonly cache: Cache | null;
  readonly facility: FacilityStatus | null;
  /** Etkin tesis (kapsamdan); oturumsuzken null. */
  readonly facilityId: string | null;
  readonly permissions: readonly string[];
  readonly offline: boolean;
  readonly offlineSince: string | null;
  /** Fabrika veri anı: son kabul edilen paketin ufku (`esitleme.ufuk`); eşitleme yoksa null. */
  readonly factoryStamp: string | null;
  /** Değişim akışı kipi: uzun yoklama · eski sunucu 60 sn yoklama · kapalı (arka plan / oturumsuz). */
  readonly feedMode: FeedMode;
  readonly configured: boolean;
  markOnline(online: boolean, savedAt?: string): void;
  /** `totp` yalnız sunucu `DOGRULAMA_KODU_GEREKLI` dedikten sonra (iki adımlı doğrulaması açık hesap). */
  login(b: { kullaniciAdi: string; parola: string; totp?: string }): Promise<void>;
  logout(): Promise<void>;
  /** `GET /oturum` yeniden okunur (uçuştayken ikinci çağrı aynı sözü alır); oturumsuzken null. */
  refresh(): Promise<FacilityStatus | null>;
}

const Ctx = createContext<SessionValue | null>(null);

/**
 * Tesisin saat dilimi DÖNEMLERİ (ANLIK `tesis` → `tabanDilim` + `donemler`): her an kendi dönemindeki dilimle
 * basılır (geçmiş kayıtlar kaymaz), telefonun diliminden değil. Eski fabrika paketi yalnız `saatDilimi` taşır →
 * tek dilim. Best-effort — projeksiyon henüz yoksa varsayılan dilim kalır.
 */
async function loadFacilityTimezone(c: Cache, api: Api): Promise<void> {
  try {
    const r = await c.load("anlik:tesis", () => api.snapshot("tesis"));
    const veri = r.data.veri as { saatDilimi?: unknown; tabanDilim?: unknown; donemler?: unknown } | null;
    const donemler = Array.isArray(veri?.donemler)
      ? (veri.donemler as Array<{ gecerliBaslangic?: unknown; saatDilimi?: unknown } | null>).map((d) => ({
          validFrom: d?.gecerliBaslangic,
          timeZone: d?.saatDilimi,
        }))
      : undefined;
    applyServerFactoryTimezone({ factoryTimezone: veri?.saatDilimi, factoryTimezoneBase: veri?.tabanDilim, factoryTimezonePeriods: donemler });
  } catch {
    // Dilim okunamadı: son geçerli (ya da varsayılan) dilimle devam.
  }
}

export function SessionProvider({ children, platform = "mobil" }: { children: ReactNode; platform?: "mobil" | "web" }) {
  const token = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>("yukleniyor");
  const [facility, setFacility] = useState<FacilityStatus | null>(null);
  const [scope, setScope] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [offlineSince, setOfflineSince] = useState<string | null>(null);
  const base = apiBaseUrl();
  // Örnek veri kipi (yalnız geliştirme; `ornek/kapi.ts`): istemci ağa çıkmaz, oturum doğrudan açılır.
  const ornek = useMemo(() => ornekIstemci(), []);

  const reset = useCallback(async () => {
    token.current = null;
    await secretStore.remove(TOKEN_KEY).catch(() => undefined);
    await secretStore.remove(SCOPE_KEY).catch(() => undefined);
    await clearCache(plainStore);
    setFacility(null);
    setScope(null);
    setPhase("giris");
  }, []);

  const api = useMemo(
    () => createApi(ornek ?? createClient({ baseUrl: base ?? "http://yapilandirilmamis.invalid", getToken: () => token.current, onUnauthorized: () => { if (token.current) void reset(); } })),
    [base, reset, ornek],
  );
  const cache = useMemo(() => (scope ? createCache(plainStore, scope) : null), [scope]);

  const markOnline = useCallback((online: boolean, savedAt?: string) => {
    setOffline(!online);
    setOfflineSince(online ? null : (savedAt ?? null));
  }, []);

  const loadFacility = useCallback(
    async (c: Cache) => {
      const r = await c.load("oturum", () => api.session());
      await loadFacilityTimezone(c, api);
      setFacility(r.data);
      markOnline(!r.offline, r.savedAt);
      return r.data;
    },
    [api, markOnline],
  );

  /** Giriş yanıtını benimser: belirteç + kapsam gizli depoya, tesis durumu yüklenir. */
  const adopt = useCallback(
    async (r: LoginResponse) => {
      token.current = r.belirtec;
      const s = `${r.tesisId}:${r.hesap.id}`;
      await secretStore.set(TOKEN_KEY, r.belirtec).catch(() => undefined);
      await secretStore.set(SCOPE_KEY, s).catch(() => undefined);
      setScope(s);
      await loadFacility(createCache(plainStore, s));
    },
    [loadFacility],
  );

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [t, s] = await Promise.all([secretStore.get(TOKEN_KEY).catch(() => null), secretStore.get(SCOPE_KEY).catch(() => null)]);
      if (!alive) return;
      await openingCacheHygiene({ plain: plainStore, legacy: legacyPlainStore, hasSession: Boolean(t && s) });
      if (!alive) return;
      if (ornek) {
        await adopt(await api.login({ kullaniciAdi: "", parola: "" }));
        if (alive) setPhase("hazir");
        return;
      }
      if (!t || !s) return setPhase("giris");
      token.current = t;
      setScope(s);
      try {
        await loadFacility(createCache(plainStore, s));
        if (alive) setPhase("hazir");
      } catch (err) {
        if (!alive) return;
        if (err instanceof ApiError && err.kind === "OTURUM") return; // reset zaten koştu
        setPhase("giris");
      }
    })();
    return () => {
      alive = false;
    };
  }, [loadFacility, ornek, adopt, api]);

  const login = useCallback(
    async (b: { kullaniciAdi: string; parola: string; totp?: string }) => {
      const r = await api.login({ ...b, istemci: platform });
      // Yeni giriş başka kimlik olabilir: bütün önbellek silinir.
      await clearCache(plainStore);
      await adopt(r);
      setPhase("hazir");
    },
    [api, adopt, platform],
  );

  const logout = useCallback(async () => {
    // Hesabın bütün cihazlardaki oturumları kapanır.
    await api.logout({ hepsi: true }).catch(() => undefined);
    await reset();
  }, [api, reset]);

  const facilityId = scope ? (scope.split(":")[0] ?? null) : null;

  const inflight = useRef<Promise<FacilityStatus | null> | null>(null);
  const refresh = useCallback((): Promise<FacilityStatus | null> => {
    if (!cache) return Promise.resolve(null);
    if (inflight.current) return inflight.current;
    const p = loadFacility(cache).finally(() => {
      inflight.current = null;
    });
    inflight.current = p;
    return p;
  }, [cache, loadFacility]);

  const live = useRef({ phase, refresh, stamp: facility?.esitleme?.ufuk ?? null });
  live.current = { phase, refresh, stamp: facility?.esitleme?.ufuk ?? null };

  // Öne gelince oturum (damga, hizmet aşaması, izinler) tazelenir; ekranlar kendi kancalarında tazelenir.
  useForeground(() => {
    if (live.current.phase === "hazir") void live.current.refresh().catch(() => undefined);
  });

  const feedFetch = useMemo(
    () => (base && !ornek ? createFeedFetcher({ baseUrl: base, getToken: () => token.current, onUnauthorized: () => { if (token.current) void reset(); } }) : null),
    [base, reset, ornek],
  );
  const feedMode = useChangeFeed({
    enabled: phase === "hazir",
    fetchChanges: feedFetch,
    resetKey: scope,
    onStamp: (stamp) => {
      if (stamp !== live.current.stamp) void live.current.refresh().catch(() => undefined);
    },
  });

  const value: SessionValue = {
    phase,
    api,
    cache,
    facility,
    facilityId,
    permissions: facility?.hesap.izinler ?? [],
    offline,
    offlineSince,
    factoryStamp: facility?.esitleme?.ufuk ?? null,
    feedMode,
    configured: base !== null || ornek !== null,
    markOnline,
    login,
    logout,
    refresh,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("SessionProvider eksik");
  return v;
}
