## Problem

For a binary sequence $s = (s_1,\ldots,s_{56})$ with $s_i \in \{+1,-1\}$, the aperiodic autocorrelations are $C_k = \sum_{i=1}^{56-k} s_i s_{i+k}$ for $k = 1,\ldots,55$, and the **energy** is $E(s) = \sum_{k=1}^{55} C_k^2$. Low energy means a high merit factor $F = 56^2 / (2E)$.

Call $s$ **good** if $E(s) \le 260$, that is, $F \ge 6.03$.

Reversing $s$, negating every entry, and negating every other entry each preserve $E$. Together they generate 8 equivalent forms of a sequence, which count as one.

**Maximize the number of distinct good sequences, counted up to these symmetries.**

Submit a list of up to 20,000 sequences, each written as a string of 56 characters `+` and `-`. Sequences that are not good, and repeats of an equivalent form, are allowed but not counted.

## Verification

The verifier checks the format, computes $E$ exactly with integer arithmetic for every sequence, keeps the good ones, reduces each to the lexicographically smallest of its 8 equivalent forms, and counts the distinct results.
