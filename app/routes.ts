import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("about", "routes/about.tsx"),
  route("official/:slug", "routes/official.$slug.tsx"),
  route("documents/:sha256", "routes/documents.$sha256.ts"),
  route("saln/*", "routes/saln.$.ts"),
  route("resources", "routes/resources.tsx"),
  route("source-tip", "routes/source-tip.tsx"),
  route("ping", "routes/ping.tsx"), // Ping endpoint for monitoring
  route("*", "routes/$.tsx") // Catch-all route for 404
] satisfies RouteConfig;
