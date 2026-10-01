import { connectArchive } from '../app/db/client.server';
import { writeDatabaseConfig } from '../app/db/cli';
import { initializeSourceTipDestination, sourceTipDestination } from '../app/db/source-tips.server';

async function main() {
  const destination = sourceTipDestination();
  const config = writeDatabaseConfig(process.argv.slice(2), { ...process.env, TURSO_DATABASE_URL: destination.url, TURSO_AUTH_TOKEN: destination.authToken, ARCHIVE_ENVIRONMENT: process.env.SOURCE_TIPS_ENVIRONMENT });
  const { client } = connectArchive(config);
  try { await initializeSourceTipDestination(client); console.log('Private Source Tips destination initialized.'); } finally { client.close(); }
}
main().catch(() => { console.error('Private destination initialization failed. Check the named target and environment.'); process.exitCode = 1; });
