import { redirect } from "react-router";
import type { Route } from "./+types/saln.$";
import { getArchive } from "../archive/archive.server";

/** Existing static PDFs remain in public/saln until a reviewed migration maps their exact bytes. */
export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const document = await (await getArchive()).findLegacyDocument(url.pathname);
  if (!document) throw new Response("Not Found", { status: 404 });
  throw redirect(`/documents/${document.sha256}${url.search}`, 301);
}
