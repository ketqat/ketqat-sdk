# Human-only first release checklist

This checklist is the authorization boundary for the first public `ketqat-sdk` npm release and `ketqat` PyPI release. Completing the engineering workflow does **not** prove registry ownership and does not authorize a publish. Every unchecked item below is a hard stop.

## Verified snapshot (2026-07-13 UTC)

The following read-only checks were performed against SDK `main` at `42c062c88393eddec2074af7bd16df5b0e6ca924`:

| Check | Verified result | Meaning |
| --- | --- | --- |
| `https://registry.npmjs.org/ketqat-sdk` | HTTP 404 | No public npm package was visible. This does not reserve the name or prove that the current maintainer can claim it. |
| `https://pypi.org/pypi/ketqat/json` | HTTP 404 | No public PyPI project was visible. A pending publisher is not visible through this API and does not reserve the name. |
| GitHub Environments | Only `copilot`; no protection rules | `npm-release`, `pypi-release`, and `github-release` are absent. |
| GitHub Actions repository secrets | None | No `NPM_TOKEN`, PyPI token, or other release secret is stored in this repository. |
| GitHub Actions repository variables | None | `RELEASE_PUBLISHING_ENABLED` is absent, so every publish/release job is disabled. |
| Git tags / GitHub Releases | None / none | No first-release tag or Release exists. |
| Repository rulesets | One active branch ruleset; no tag ruleset | Release tags are not yet restricted. |
| Default `GITHUB_TOKEN` workflow permission | Read | The release job requests explicit `contents: write`, `attestations: write`, and `id-token: write`; organization policy must still allow them. |

Re-run these checks immediately before setup. A package-level 404 changing to 200 before an approved bootstrap is a stop condition, not proof that KetQat gained ownership. After an approved npm bootstrap, the package-level endpoint is expected to return 200, but the authenticated owner must match the approval and the intended new version endpoint must still return 404.

## Values that must match exactly

| Field | Exact value |
| --- | --- |
| GitHub owner | `ketqat` |
| GitHub repository | `ketqat-sdk` |
| Repository URL in npm metadata | `https://github.com/ketqat/ketqat-sdk.git` |
| Workflow filename | `publish.yml` (filename only, not `.github/workflows/publish.yml`) |
| npm package | `ketqat-sdk` |
| npm Environment | `npm-release` |
| npm allowed action | `npm publish` only |
| PyPI project | `ketqat` |
| PyPI Environment | `pypi-release` |
| GitHub Release Environment | `github-release` |
| Enablement variable | repository variable `RELEASE_PUBLISHING_ENABLED` with value `true` |

All registry publisher fields are case-sensitive. Do not substitute an organization display name, repository URL, workflow path, job name, or Environment with a similar value.

## Secret-handling rule

No API token, password, 2FA code, recovery code, session cookie, private key, or OIDC token is required in this repository.

- Never paste one into an Issue, pull request, review, commit, workflow, Actions variable, terminal transcript, chat, or support screenshot.
- Perform npm/PyPI sign-in and 2FA only in the registry's authenticated UI or a maintainer-controlled local session.
- Store recovery material only in the approved password manager.
- If any credential is exposed, stop, revoke it in the registry UI, rotate recovery material where applicable, and record only the revocation date—not the value.

## 1. Assign independent human roles

Human action is required because the workflow cannot decide who is authorized to represent the project or approve its own deployment.

- [ ] Name a registry owner who has verified control of the intended npm account/organization and PyPI account.
- [ ] Name a release operator who will create the signed tag.
- [ ] Name at least one Environment reviewer who is not the release operator.
- [ ] Confirm every reviewer has at least read access to `ketqat/ketqat-sdk` and enable “Prevent self-review.”
- [ ] Record names, date, and non-sensitive evidence in the sign-off table at the end of this document or in the release tracking Issue.

Failure/rollback: do not create Environments, publishers, variables, or tags until the roles are separated. Replace a reviewer before release if independence cannot be maintained.

## 2. Prove npm namespace ownership and resolve the first-publish bootstrap

Human action is required because the unauthenticated 404 cannot prove name availability or account authority. npm Trusted Publisher configuration lives under an existing package's settings; npm does not provide PyPI-style pending publishers in its documented flow.

- [ ] Sign in to npmjs.com with the approved owner account and confirm whether `ketqat-sdk` can be created and will be owned by the intended account/organization.
- [ ] Confirm the account has 2FA and recovery access before any package-changing action.
- [ ] Confirm `package.json` still contains `name: "ketqat-sdk"` and the exact GitHub repository URL shown above.
- [ ] Decide and review the npm bootstrap path **before** publishing anything. Do not publish a placeholder merely to reserve the name.

If `ketqat-sdk` does not yet exist, this is an unresolved first-publish blocker: an authorized human must separately approve how the first immutable npm version is created before Trusted Publishing can be configured. That bootstrap must have its own Issue/PR, artifact digest, version choice, 2FA approval, registry readback, and recovery plan. It must not reuse a version later in the automated workflow.

