# Changelog

Notable changes to `ketqat-sdk` (npm) and `ketqat` (PyPI), which are versioned together.

The two packages share a version because they share a contract: the reproducibility hash,
the canonical serialization and the schemas must agree byte for byte across the two
languages. A release where they disagreed would be a release where the same run produced
two different hashes, so there is no version in which one is ahead of the other.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html), with one addition specific to
this project: **any change to hashed payloads, the exclusion set, the canonical form or
number formatting is breaking**, whatever it looks like in the diff. It changes every
future hash and silently breaks comparison with every stored run.

## Unreleased

Nothing has been published. `ketqat-sdk` on npm and `ketqat` on PyPI both return 404, and
first publication is gated by [`docs/first-release-checklist.md`](docs/first-release-checklist.md),
which is a human decision.

### Added

- **Release artifacts are built and checked without being published.**
  `npm run build:release` produces the npm tarball, the Python wheel and sdist, CycloneDX
  SBOMs for both, `SHA256SUMS`, provenance and reproducibility evidence in `dist-release/`.
  Every artifact is built **twice** into separate directories and the digests compared, so
  reproducibility is measured rather than asserted. `npm run verify:release` gates on the
  contents of those files rather than on a manifest describing them.
- **`CITATION.cff` now ships inside every artifact.** It was in the repository and in none
  of the three artifacts, so an installed copy could not be cited — and `pip install` never
  sees the repository. `python/CITATION.cff` is a byte-identical copy of the canonical file,
  and `npm run verify:citation` fails when the two differ. A symlink was tried first and
  does not work: sdists and wheels store a symlink as a symlink, and the packaged file
  resolved to nothing.
- **A clean-room workflow** installs only the built artifacts into fresh environments and
  runs an algorithm and a three-decoder QEC comparison there, with the checkout nowhere on
  the path.

### Fixed

- **The TypeScript CLI accepts `KETQAT_API_TOKEN`** ([#218](https://github.com/ketqat/ketqat-sdk/issues/218)).
  It read `KETQAT_TOKEN` while the Settings page that mints the token, this README, the
  quickstart and the Python CLI all said `KETQAT_API_TOKEN`, so following the documentation
  produced "No API token" with the token already exported. Both names now resolve in both
  languages; two different values are refused rather than resolved, because a job and its
  results are owned and choosing one files an immutable record under an identity the user
  did not pick.

### Security

- **Branch protection on `main`** now requires a pull request, requires all 14 CI contexts,
  enforces linear history, applies to administrators, and forbids force pushes and
  deletions. Required signed commits were enabled, measured to block every merge this
  project can make, and switched off again — the record of that is in
  [ketqat-planning#47](https://github.com/ketqat/ketqat-planning/issues/47).
- CodeQL, Scorecard and dependency review actions pinned to the CodeQL v4 line
  ([#116](https://github.com/ketqat/ketqat-sdk/pull/116)).

## 0.2.0 — unreleased

The version both packages currently declare. It has never been published, so there is no
release entry for it; the work it contains is recorded in the issues and pull requests of
this repository and in `ketqat-planning`.
