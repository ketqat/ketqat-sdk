# Enroll KetQat SDK in OSS Scanner

**Project:** https://github.com/ketqat/ketqat-sdk  
**Public report contact:** tomoya.hatanaka@ketqat.com  
**Maintainer:** @dorakingx  
**License:** Apache-2.0

KetQat SDK contains TypeScript validators, schemas and reproducibility checks,
plus a Python runner for local Qiskit regression and quantum-error-correction
research. We request an opt-in security scan of the public repository, focusing
on data-parsing boundaries, contract validation, reproducibility and integrity
checks, CLI/MCP inputs, provider adapter boundaries and worker job payloads.

This is an early-stage project; no claims are made about widespread adoption,
released npm/PyPI packages or critical-infrastructure usage.

The application adds only `projects/ketqat-sdk/project.yaml`, `Dockerfile`
and `threat_model.md`. Production services, private repositories, QPU jobs
and credentials are excluded from the requested scope.

## Verification

- [x] The public contact and manifest fields are configured.
- [x] Exactly three application files in the fork branch, with the Dockerfile
      and threat model next to the manifest.
- [ ] Official `tools/validate.py` not run locally (structural fields checked).
- [ ] `tools/check ketqat-sdk` / offline tests not run: Docker unavailable.
- [ ] Confirm mailbox receives reports; maintainer reviews terms and completes
      any required CLA-bot signature.

**This is a draft description; the upstream PR has not yet been opened.**