After the package exists under proven KetQat ownership:

- [ ] Open npmjs.com → package `ketqat-sdk` → **Settings** → **Trusted publishing** → GitHub Actions.
- [ ] Enter organization/user `ketqat`, repository `ketqat-sdk`, workflow filename `publish.yml`, Environment `npm-release`, and allow `npm publish` only.
- [ ] Save, reopen the page, and independently compare every field with the exact-values table.
- [ ] After one OIDC publish succeeds, set Publishing access to “Require two-factor authentication and disallow tokens.”

Success check: the authenticated npm package settings show KetQat's intended owner and exactly one trusted publisher with the values above. `npm whoami` is not an OIDC success check; OIDC authentication occurs only during publish.

Rollback: delete or correct the trusted publisher in package Settings and keep `RELEASE_PUBLISHING_ENABLED` absent/false. Never unpublish or reuse a public version to repair configuration.

Official reference: [npm Trusted Publishing](https://docs.npmjs.com/trusted-publishers/).

## 3. Register the PyPI pending Trusted Publisher

Human action is required because only an authenticated PyPI account can create and inspect a pending publisher. A pending publisher neither creates nor reserves the project name.

- [ ] Sign in to PyPI with the approved owner account and open account sidebar → **Publishing** → add a pending GitHub publisher.
- [ ] Enter PyPI project `ketqat`, owner `ketqat`, repository `ketqat-sdk`, workflow filename `publish.yml`, and Environment `pypi-release`.
- [ ] Save, reopen the pending publisher entry, and independently compare all fields with the exact-values table.
- [ ] Recheck `https://pypi.org/pypi/ketqat/json` immediately before tagging. If it returns 200 before the pending publisher is used, stop and investigate ownership; the pending publisher may have been invalidated.

Success check: the authenticated account Publishing page lists the exact pending publisher. After the first successful publish it must convert to a normal publisher on project `ketqat`, and the project owner/maintainer list must contain only intended accounts.

Rollback: delete the pending publisher while the enablement variable remains absent/false. If the name is taken, follow the conflict plan below; do not upload over an unknown project.

Official references: [creating a project with a pending publisher](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/), [Trusted Publishers](https://docs.pypi.org/trusted-publishers/), and the [security model](https://docs.pypi.org/trusted-publishers/security-model/).

## 4. Create and protect the three GitHub Environments

Human action is required because only repository administrators can choose trustworthy reviewers and bypass policy.

In repository **Settings → Environments**, create `npm-release`, `pypi-release`, and `github-release`. For each Environment:

- [ ] Add one or more independent required reviewers.
- [ ] Enable **Prevent self-review**.
- [ ] Disable administrator bypass of protection rules.
- [ ] Restrict deployment branches and tags to selected tags matching `v*`; do not allow arbitrary branches.
- [ ] Store no Environment secrets and no registry credentials.

`npm-release` authorizes the npm write, `pypi-release` authorizes the PyPI write, and `github-release` authorizes registry readback, attestations, and GitHub Release creation. Do not combine them: a reviewer must be able to reject the final Release if registry evidence is incomplete.

Success check: the GitHub Environments API lists all three names, non-empty protection rules, administrator bypass disabled, and a tag-only deployment policy. A job referencing an Environment must enter **Waiting** until an independent reviewer approves it.

Rollback: reject the waiting deployment, remove the reviewer rule only to replace it with an equally strong rule, and keep/delete the enablement variable. Environment changes do not justify bypassing registry immutability.

Official reference: [GitHub deployment environments and required reviewers](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).

## 5. Protect release tags and confirm GitHub Release authority

Human action is required because a tag starts the workflow and the workflow cannot safely protect its own trigger.

- [ ] Create an active repository ruleset targeting tags that includes `v*` and blocks deletion and non-fast-forward updates.
- [ ] Limit bypass actors to the smallest approved release-maintainer group; do not allow broad administrator bypass.
- [ ] In **Settings → Actions → General**, confirm organization/repository policy permits the explicit job permissions in `publish.yml`: `contents: write`, `attestations: write`, and `id-token: write`.
- [ ] Confirm third-party/official Actions policy permits every immutable SHA used in `publish.yml`.
- [ ] Confirm the workflow still uses GitHub-hosted runners and contains no release cache or mutable action tag.

Success check: the tag ruleset API shows active tag protection for `v*`; an unauthorized account cannot create, delete, or move a release tag. The authorized workflow can create a test attestation only during an approved real release—do not weaken permissions to simulate this beforehand.

Rollback: remove the enablement variable first, then correct policy. Never move an already-pushed release tag; use a new patch version.

Official references: [artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations) and [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).

## 6. Audit and remove legacy registry credentials

Human action is required because repository APIs cannot inspect personal npm/PyPI accounts or password managers.

- [ ] Confirm repository and organization Actions secrets contain no `NPM_TOKEN`, `NODE_AUTH_TOKEN`, PyPI API token, or equivalent write credential.
- [ ] Inspect npm access tokens and PyPI account/project API tokens in their authenticated UIs. Revoke obsolete automation/write tokens after Trusted Publishing is configured and verified.
- [ ] Confirm no `.npmrc`, `.pypirc`, environment file, workflow, local shell history, or password-manager shared note exposes a release credential.
- [ ] Record only token names/last-used dates and revocation timestamps; never copy token values into evidence.

Current repository result: zero Actions repository secrets. Account-level and organization-level stores remain unknown until an authorized human checks them.

Rollback: if a token is found, leave publishing disabled, revoke it, inspect audit logs, and rotate dependent credentials before continuing.

## 7. Enable publishing last

The repository variable is a non-secret kill switch. It must be the final setup mutation.

- [ ] Confirm sections 1–6 have two-person sign-off and no unresolved blocker, especially npm first-publish ownership.
- [ ] Open repository **Settings → Secrets and variables → Actions → Variables**.
- [ ] Create repository variable `RELEASE_PUBLISHING_ENABLED` with exact lowercase value `true`.
- [ ] Read it back in the UI/API and confirm it is a repository variable, not a secret or Environment variable.

Success check: the variable exists once with value `true`; all three protected Environments remain configured. Do not print variables in workflow logs.

Immediate rollback/kill switch: change the value to `false` or delete the variable. This prevents future publish/release jobs but cannot undo a registry version already published.

Official reference: [GitHub Actions variables](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-variables).

## 8. Final pre-publish review and first run

Do not execute these commands while any earlier checkbox is open.

- [ ] Pull the reviewed `main` commit and confirm a clean worktree.
- [ ] Confirm `package.json`, `python/pyproject.toml`, `ketqat_runner.__version__`, and runner `SDK_VERSION` all equal the intended version.
- [ ] Recheck the exact version endpoints `https://registry.npmjs.org/ketqat-sdk/0.2.0` and `https://pypi.org/pypi/ketqat/0.2.0/json`; both must return 404, while any package/project-level 200 response must match the authenticated ownership decision.
- [ ] Run `scripts/release-preflight.sh v0.2.0` and retain the non-sensitive output plus commit SHA.
- [ ] Review `npm pack --dry-run --json --ignore-scripts`, wheel/sdist verification, and all current CI checks.
- [ ] Confirm release notes state scientific limitations and do not claim registry success before readback.
- [ ] Have the release operator create a signed, immutable tag from the reviewed commit and push only that tag:

```bash
git tag -s v0.2.0 -m "KetQat SDK 0.2.0"
git push origin v0.2.0
```

- [ ] Open the resulting **Publish release** workflow. Approve `npm-release` and `pypi-release` only after confirming preflight passed for the expected tag/SHA.
- [ ] Approve `github-release` only after both registry jobs succeeded; the job itself must still verify API digests, PyPI publish attestations, npm signatures, and clean public installs.
- [ ] Do not manually run `gh release create`; the workflow creates the Release only after readback.

Success evidence must include the workflow URL, immutable tag SHA, npm and PyPI version URLs, npm provenance/signature verification, PyPI Integrity API entries, GitHub Release URL, attached artifact digests, and `gh attestation verify` results. Do not record “success” from a publish command alone.

Workflow to rerun: use **Re-run failed jobs** on the same tag workflow for a transient Environment/registry/readback failure. Never use **Re-run all jobs** after either registry has accepted the version. Follow [`release-recovery.md`](release-recovery.md).

## Package-name conflict fallback

If either package/project-level 404 becomes 200 before ownership or an approved bootstrap is proven, stop the release and inspect the authenticated owner. If either exact intended-version endpoint returns 200 at any time, that version is permanently unavailable for this release. Never depend on, take over, or publish to an unknown project merely because its name matches KetQat.

- npm fallback candidate: `@ketqat/sdk`, only after an authorized human proves control of the `@ketqat` npm scope.
- PyPI fallback candidate: `ketqat-runner`; the import package may remain `ketqat_runner`.

A fallback is not a documentation-only substitution. Open a new Phase 1 Issue/PR and update package metadata/locks, install docs, import/install tests, release-version guards, registry endpoints, trusted-publisher target, readback scripts, and all examples. Re-run the full clean-install matrices and preflight. Do not tag until the new public names return the expected state and ownership is proven.

## Required sign-off record

| Decision | Human | Date | Non-sensitive evidence URL/reference |
| --- | --- | --- | --- |
| npm owner and bootstrap path approved |  |  |  |
| npm Trusted Publisher fields verified |  |  |  |
| PyPI pending publisher fields verified |  |  |  |
| Three Environment protections verified |  |  |  |
| Tag ruleset and workflow permissions verified |  |  |  |
| Legacy credential audit completed |  |  |  |
| Enablement variable approved |  |  |  |
| Final tag/SHA and preflight approved |  |  |  |
