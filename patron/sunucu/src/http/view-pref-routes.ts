// Görünüm tercihi rotaları (veri tablosu) — hesap API'si tablosunun parçası (`API_ROUTES`e yayılır).
import { z } from "zod";
import { getViewPreference, setViewPreference, viewPrefKey } from "../services/view-preference.service";
import { body, s, type ApiRouteDef } from "./api-route-kit";

const KEY = "anahtar";

export const VIEW_PREF_ROUTES: readonly ApiRouteDef[] = [
  {
    method: "get",
    path: `/oturum/tercihler/:${KEY}`,
    auth: "OTURUM",
    kimlik: "OKUMA",
    handler: async (c) => ({ data: await getViewPreference(c.ctx, s(c), viewPrefKey(String(c.req.params[KEY]))) }),
  },
  {
    method: "post",
    path: `/oturum/tercihler/:${KEY}`,
    auth: "OTURUM",
    kimlik: { muaf: "hesabın kendi görünüm tercihinin TAM yerine konması; tekrarı aynı sonuç" },
    handler: async (c) => {
      const key = viewPrefKey(String(c.req.params[KEY]));
      return { data: await setViewPreference(c.ctx, s(c), key, body(c, z.strictObject({ deger: z.unknown() })).deger) };
    },
  },
];
