<!--
subject: 数学III
category: 極限
subcategory: 数列の極限
-->

# 解説

この問題では固定点が2つ現れます。

固定点を $\alpha,\beta$ とすると、

$$
a_n-\alpha,
\qquad
a_n-\beta
$$

をそれぞれ調べ、共通因子が現れたら

$$
\frac{a_n-\alpha}{a_n-\beta}
$$

という**差の比**を考えるのがポイントです。

今回はこの比が等比数列になります。

固定点が1つの型で「差」を見たことから、固定点が2つの型では「差の比」へ進む、というつながりが見えます。

<details>
<summary>模範解答</summary>

(1)

$$
x=\frac{5x-3}{x+1}
$$

より

$$
x^2-4x+3=0,
$$

したがって

$$
\boxed{x=1,3}.
$$

(2)

$$
a_{n+1}-1=\frac{4(a_n-1)}{a_n+1},
$$

$$
a_{n+1}-3=\frac{2(a_n-3)}{a_n+1}.
$$

よって

$$
\frac{a_{n+1}-1}{a_{n+1}-3}
=2\frac{a_n-1}{a_n-3},
$$

したがって

$$
\boxed{b_{n+1}=2b_n}.
$$

(3) $b_1=2$ より $b_n=2^n$。したがって

$$
\frac{a_n-1}{a_n-3}=2^n.
$$

これを解くと

$$
\boxed{a_n=\frac{3\cdot2^n-1}{2^n-1}}.
$$

(4)

$$
\boxed{\lim_{n\to\infty}a_n=3}.
$$

</details>
