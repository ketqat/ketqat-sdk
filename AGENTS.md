# AGENTS.md

## Mission

Since 2026-10-29 the headline is the **official KetQat catalog**: KetQat-curated
quantum software in three categories (quantum algorithms, quantum error
correction, quantum information), found on ketqat.com and run locally through
this SDK. Free products are open source here and need no account, payment or
telemetry. Pro products are additional KetQat implementations delivered as
signed bundles under a time-limited entitlement. See `docs/catalog.md`.

"Officially provided by KetQat" must never imply KetQat invented a method. Every
product definition states its origin, upstream OSS, references, license and
contributors, and keeps original and external contributors listed.

Qiskit regression checks (ADR 0015 in ketqat-planning) remain a supported
feature, no longer the headline. Resource estimates and the research registry
remain the evidence layer underneath.

KetQat's own software subscription and test payment integration are authorized by
the maintainer's 2026-09-08 commercial rebuild directive; billing itself lives in
`ketqat-web`, never here. Record a proposed price as a hypothesis; never invent
sales, customers, costs, usage or retention.

Keep Engineering-ready, Commercially-ready and Market-validated separate. Live
selling still requires actual seller/legal/account setup. New paid capacity and
external outreach require explicit authorization. Existing public OSS licenses,
private data, shared URLs, scientific validity and review gates are preserved.

QPU marketplace/resale, provider billing, persistent provider credentials and
unconfirmed hardware execution remain excluded. No customer source runs on
KetQat servers; catalog products run on the user's machine.

## Repository responsibility

`ketqat-sdk` owns:

- Scientific public contracts
- Zod runtime validation and generated JSON Schemas
- Reproducibility hashing
- Scientific compatibility logic
- Typed REST client
- Public examples and demo fixtures
- Local TypeScript/Python runner support
- The catalog product definitions (`catalog/`), their schema, the generated index, and the
  local catalog CLI (`ketqat catalog | runs | report | pro`)

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
- Python test setup: `python3.11 -m pip install -e "python[qec,qinfo,pro]" pytest`
- Python tests: `python3.11 -m pytest python/tests`
- Catalog index and packaged copy: `python -m ketqat_runner.catalog.build` (CI runs `--check`)
- Catalog examples in clean virtualenvs (slow): `KETQAT_RUN_SLOW_TESTS=1 python -m pytest -m slow python/tests/test_catalog_examples.py`
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
- Catalog definitions are authored only in `catalog/products/`; regenerate with
  `python -m ketqat_runner.catalog.build` and commit the index and packaged copy together.
  Never hand-edit `catalog/catalog.json` or `python/src/ketqat_runner/catalog/data/`.
- A product's `validation` entries must name tests that compare against independent
  analytic values or independent computations. Do not mark a product `verified` until CI
  has executed its example verbatim in a clean virtualenv.
- Free catalog runs must not import entitlement or network code, and must not contact a
  server. Usage reports are opt-in, show the exact payload first, and send only the six
  contract fields.
- Never commit a private signing key. Production public keys are added only by the owner;
  test keys are honoured only with `KETQAT_ALLOW_TEST_ENTITLEMENT_KEYS=1`.
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
