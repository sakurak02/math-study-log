<!--
subject: 数学III
category: 極限
subcategory: 数列の極限
-->

# 解説

この問題では、二項展開の二次項までを使った下からの評価で十分です。

$x=\sqrt{3/n}$ を代入すると、下界の中に $n$ と同じ一次の大きさをもつ項が現れます。

ここで大切なのは、「どちらも無限大へ行くから大きい」と考えるのではなく、得られた下界と $n$ を**直接比較する**ことです。

<details>
<summary>模範解答</summary>

$n\ge2$ とする。

$$
\begin{aligned}
\left(1+\sqrt{\frac3n}\right)^n
&\ge
1+n\sqrt{\frac3n}
+\frac{n(n-1)}2\frac3n\\
&=
\sqrt{3n}+\frac{3n-1}{2}.
\end{aligned}
$$

$n>1$ なら

$$
\frac{3n-1}{2}>n
$$

なので、

$$
\boxed{
\left(1+\sqrt{\frac3n}\right)^n>n
}.
$$

</details>
