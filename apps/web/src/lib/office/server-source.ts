// Which backend the API routes drive. mock = in-process mock engine; live = Terse actors.
export const SERVER_SOURCE: "mock" | "live" = process.env.BANSHEE_SOURCE === "live" ? "live" : "mock"
