# 不変な関係を使って連立漸化式を簡単にする

数列 $\{x_n\},\{y_n\}$ を

$$
x_1=2,\qquad y_1=1
$$

および

$$
\begin{cases}
x_{n+1}=\dfrac12x_n+\dfrac14y_n\\[4pt]
y_{n+1}=\dfrac14x_n+\dfrac78y_n
\end{cases}
\qquad(n=1,2,3,\ldots)
$$

によって定める。

$$
\lim_{n\to\infty}x_n,\qquad
\lim_{n\to\infty}y_n
$$

を求めよ。

<details>
<summary>HINT</summary>

まず、$x_n$ と $y_n$ のある線形結合が、$n$ によらず一定にならないか調べてみましょう。

その関係が1本見つかったら、もう1本探す前に、

$$
y_n=\text{$x_n$ の式}
$$

または

$$
x_n=\text{$y_n$ の式}
$$

と表せないか考えてください。

さらに今回は一般項ではなく極限だけを求めればよいことにも注目してみましょう。

</details>