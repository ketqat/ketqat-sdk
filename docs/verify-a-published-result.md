# Verify a published result yourself

You need no account, no credentials, and no checkout of this repository. Everything below
uses a public endpoint and a public install.

This was run end to end on 2026-08-15 and the output is what it actually printed.

## 1. Install the runner from the public repository

```bash
python3 -m venv verify && . verify/bin/activate
pip install "git+https://github.com/ketqat/ketqat-sdk.git#subdirectory=python"
```

`ketqat-sdk` is **not on PyPI yet** — first publication is human-gated. Installing from the
public Git URL is the supported route until then, and it needs nothing you cannot obtain.

## 2. Fetch a published bundle and recompute its hash

```python
import json, urllib.request
from ketqat_runner.hashing import calculate_reproducibility_hash, hash_version_of

url = "https://ketqat.com/api/intelligence/reference/measured-statevector-simulation-12q/bundle"
req = urllib.request.Request(url, headers={"User-Agent": "ketqat-reproduction-check"})
bundle = json.load(urllib.request.urlopen(req))

stated = bundle["reproducibility_hash"]
computed = calculate_reproducibility_hash(bundle, hash_version_of(bundle))
print("stated  :", stated)
print("computed:", computed)
print("MATCH   :", stated == computed)
```

```
stated  : 0befaaf67793ece41ed346846774aa8f0dd2ac42b0fd8a9582509b09383fe06d
computed: 0befaaf67793ece41ed346846774aa8f0dd2ac42b0fd8a9582509b09383fe06d
MATCH   : True
```

## Two things that will waste your afternoon if nobody tells you

### Set a User-Agent

Python's `urllib` sends `Python-urllib/3.x` by default, and the CDN in front of
`ketqat.com` **refuses that signature** with an opaque `error code: 1010`. It looks like the
API is broken or you have been banned; neither is true. Any descriptive User-Agent works —
the example above sets one. `curl`, `wget` and `requests` are unaffected.

This is edge configuration, not an application rule, and it is tracked in
[ketqat-web#348](https://github.com/ketqat/ketqat-web/issues/348).

### Do not hand-roll the canonicalization

The rules look simple enough to reimplement — sort keys, drop an exclusion set, SHA-256 the
JSON. They are not. I tried it while writing this page and got a mismatch twice before
using the library.

The trap is number formatting: JavaScript renders a whole-number float as `1`, Python as
`1.0`, and the two hash differently. `hash_version` 2 also excludes seven timing fields that
version 1 did not, because the same experiment run twice from the same seed produced
different hashes purely from elapsed milliseconds ([ketqat-sdk#89](https://github.com/ketqat/ketqat-sdk/issues/89)).

Both languages' implementations are kept byte-identical and covered by shared parity
fixtures. Use one of them.

## What a match does and does not prove

**It proves the bytes are unchanged** since the hash was published. Nobody has edited the
record.

**It does not prove the experiment ran, and it is not attestation.** A fabricated result
hashes just as consistently as a real one. This is enforced rather than merely stated: the
contract rejects `HASH_VERIFICATION` combined with a `REPRODUCED` status. See
[`verification-levels.md`](verification-levels.md).

If you want to go further than the bytes — re-run the underlying computation, check the
method, dispute a figure — that is the more valuable thing, and
[`independent-reproduction.md`](independent-reproduction.md) is how to report it.

## If your hash does not match

**Please tell us.** That is a finding, not a failed attempt, and we would rather hear it in
public: file a [reproduction report](https://github.com/ketqat/ketqat-sdk/issues/new?template=reproduction_report.yml)
with your environment and both hashes.
