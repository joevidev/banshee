import { mockEngine } from "@/lib/office/mock-engine"
import type { Snapshot } from "@/lib/office/types"

// Server-Sent Events: pushes a Snapshot whenever the mock world changes (and at least once a second).
export async function GET(request: Request) {
  const engine = mockEngine()
  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | undefined
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (s: Snapshot) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(s)}\n\n`))
        } catch {
          unsubscribe?.()
        }
      }
      unsubscribe = engine.subscribe(send)
      request.signal.addEventListener("abort", () => {
        unsubscribe?.()
        try {
          controller.close()
        } catch {}
      })
    },
    cancel() {
      unsubscribe?.()
    },
  })
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}
