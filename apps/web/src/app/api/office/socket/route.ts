import { connection } from "next/server"

// Returns the WebSocket URL the browser opens to the Office actor ("org"). The socket sends
//   {type:"state", state:{office, incidents}, version}  once, then
//   {type:"state_update", changes:{office?, incidents?}, removed:[], version}  (whole-field replacement).
// `incidents` holds the IncidentState of recent incidents, so no per-incident socket is needed.
// The grant expires in about 60 s: open the socket right away, ask for a new URL on reconnect.
export async function GET() {
  await connection()
  if (process.env.BANSHEE_OFFICE_WS_URL) return Response.json({ url: process.env.BANSHEE_OFFICE_WS_URL })
  try {
    const { actors, ORG } = await import("@/lib/live/actors")
    const { websocketUrl } = await actors.Office.prepareWebsocket({ actorId: ORG, metadata: null })
    return Response.json({ url: websocketUrl })
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 })
  }
}
