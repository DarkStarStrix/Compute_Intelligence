// Scope only binding types globally; importing the Workers runtime globally conflicts with DOM types.
import type {
  D1Database as PlatformD1Database,
  RateLimit as PlatformRateLimit,
} from "@cloudflare/workers-types";
declare global {
  type D1Database = PlatformD1Database;
  type RateLimit = PlatformRateLimit;
}
