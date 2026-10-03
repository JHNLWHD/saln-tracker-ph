import assert from 'node:assert/strict';

/** Follow only the public data alias to the accepted immutable release artifact. */
export async function readReleaseRoute(origin: URL, path: string, snapshotVersion: string): Promise<Response> {
  const response = await fetch(new URL(path, origin), { signal: AbortSignal.timeout(30000), redirect: 'manual' });
  if (response.status >= 300 && response.status < 400 && response.headers.has('Location')) {
    const target = new URL(response.headers.get('Location')!, new URL(path, origin));
    assert.equal(target.origin, origin.origin, 'HTTP check escaped the named deployment');
    if (['/data/archive.json', '/data/source-checksums.json'].includes(path)) {
      assert.equal(response.status, 307);
      assert.equal(target.href, new URL(`/data/${snapshotVersion}/${path.slice('/data/'.length)}`, origin).href, 'Data alias must identify the accepted immutable artifact');
      return readReleaseRoute(origin, target.pathname, snapshotVersion);
    }
  }
  return response;
}
