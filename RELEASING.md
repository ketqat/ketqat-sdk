# Releasing ketqat-sdk

Two packages are published from this repo: the npm package `ketqat-sdk` (TypeScript contracts/client) and the PyPI package `ketqat` (Python local runner, distribution name `ketqat`, importable as `ketqat_runner`).

## One-time setup (required before the first release)

### npm (`ketqat-sdk`)

1. Create an npm account (or use an existing one) and, if desired, an npm org for `ketqat`.
2. Generate an npm **Automation** access token (`npm token create --type=automation` or via npmjs.com → Access Tokens).
3. Add it as a repository secret: `gh secret set NPM_TOKEN --repo ketqat/ketqat-sdk`.

### PyPI (`ketqat`)

Uses [PyPI Trusted Publishing](https://docs.pypi.org/trusted-publishers/) (OIDC) -- no long-lived token needed.

1. Create a PyPI account and reserve the `ketqat` project name (a first manual `twine upload` of an 0.x version, or PyPI's pending-publisher flow, both work).
2. On the PyPI project's "Publishing" settings, add a trusted publisher:
   - Owner: `ketqat`
   - Repository: `ketqat-sdk`
   - Workflow: `publish.yml`
   - Environment: (leave blank unless you add a GitHub Environment named `pypi`)

## Cutting a release

1. Bump `version` in both `package.json` and `python/pyproject.toml` to the same value (they must match).
2. Commit, merge to `main` through the normal PR process.
3. Tag the merge commit and push the tag: `git tag v0.3.0 && git push origin v0.3.0`.
4. `.github/workflows/publish.yml` runs both publish jobs. Each job independently verifies the tag matches the corresponding package's version file before publishing, and runs the full test suite first.

If either package's version doesn't match the tag, that job fails before publishing anything.
