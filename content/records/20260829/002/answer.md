<!--
subject: 数学III
category: 極限
subcategory: 数列の極限
-->

# 解説

二次項までの下界は $O(n)$ 程度なので、目標である $n^2$ には届きません。

そこで二項展開の各項の大きさを見積もります。

5次項は $n^{5/2}$ 程度となるため、十分大きな $n$ では $n^2$ を上回ります。

正確な積の展開にこだわらず、十分大きな $n$ で各因子を $n/2$ 以上と評価すると、証明を簡潔にできます。

<details>
<summary>模範解答</summary>

二項展開の5次項

$$
\binom n5\left(\frac2{\sqrt n}\right)^5
$$

を見る。

$n\ge8$ なら

$$
n-1,n-2,n-3,n-4\ge\frac n2
$$

だから、

$$
\begin{aligned}
\binom n5\left(\frac2{\sqrt n}\right)^5
&\ge
\frac{n(n/2)^4}{120}\cdot\frac{32}{n^{5/2}}\\
&=\frac1{60}n^{5/2}.
\end{aligned}
$$

さらに $n>3600$ なら

$$
\frac1{60}n^{5/2}>n^2.
$$

したがって十分大きな $n$ について、

$$
\boxed{
\left(1+\frac2{\sqrt n}\right)^n>n^2
}.
$$

</details>
