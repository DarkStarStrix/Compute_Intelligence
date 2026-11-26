import type { Fetcher as PlatformFetcher } from "@cloudflare/workers-types";
declare global {
  type Fetcher = PlatformFetcher;
}
