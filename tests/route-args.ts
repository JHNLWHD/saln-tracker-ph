/** Supply the URL and matched pattern required by server route arguments. */
export function routeArgs<T extends { request: Request }>(args: T, pattern: string) {
  return { ...args, url: new URL(args.request.url), pattern };
}
