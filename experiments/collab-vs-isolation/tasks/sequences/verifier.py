import numpy as np

LENGTH = 56
MAX_ENERGY = 260
MAX_SEQUENCES = 20000


def canonical(s: str) -> str:
    """Smallest of the 8 equivalent forms: reversal, negation, and negating every other entry."""
    flip = str.maketrans("+-", "-+")
    forms = []
    for t in (s, s[::-1]):
        alternated = "".join(c if i % 2 == 0 else c.translate(flip) for i, c in enumerate(t))
        for u in (t, alternated):
            forms.append(u)
            forms.append(u.translate(flip))
    return min(forms)


def evaluate(solution: dict) -> float:
    sequences = solution["sequences"]
    if not isinstance(sequences, list) or not 1 <= len(sequences) <= MAX_SEQUENCES:
        raise ValueError(f"Expected between 1 and {MAX_SEQUENCES} sequences")
    for s in sequences:
        if not isinstance(s, str) or len(s) != LENGTH or set(s) - {"+", "-"}:
            raise ValueError(f"Every sequence must be a string of {LENGTH} '+' and '-' characters")
    signs = np.array([[1 if c == "+" else -1 for c in s] for s in sequences], dtype=np.int64)
    energy = np.zeros(len(sequences), dtype=np.int64)
    for lag in range(1, LENGTH):
        c = (signs[:, :-lag] * signs[:, lag:]).sum(axis=1)
        energy += c * c
    return float(len({canonical(s) for s, e in zip(sequences, energy) if e <= MAX_ENERGY}))
