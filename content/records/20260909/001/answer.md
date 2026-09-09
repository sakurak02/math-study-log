# 不変な関係を使って連立漸化式を簡単にする｜解説

## EXPLANATION

この問題のポイントは、連立漸化式を最後まで連立のまま扱わないことです。

まず、2つの漸化式を適切に組み合わせると、

$$
\frac12x_{n+1}+y_{n+1}
=
\frac12x_n+y_n
$$

となります。

したがって、

$$
\frac12x_n+y_n
$$

は $n$ によらず一定です。

初期値より、

$$
\frac12x_1+y_1=2
$$

なので、

$$
\frac12x_n+y_n=2
$$

です。

ここで重要なのは、別の線形結合をさらに探すことではありません。

この1本だけで、

$$
y_n=2-\frac12x_n
$$

と表せるため、連立漸化式を1変数に減らせます。

これを第1式へ代入すると、

$$
x_{n+1}
=
\frac12x_n
+\frac14\left(2-\frac12x_n\right)
$$

より、

$$
x_{n+1}
=
\frac38x_n+\frac12
$$

となります。

今回は一般項ではなく極限だけを求めればよいので、さらに簡略化できます。

$x_n$ が $L$ に収束するとすれば、

$$
L=\frac38L+\frac12
$$

を満たす必要があります。

よって、

$$
L=\frac45
$$

です。

ただし、この式だけでは収束そのものはまだ保証されません。

そこで、

$$
x_{n+1}-\frac45
=
\frac38\left(x_n-\frac45\right)
$$

とすると、

$$
x_n-\frac45
$$

は公比 $\frac38$ の等比数列になります。

$$
\left|\frac38\right|<1
$$

なので、

$$
x_n-\frac45\to0
$$

したがって、

$$
x_n\to\frac45
$$

です。

さらに、

$$
y_n=2-\frac12x_n
$$

より、

$$
y_n\to
2-\frac12\cdot\frac45
=
\frac85
$$

となります。

この問題では、

**不変な関係を1本見つける  
→ 1変数に減らす  
→ 極限だけなら一般項を求めず収束先を調べる**

という順に考えることで、計算を大幅に短くできます。

<details>
<summary>MODEL ANSWER</summary>

2式を適切に組み合わせると、

$$
\frac12x_{n+1}+y_{n+1}
=
\frac12x_n+y_n
$$

となる。

したがって、

$$
\frac12x_n+y_n
$$

は一定である。

初期値より、

$$
\frac12x_n+y_n=2
$$

なので、

$$
y_n=2-\frac12x_n.
$$

これを

$$
x_{n+1}
=
\frac12x_n+\frac14y_n
$$

へ代入すると、

$$
x_{n+1}
=
\frac12x_n
+
\frac14\left(2-\frac12x_n\right)
$$

$$
=
\frac38x_n+\frac12.
$$

ここで、

$$
L=\frac38L+\frac12
$$

を解くと、

$$
L=\frac45.
$$

さらに、

$$
x_{n+1}-\frac45
=
\frac38\left(x_n-\frac45\right).
$$

よって、

$$
x_n-\frac45
$$

は公比 $\frac38$ の等比数列である。

$$
\left|\frac38\right|<1
$$

だから、

$$
x_n-\frac45\to0.
$$

したがって、

$$
\boxed{
\lim_{n\to\infty}x_n=\frac45
}
$$

である。

また、

$$
y_n=2-\frac12x_n
$$

より、

$$
\boxed{
\lim_{n\to\infty}y_n=\frac85
}
$$

となる。

</details>