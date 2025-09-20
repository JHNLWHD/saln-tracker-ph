import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("about", "routes/about.tsx"),
  route("official/:slug", "routes/official.$slug.tsx"),
  route("*", "routes/$.tsx") // Catch-all route for 404
] satisfies RouteConfig;
