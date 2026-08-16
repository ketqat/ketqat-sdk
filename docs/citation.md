# Citing KetQat

`CITATION.cff` already pointed here, and this file did not exist — a citation file whose
own instructions lead nowhere. That is the shape of problem this page is about.

## Cite the version you ran

```
KetQat SDK, version 0.3.0. https://github.com/ketqat/ketqat-sdk
```

`CITATION.cff` at the repository root is the machine-readable form; GitHub renders a
"Cite this repository" button from it, and it now ships **inside** the npm tarball, the
wheel and the sdist, so an installed copy is citable without the repository:

```python
from importlib.resources import files
print((files("ketqat_runner") / "CITATION.cff").read_text())
```

**Name the version, not just the project.** A result is reproducible only against the
schema and hashing behaviour of the version that produced it. Citing "KetQat" without a
version tells a reader nothing about whether their run should have matched yours — see
[`schema-versioning.md`](schema-versioning.md).

## Citing a run, not the software

A published run has its own citation, generated from the record rather than written by
hand: open the run page on ketqat.com and copy the BibTeX. It carries the benchmark suite
and version the run was measured under, which is what makes it comparable to anything else.

The distinction matters. Citing the SDK credits the tooling; citing a run points at a
specific measurement with a reproducibility hash attached. A paper comparing decoders wants
the second.

## What is deliberately absent, and why

**No DOI.** Nothing has been deposited with Zenodo or any other archive, so there is no
identifier. Publishing one before the deposit exists makes the citation unresolvable, which
is worse than having none.

**No legal names, affiliations or ORCID iDs.** The authors are the GitHub identities with
merged contributions, taken from the repository's own contributor list. A citation file is a
claim about real people: inventing an affiliation misattributes work to an institution that
never saw it, and guessing an ORCID attributes it to a specific stranger. Replace an alias
with a real name only with that person's agreement.

**No `preferred-citation`.** There is no paper. A software citation pointing at a
non-existent publication sends readers somewhere that does not exist.

`npm run verify:citation` fails if any of these appear, so they cannot be added by
inattention. It also fails if the version drifts from `package.json`, or if the copy shipped
in the Python distribution stops matching the canonical file.

## Getting a DOI (human step)

1. Sign in to [Zenodo](https://zenodo.org) with the GitHub account that owns the repository.
2. Enable the archive for `ketqat/ketqat-sdk`.
3. Publish a GitHub Release. Zenodo mints a DOI for that release.
4. Add the DOI to `CITATION.cff` under `identifiers`, and record the concept DOI — the one
   that always resolves to the newest version — separately from the version DOI.

Steps 1–3 need credentials nobody but a maintainer holds, so nothing automated here attempts
them. Step 4 is the only part that touches this repository, and it must record a DOI that
already resolves — never one predicted from a pattern.
