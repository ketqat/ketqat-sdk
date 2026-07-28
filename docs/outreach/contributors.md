# First contributors

For people who might contribute, and for the people already in a thread with
them. The failure mode here is over-promising: a contributor who is told the
project is thriving and finds one star feels misled, and does not come back.

Read [`README.md`](README.md) first.

---

## Replying to a first issue or pull request

> Thank you — this is a real gap and I had not seen it.
>
> One thing worth knowing before you spend more time: this is a young project.
> One star, two contributors, nothing published to a package registry yet. Your
> change will get attention, and it will also carry more weight than a change to
> an established codebase would. Some people find that appealing and some find it
> a reason to wait, and both are reasonable.
>
> If you want to continue: the thing I will ask for that projects often do not is
> **a test that fails without your change**. Confirm it fails before, passes
> after. This repository has merged three tests that passed for reasons unrelated
> to the bug they were meant to pin, so it is asked for every time now.
>
> Happy to pair on it if that is easier than a review cycle.

---

## Answering "is this project active / should I invest time?"

Do not sell. Give the numbers and let them decide.

> Fair question, and the honest answer is: it is actively developed and barely
> used. Current figures are at https://ketqat.com/metrics — that page reports
> unknowns as unknown rather than zero, so it is a fair basis for the decision.
>
> Development is ongoing and recent. Adoption is near zero. There is one open
> defect I would want to know about if I were you (#89: the same experiment run
> twice produces different reproducibility hashes).
>
> If you want a project where your contribution shapes the direction, that
> combination is an argument for. If you want something with users today, it is
> an argument against.

---

## Office hours announcement

> **Open office hours — ―, ― UTC**
>
> An open call for anyone using or considering KetQat. No agenda and no
> presentation. Bring a question, a bug, a benchmark that disagrees with a
> published figure, or a decoder you want to run.
>
> If nobody comes I will use the hour to work on issues, so it costs nothing to
> be the only person there.
>
> ―

That last line is not a joke. Small projects hold empty meetings, and saying so
in advance removes the awkwardness that stops people attending the next one.

---

## Good-first-issue description template

An issue that wastes a newcomer's time costs more than the fix is worth.

> **What is wrong:** ―
>
> **Where:** `path/to/file.ts:LINE`
>
> **What "done" looks like:** ―
>
> **How to tell it worked:** ― (the specific command, and what its output should
> change to)
>
> **Roughly how much work:** ―
>
> **What you do not need to know:** ―
>
> Ask questions in the issue rather than working around anything unclear —
> an unclear issue is my bug, not yours.

---

## 日本語版：初めてのコントリビューションへの返信

> ご報告ありがとうございます。実際に見落としていた箇所でした。
>
> お時間を使っていただく前に一点お伝えしておきます。本プロジェクトはまだ
> 非常に小規模です。スター 1、コントリビューター 2 名、パッケージレジストリ
> への公開もまだです。そのため変更は必ず目を通されますが、成熟した
> コードベースよりも重い意味を持ちます。魅力と感じる方も、様子を見たいと
> 感じる方もいらっしゃると思います。
>
> 進めていただける場合、一点だけお願いしています。**その変更が無ければ失敗
> するテスト** を添えてください。変更前に失敗し、変更後に成功することをご確認
> ください。本リポジトリでは、意図した不具合とは無関係な理由で成功していた
> テストが過去に三件マージされているため、毎回お願いしています。
>
> レビューのやり取りより一緒に作業する方が早ければ、いつでもご相談ください。
