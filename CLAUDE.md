# CLAUDE.md

Guidance for Claude Code working in `ketqat-sdk`. This file supplements [AGENTS.md](AGENTS.md); it does not replace or override it. Where the two overlap, `AGENTS.md` governs.

## What this repository is

`ketqat-sdk` is the **public contract layer** for KetQat: typed scientific contracts, Zod validators, generated JSON Schemas, canonical serialization, reproducibility hashing, scientific compatibility rules, a typed REST client, public examples and demo fixtures, and a local Python runner.

This is the only public code repository in the organization, and it is the package other people install. Two consequences follow:

- **It must stay dependency-light.** Its only runtime dependency is `zod`. Qiskit, CUDA-Q, PyZX, and comparable frameworks must never enter the core dependency set. Heavy scientific dependencies belong behind Python optional extras or, later, in a separate engine package.
- **Its contracts are public API.** A change to a hashed payload or a schema is a compatibility event, not a refactor.

Adjacent repositories:

- `ketqat-web` (private) -- UI, APIs, Prisma/Neon persistence, authorization, GitHub metadata import, deployment
- `ketqat-planning` (private) -- vision, scope, roadmap, ADRs, RFCs, cross-repository planning

## Commands

```bash
npm ci
npm run build                    # tsc, then regenerate JSON Schemas
npm test                         # build + SDK tests + package content verification
npm run verify:package-contents
npm run verify:clean-install
npm run verify:quickstart        # post-release clone-free runner flow

python3.11 -m pip install -e "python[qec]" pytest
python3.11 -m pytest python/tests
ketqat run examples/qec/surface-code-memory.yaml --output /tmp/ketqat-qec-run.json
```

CI splits Node and Python jobs, installs the real QEC dependencies, validates npm package contents and Python distributions, and runs clone-free quickstart verification across supported Node and Python lines.

`npm run build` regenerates `schemas/` from the TypeScript contracts. Never hand-edit a generated schema; change the contract and rebuild.

## Layout

- `src/contracts/` -- artifact, benchmark suite, benchmark result, experiment manifest, reproducibility bundle, verification evidence, common types
- `src/schemas/` -- JSON Schema generation
- `src/reproducibility/` -- canonical serialization and hashing
- `src/compatibility/` -- run comparison rules
- `src/client/` -- typed REST client, including `client.execution` for the sandboxed job queue
- `src/mcp/index.ts` -- read-only MCP tools; `src/mcp/execution.ts` -- the mutating ones, kept apart on purpose
- `src/demo/` -- demo fixtures, all marked `is_demo: true`
- `python/src/ketqat_runner/` -- CLI, runner, hashing, validation, environment capture
- `fixtures/reproducibility/` -- cross-language hash parity fixtures
- `dist/` -- **committed on purpose** so that exact GitHub source-tarball dependencies work for `ketqat-web`. Rebuild and commit it when source changes.

## Reproducibility hashing

This is the repository's most load-bearing behavior. `src/reproducibility/index.ts` and `python/src/ketqat_runner/hashing.py` must produce byte-identical canonical JSON and therefore identical SHA-256 digests, for every input.

- Keys are sorted; `undefined` values are dropped; a fixed exclusion set (`id`, `slug`, `started_at`, `finished_at`, `created_at`, `updated_at`, `submitted_at`, `ui_metadata`, `reproducibility_hash`, `owner_username`, `visibility`) is removed at every level.
- Changing the exclusion set, the canonical form, or number formatting changes **every future hash** and silently breaks comparison with every stored run. Treat it as a breaking contract change requiring a schema version bump and a planning ADR.
- Any change to hashing needs a parity fixture covering it in both languages. Known sharp edges already covered by fixtures: explicit `null` versus absent keys, whole-number floats, and negative zero.
- Add TypeScript tests for schema, hashing, compatibility, client, and demo changes; add Python tests when runner behavior changes.

## Scientific integrity

- Normal QEC runner execution uses real NumPy, Stim, and PyMatching. **Never reintroduce an automatic synthetic fallback.** Missing dependencies must fail closed with a clear message, not silently produce fabricated numbers.
- Mark synthetic records `is_demo: true`. Demo data is never presented as a scientific performance claim.
- Do not rank or compare incompatible runs. `src/compatibility/` refuses comparisons across domains, differing suite or schema versions, missing required metrics, and non-overlapping metric coordinates. Loosening any of those makes invalid comparisons possible.
- Review backward compatibility for every public contract change.
- Report what was not run as not run.

