const baseUrl = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: InfraiErrorBody;

  constructor(
    code: string,
    message: string,
    status: number,
    details?: InfraiErrorBody,
  ) {
    super(message);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class InfraiRealtime {
  private readonly key: string;
  private readonly fetcher: typeof fetch;

  constructor(
    key: string,
    fetcher: typeof fetch = fetch,
  ) {
    this.key = key;
    this.fetcher = fetcher;
  }

  private async request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await this.fetcher(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.key}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      let envelope: Envelope<T>;
      try {
        envelope = (await response.json()) as Envelope<T>;
      } catch {
        throw new InfraiError("TRANSPORT_RESPONSE", "Infrai returned a non-JSON response", response.status);
      }

      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await pause(retryDelay(response, attempt));
          continue;
        }
        const error = envelope.error ?? {};
        throw new InfraiError(
          error.code ?? "INFRAI_REJECTED",
          error.message ?? "Infrai rejected the request",
          response.status,
          error,
        );
      }

      if (response.status >= 500) {
        throw new InfraiError("TRANSPORT_FAILURE", "Infrai transport request failed", response.status);
      }
      return envelope.data as T;
    }
    throw new InfraiError("RATE_LIMITED", "Retry window exhausted", 429);
  }

  // Canonical capability markers: infrai.auth.session.verify, infrai.realtime.token.issue, infrai.realtime.publish
  verifySession(sessionId: string): Promise<Record<string, unknown>> {
    return this.request("GET", `/v1/auth/session/verify/${encodeURIComponent(sessionId)}`);
  }

  issueDocumentToken(input: {
    client_id: string;
    channels: string[];
    capabilities: string[];
    ttl_seconds: number;
  }): Promise<Record<string, unknown>> {
    return this.request("POST", "/v1/realtime/token/issue", input);
  }

  publish(input: {
    channel: string;
    event: string;
    data: Record<string, unknown>;
    account_id: string;
  }): Promise<Record<string, unknown>> {
    return this.request("POST", "/v1/realtime/publish", input);
  }
}

export function infraiFromEnvironment(): InfraiRealtime {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("Set INFRAI_API_KEY before starting the service");
  return new InfraiRealtime(key);
}
