# Enroll KetQat SDK

## Project

- Repository: https://github.com/ketqat/ketqat-sdk
- Homepage: https://ketqat.com
- License: Apache-2.0
- Core maintainer: @dorakingx, documented in the repository's MAINTAINERS.md

KetQat SDK provides TypeScript contracts and Python runners for reproducible
quantum error-correction and quantum-algorithm research, including local Qiskit
regression checks. Researchers import and compare externally supplied manifests,
circuits and result bundles, making parser safety, cross-language validation and
integrity boundaries relevant audit targets.

This is an early-stage project; we are not claiming established critical
infrastructure status, large downstream adoption or published package usage.
We request case-by-case consideration on the basis of the untrusted-input and
research-integrity surfaces described in the accompanying threat model.

## Enrollment contents

Adds only `projects/ketqat-sdk/project.yaml`, `Dockerfile` and `threat_model.md`.
The Dockerfile and threat model live next to the enrollment config; no prior SDK
merge is required. The target is the public SDK's main branch, not the hosted
platform or private repositories.

## Before submitting this draft

- [ ] Set primary_contact to a monitored email explicitly approved for publication.
- [ ] Run the upstream `tools/validate.py` on the final config.
- [ ] Build and exercise `tools/check ketqat-sdk`, fixing dependency/build/offline issues.
- [ ] Update the threat model with the actual validation results.
- [ ] Review the OSS Scanner terms and the Contributor License Agreement personally.

The current preparation environment had no Docker or external network access;
no Docker build, SDK test run or offline runtime test is claimed here. This file
is a PR body draft, not a statement that enrollment has been submitted or accepted.
Do not post a CLA signature on the maintainer's behalf.
