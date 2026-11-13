/** A visual preview never opens a data service, even if runtime settings drift. */
export function isReadOnlyPreview(env: NodeJS.ProcessEnv = process.env) {
  if (env.ARCHIVE_ENVIRONMENT !== 'preview' && env.VITE_READ_ONLY_PREVIEW !== 'true' && !env.ARCHIVE_PREVIEW_BRANCH) return false;
  if (env.ARCHIVE_ENVIRONMENT !== 'preview' || env.VITE_READ_ONLY_PREVIEW !== 'true' || env.ARCHIVE_ADAPTER !== 'local' || env.ARCHIVE_STORAGE !== 'local') throw new Error('Read-only preview settings must be paired with local adapters');
  if (env.NETLIFY !== undefined && env.NETLIFY !== 'true') throw new Error('Read-only preview requires NETLIFY=true or an explicit local environment without NETLIFY');
  const hosted = env.NETLIFY === 'true' || Boolean(env.SITE_ID || env.CONTEXT || env.BRANCH);
  if (hosted) {
    if (env.ARCHIVE_PREVIEW_BRANCH !== 'develop') throw new Error('Read-only preview is restricted to develop');
    // Netlify supplies BRANCH/CONTEXT at build time, but not to Functions.
    // The marker is set only for develop in both Builds and Functions scopes.
    if ((env.CONTEXT && env.CONTEXT !== 'branch-deploy') || (env.BRANCH && env.BRANCH !== 'develop')) throw new Error('Read-only preview is restricted to the develop branch deployment');
    if (!env.SITE_ID && (!env.CONTEXT || !env.BRANCH)) throw new Error('Read-only preview deployment context is missing');
  }
  if (Object.entries(env).some(([key, value]) => value && /^(?:TURSO_|R2_|SOURCE_TIPS_|STAGING_TURSO_|STAGING_R2_|STAGING_SOURCE_TIPS_)/.test(key))) throw new Error('Read-only preview cannot use data services or credentials');
  return true;
}

export function checkPreviewView(request: Request, reviewedOnly = false) {
  if (isReadOnlyPreview() && (reviewedOnly || new URL(request.url).searchParams.get('view') === 'reviewed')) throw new Response('Reviewed views are not available in this read-only visual preview. Browse the saved public data from Home.', { status: 503, statusText: 'Reviewed views are not available in this visual preview', headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}
