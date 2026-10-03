import { runManifestImport } from "./import-manifest";

runManifestImport("person").catch(error => { console.error(error.message); process.exitCode = 1; });
