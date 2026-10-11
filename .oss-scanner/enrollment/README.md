# KetQat SDK — Anthropic OSS Scanner application

Status (2026-10-12 JST): **Prepared in the public fork; not yet submitted to Anthropic.**

Fork branch: https://github.com/dorakingx/oss-scanner/tree/enroll-ketqat-sdk
Upstream PR compare: https://github.com/anthropics/oss-scanner/compare/main...dorakingx:enroll-ketqat-sdk?expand=1

The requested primary contact is `tomoya.hatanaka@ketqat.com`. This email
address is PUBLIC in `projects/ketqat-sdk/project.yaml` on the fork branch.
Confirm the mailbox can receive Anthropic's private reports before approval.

The GitHub connector can update the fork and SDK repositories but could not
create the cross-repository PR in `anthropics/oss-scanner` (HTTP 403:
Resource not accessible by integration). The maintainer needs to visit the
compare link above and click **Create pull request**. The three application
files are already committed and ready to use there.

The submission changes only `projects/ketqat-sdk/project.yaml`, `Dockerfile`
and `threat_model.md` in the fork; it does not require merging this preparatory
PR into KetQat SDK. Production code, credentials and private repositories are
not modified or submitted.

## Outstanding validation and ownership

- The YAML manifest structure and the exact three-file upstream diff were checked.
- The official Anthropic `tools/validate.py` has not been executed locally.
- Docker is unavailable in the preparation environment; build and offline test
  behavior remain unverified. Run `tools/check ketqat-sdk` before merge.
- The maintainer must review the service terms and personally complete the
  Anthropic CLA-bot step after opening the PR if requested.

Official instructions: https://github.com/anthropics/oss-scanner/blob/main/README.md
