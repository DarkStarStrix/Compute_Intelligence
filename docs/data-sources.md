# Provider data and interpretation

Compute Intelligence reads public APIs and official pricing pages. This guide records GPU adapter behavior; the live [provider profiles](https://darkstarstrix.github.io/gpu-price-tracker/) show the sources in the latest published snapshot. Coverage and successful refreshes can change.

| Provider        | Collected data                           | Important interpretation                                                                                                |
| --------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| RunPod          | Public GraphQL catalog and stock reports | Secure and Community are separate cloud tiers; catalog prices are per GPU-hour, with no asserted node configuration.    |
| CoreWeave       | Official regional on-demand price tables | Node rates are divided by GPU count once. Spot, inference, CPU and quote-only rows are excluded.                        |
| Paperspace      | Official DigitalOcean machine pricing    | Conflicting multi-GPU prices and ambiguous model labels are excluded explicitly.                                        |
| Hyperstack      | Official on-demand GPU price cards       | Maximum CPU/RAM specifications are not presented as allocated resources.                                                |
| Verda           | Official regular single-GPU instances    | Distinct CPU/RAM configurations retain separate listing identities.                                                     |
| Crusoe          | Official current on-demand rates         | Future December 1 prices are excluded; collection stops at that transition until the parser is reviewed.                |
| Vultr           | Public plans endpoint                    | Node prices and total VRAM are normalized per GPU; empty locations do not prove availability.                           |
| Nebius          | Public spot prices and hourly history    | Interruptible spot prices remain separate from on-demand comparisons.                                                   |
| Runcrate        | Public GPU pricing feed                  | Lowest listed per-GPU rate per type. Types with no orderable option are excluded; no node configuration is asserted.    |
| Hot Aisle       | Official MI300X pricing                  | Published per-GPU rates for 1-, 2- and 4-GPU VMs and 8-GPU bare metal.                                                  |
| Lambda          | Official GPU instance pricing            | On-demand per-GPU rates by node size. Regional stock is not published in the rate card.                                 |
| DigitalOcean    | Official GPU Droplet pricing             | On-demand and spot node rates, with 1- and 8-GPU SKUs kept separate.                                                    |
| Civo            | Official NVIDIA GPU pricing              | On-demand hourly node rates. Commitment-only plans are excluded.                                                        |
| Jarvislabs      | Official USD instance pricing            | Single-GPU on-demand and spot rates from the public USD table.                                                          |
| Massed Compute  | Official on-demand GPU pricing           | Published node configurations and hourly rates. Quote-only configurations are excluded.                                 |
| Lium            | Public nodes API                         | Secure and Spot node rates, free GPU counts, and minimum rentable GPU counts. Rented nodes retain their observed price. |
| GPU.ai          | Public pricing and GPU types APIs        | Whole configuration rates, stock counts, and Community or Secure tier.                                                  |
| OpenRelay       | Public GPU catalog API                   | Community and Verified USD per-GPU rates with no stock claim.                                                           |
| Akamai Cloud    | Public Linode plans API                  | Published hourly VM rates and GPU counts.                                                                               |
| Oracle Cloud    | OCI price list API                       | GPU compute meters in USD. Separate software license meters and shapes with ambiguous hardware are excluded.            |
| Microsoft Azure | Retail Prices API                        | Selected Linux VM SKUs in East US, Central US, and West US 2. On-demand and Spot rates are separate.                    |
| Thunder Compute | Public instance pricing                  | Single-GPU on-demand compute rates. Sandboxes and optional add-ons are excluded.                                        |
| OVHcloud        | US public cloud price list               | Hourly GPU VM prices from the US catalog.                                                                               |
| Canopy Wave     | Public GPU cloud price table             | Per-GPU hourly prices with whole instance counts. Quote-only rows are excluded.                                         |
| Latitude.sh     | Public metal GPU plan table              | Starting hourly bare-metal prices. Specific regions may differ.                                                         |
| Denvr Dataworks | Public GPU cloud price table             | On-demand rates for whole accelerators. Reserved-only and fractional MIG configurations are excluded.                   |
| Oblivus         | Public GPU configurations and pricing    | On-demand per-GPU prices with configured node sizes.                                                                    |
| Google Cloud    | Accelerator-optimized VM price table     | USD on-demand and Spot reference rates for full-GPU instances. Commitments and fractional GPUs are excluded.            |
| Spheron AI      | Public paginated marketplace API         | On-demand and Spot node rates with provider-reported stock and regions.                                                 |
| VoltageGPU      | Public price and stock snapshot          | Standard price floors have unspecified machine sizes. Confidential VMs and dedicated nodes retain their full counts.    |
| Sixtytwo        | Public capacity listings                 | Exact USD per-GPU-hour lease quotes appear on the profile with quantity, term and published ready date.                 |
| Sesterce        | Public compute catalog                   | Starting configuration rates are divided by the node's GPU count. Regional stock is unverified.                         |

The disconnected Prime Intellect, TensorDock and Fluidstack adapters have been removed. Historical observations and Git history are retained. Adding a provider requires a verified first-party data contract and parser tests; credentials must never enter frontend assets.

Pricing pages establish a published rate, not stock. Missing stock becomes a **Check stock** link; explicit available/limited/unavailable reports keep their colored indicators. Failed or old observations remain visible in Offers with their actual timestamps and never count as current market data. Overview, comparisons and provider inventory retain their last observed prices with explicit stale labels when fresh data is unavailable. Old stock reports become stock-check links. The freshness limit is two hours.

## Other compute categories

CPU, TPU and sandbox listings use the same catalog, filters, calculator and history pipeline, with separate billing units. Provider profiles include these sources as well. Inspect the original source, configuration, billing basis and observation time before comparing quotes. See the [architecture](../ARCHITECTURE.md) and [provider onboarding guide](provider-onboarding.md) for implementation contracts.

Provider logo attribution is recorded in [SOURCES.json](../client/public/images/providers/SOURCES.json). Logos identify providers; they do not imply endorsement.
