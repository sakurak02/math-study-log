# オリジナル問題と発展

## オリジナル問題

正の整数 $n$ に対して、

$$
\left(1+\sqrt{\frac3n}\right)^n>n
$$

が十分大きな $n$ で成り立つことを示す。

今回は、

$$
(1+x)^n
\ge
1+nx+\frac{n(n-1)}2x^2
$$

を使うところまでは自力で進めることができた。

$x=\sqrt{3/n}$ を代入すると、

$$
\begin{aligned}
\left(1+\sqrt{\frac3n}\right)^n
&\ge
1+n\sqrt{\frac3n}
+\frac{n(n-1)}2\frac3n\\
&=
1+\sqrt{3n}+\frac32(n-1)\\
&=
\sqrt{3n}+\frac{3n-1}{2}.
\end{aligned}
$$

ここで、

$$
\frac{3n-1}{2}\to\infty
$$

だから $n$ より大きくなるのではないか、と考えた。

しかし、ここには穴がある。

## 「無限大になる」と「こちらの方が大きい」は別

比較相手である

$$
n
$$

も

$$
n\to\infty
$$

である。

したがって、

$$
\frac{3n-1}{2}\to\infty
$$

という事実だけでは、

$$
\frac{3n-1}{2}>n
$$

とは結論できない。

たとえば、

$$
\frac n2\to\infty
$$

だが、

$$
\frac n2<n
$$

である。

大小を知りたいなら、直接比較する。

$$
\frac{3n-1}{2}>n
$$

は、

$$
3n-1>2n
$$

すなわち

$$
n>1
$$

で成立する。

したがって $n\ge2$ なら、

$$
\left(1+\sqrt{\frac3n}\right)^n>n.
$$

<details>
<summary>解答</summary>

$n\ge2$ とする。

$$
\begin{aligned}
\left(1+\sqrt{\frac3n}\right)^n
&\ge
1+\sqrt{3n}+\frac32(n-1)\\
&=
\sqrt{3n}+\frac{3n-1}{2}.
\end{aligned}
$$

$n>1$ なら、

$$
\frac{3n-1}{2}>n
$$

であるから、

$$
\sqrt{3n}+\frac{3n-1}{2}>n.
$$

よって、

$$
\boxed{
\left(1+\sqrt{\frac3n}\right)^n>n
}
$$

が成り立つ。

</details>

---

## 発展・寄り道｜同じ方法では届かない？

さらに、

$$
\left(1+\frac2{\sqrt n}\right)^n>n^2
$$

を十分大きな $n$ で示せるか考えてみた。

最初は同じ不等式をそのまま使おうとした。

途中で、

$$
n\frac2{\sqrt n}
$$

を $\sqrt{2n}$ としてしまったが、正しくは

$$
n\frac2{\sqrt n}=2\sqrt n
$$

である。

また、

$$
\left(\frac2{\sqrt n}\right)^2=\frac4n
$$

なので、正しく計算すると、

$$
\begin{aligned}
\left(1+\frac2{\sqrt n}\right)^n
&\ge
1+2\sqrt n
+\frac{n(n-1)}2\frac4n\\
&=
2n-1+2\sqrt n.
\end{aligned}
$$

ところが、

$$
2n-1+2\sqrt n
$$

では、十分大きな $n$ に対して $n^2$ より小さい。

ここで重要なのは、

$$
2n-1+2\sqrt n<n^2
$$

だからといって、

$$
\left(1+\frac2{\sqrt n}\right)^n<n^2
$$

とは言えないことである。

分かったのは、

> **二次項まで使った下からの評価では弱すぎる**

ということだけである。

$$
\boxed{
\text{下界が目標より小さい}
\;\not\Rightarrow\;
\text{元の式が目標より小さい}
}
$$
