"use client"

import type { IncidentState, OfficeSnapshot, OfficeState } from "@banshee/contracts"
import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react"
import type { ConnectionStatus, OfficeSource, Snapshot, SourceKind } from "./types"

// ---------------- sources ----------------

/** Mock: SSE from the in-process mock engine (/api/mock/stream). */
export function mockSource(): OfficeSource {
  return {
    kind: "mock",
    start(onSnapshot, onStatus) {
      onStatus("connecting")
      const es = new EventSource("/api/mock/stream")
      es.onopen = () => onStatus("open")
      es.onerror = () => onStatus(es.readyState === EventSource.CLOSED ? "closed" : "connecting")
      es.onmessage = (e) => {
        try {
          onSnapshot(JSON.parse(e.data) as Snapshot)
        } catch {}
      }
      return () => es.close()
    },
  }
}

/**
 * Live: Terse actor WebSocket to the Office actor ("org"), URL from GET /api/office/socket.
 * Wire format (verified on the local runtime):
 *   {type:"state", state:{office: OfficeState, incidents: Record<string, IncidentState>}, version}   once on connect
 *   {type:"state_update", changes:{office?, incidents?}, removed:[], version}                         whole-field replacement
 * The Office actor embeds the recent IncidentState objects, so no per-incident socket is needed.
 */
export function liveSource(): OfficeSource {
  return {
    kind: "live",
    start(onSnapshot, onStatus) {
      let ws: WebSocket | undefined
      let closed = false
      let office: OfficeState | undefined
      const incidents: Record<string, IncidentState> = {}
      const push = () => office && onSnapshot({ office, incidents: { ...incidents }, serverNow: Date.now() })
      onStatus("connecting")
      const connect = async () => {
        try {
          const r = await fetch("/api/office/socket")
          const { url } = (await r.json()) as { url?: string }
          if (!url || closed) return onStatus("closed")
          ws = new WebSocket(url)
          ws.onopen = () => onStatus("open")
          ws.onclose = () => {
            onStatus("closed")
            if (!closed) setTimeout(connect, 2000)
          }
          ws.onmessage = (e) => {
            const msg = JSON.parse(String(e.data)) as { type: string; state?: Partial<OfficeSnapshot>; changes?: Partial<OfficeSnapshot> }
            const apply = (d?: Partial<OfficeSnapshot>) => {
              if (d?.office) office = d.office
              if (d?.incidents) {
                for (const k of Object.keys(incidents)) delete incidents[k]
                Object.assign(incidents, d.incidents)
              }
            }
            if (msg.type === "state") apply(msg.state)
            else if (msg.type === "state_update") apply(msg.changes)
            else return
            push()
          }
        } catch {
          onStatus("closed")
          if (!closed) setTimeout(connect, 3000)
        }
      }
      void connect()
      return () => {
        closed = true
        ws?.close()
      }
    },
  }
}

// ---------------- store + context ----------------

type StoreValue = { snapshot?: Snapshot; status: ConnectionStatus; skew: number }

class OfficeStore {
  value: StoreValue = { status: "connecting", skew: 0 }
  listeners = new Set<() => void>()
  set(patch: Partial<StoreValue>) {
    this.value = { ...this.value, ...patch }
    for (const l of this.listeners) l()
  }
  subscribe = (l: () => void) => {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
  get = () => this.value
}

type Ctx = { store: OfficeStore; source: SourceKind }
const OfficeCtx = createContext<Ctx | null>(null)

function readSourceKind(): SourceKind {
  if (typeof window === "undefined") return "mock"
  const q = new URLSearchParams(window.location.search).get("source")
  if (q === "live" || q === "mock") return q
  // Build-time default for the public deployment (NEXT_PUBLIC_DEFAULT_SOURCE=live); the dev server stays on mock.
  return process.env.NEXT_PUBLIC_DEFAULT_SOURCE === "live" ? "live" : "mock"
}

export function OfficeProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() => new OfficeStore())
  // The first client render must equal the server render ("mock"), so the URL is read after mount.
  const [source, setSource] = useState<SourceKind>("mock")
  const [ready, setReady] = useState(false)
  useEffect(() => {
    // Intentional: read ?source after hydration so the first client render equals the server render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSource(readSourceKind())
    setReady(true)
  }, [])
  useEffect(() => {
    if (!ready) return
    const src = source === "live" ? liveSource() : mockSource()
    return src.start(
      (snapshot) => store.set({ snapshot, skew: snapshot.serverNow - Date.now() }),
      (status) => store.set({ status }),
    )
  }, [store, source, ready])
  const ctx = useMemo(() => ({ store, source }), [store, source])
  return <OfficeCtx.Provider value={ctx}>{children}</OfficeCtx.Provider>
}

