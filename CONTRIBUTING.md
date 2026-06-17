# Contributing to ketqat-sdk

Thank you for contributing to KetQat SDK, the shared contract layer for reproducible quantum error-correction and quantum-algorithm research.

## Project Boundaries

This repository owns public research contracts, validators, generated JSON Schemas, reproducibility hashing, compatibility helpers, demo fixtures, a typed REST client, and the local runner package.

It must not contain web UI code, Prisma models, deployment configuration, hardware-access catalogs, QPU credential handling, availability checks, pricing logic, or commercial QPU execution integrations.

## Development

```bash
npm install
npm run build
npm test
```

`npm run build` compiles TypeScript and regenerates committed JSON Schemas from the Zod validators. Keep schema changes intentional and review both the TypeScript contract and generated schema diff.

## Research Data Expectations

Demo records must be marked with `is_demo: true`. Do not add fabricated stars, downloads, dates, author claims, benchmark claims, threshold claims, or performance claims. Real benchmark data should include enough configuration, environment, source, and metric detail for reproducibility hashing and compatibility checks.

## Pull Requests

Use focused pull requests. Include:

- the research contract or runner behavior that changed
- generated schema changes
- compatibility or hashing impact
- commands used for validation
- scientific limitations or assumptions

By contributing, you agree that your contribution is licensed under Apache-2.0.
