import type { Route } from "./+types/documents.$sha256";
import { getArchive } from "../archive/archive.server";
import { createDocumentStorage, DocumentStorageUnavailableError } from "../storage/objects.server";

export async function loader({ params, request }: Route.LoaderArgs) {
  if (!/^[a-f0-9]{64}$/.test(params.sha256)) throw new Response("Not Found", { status: 404 });
  const document = await (await getArchive()).findSourceDocument(params.sha256);
  if (!document) throw new Response("Not Found", { status: 404 });
  const disposition = new URL(request.url).searchParams.get("download") === "1" ? "attachment" : "inline";
  const fileName = encodeURIComponent(document.fileName).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  const headers = {
    "Content-Type": document.mediaType,
    "Content-Length": String(document.byteSize),
    "Content-Disposition": `${disposition}; filename*=UTF-8''${fileName}`,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
    "Cache-Control": "public, max-age=0, must-revalidate",
    ETag: `"${document.sha256}"`,
  };
  const validators = request.headers.get("If-None-Match");
  if (validators?.trim() === '*' || validators?.split(',').some(value => value.trim().replace(/^W\//, '') === headers.ETag)) return new Response(null, { status: 304, headers });
  if (request.method === "HEAD") return new Response(null, { headers });
  // ponytail: buffers one file; stream from storage before serving files above the host response limit.
  const bytes = await createDocumentStorage().get(document.sha256).catch(error => {
    if (!(error instanceof DocumentStorageUnavailableError)) throw error;
    return null;
  });
  if (!bytes) throw new Response("Source Document is temporarily unavailable", { status: 503, headers: { "Retry-After": "60" } });
  return new Response(Uint8Array.from(bytes), { headers });
}
