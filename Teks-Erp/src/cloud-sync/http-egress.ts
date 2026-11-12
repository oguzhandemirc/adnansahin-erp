// Fabrikadan DIŞARI giden HTTPS istekleri (yalnız patron bulutu) — kurumsal proxy ortamdan, Node'un
// yerleşik `Agent({proxyEnv})` desteğiyle (yeni paket yok). Ana ürünün `lib/http-egress.ts`inin budanmışı:
// panel proxy'si, SSE akışı ve compose servis istisnası lisans/okuma kanallarına aitti, burada yok.
import http, { type IncomingHttpHeaders, type IncomingMessage } from "node:http";
import https from "node:https";

export interface EgressOptions {
  readonly method: "GET" | "POST";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | Buffer;
  readonly timeoutMs: number;
  /** Yanıt gövdesi tavanı; aşılırsa istek düşer. */
  readonly maxBytes?: number;
}

export interface EgressResponse {
  readonly status: number;
  readonly headers: IncomingHttpHeaders;
  readonly body: Buffer;
}

/** Hata sınıfı — beklenen ağ arızasını programcı hatasından ayırmak için. */
export class EgressError extends Error {
  constructor(
    readonly code: "EGRESS_URL" | "EGRESS_PROXY_UNSUPPORTED" | "EGRESS_NETWORK" | "EGRESS_TIMEOUT" | "EGRESS_TOO_LARGE",
    message: string,
  ) {
    super(message);
    this.name = "EgressError";
  }
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

let agentKey = "";
let agent: https.Agent | null = null;
let plainAgent: http.Agent | null = null;

/** `https.Agent({proxyEnv})` Node ≥ 22.21 (22 hattı) / ≥ 24.5 ile gelir; eskisinde seçenek SESSİZCE yok sayılır. */
export function nodeSupportsProxyEnv(version: string = process.versions.node): boolean {
  const [major, minor] = version.split(".").map((n) => Number.parseInt(n, 10));
  if (!Number.isFinite(major) || !Number.isFinite(minor)) return false;
  if (major >= 25) return true;
  if (major === 24) return minor >= 5;
  if (major === 22) return minor >= 21;
  return false;
}

function envProxy(): { adres: string | null; atla: string | null } {
  const v = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY ?? process.env.http_proxy;
  const adres = v && v.trim() ? v.trim() : null;
  return { adres, atla: adres ? (process.env.NO_PROXY ?? process.env.no_proxy ?? null) : null };
}

function currentAgent(): https.Agent {
  const p = envProxy();
  const key = JSON.stringify([p.adres, p.atla]);
  if (agent && key === agentKey) return agent;
  agent?.destroy();
  agent = p.adres
    ? new https.Agent({ proxyEnv: { HTTPS_PROXY: p.adres, HTTP_PROXY: p.adres, NO_PROXY: p.atla ?? "" } } as https.AgentOptions)
    : new https.Agent();
  agentKey = key;
  return agent;
}

/** Dışarı gidilebilecek adres: HTTPS; düz HTTP yalnız aynı makinedeki (test) sunucuya — hat dinlenemez. */
export function isEgressTargetAllowed(u: URL): boolean {
  if (u.protocol === "https:") return true;
  return u.protocol === "http:" && LOOPBACK_HOSTS.has(u.hostname);
}

function resolveTarget(url: string): { u: URL; secure: boolean } {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new EgressError("EGRESS_URL", "Dış adres çözülemedi");
  }
  if (!isEgressTargetAllowed(u)) throw new EgressError("EGRESS_URL", "Dış istek yalnız HTTPS olabilir (düz HTTP yalnız döngü adresi)");
  return { u, secure: u.protocol === "https:" };
}

function openRequest(url: string, opts: EgressOptions): Promise<IncomingMessage> {
  const { u, secure } = resolveTarget(url);
  if (secure && envProxy().adres && !nodeSupportsProxyEnv()) {
    return Promise.reject(
      new EgressError("EGRESS_PROXY_UNSUPPORTED", `Bu Node sürümü (${process.version}) proxy ayarını desteklemiyor; Node 22.21+ / 24.5+ gerekir`),
    );
  }
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.body !== undefined) headers["content-length"] = String(Buffer.byteLength(opts.body));
    const reqOpts: https.RequestOptions = { method: opts.method, headers };
    const req = secure
      ? https.request(u, { ...reqOpts, agent: currentAgent() })
      : http.request(u, { ...reqOpts, agent: (plainAgent ??= new http.Agent()) });
    const timer = setTimeout(() => req.destroy(new EgressError("EGRESS_TIMEOUT", "Dış istek zaman aşımına uğradı")), opts.timeoutMs);
    timer.unref();
    req.on("response", (res) => {
      clearTimeout(timer);
      resolve(res);
    });
    req.on("error", (err) => {
      clearTimeout(timer);
      if (err instanceof EgressError) reject(err);
      else reject(new EgressError("EGRESS_NETWORK", `Dış bağlantı kurulamadı (${(err as NodeJS.ErrnoException).code ?? err.name})`));
    });
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

/** Tek istek-yanıt; gövde belleğe alınır (tavanlı). */
export async function egressRequest(url: string, opts: EgressOptions): Promise<EgressResponse> {
  const res = await openRequest(url, opts);
  const max = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => res.destroy(new EgressError("EGRESS_TIMEOUT", "Dış yanıt zaman aşımına uğradı")), opts.timeoutMs);
    timer.unref();
    res.on("data", (c: Buffer) => {
      size += c.length;
      if (size > max) {
        res.destroy(new EgressError("EGRESS_TOO_LARGE", "Dış yanıt izin verilenden büyük"));
        return;
      }
      chunks.push(c);
    });
    res.on("end", () => {
      clearTimeout(timer);
      resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) });
    });
    res.on("error", (err) => {
      clearTimeout(timer);
      reject(err instanceof EgressError ? err : new EgressError("EGRESS_NETWORK", "Dış yanıt yarıda kesildi"));
    });
  });
}
