"use client"
import dynamic from "next/dynamic"
import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import type { ServiceName } from "@banshee/contracts"
import { OfficeProvider } from "@/lib/office/client"
import { emit, WORLD_EVENTS, type SelectedAgent } from "../../components/world/contracts"
import { AgentPanel } from "../../components/world/AgentPanel"
import { FeedPanel } from "../../components/world/FeedPanel"
import { Hud } from "../../components/world/Hud"
import { KanbanPanel } from "../../components/world/KanbanPanel"
import "../../components/world/world.css"

const WorldScene = dynamic(() => import("../../components/world/WorldScene").then((m) => m.WorldScene), { ssr: false })

const noop = () => () => {}
/** "" = full UI, "1" or "office" = scene only (landing page iframe). Server render is always the full shell. */
function useMode(): "pending" | "full" | "embed" {
  return useSyncExternalStore(noop, () => (new URLSearchParams(window.location.search).get("embed") ? "embed" : "full"), () => "pending" as const)
}

function World() {
  const mode = useMode()
  const embed = mode === "embed"
  const [boardOpen, setBoardOpen] = useState(false)
  const [feedOpen, setFeedOpen] = useState(false)
  const [selected, setSelected] = useState<SelectedAgent>(null)

  useEffect(() => {
    const onSelect = (e: Event) => {
      const service = (e as CustomEvent<{ service: ServiceName }>).detail?.service
      if (!service) return
      setSelected(service)
      emit(WORLD_EVENTS.focusAgent, { service })
    }
    const onBoard = () => setBoardOpen(true)
    window.addEventListener(WORLD_EVENTS.selectAgent, onSelect)
    window.addEventListener(WORLD_EVENTS.openBoard, onBoard)
    return () => {
      window.removeEventListener(WORLD_EVENTS.selectAgent, onSelect)
      window.removeEventListener(WORLD_EVENTS.openBoard, onBoard)
    }
  }, [])

  const closeBoard = useCallback(() => setBoardOpen(false), [])
  const closeFeed = useCallback(() => setFeedOpen(false), [])
  const closeAgent = useCallback(() => setSelected(null), [])

  return (
    <div className="world-root">
      {mode !== "pending" && <WorldScene embed={embed} />}
      {mode === "full" && (
        <>
          <Hud boardOpen={boardOpen} feedOpen={feedOpen} onToggleBoard={() => setBoardOpen((v) => !v)} onToggleFeed={() => setFeedOpen((v) => !v)} />
          <KanbanPanel open={boardOpen} onClose={closeBoard} />
          <FeedPanel open={feedOpen} onClose={closeFeed} />
          {selected && <AgentPanel key={selected} service={selected} onClose={closeAgent} />}
        </>
      )}
    </div>
  )
}

export default function WorldPage() {
  return (
    <OfficeProvider>
      <World />
    </OfficeProvider>
  )
}
