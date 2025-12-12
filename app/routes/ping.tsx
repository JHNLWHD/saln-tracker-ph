import type { Route } from "./+types/ping";

/**
 * Ping endpoint for monitoring services (e.g., UptimeRobot)
 * Returns "pong" as plain text
 * 
 * This is a resource route - no default component export means React Router
 * will return the Response directly without rendering any UI
 */
export async function loader({}: Route.LoaderArgs) {
  return new Response("pong", {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
