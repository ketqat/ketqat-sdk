## What changed

<!-- One or two sentences. What behaviour is different after this? -->

## Why

<!-- The problem, not the patch. If it fixes an issue, link it. -->

## Contract and compatibility impact

<!-- Delete this section if you touched no contract, schema, or hashing code.

     A change to canonical serialization, the hash exclusion set, or number
     formatting is BREAKING even when no type signature changes: it alters every
     future hash and silently breaks comparison with stored runs. That needs a
     schema version bump, an ADR in ketqat-planning, and parity fixtures in both
     TypeScript and Python. -->

- [ ] No contract, schema, or hashing change
- [ ] Contract change, with the compatibility impact described above

## How it was verified

<!-- The commands you ran and what they said. If a new test covers new
     behaviour, please confirm it FAILS without the change -- several tests here
     were found to be passing for the wrong reason. -->

```
npm test
```

## Anything unverified

<!-- State it rather than omitting it. "I could not test X because Y" is a
     useful review comment; silence is not. -->
