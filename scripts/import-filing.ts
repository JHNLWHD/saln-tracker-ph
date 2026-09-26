import { runManifestImport } from "./import-manifest";

runManifestImport("filing").catch(error => { console.error(error.message); process.exitCode = 1; });
