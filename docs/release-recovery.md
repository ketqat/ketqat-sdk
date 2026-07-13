# Release verification and partial-failure recovery

The `Publish release` workflow treats npm, PyPI, and GitHub Releases as an ordered release transaction with immutable external steps:

1. credential-free shared preflight;
2. parallel npm and PyPI publishing through protected Environments;
3. exact API digest readback and clean installs from both public registries;
4. GitHub artifact attestations and a GitHub Release containing the exact published files.

A GitHub Release is not created unless both publish jobs succeeded and registry readback proves that the downloaded metadata digests match the workflow artifacts. The Release notes must therefore never claim that both registries succeeded based only on a publish command's exit status.

## Recovery rules

- Never delete, overwrite, move a release tag, or reuse a version that reached either public registry. npm and PyPI versions are immutable release records.
- If preflight fails before publishing, fix the cause and prepare a new patch version and tag. A transient registry-read outage may be retried without changing source.
- If exactly one registry publish succeeds, do not create a GitHub Release. For an Environment approval, registry propagation, or other non-code transient failure, use **Re-run failed jobs** on the same workflow run so the successful registry job and preflight are not rerun. Never choose **Re-run all jobs**, because the duplicate-version guard must reject the already-published side.
- If completing the missing registry would require workflow or artifact changes, leave the partial version intact, document which registry contains it, and publish a new patch version to both registries after review. Do not move the old tag to new code.
- If both registries succeed but readback, clean install, attestation, or GitHub Release creation fails transiently, rerun only the failed `verify-and-release` job. It performs no registry publish.
- If registry metadata digests do not match the preserved workflow artifacts, stop. Do not create a GitHub Release; preserve the workflow logs and escalate as a supply-chain incident.

## Independent verification

After downloading an attached release artifact:

```bash
gh attestation verify <artifact> --repo ketqat/ketqat-sdk
```

After installing the npm package in a clean project:

```bash
npm audit signatures
```

Registry metadata is available at `https://registry.npmjs.org/ketqat-sdk/<version>` and `https://pypi.org/pypi/ketqat/<version>/json`. The workflow compares npm SHA-512/SHA-1 and PyPI SHA-256 values with the exact files attached to the GitHub Release.
