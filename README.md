# Banshee

**Every production service gets its own AI agent.** When production breaks, the agents question each other in an Agent Relay channel, find the culprit from evidence, and ask a human to approve one fix, by chat, by voice call or with one tap on a phone.

Built at Haunted Hacks (Y Combinator, San Francisco, Oct 31 2026) by Joel Timana and Diana Munoz. All code in this repository was written at the hackathon.

- Live demo: https://banshee.style.dev (scan the QR on the landing, or open `/chaos` on a phone and break our production)
- War room (big screen): `/room` · On-call phone: `/oncall` · Break things: `/chaos`

## How it works

```
 Candy Shop (Freestyle VM)            Terse Durable Actors (cloud)              People
 ┌────────────────────────┐  telemetry ┌───────────────────────────────┐
 │ checkout  payments     │──────────▶│ ServiceSpirit × 3  (one per    │
 │ inventory vendor(fake) │            │   service: baseline, deploys,  │        ┌────────────┐
 │ supervisor + load gen  │◀───────────│   memory, dead-man alarm)      │◀──────▶│ Agent Relay │ channel inc-N
 └────────────────────────┘   fixes    │ IncidentDesk  (one mailbox →   │        └────────────┘
          ▲                             │   one incident per fault)      │
          │ chaos buttons               │ Incident      (root cause,     │  approve  ┌────────────┐
          │                             │   proposal, fix, postmortem)   │◀─────────│ /oncall     │ chat · voice · tap
 ┌────────┴─────────────┐  live socket  │ Office        (state stream)   │           └────────────┘
 │ Next.js web app      │◀──────────────┴───────────────────────────────┘
 │ /room /oncall /chaos │  OpenAI: narration (Vercel AI SDK), chat, Realtime voice
 └──────────────────────┘
```

1. A service pushes its numbers to its own agent. When error rate or latency leaves the baseline, that agent opens an incident (one fault, one incident, even if two services notice at once).
2. The agents question each other in an Agent Relay channel (`inc-N`) with evidence ("did you change anything before 13:02?").
3. **The culprit is chosen by code, not by the model:** the earliest change with a local cause (a deploy, a config change or a vendor error). OpenAI only writes the conversation. A vendor outage is correctly called "not our bug".
4. The on-call human gets the evidence and one proposed fix (roll back, switch on a fallback, switch on a cache) and approves or rejects it. Banshee can ring on-call: chat with the agent, or take its voice call (OpenAI Realtime), then confirm with one tap.
5. The fix runs against the real services, the agents confirm recovery, and the incident is remembered: the same fault the second time is recognised faster.

## What is real and what is simulated

Real: the Candy Shop services run as HTTP services under constant traffic; the "bad deploy" is a real git commit with a real bug that the button checks out and restarts; error rates, latencies, error lines and deploy diffs come from the running services; the agents only know what their tools return; approved fixes change the running services.

Simulated: the shop is our own demo shop, the card processor is a fake vendor service, the deploy pipeline is a script (not CI/CD). `?source=mock` runs the UI on scripted data with no backend.

## Stack

TypeScript everywhere. Next.js 16 + React 19 + Tailwind 4 (web), three.js with react-three-fiber (isometric office), Terse Durable Actors (agents), Agent Relay (channels), OpenAI through the Vercel AI SDK and the Realtime API (narration, chat, voice), Hono (shop services), Freestyle VMs (hosting of the shop and the web app). pnpm workspace; Bun for the Terse CLI.

## Repository layout

| Path | What it is |
|---|---|
| `actors/` | Terse project: `ServiceSpirit`, `IncidentDesk`, `Incident`, `Office`, root-cause rules, narration, Relay client, e2e tests in `test/` |
| `apps/web/` | Next.js app: landing, `/room` (3D war room), `/oncall`, `/chaos`, API routes, deploy scripts for Freestyle |
| `services/candy-shop/` | The demo production: checkout, payments, inventory, fake vendor, supervisor and load generator |
| `packages/contracts/` | Types shared by the web app and the actors (`@banshee/contracts`; vendored into `actors/src/contracts.ts` for deploys) |
| `scripts/` | Preflight, reset, Terse secret pushing and a read-only Relay viewer |
| `probe/` | Small experiments used while learning the Terse runtime |

## Run it locally

Requirements: Node 22+, pnpm 10, Bun (for `terse`), and a `.env` copied from `.env.example`.

```bash
pnpm install

# 1. UI only, no backend (scripted data; nothing breaks unless you press a chaos button)
pnpm dev:web          # http://localhost:3000/room?source=mock

# 2. The real thing, locally
cd actors && bun install && terse actor dev          # actors on http://127.0.0.1:7100
cd services/candy-shop && bash scripts/setup-payments-repo.sh   # once: creates the payments repo with the good and bad releases
cd services/candy-shop && pnpm dev                   # supervisor + shop on :4100 to :4104
cd services/candy-shop && pnpm load                  # constant traffic
BANSHEE_SOURCE=live BANSHEE_ADMIN_TOKEN=dev-token pnpm dev:web
```

Tests: `sh actors/test/run.sh` runs the end-to-end suite against a local Terse runtime. `pnpm typecheck` checks the workspace.

## Configuration

Names only, values live in your private `.env` (never commit it). See `.env.example`.

| Variable | Used by |
|---|---|
| `OPENAI_API_KEY` | narration, chat and the Realtime voice session (server side only; the browser gets a short-lived client secret) |
| `TERSE_ACTOR_URL`, `TERSE_API_KEY` | the web app calling the hosted actors |
| `RELAY_BASE_URL`, `RELAY_WORKSPACE_KEY` | the actors posting to Agent Relay |
| `FREESTYLE_API_KEY` | deploy scripts for the shop and the web VM |
| `BANSHEE_ADMIN_TOKEN` | shop admin API, chaos and the actor bridge (`x-banshee-token`) |
| `BANSHEE_SOURCE` / `NEXT_PUBLIC_DEFAULT_SOURCE` | `live` or `mock` data source for the web app |
| `BANSHEE_MOCK_AUTOPLAY=1` | optional: lets the mock demo play incidents by itself (off by default) |

## Deploy

- **Actors (Terse cloud):** `scripts/push-terse-secrets.sh` once, then `terse deploy` from a clean copy of `actors/` (the CLI ignores `.gitignore`, so copy only `src`, `package.json`, `bun.lock`, `tsconfig.json`, `terse.config.json`).
- **Shop and web (Freestyle VMs):** `apps/web/scripts/deploy-freestyle.ts` creates the VMs; `apps/web/scripts/update-freestyle.ts` ships a new web build in place and restores the previous one if the new one does not start.
- **Before a demo:** `bash scripts/preflight.sh`, then `bash scripts/reset-shop.sh` to bring the shop back to a clean release.

### Actor bridge

In Terse cloud an actor cannot call a peer actor with its own credential, so peer calls go through `POST /api/peer` on the web app (constant-time token check, fixed allow-list of actor methods, no approve). Locally the actors call each other directly.

## Security notes

- Secrets are read from the environment only; the OpenAI key never reaches the browser.
- `/api/peer` is live-mode only and checks `x-banshee-token`; `/api/ask`, `/api/call`, `/api/say` and `/api/realtime/session` are rate limited per IP.
- `/chaos` is intentionally public: it breaks a demo shop that exists to be broken.
- Approving a fix always needs an explicit tap on Approve; the voice agent can only ask for a decision, never execute one.

## Team

Joel Timana and Diana Munoz.