## Execution surfaces

The CLI's `job` commands and the MCP execution tools **enqueue; they never execute**. A surface that ran a circuit locally and uploaded the answer would produce a registry record with no audit trail and no enforced limits, indistinguishable from one the worker produced.

`src/mcp/index.ts` is entirely `readOnly: true`, and that annotation is only meaningful if a mutating tool cannot join the list by accident. Mutating tools therefore live in `src/mcp/execution.ts`, behind their own type and their own list function, so "what can this MCP server change?" is answered by one short file.

`submit_execution_job` refuses unless `confirmed: true`, and `confirmed` **defaults to false** -- a model that omits the field must not thereby submit. The refusal carries operation, qubits, shots, execution class, and any conversion loss, because a confirmation prompt that omits the cost is not a confirmation.

## Security

`npm run verify:workflows` enforces two OpenSSF Scorecard criteria in the repository rather than reporting them after the fact:

- **Every action is pinned to a commit SHA.** A tag is a mutable pointer; whoever controls the action repository can move `v4` to different code, which then runs with whatever token the workflow holds. Dependabot keeps the pins current so pinning does not become abandoned maintenance.
- **Every workflow declares `permissions:`.** Without a block it inherits the repository default, which may include write scopes. `ci.yml` had none and runs on `pull_request`, so it executed fork-authored code with inherited permissions.

Both were *partly* true before, which is why nobody noticed: the release workflows pinned SHAs while `ci.yml` floated, so a glance at the repository suggested pinning was done.

Report vulnerabilities through `SECURITY.md`. The SDK holds no secrets and opens no listener, so the real surface is untrusted-payload parsing, hash canonicalization, and validation bypass.

- Do not commit secrets.
- Do not execute arbitrary uploaded code.
- Do not store provider credentials.
- The SDK does not authenticate users and holds no secrets. Keep it that way.

## Boundary

Do not add web UI, Prisma, PostgreSQL, authentication, or deployment functionality here, and do not duplicate behavior that belongs in `ketqat-web`.

[ADR 0004](https://github.com/ketqat/ketqat-planning/blob/main/docs/architecture/adr/0004-scientific-execution-and-hardware-characterization-scope.md) was **accepted on 2026-07-28** and supersedes the provider clause of [ADR 0001](https://github.com/ketqat/ketqat-planning/blob/main/docs/architecture/adr/0001-focus-on-qec-and-algorithms.md).

**In scope here:** hardware characterization snapshot contracts, provider adapter contracts, and circuit/result translation. Adapter implementations must stay behind optional extras so the core dependency set remains `zod` only.

**Out of scope:** QPU marketplace, billing, pricing aggregation, provider status monitoring, persistent credential storage, and commercial execution aggregation.

**Binding conditions** for any code touching this area:

- Never read, write, or log a provider credential. The SDK holds no secrets.
- Every result records an execution class; a simulated result is never described as hardware.
- Absent credentials produce not-run records. Never commit a fixture that imitates an executed hardware result.
- Hardware snapshots are immutable dated observations and are never refreshed in place.

## Release state

No npm or PyPI release exists yet: `ketqat-sdk` on npm and `ketqat` on PyPI both return 404. Release workflows, credential-free preflight, and registry readback checks exist, but **first publication is human-gated** by `docs/first-release-checklist.md`. Do not attempt to publish.

## Workflow

- Create or identify a GitHub Issue before substantial implementation.
- Use a feature branch: `chore/...`, `feature/...`, or `fix/...`. Do not commit to `main`.
- Link PRs to Issues.
- Run the documented Node and Python tests before requesting review.
- Update README, schemas, examples, or planning docs when behavior changes.

## Cautions

- Worktrees of this repository exist outside the primary checkout, including under `~/.codex/worktrees/`. Run `git worktree list` before assuming a branch is free, and create a new worktree rather than switching branches in place.
- `ketqat-web` pins this repository by commit SHA as a source tarball. A merged change here does not reach the web app until that pin is updated.
