# ketqat-sdk

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=flat&logo=discord&logoColor=white)](https://discord.gg/KcJcRJv6pr)
[![X](https://img.shields.io/badge/X-@ket__qat-000000?style=flat&logo=x)](https://x.com/ket_qat)

TypeScript library for **[KetQat](https://github.com/ketqat)** — shared **types**, a **quantum cloud provider catalog**, and **reference decoder data** used by the KetQat web app and other consumers.

This repository contains **only** the shared TypeScript package. The KetQat **website** (Next.js app and routes) is maintained in a separate codebase.

## What’s included

| Area | Description |
|------|-------------|
| **Types** | `Decoder`, filters, `QubitType`, `CodeType`, etc. |
| **Cloud catalog** | `QUANTUM_PROVIDERS`, `getProviderById`, `getRelatedProviders` |
| **Reference data** | `mockDecoders`, `getDecoderById`, `getTrendingDecoders` |

Package entry: `dist/index.js` + `dist/index.d.ts` (built from `src/`).

## Requirements

- Node.js **18+**
- npm (or pnpm / yarn)

## Install

Published package (when released to npm):

```bash
npm install ketqat-sdk
```

Local path during development (e.g. from the KetQat monorepo):

```bash
npm install file:../ketqat-sdk
```

## Usage

```ts
import type { QuantumProvider, Decoder } from "ketqat-sdk"
import {
  QUANTUM_PROVIDERS,
  getProviderById,
  mockDecoders,
  getTrendingDecoders,
} from "ketqat-sdk"

const p = getProviderById("ibm-quantum")
const trending = getTrendingDecoders(5)
```

Build output is ESM (`"type": "module"`). Use a bundler or Node with ESM resolution as appropriate.

## Development

```bash
git clone https://github.com/ketqat/ketqat-sdk.git
cd ketqat-sdk
npm install
npm run build
```

- **`npm run build`** — compile `src/` → `dist/` with TypeScript.
- **`npm run clean`** — remove `dist/`.

`prepublishOnly` runs `build` before publish.

## Project layout

```
src/
  index.ts          # public exports
  types.ts
  cloud-providers.ts
  mock-data.ts
tsconfig.json
package.json
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache License 2.0 — see [LICENSE](LICENSE).
