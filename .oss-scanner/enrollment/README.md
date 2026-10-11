# KetQat SDK — OSS Scanner enrollment preparation

Prepared on 2026-10-12 (JST) from public SDK commit
`ced92ce78848032ee95a781249a6251a249b78ee`.

**Status: NOT SUBMITTED to Anthropic.** This directory is preparation material,
not an approved or active scan. No changes to SDK runtime code are required.

The destination is `anthropics/oss-scanner`, adding only:

```
projects/ketqat-sdk/project.yaml
projects/ketqat-sdk/Dockerfile
projects/ketqat-sdk/threat_model.md
```

`pull-request.md` is the proposed upstream PR body; it does not belong inside
`projects/ketqat-sdk/` in the upstream repository.

## Remaining gates

1. Create a fork of https://github.com/anthropics/oss-scanner under `dorakingx`.
   The GitHub connection used for preparation has file/branch/PR tools but no
   fork-creation tool, and no accessible existing fork was found.
2. Replace `primary_contact: null` with a monitored email the maintainer approves
   for PUBLIC disclosure. No personal email has been committed by this preparation.
   A GitHub noreply address cannot receive the reports and must not be used.
3. Validate the final config with upstream `tools/validate.py`, then run
   `tools/check ketqat-sdk`. The preparation environment has no Docker and no
   external network access, so image build, dependency resolution and runtime
   tests remain unverified. Fix any build/offline problems and update the recorded
   validation status before submission.
4. Open the upstream PR from the fork. The maintainer must personally review the
   terms and follow the CLA bot's signature instructions; preparation does not
   sign a CLA or state agreement on their behalf.

The Dockerfile and threat model are colocated in the enrollment, so this SDK
preparation PR does not have to be merged to enroll the public main branch.
No live provider credentials, deployment, QPU calls, billing or private source
are involved.

## Official references

- https://github.com/anthropics/oss-scanner/blob/main/README.md
- https://github.com/anthropics/oss-scanner/blob/main/CONTRIBUTING.md
- https://red.anthropic.com/oss-scanner/
- https://red.anthropic.com/oss-scanner/terms

Acceptance and scan scheduling are controlled by Anthropic. Preparing a PR is
not acceptance and does not imply the project meets the established-project
eligibility criteria.
