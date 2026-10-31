// Server-side access to the Banshee actors (live mode). Import only from route handlers.
// The generated client reads TERSE_ACTOR_URL / TERSE_API_KEY. banshee/.env points those at the hosted Terse project,
// which is not deployed yet, so live mode uses BANSHEE_ACTOR_URL / BANSHEE_ACTOR_KEY and defaults to the local runtime.
process.env.TERSE_ACTOR_URL = process.env.BANSHEE_ACTOR_URL || "http://127.0.0.1:7100/v1/projects/local/actors"
process.env.TERSE_API_KEY = process.env.BANSHEE_ACTOR_KEY || ""

export { actors } from "../terse/index.js"

export const ORG = process.env.BANSHEE_NS ? `${process.env.BANSHEE_NS}org` : "org"
export const NS = process.env.BANSHEE_NS ?? ""
export const ADMIN_TOKEN = process.env.BANSHEE_ADMIN_TOKEN ?? "dev-token"
export const SHOP_URL = process.env.CANDY_SHOP_URL ?? "http://127.0.0.1:4100"
