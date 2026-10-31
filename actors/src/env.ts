// Inside the Terse cloud sandbox the SDK finds the control plane (an internal URL) but no project id, so actor-to-actor
// calls fail with "a valid projectId is required for remote connections". The project id is not a secret; set it only
// when the control plane is not local, so the local runtime keeps its own defaults.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
const controlPlane = env?.DURABLE_ACTORS_CONTROL_PLANE_URL ?? ""
if (env && controlPlane && !/(127\.0\.0\.1|localhost|\[::1\])/.test(controlPlane)) {
  env.DURABLE_ACTORS_PROJECT_ID ??= "cmvwvm7hv0124jy2aegvslvg7"
}
export {}
