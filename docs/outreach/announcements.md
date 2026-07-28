# Releases, social posts, monthly updates, events

Public writing, where the temptation to round upward is strongest because nobody
replies to correct you.

Read [`README.md`](README.md) first. Posting is a human action.

---

## Release notes

State what changed and what is still broken. A release note that mentions no
limitation is not a release note, it is an advertisement.

> ## v0.―.―
>
> **Changed**
> - ―
>
> **Fixed**
> - ―
>
> **Known issues**
> - ― (#―)
>
> **Verified in this release**
> - `npm test`, `pytest python/tests`, clean-install on Node 22/24 and Python
>   3.10–3.13
> - TypeScript/Python reproducibility hash parity
> - the quickstart, from a clean environment, against built artifacts
>
> **Not verified**
> - ―

The "Not verified" heading is the one that matters. Everything else is
conventional.

---

## First-release announcement

Do not use launch language. There is nothing to launch yet.

> KetQat v0.―.― is the first published release: an Apache-2.0, vendor-neutral
> registry for quantum error-correction and algorithm benchmarks.
>
> What it does today:
>
> - runs surface-code memory experiments with real Stim sampling and PyMatching
>   decoding, with no synthetic fallback
> - reports a zero-failure run as an upper bound with its Wilson interval, never
>   as an error rate of zero
> - refuses to compare runs whose conditions differ, and names the fields
> - records a reproducibility hash the server independently recalculates
>
> What it does not do yet:
>
> - hardware execution (simulation only; results are labelled SIMULATION
>   everywhere, including inside downloaded bundles)
> - ― (#―)
>
> It has no users to speak of. If you work on decoders or QEC benchmarking, the
> most useful thing you could do is run it and tell me where it is wrong.
>
> https://github.com/ketqat/ketqat-sdk

---

## Social posts

Rules: no growth numbers, no "excited to announce", no implied traction, no
comparison to another project. One concrete fact per post.

> A logical error rate of 0 from a benchmark that observed no failures is not a
> measurement — it is an upper bound at whatever shot count you used. KetQat now
> renders it as `< 3.84e-4 (upper bound; no failures in 10,000 shots)` everywhere
> it appears, because a zero-failure row sorts to the top of any ranking and is
> the row most likely to be quoted.

> Found in our own repository this week: the reproducibility hash does not
> reproduce. Duration measurements were inside the hashed payload, so the same
> experiment run twice hashes differently. Filed as #89 with an ADR, because the
> fix is breaking and that is a decision, not a patch.

> KetQat refuses to rank two decoder runs that used different code distances,
> rounds, noise models, or stopping rules. It shows them in separate tables and
> names the fields that differ. An ordering across incomparable conditions is
> not a finding.

Posting a defect you found in your own project is better outreach than posting a
feature. It is unusual, it is checkable, and it tells a researcher exactly what
kind of maintainer they would be dealing with.

---

## Monthly update

> ## KetQat — ― 2026
>
> **Merged this month:** ―
>
> **Found and not yet fixed:** ―
>
> **Metrics** (from https://ketqat.com/metrics, collected ―):
> stars ―, contributors ―, external contributors in the last 12 months ―,
> published releases ―, downloads ―
>
> **Next:** ―
>
> **Help wanted:** ―

Publish the metrics even when they have not moved. A monthly update that only
appears in good months is a marketing channel, and readers work that out fast.

---

## Conference or meetup submission

> **Title:** ―
>
> **Abstract:** Benchmark results in quantum error correction are difficult to
> compare, not because the numbers are wrong but because the conditions behind
> them are rarely recorded completely enough to know whether two numbers
> describe the same experiment.
>
> This talk covers what a registry has to refuse in order to be trustworthy:
> refusing to compare runs whose conditions differ, refusing to report an
> unobserved failure rate as zero, and refusing to fall back to a simpler
> simulation when the real decoder is unavailable. It uses KetQat, an
> Apache-2.0 project, as the worked example, including the defects found in it
> while building those refusals.
>
> **What the audience gets:** a checklist for judging whether a published
> benchmark can be compared to their own.

Submit a talk about the problem, not about the project. A talk that is an
extended demo of an unadopted tool will be rejected, and should be.

---

## 日本語版：リリース告知

> KetQat v0.―.― を公開しました。量子誤り訂正およびアルゴリズムの
> ベンチマークを記録する Apache-2.0 のレジストリです。特定ベンダーに
> 依存しません。
>
> 現時点でできること:
>
> - Stim によるサンプリングと PyMatching による復号を実際に実行します。
>   簡易モデルへの自動切り替えは行いません。
> - 論理誤りが観測されなかった実行は、ゼロではなく Wilson 信頼区間つきの
>   上界として表示します。
> - 条件が異なる実行同士の比較を拒否し、どの項目が異なるかを提示します。
> - サーバ側で再計算される再現性ハッシュを記録します。
>
> 現時点でできないこと:
>
> - 実機での実行（シミュレーションのみ。結果は常に SIMULATION と記録されます）
> - ―（#―）
>
> 利用者はほとんどいません。復号器や QEC ベンチマークに携わっておられる方は、
> 実際に動かして誤りをご指摘いただけると最も助かります。
