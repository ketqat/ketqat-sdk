# Reporting an independent reproduction

You re-ran something of ours. This is how to tell us, and what happens to it.

Use the [Reproduction report](https://github.com/ketqat/ketqat-sdk/issues/new?template=reproduction_report.yml)
template. Everything below explains why it asks what it asks.

## The distinction this whole path rests on

**A matching hash proves the bytes are unchanged. It is not attestation.**

A fabricated result hashes just as consistently as a real one. The hash tells you nobody
edited the record between publication and your check; it tells you nothing about whether
the experiment happened or whether the physics is right.

This is enforced in the contract, not merely stated: `HASH_VERIFICATION` combined with a
`REPRODUCED` status is **rejected**. See [`verification-levels.md`](verification-levels.md).

So submitting this form records what you did and what you observed. Whether that
constitutes independent verification is a judgement a **named person** makes afterwards,
looking at your evidence. Filing the report does not confer it, and no automation will.

## What we ask for, and why

| Field | Why |
|---|---|
| What you reproduced | A hash alone does not say what it is a hash *of* |
| The exact command | An approximation cannot be re-run by a third party |
| Environment | "Latest" is not a version; a future reader cannot resolve it |
| The hash we published | So a mismatch is unambiguous rather than a matter of memory |
| The hash you got | See below |
| Evidence a third party could check | The point of an *independent* report is that it does not rest on us trusting you |
| What you are **not** claiming | Optional, and the most valuable box on the form |

### A differing hash is a finding, not a failed submission

If your hash does not match ours, that is more useful than a match, and we would rather
hear it in public. Please file it. The most likely explanations, roughly in order:

1. a different artifact version than the one the hash was published against
2. a platform difference we have not accounted for
3. a defect in our hashing, canonical form, or number formatting
4. a wrong published hash

Only the first two are boring, and we cannot tell which it is without your environment.

### "What you are not claiming" is the box that makes the rest trustworthy

A report saying *"I re-ran the tooling and matched the hash; I did not check the physics
and could not obtain the original hardware"* is worth far more than one that leaves its
own limits unstated — because the second reads as a stronger claim than its author
intended, and somebody downstream will act on the stronger reading.

We hold ourselves to this too. Every reference case on the site states what it does not
establish.

## What we do with it

1. Your report is public from the moment you file it. We do not edit it.
2. If it changes something, the correction is a **superseding record** — the original
   stays readable, because a decision taken against the old figure has to stay checkable.
3. If a named person judges your report to constitute independent reproduction, that
   judgement is recorded as `INDEPENDENT_REPRODUCTION` with their name on it. If nobody
   does, the report still stands as a record of what you observed.

There is no path by which filing a report produces a badge automatically. That is the
same rule the platform applies to its own attestations.

## What we do not want

**Anything personal.** Not your name, employer, email address or affiliation. Your GitHub
handle is attached automatically and that is enough for us to credit you.

Be clear about what we can and cannot promise here. In the **product** we collect no
contact details at all — see [the beta status
page](https://ketqat.com/intelligence/beta). A **GitHub issue is different**: it is public,
stored by GitHub rather than by us, and editing it leaves a revision history. So we can say
we will not ask for personal data and will not use it; we cannot say we will erase it. If
you post something by accident, edit the issue and tell us and we will delete it, but
copies may already exist.

If your reproduction concerns work you cannot discuss publicly, do not put it in a public
issue. That is a different conversation and a public form is the wrong instrument for it.

## Disagreeing with a figure rather than reproducing one

Use the [Scientific disagreement](https://github.com/ketqat/ketqat-sdk/issues/new?template=scientific_disagreement.yml)
template instead. It asks what would change your mind, and we answer the same question
about our own position.
