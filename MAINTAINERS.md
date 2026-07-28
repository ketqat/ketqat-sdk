# Maintainers

Who holds which authority, as of 2026-07-28. Roles nobody holds are marked
**vacant** rather than assigned to someone who has not agreed to them.

## Current

| Role | Holder | Authority |
| --- | --- | --- |
| Project lead | [@dorakingx](https://github.com/dorakingx) | Final say on scope, roadmap, and releases |
| Code review | [@dorakingx](https://github.com/dorakingx) | Approving and merging changes |
| Scientific contracts | [@dorakingx](https://github.com/dorakingx) | Schemas, hashing, compatibility rules |
| Security response | [@dorakingx](https://github.com/dorakingx) | Triaging and disclosing vulnerabilities |
| Release | **vacant** | Nobody holds this separately; releases follow the project lead |
| Python runner | **vacant** | No dedicated owner |
| Documentation | **vacant** | No dedicated owner |

## Contributors with merged work

Counts are from the repository's contributor API, which is the figure GitHub
itself reports. A count taken from the commits endpoint differs -- it paginates
recent history rather than totalling authorship -- and an earlier draft of this
file overstated one of these by two as a result.

- [@dorakingx](https://github.com/dorakingx) — 71 commits, 41 merged pull requests
- [@raunavm](https://github.com/raunavm) — 3 commits, 3 merged pull requests

## Bus factor: 1

One person can approve, merge, and release. If that person becomes
unavailable, this project stops.

Stating it is more useful than a governance structure implying otherwise. It is
also the single most valuable thing an external contributor could change, and
the reason the progression path below is short rather than ceremonial.

## Becoming a maintainer

There is no committee to petition and no minimum number of contributions.

The realistic path is: land a few substantive changes, review someone else's,
and say you would like commit rights. The project lead decides. Nobody has been
through this process yet, so it will be adjusted the first time it is used —
that is a more honest description than a policy written for a scale this project
has not reached.

## Inactive maintainers

If a maintainer is unreachable for 90 days, another maintainer may move them to
this section. With a bus factor of 1 that rule currently has no one to apply it,
which is itself the argument for growing the list.

## Escalation

Disagreement about a change is settled in the pull request. Disagreement about
direction goes to an RFC in `ketqat-planning`. Disagreement about a **scientific
claim** takes precedence over both: a result that overstates its evidence is
reverted first and discussed afterwards, because a wrong number that reaches a
citation is not recoverable by a later conversation.
