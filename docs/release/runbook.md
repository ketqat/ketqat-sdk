# Release runbook: build, verify, read back

Exact commands, in order, for producing and proving a release artifact. Everything here is
reversible and nothing here publishes.

**Publishing is not in this document.** Authorization to publish — namespace ownership, Trusted
Publisher registration, GitHub Environments, tag protection, credential audit — is
[`docs/first-release-checklist.md`](../first-release-checklist.md), and it is a human decision made
by named people. This runbook is what you run *before* that conversation, so that it can be had
against evidence.

Related: [`versioning.md`](versioning.md) for which version and why,
[`docs/release-recovery.md`](../release-recovery.md) for partial-failure recovery,
[`docs/provenance.md`](../provenance.md) for what each artifact carries.

## 0. Setup, once per machine

Node must satisfy the declared engine. This is enforced rather than suggested: npm treats
`engines` as advisory and installs anyway with a warning, so a verification run on an unsupported
Node would report PASS while establishing nothing about a supported one.

```bash
node --version   # must be >= 22
```

The Python artifacts need the `build` module. Use a virtual environment — `.venv` is self-ignoring
(venv writes its own `.gitignore` containing `*`), so it will not dirty the working tree or the
provenance record.

```bash
python3 -m venv .venv && .venv/bin/pip install --upgrade pip build
```

## 1. The tree must be clean

Provenance records the commit and whether the tree was dirty. A dirty tree is **recorded, never
cleaned** — an artifact built from uncommitted changes is not the commit it names, and the
honest response is to say so rather than to quietly `git stash`.

```bash
git status --porcelain    # expect no output
```

## 2. Build the artifacts

```bash
npm run build:release -- --python "$(pwd)/.venv/bin/python"
```

Produces `dist-release/`: the npm tarball, the wheel, the sdist, a CycloneDX 1.5 SBOM for each
ecosystem, and `SHA256SUMS`. Each artifact is built twice and compared; the run reports
`reproducible=true` per artifact or names the reason it is not.

## 3. Verify the artifacts

```bash
npm run verify:release
```

Checks the checksums, that licence and citation are present in every artifact, that the version
agrees across `package.json`, `pyproject.toml` and `CITATION.cff`, that a rebuild is byte-identical,
and that the provenance record says `published=false`.

## 4. Exercise the artifact as a consumer

```bash
npm run verify:clean-install
npm run verify:release-consumer
```

The first installs the tarball into an empty project and type-checks against it. The second drives
it the way a stranger would: bin links resolved through `node_modules/.bin`, every export subpath
resolved by node rather than by relative path, the MCP server answering `initialize`, and — the
case that matters most — **`intelligence report` written to a pipe**, compared byte for byte
against the same command's `--output` file.

That last check is not generic thoroughness. The stdout truncation in
[#246](https://github.com/ketqat/ketqat-sdk/issues/246) dropped everything past 65,536 bytes when
stdout was a pipe, and was invisible in a terminal because a TTY write is synchronous. Anyone
piping a report to a file was silently getting 64 KiB of it. The check also asserts the sample
report *exceeds* 65,536 bytes, so it fails rather than passes vacuously if the fixture shrinks.

## 5. Read back what you produced

Read-back is the step people skip, and it is the only one that proves the bytes on disk are the
bytes you think they are. Re-hash independently of the tooling that wrote them:

```bash
cd dist-release && shasum -a 256 -c SHA256SUMS && cd -
```

Then confirm the artifact is what it claims:

```bash
tar -tzf dist-release/ketqat-sdk-*.tgz | head
unzip -l dist-release/ketqat-*.whl | head
```

## 6. Record the evidence

Paste into the release issue: the version, the commit, the three artifact hashes, the Node version
the checks ran on, and the `reproducible=` line for each artifact. A verification whose output was
not recorded is a verification nobody can check.

## What is deliberately absent

- **No publish step.** Not to npm, not to PyPI, not a GitHub Release. `prepublishOnly` runs the
  build; it does not authorize anything.
- **No credentials.** Nothing in this runbook reads a token, and nothing needs one. If a step ever
  appears to, that is the thing to question, not to satisfy.
- **No KetQat service, and no authenticated request.** Steps 2, 3 and 5 are genuinely offline —
  they read local files and re-hash them, so a green result there does not depend on any registry
  being reachable or honest.

  Step 4 is **not** offline, and the earlier draft of this document said it was. Installing the
  tarball resolves `zod` and `zod-to-json-schema` from the public npm registry, because a consumer
  install that stubbed its real dependencies would not be the thing under test. What still does not
  happen anywhere in this runbook: a request to a KetQat service, an authenticated request, or a
  write to any registry.
