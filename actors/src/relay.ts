/// <reference types="node" />
// Agent Relay (Relaycast REST) client. RestRelay is coded from https://agentrelay.com/docs/markdown/relaycast-api.md and the openapi.yaml.
export interface RelayClient {
  readonly kind: "rest" | "local"
  post(channel: string, from: string, text: string): Promise<void>
  dm(from: string, to: string, text: string): Promise<void>
  createChannel(name: string): Promise<void>
}

/** Agent tokens are shown once by Relay and cannot be recovered with the workspace key, so they must be stored. */
export interface TokenStore {
  load(): Promise<Record<string, string>>
  save(name: string, token: string): Promise<void>
}

export class RelayError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(`relay ${status} ${code}: ${message}`)
  }
}

export type RestRelayOptions = {
  baseUrl?: string
  workspaceKey: string
  store?: TokenStore
  fetchImpl?: typeof fetch
  timeoutMs?: number
  /** When an identity exists but its token is lost: delete and re-register it (only for names we own). Default true. */
  reclaim?: boolean
  log?: (m: string) => void
}

export class RestRelay implements RelayClient {
  readonly kind = "rest" as const
  private base: string
  private tokens = new Map<string, string>()
  private loaded = false
  private joined = new Set<string>()
  private inflight = new Map<string, Promise<string>>()
  private f: typeof fetch

  constructor(private o: RestRelayOptions) {
    this.base = (o.baseUrl ?? "https://armadillo.agentrelay.com").replace(/\/+$/, "") + "/v1"
    this.f = o.fetchImpl ?? fetch
  }

  private async call<T = any>(method: string, path: string, token: string, body?: unknown, extra: Record<string, string> = {}): Promise<T> {
    const res = await this.f(this.base + path, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(this.o.timeoutMs ?? 5000),
    })
    const json: any = await res.json().catch(() => ({}))
    if (!res.ok || json?.ok === false) throw new RelayError(res.status, json?.error?.code ?? "http_error", json?.error?.message ?? res.statusText)
    return (json?.data ?? json) as T
  }

  private async ensureAgent(name: string): Promise<string> {
    if (!this.loaded) {
      this.loaded = true
      try {
        for (const [k, v] of Object.entries((await this.o.store?.load()) ?? {})) this.tokens.set(k, v)
      } catch {}
    }
    const have = this.tokens.get(name)
    if (have) return have
    let p = this.inflight.get(name)
    if (!p) {
      p = this.register(name).finally(() => this.inflight.delete(name))
      this.inflight.set(name, p)
    }
    return p
  }

  private async register(name: string): Promise<string> {
    const make = () => this.call<{ token: string }>("POST", "/agents", this.o.workspaceKey, { name, type: "agent", persona: "Banshee service spirit", metadata: { source: "banshee" } })
    let data: { token: string }
    try {
      data = await make()
    } catch (e) {
      if (!(e instanceof RelayError) || e.status !== 409 || this.o.reclaim === false) throw e
      this.o.log?.(`relay: ${name} exists without a stored token; deleting and re-registering`)
      await this.call("DELETE", `/agents/${encodeURIComponent(name)}`, this.o.workspaceKey)
      data = await make()
    }
    if (!data.token) throw new RelayError(500, "no_token", `register ${name} returned no token`)
    this.tokens.set(name, data.token)
    await this.o.store?.save(name, data.token).catch(() => {})
    return data.token
  }

  async createChannel(name: string): Promise<void> {
    try {
      await this.call("POST", "/channels", this.o.workspaceKey, { name, topic: `Banshee incident room ${name}` })
    } catch (e) {
      if (e instanceof RelayError && (e.status === 409 || /exist/i.test(e.code))) return
      throw e
    }
  }

  private async withAgent<T>(name: string, fn: (token: string) => Promise<T>): Promise<T> {
    try {
      return await fn(await this.ensureAgent(name))
    } catch (e) {
      if (e instanceof RelayError && e.status === 401 && this.o.reclaim !== false) {
        this.tokens.delete(name)
        await this.call("DELETE", `/agents/${encodeURIComponent(name)}`, this.o.workspaceKey).catch(() => {})
        return fn(await this.ensureAgent(name))
      }
      throw e
    }
  }

  async post(channel: string, from: string, text: string): Promise<void> {
    await this.withAgent(from, async (token) => {
      const key = `${channel}|${from}`
      if (!this.joined.has(key)) {
        await this.call("POST", `/channels/${encodeURIComponent(channel)}/join`, token).catch((e) => {
          if (!(e instanceof RelayError && e.status === 409)) throw e
        })
        this.joined.add(key)
      }
      await this.call("POST", `/channels/${encodeURIComponent(channel)}/messages`, token, { text }, { "idempotency-key": crypto.randomUUID() })
    })
  }

  async dm(from: string, to: string, text: string): Promise<void> {
    await this.withAgent(from, (token) => this.call("POST", "/dm", token, { to, text }, { "idempotency-key": crypto.randomUUID() }))
  }

  /** Read back a channel (workspace key). Used by tests and by the war room to verify delivery. */
  async messages(channel: string, limit = 50): Promise<{ id: string; text: string; agent_name?: string; [k: string]: unknown }[]> {
    const d = await this.call<any>("GET", `/channels/${encodeURIComponent(channel)}/messages?limit=${limit}`, this.o.workspaceKey)
    return Array.isArray(d) ? d : d.messages ?? []
  }
}

export type SentMessage = { ts: number; channel: string; from: string; to?: string; text: string }

/** In-memory relay for when no workspace key is configured. */
export class LocalRelay implements RelayClient {
  readonly kind = "local" as const
  readonly log: SentMessage[] = []
  readonly channels = new Set<string>()
  async post(channel: string, from: string, text: string) {
    this.log.push({ ts: Date.now(), channel, from, text })
  }
  async dm(from: string, to: string, text: string) {
    this.log.push({ ts: Date.now(), channel: `dm:${to}`, from, to, text })
  }
  async createChannel(name: string) {
    this.channels.add(name)
  }
}

/** Wraps a relay so every message is also handed to `sink` (the Office chatter), whichever relay is behind it. */
export class MirroredRelay implements RelayClient {
  constructor(private inner: RelayClient, private sink: (m: SentMessage) => Promise<void>, private onError?: (e: Error) => void) {}
  get kind() {
    return this.inner.kind
  }
  async post(channel: string, from: string, text: string) {
    // chatter first so the UI is never behind the network; relay failure never blocks the incident
    await Promise.all([this.sink({ ts: Date.now(), channel, from, text }), this.inner.post(channel, from, text).catch((e) => this.onError?.(e))])
  }
  async dm(from: string, to: string, text: string) {
    await Promise.all([this.sink({ ts: Date.now(), channel: `dm:${to}`, from, to, text }), this.inner.dm(from, to, text).catch((e) => this.onError?.(e))])
  }
  async createChannel(name: string) {
    await this.inner.createChannel(name).catch((e) => this.onError?.(e))
  }
}
