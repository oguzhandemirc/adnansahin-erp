// Patron bulutuna TEL katmanı: kurulum anahtarıyla imzalı İSTEK (`amac: esitle`), gzip'li gövde,
// taşıma soyutlaması (test enjeksiyonu), hata sınıflaması. Ana ürünün `cloud-sync/cloud-client.ts`i;
// lisans deposu yerine anahtar ön koşuldan (`eligibility.ts`) gelir — bağlam yalnız açık ön koşuldan kurulur.
import { gzipSync } from "node:zlib";
import type { KeyObject } from "node:crypto";
import { EgressError, egressRequest } from "./http-egress";
import { REQUEST_HEADER, signRequest } from "../lib/cloud-signing/istek";
import { isoToMs } from "../lib/cloud-signing/ortak";
import { CloudErrorResponseSchema, type SyncPath } from "./wire/esitleme";
import type { CloudEligibility } from "./eligibility";

export const CLOUD_TIMEOUT_MS = 60_000;
const RESPONSE_MAX_BYTES = 8 * 1024 * 1024;
/** Aynı mantıksal deneme için en fazla 2 TEKRAR (toplam 3 gönderim); saat düzeltmesi de bu bütçeden yer. */
export const NETWORK_RETRIES = 2;

export interface CloudHttpRequest {
  readonly url: string;
  readonly method: "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body: Buffer;
}
export interface CloudHttpResponse {
  readonly status: number;
  readonly body: Buffer;
}
export type CloudTransport = (req: CloudHttpRequest) => Promise<CloudHttpResponse>;

export function createEgressCloudTransport(timeoutMs: number = CLOUD_TIMEOUT_MS): CloudTransport {
  return async (req) => {
    const res = await egressRequest(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      timeoutMs,
      maxBytes: RESPONSE_MAX_BYTES,
    });
    return { status: res.status, body: res.body };
  };
}

export const egressCloudTransport: CloudTransport = createEgressCloudTransport();

export type CloudResult =
  | { readonly ok: true; readonly json: unknown }
  /** `status` 0 = ağ hatası (beklenen; iş kaydına yazılmaz). */
  | { readonly ok: false; readonly status: number; readonly code: string };

export interface CloudCallContext {
  readonly baseUrl: string;
  readonly installationId: string;
  readonly privateKey: KeyObject;
  readonly transport: CloudTransport;
}

/** Bağlam YALNIZ açık ön koşuldan doğar: kapalı düğmeyle imzalı istek kurmanın yolu yoktur. */
export function cloudContext(e: Extract<CloudEligibility, { ok: true }>, transport: CloudTransport = egressCloudTransport): CloudCallContext {
  return { baseUrl: e.baseUrl, installationId: e.installationId, privateKey: e.privateKey, transport };
}

/** `ISTEK_ZAMAN` + geçerli sunucu saati → düzeltme payı (duvar − sunucu, ms); aksi hâlde null. */
export function requestClockSkewMs(code: string, serverTimeMs: number | undefined, receivedAtMs: number): number | null {
  if (code !== "ISTEK_ZAMAN" || serverTimeMs === undefined || !Number.isFinite(serverTimeMs)) return null;
  return receivedAtMs - serverTimeMs;
}

/**
 * İmzalı POST. `gzip` açıkken `govdeOzeti` SIKIŞTIRILMIŞ ham baytların özetidir (sunucu açmadan önce özetler).
 * Yalnız sonucu belirsiz bırakan hata (ağ · zaman aşımı · 5xx) tekrar edilir; kesin 4xx'te tekrar yok — tek istisna
 * `ISTEK_ZAMAN` + sunucu saati: BİR KEZ düzeltilmiş damgayla, yeni nonce'la yeniden imzalanır. `path` imzaya girer.
 */
export async function cloudPost(
  ctx: CloudCallContext,
  path: SyncPath,
  body: unknown,
  opts: { readonly gzip: boolean; readonly nowMs?: () => number },
): Promise<CloudResult> {
  const nowMs = opts.nowMs ?? Date.now;
  const text = JSON.stringify(body);
  const raw = opts.gzip ? gzipSync(Buffer.from(text, "utf8")) : Buffer.from(text, "utf8");
  const url = `${ctx.baseUrl}${path}`;
  let skewMs: number | null = null;
  let last: CloudResult = { ok: false, status: 0, code: "EGRESS_NETWORK" };
  for (let attempt = 0; attempt <= NETWORK_RETRIES; attempt++) {
    const token = signRequest({
      installationId: ctx.installationId,
      purpose: "esitle",
      body: raw,
      key: { privateKey: ctx.privateKey, nowMs: nowMs() - (skewMs ?? 0) },
      path,
    });
    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      [REQUEST_HEADER]: token,
      ...(opts.gzip ? { "content-encoding": "gzip" } : {}),
    };
    let res: CloudHttpResponse;
    try {
      res = await ctx.transport({ url, method: "POST", headers, body: raw });
    } catch (err) {
      last = { ok: false, status: 0, code: err instanceof EgressError ? err.code : "EGRESS_NETWORK" };
      continue;
    }
    let json: unknown = null;
    try {
      json = JSON.parse(res.body.toString("utf8")) as unknown;
    } catch {
      json = null;
    }
    if (res.status >= 200 && res.status < 300) return { ok: true, json };
    const err = CloudErrorResponseSchema.safeParse(json);
    const code = err.success ? err.data.details.code : `HTTP_${res.status}`;
    last = { ok: false, status: res.status, code };
    if (skewMs === null) {
      const t = err.success ? err.data.details.sunucuSaati : undefined;
      const skew = requestClockSkewMs(code, t ? isoToMs(t) : undefined, nowMs());
      if (skew !== null) {
        skewMs = skew;
        continue;
      }
    }
    if (res.status < 500) return last;
  }
  return last;
}
