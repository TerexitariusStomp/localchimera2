import { syncProviders, closeProviderDbs } from '../src/db/providerRegistry.js';

async function main() {
  try {
    const result = await syncProviders();
    console.log(
      `[sync-providers] complete: ${result.total} providers, ${result.aggregated.locations} separate locations, ${result.aggregated.combined} combined locations`
    );
  } catch (err) {
    console.error('[sync-providers] error:', err.message);
    process.exit(1);
  } finally {
    closeProviderDbs();
  }
}

main();
