# Research labs

For QEC groups, algorithms groups, and anyone maintaining decoder or benchmark
code. These people can check every claim you make, so make only checkable ones.

Read [`README.md`](README.md) first. Sending is a human action.

---

## Cold email: a QEC group

> **Subject:** Reproducible surface-code benchmarking — would this be useful to you?
>
> Dear Dr. ―,
>
> I maintain KetQat, an open-source registry for quantum error-correction and
> algorithm benchmarks. It is Apache-2.0 and vendor-neutral. I am writing because
> your group publishes decoder results, and I would like to know whether the
> thing I have built is useful to you or whether it solves a problem you do not
> have.
>
> What it does: a benchmark run is described by a manifest, executed locally with
> real Stim sampling and PyMatching decoding, and recorded with a hash computed
> from the manifest, environment, and results. Publishing is optional and
> separate from running.
>
> Three decisions you may find more interesting than the feature list:
>
> - A run that observes no logical failures is recorded and displayed as an
>   **upper bound with its Wilson interval**, never as a rate of zero. Zero
>   failures in 10,000 shots bounds the rate below 3.8e-4; it does not measure it
>   to be zero, and the site will not print it as though it did.
> - Two runs that differ in distance, rounds, physical error rate, noise model,
>   stopping rule, or decoder version are **refused a comparison** rather than
>   ranked. The refusal names the fields that differ.
> - There is **no synthetic fallback**. Without Stim and PyMatching installed, a
>   QEC run fails and tells you what to install. It will never quietly produce a
>   number from a simpler model.
>
> You can check all of this in about a minute:
>
>     python3 -m venv .venv && source .venv/bin/activate
>     python -m pip install -e "python[qec]"
>     ketqat run surface-code-memory --output run.json
>
> Two honest caveats. Nothing is published to PyPI yet, so that is a source
> install. And there is an open defect (#89) where the same experiment run twice
> produces different reproducibility hashes, because duration measurements are
> inside the hashed payload — I would rather you heard that from me than found it.
>
> If this is useful, the most valuable thing you could give me is a decoder or
> noise model your group actually uses, as a contribution pack — YAML validated
> against a schema, no code execution during review. If it is not useful, I would
> genuinely like to know why; that is worth more to me than a star.
>
> Repository: https://github.com/ketqat/ketqat-sdk
>
> ―

---

## Cold email: benchmark or decoder collaboration

> **Subject:** Would you be willing to check a decoder benchmark against yours?
>
> Dear ―,
>
> Your paper on ― reports a threshold for ―. I have an open-source benchmark
> harness that runs surface-code memory experiments with Stim and PyMatching and
> records every parameter needed to repeat the run.
>
> I am not asking you to adopt anything. I am asking whether you would be willing
> to look at one number and tell me if it is wrong.
>
> The run, its full manifest, its environment, and its reproducibility hash are
> at ―. If our figures disagree, that disagreement is the useful outcome, and I
> will publish it either way.
>
> If it would be more useful in reverse, the harness takes a decoder as a
> validated YAML pack, and I would be glad to run your configuration and publish
> the result with attribution to you.
>
> ―

---

## Follow-up, once and only once

> **Subject:** Re: ―
>
> Dear ―,
>
> Following up once on the message below, then I will stop.
>
> If the answer is "not interesting", that is a complete answer and I would
> rather have it than silence.
>
> ―

Do not send a third message. A project asking for attention it has not earned is
the fastest way to make sure it never earns it.

---

## 日本語版：研究室向けコールドメール

> **件名：** 再現可能な表面符号ベンチマークについて
>
> ―先生
>
> 突然のご連絡失礼いたします。量子誤り訂正およびアルゴリズムのベンチマークを
> 記録するオープンソースのレジストリ KetQat を開発しております。Apache-2.0
> ライセンスで、特定のベンダーに依存しません。
>
> ご研究室では復号器の結果を公表されているため、これが実際に役立つものか、
> それとも存在しない問題を解こうとしているのか、率直なご意見を伺えればと
> 考えております。
>
> 特にご関心を持たれるかもしれない設計上の判断が三点あります。
>
> - 論理誤りが観測されなかった実行は、ゼロではなく **Wilson 信頼区間つきの
>   上界** として記録・表示されます。10,000 ショットで失敗ゼロは誤り率を
>   3.8e-4 未満に抑えるという意味であり、ゼロと測定したことにはなりません。
> - 符号距離・ラウンド数・物理誤り率・雑音モデル・停止条件・復号器バージョン
>   のいずれかが異なる実行は、順位付けせず **比較を拒否** します。
> - **代替の簡易シミュレーションに切り替わることはありません。** Stim と
>   PyMatching が無い環境では実行は失敗し、必要な導入手順を表示します。
>
> 一分ほどでご確認いただけます:
>
>     python -m pip install -e "python[qec]"
>     ketqat run surface-code-memory --output run.json
>
> 正直に申し上げるべき点が二つあります。PyPI への公開はまだ行っていないため
> ソースからの導入となります。また、同一の実験を二回実行すると再現性ハッシュ
> が一致しないという未解決の不具合 (#89) があります。所要時間の測定値が
> ハッシュ対象に含まれていることが原因です。
>
> お役に立ちそうであれば、ご研究室で実際にお使いの復号器や雑音モデルを
> コントリビューションパックとしてご提供いただけると大変ありがたく存じます。
> 役に立たないという場合は、その理由を伺えれば十分に価値があります。
>
> リポジトリ: https://github.com/ketqat/ketqat-sdk
>
> ―
