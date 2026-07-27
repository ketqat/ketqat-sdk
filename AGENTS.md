# AGENTS.md

## Mission

KetQat is open-source research infrastructure for reproducible quantum error-correction and quantum-algorithm experiments.

Supported domains:

- Quantum Error Correction and fault-tolerant quantum computing
- Quantum algorithms and reproducible algorithm evaluation

Explicit non-goals:

- QPU marketplace, billing, persistent credential storage, commercial QPU execution aggregation, provider pricing aggregation, provider status monitoring, and hardware-provider catalog features presented as purchasing advice

In scope per [ADR 0004](https://github.com/ketqat/ketqat-planning/blob/main/docs/architecture/adr/0004-scientific-execution-and-hardware-characterization-scope.md), accepted 2026-07-28, which supersedes the provider clause of ADR 0001:

- Hardware characterization snapshots: immutable, dated device descriptions used as scientific inputs to transpilation, resource estimation, and QEC analysis
- User-initiated execution on real hardware (BYOC), where credentials are supplied per job and never persisted
- Provider adapters that translate KetQat circuits and results to and from a provider's formats

Binding conditions: credentials never persist including on failure and crash paths; explicit pre-submission confirmation of provider, backend, shots, cost, and quota; execution class on every result; absent credentials produce not-run records rather than fixtures imitating hardware results; snapshots are dated observations, never refreshed in place.

## Repository responsibility

`ketqat-sdk` owns:

- Scientific public contracts
- Zod runtime validation and generated JSON Schemas
- Reproducibility hashing
- Scientific compatibility logic
- Typed REST client
- Public examples and demo fixtures
- Local TypeScript/Python runner support

Adjacent responsibilities:

- `ketqat-web` owns UI, APIs, Prisma/PostgreSQL, authorization, GitHub metadata import, and deployment.
- `ketqat-planning` owns vision, scope, roadmap, ADRs, RFCs, and cross-repository planning.

## Required reading before editing

1. `AGENTS.md`
2. `README.md`
3. `CONTRIBUTING.md`
4. Relevant files under `src/contracts`, `src/schemas`, `src/reproducibility`, `src/compatibility`, or `python/src`
5. `ketqat-planning/CONTEXT.md`
6. Relevant ADRs or RFCs in `ketqat-planning`

Inspect current code and tests instead of trusting stale documentation.

## Commands

- Install: `npm ci`
- Build and regenerate schemas: `npm run build`
- Test: `npm test`
- Python test setup: `python3.11 -m pip install -e "python[qec]" pytest`
- Python tests: `python3.11 -m pytest python/tests`
- Python runner smoke check: `ketqat run examples/qec/surface-code-memory.yaml --output /tmp/ketqat-qec-run.json`

## Development rules

- Create or identify a GitHub Issue before substantial implementation.
- Use a feature branch; use `chore/...`, `feature/...`, or `fix/...`.
- Link PRs to Issues.
- Run documented tests before requesting review.
- Update README, schemas, examples, or planning docs when behavior changes.
- Report unverified assumptions.

## SDK-specific rules

- Review schema backward compatibility for public contract changes.
- Add or update TypeScript tests for schema, hashing, compatibility, client, and demo data changes.
- Add Python tests for runner and cross-language hash behavior when runner behavior changes.
- Maintain cross-language reproducibility hash parity.
- Normal QEC runner execution must use real NumPy, Stim, and PyMatching dependencies; never reintroduce an automatic synthetic fallback.
- Do not add web UI, Prisma, PostgreSQL, authentication, deployment, or provider-catalog functionality.
- Do not duplicate implementation behavior that belongs in `ketqat-web`.

## Security and scientific integrity

- Do not commit secrets.
- Do not execute arbitrary uploaded code.
- Do not store provider credentials.
- Mark synthetic records with `is_demo: true`.
- Do not present demo results as scientific performance claims.
- Do not rank or compare incompatible runs.

## Cross-repository changes

Create a parent issue in `ketqat-planning` for cross-repository initiatives, then implementation issues in owning repositories. Use bidirectional links if GitHub sub-issues are unavailable.
