# The next version is 0.3.0, and not 1.0.0

Decided for [ketqat-sdk#247](https://github.com/ketqat/ketqat-sdk/issues/247). This records the
reasoning, because the number on its own does not carry it and the next person choosing a version
should be able to disagree with the argument rather than guess at it.

## Where we actually are

`ketqat-sdk` is at **0.2.0** and **has never been published**. Both `ketqat-sdk` on npm and
`ketqat` on PyPI return 404. `ketqat-web` consumes this SDK as a pinned GitHub tarball, so the only
consumer today is one we control on both sides.

That single fact settles most of the question. Semantic versioning describes a promise to people
who already depend on a published artifact. There are none. Nothing in this release can *break* a
consumer, because no consumer can have installed anything.

## What changed since 0.2.0

| change | shape |
|---|---|
| `client.intelligence` ([#236](https://github.com/ketqat/ketqat-sdk/issues/236), [#246](https://github.com/ketqat/ketqat-sdk/issues/246)) | additive — new namespace, no existing signature altered |
| `client.reviews` ([#244](https://github.com/ketqat/ketqat-sdk/issues/244)) | additive — new namespace |
| `intelligence` CLI and MCP tools | additive — new commands, new tools |
| `bin.ts` stdout truncation fix ([#246](https://github.com/ketqat/ketqat-sdk/issues/246)) | behaviour change, correcting silent data loss past 65,536 bytes |
| an undetermined T count is no longer reported as zero ([#242](https://github.com/ketqat/ketqat-sdk/issues/242)) | behaviour change, correcting a wrong scientific claim |

No change to hashed payloads, the exclusion set, the canonical form, or number formatting. Under
this project's own rule those would be breaking whatever the diff looked like, and none occurred.

## Why 0.3.0

**Not `0.2.1`.** A patch says nothing new appeared. Two new client namespaces, a new CLI command
group and ten MCP tools is not a patch, and labelling it one would make the changelog the only
place the addition is visible.

**Not `1.0.0`.** This is the tempting one, and it is wrong for a reason worth stating plainly:
1.0.0 is a promise of API stability, and this project has no evidence it can keep that promise yet.
The intelligence contracts are new, they have one consumer, and no external user has ever exercised
them. Publishing 1.0.0 would assert a compatibility guarantee on a surface whose first real
feedback has not arrived. The two behaviour corrections above are exactly the kind of thing that
keeps surfacing early in a contract's life — an undetermined T count reported as zero was a wrong
scientific claim shipped in good faith, and it is unlikely to be the last.

Under 0.x, a minor bump is the conventional signal for "substantial additive surface, no stability
promise yet". That is an accurate description of this release.

**Not a `0.3.0-rc.1` for its own sake.** The issue permits an RC tag only if governance allows one,
and an RC exists to gather feedback from installers. With publishing gated by
[`docs/first-release-checklist.md`](../first-release-checklist.md) there are no installers to gather
it from, so an RC would be ceremony rather than evidence. If first publication is later approved as
a staged rollout, cut the RC at that point.

## When 1.0.0 becomes honest

Not on a date, and not when the surface feels finished. When all of these hold:

- the intelligence contracts have been exercised by at least one consumer outside this organisation
- a full minor cycle passes without a correction to a scientific output
- the hash, canonical form and exclusion set have been stable across two releases
- the compatibility rules are covered by tests that a breaking change cannot pass

Until then the version says what is true: useful, additive, and not yet promising to stay put.

## The version lives in three files

`package.json`, `pyproject.toml` and `CITATION.cff` must agree exactly. `npm run verify:release`
fails if they do not — a citation naming one release while the artifact is another points a reader
at different hashing behaviour, which is the failure this check exists to prevent.

The npm and PyPI packages are versioned together because they share the reproducibility hash, the
canonical serialization and the schemas. A release where those disagreed would be one where the
same run produced two different hashes, so there is no version in which one is ahead of the other.