const EMPTY: StoreValue = { status: "connecting", skew: 0 }

function useStore(): StoreValue {
  const ctx = useContext(OfficeCtx)
  if (!ctx) throw new Error("useOffice* must be used inside <OfficeProvider>")
  return useSyncExternalStore(ctx.store.subscribe, ctx.store.get, () => EMPTY)
}

export function useSourceKind(): SourceKind {
  return useContext(OfficeCtx)?.source ?? "mock"
}

export function useConnection(): ConnectionStatus {
  return useStore().status
}

export function useOffice(): OfficeState | undefined {
  return useStore().snapshot?.office
}

export function useIncident(id: string | undefined): IncidentState | undefined {
  const s = useStore().snapshot
  return id ? s?.incidents[id] : undefined
}

/** The incident the screens should focus: newest open one, else the most recent resolved one. */
export function useCurrentIncident(): IncidentState | undefined {
  const s = useStore().snapshot
  if (!s) return undefined
  const open = s.office.openIncidents
  if (open.length) return s.incidents[open[open.length - 1]]
  return undefined
}

/** Every incident in the current snapshot, newest first (used by the incident board). */
const NO_INCIDENTS: IncidentState[] = []
export function useAllIncidents(): IncidentState[] {
  const incidents = useStore().snapshot?.incidents
  // stable identity: only changes when the snapshot's incidents change (safe as an effect dependency)
  return useMemo(() => (incidents ? Object.values(incidents).sort((a, b) => b.openedAt - a.openedAt) : NO_INCIDENTS), [incidents])
}

export function useLatestIncident(): IncidentState | undefined {
  const s = useStore().snapshot
  if (!s) return undefined
  const all = Object.values(s.incidents).sort((a, b) => b.openedAt - a.openedAt)
  return all[0]
}

// ---------------- clock ----------------

let nowValue = 0
const nowListeners = new Set<() => void>()
let nowTimer: ReturnType<typeof setInterval> | undefined
function subscribeNow(l: () => void) {
  nowListeners.add(l)
  if (!nowTimer) {
    nowValue = Date.now()
    nowTimer = setInterval(() => {
      nowValue = Date.now()
      for (const fn of nowListeners) fn()
    }, 250)
  }
  return () => {
    nowListeners.delete(l)
    if (!nowListeners.size && nowTimer) {
      clearInterval(nowTimer)
      nowTimer = undefined
    }
  }
}

/** Server-corrected wall clock, re-rendering every 250 ms. */
export function useNow(): number {
  const skew = useStore().skew
  const t = useSyncExternalStore(subscribeNow, () => nowValue, () => 0)
  return t ? t + skew : 0
}

// ---------------- actions ----------------

export async function postChaos(kind: string) {
  const r = await fetch("/api/chaos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) })
  return (await r.json()) as { ok: boolean; incidentId?: string; error?: string }
}

export async function postApprove(incidentId: string, approve: boolean) {
  const r = await fetch("/api/approve", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ incidentId, approve }) })
  return (await r.json()) as { ok: boolean; error?: string }
}
