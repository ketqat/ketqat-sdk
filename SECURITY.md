# Security policy

## Reporting a vulnerability

Report privately through GitHub Security Advisories:
<https://github.com/ketqat/ketqat-sdk/security/advisories/new>

Please do not open a public issue for a vulnerability. A public report is
readable by everyone the moment it is filed, including before a fix exists.

Include what you have: the affected version or commit, what an attacker can do,
and the smallest reproduction you can manage. A partial report is worth sending —
we would rather hear about something you are unsure of than not hear about it.

**Expect an acknowledgement within seven days.** This is a small project without
a staffed on-call rotation, and that number is what can actually be met rather
than what sounds reassuring. If you have not heard back in seven days, the
message was missed; please chase it.

## Scope

`ketqat-sdk` is a library and a local runner. It performs no authentication,
stores no credentials, and opens no network listener. The security surface is
therefore narrower than the size of the repository suggests.

**In scope:**

- Code execution reachable from parsing an untrusted circuit, manifest, or
  result payload
- Reproducibility-hash collisions or canonicalization flaws that would let two
  materially different results share a hash
- Validation bypasses that let an invalid scientific record be accepted as valid
- Dependency vulnerabilities reachable from the published packages
- Anything that causes a credential supplied to a provider adapter to be
  written, logged, or returned

**Out of scope, and why:**

- The hosted platform at ketqat.com — report those through the same advisory
  form, but they are a different codebase
- Denial of service through deliberately large inputs to the local runner. It
  runs on your own machine at your own request; resource limits belong to the
  execution plane, not the library
- Findings from automated scanners without a demonstrated impact on this code

## What this project does not claim

Honesty here is more useful than reassurance:

- **No formal audit has been performed.** Nothing in this repository has been
  reviewed by a third-party security firm.
- **No release exists yet.** `ketqat-sdk` on npm and `ketqat` on PyPI both return
  404. There is no published artifact to attack, and no supply-chain history to
  inspect.
- **Branch protection on `main` requires no reviews or status checks** at the
  time of writing. That is recorded in ketqat-planning#47 with the exact steps to
  change it; it needs a repository admin.

## Supported versions

Only `main` is supported. There are no released versions to backport to. Once a
release exists, this section will name the supported range rather than implying
one.

## Handling of secrets

The SDK holds no secrets. Provider credentials are passed as call arguments,
never stored on an adapter, and never written to a returned record — no type in
the contracts has a field for one. `redactCredentials` is applied before
anything is logged or serialized, because a credential reaching a stack trace is
an ordinary accident rather than a lapse in discipline.

If you find a path where a credential is persisted or logged, that is in scope
and worth reporting even if you cannot show it being read back.
