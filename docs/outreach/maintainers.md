# Quantum OSS maintainers

For maintainers of Stim, PyMatching, Qiskit, Cirq, Braket, tket, and similar
projects. They are busy, they have seen many new projects, and the useful
message is short and asks for one specific thing.

Read [`README.md`](README.md) first. Sending is a human action.

---

## Interoperability question

> **Subject:** KetQat uses ― ; one question about correct usage
>
> Hello,
>
> KetQat is an Apache-2.0 benchmark registry for QEC and quantum algorithms. It
> uses ― for ―, through the official package rather than a reimplementation.
>
> One question, and I would rather ask than guess: ―
>
> If we are using it in a way you consider incorrect or unsupported, I would like
> to fix that now, while nothing depends on the current behaviour. Nothing is
> published to a registry yet, so a breaking correction costs nothing.
>
> Not asking for a link, a mention, or a review. Just the answer.
>
> ―

---

## Reporting an integration bug upstream

> **Subject:** ― returns ― when ―
>
> Hello,
>
> Minimal reproduction: ―
>
> Expected ―, observed ―. Versions: ―
>
> I have not opened a PR because I am not certain which behaviour you intend. If
> the current behaviour is correct and my expectation is wrong, saying so is a
> complete answer and I will document it on our side.
>
> ―

---

## When someone asks "how is this different from X?"

Answer it directly and without disparaging X. The honest version:

> It overlaps with ― considerably. The difference is scope: ― is a ―, and KetQat
> is a registry and comparison layer that expects to *run on top of* tools like
> it — the QEC path is Stim and PyMatching underneath, not a reimplementation.
>
> The parts I think are genuinely different are the refusals: it declines to
> compare runs whose conditions differ, and it will not report a zero-failure run
> as a logical error rate of zero. Those are opinions about what a benchmark
> registry owes a reader, and reasonable people implement them differently.
>
> If ― already does what you need, use ―. I would rather you had a working
> workflow than a second one.

Never claim to replace, beat, or supersede another project. It is unverifiable,
it reads as inexperience, and in a field this small the maintainer you disparage
will read it.

---

## 日本語版：相互運用性の確認

> **件名：** KetQat での ― の利用について確認させてください
>
> はじめまして。
>
> KetQat は量子誤り訂正およびアルゴリズムのベンチマークを扱う Apache-2.0 の
> レジストリで、― を ― のために利用しています。独自実装ではなく公式パッケージ
> をそのまま使用しています。
>
> 一点だけ確認させてください: ―
>
> 想定外の使い方をしている場合は、今のうちに修正したいと考えております。
> まだレジストリへ公開していないため、互換性を壊す修正の代償がありません。
>
> 紹介や告知をお願いするものではありません。ご回答のみで十分です。
>
> ―
