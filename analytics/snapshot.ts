import type { D1Database } from "@cloudflare/workers-types";
import { snapshotSchema } from "../shared/catalog";
import { readBounded } from "./http";

export async function observeSnapshot(db: D1Database, url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: {
      Accept: "application/json",
      "User-Agent": "ComputeIntelligenceAnalytics/1.0 (snapshot health)",
    },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("snapshot HTTP failure");
  }
  const snapshot = snapshotSchema.parse(
    JSON.parse(await readBounded(response, 4_000_000))
  );
  const statements = snapshot.sources.map(source => {
    const offers = snapshot.offers.filter(
      offer => offer.providerId === source.id
    );
    const complete = offers.filter(
      offer =>
        offer.configurationKnown !== false &&
        offer.vcpus !== null &&
        offer.ramGb !== null
    ).length;
    return db
      .prepare(
        `INSERT INTO source_checks(revision,provider,checked_at,last_success_at,status,listings,complete) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(revision,provider) DO NOTHING`
      )
      .bind(
        snapshot.generatedAt,
        source.id,
        source.checkedAt,
        source.lastSuccessAt,
        source.status,
        offers.length,
        complete
      );
  });
  for (const feed of snapshot.compute ?? [])
    statements.push(
      db
        .prepare(
          `INSERT INTO source_checks(revision,provider,checked_at,last_success_at,status,listings,complete) VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(revision,provider) DO NOTHING`
        )
        .bind(
          snapshot.generatedAt,
          `${feed.providerId}:compute`,
          snapshot.generatedAt,
          feed.observedAt,
          feed.status,
          feed.rates.length,
          feed.rates.filter(rate => rate.vcpus && rate.memoryGb).length
        )
    );
  for (let i = 0; i < statements.length; i += 50)
    await db.batch(statements.slice(i, i + 50));
}
