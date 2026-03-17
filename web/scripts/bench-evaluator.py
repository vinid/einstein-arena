import os
import json
import time
import random
import together

TIMEOUT = 50

VERIFIERS = {
    "erdos-min-overlap-600": {
        "verifier": """import numpy as np

def _normalize_sum_constraint(sequence_array):
    target_sum = len(sequence_array) / 2.0
    current_sum = float(np.sum(sequence_array))
    if current_sum != target_sum:
        if current_sum == 0.0:
            raise AssertionError("Cannot normalize sequence with zero total sum.")
        sequence_array = sequence_array * (target_sum / current_sum)
    return sequence_array

def compute_upper_bound(sequence):
    sequence_array = np.array(sequence, dtype=np.float64)
    sequence_array = _normalize_sum_constraint(sequence_array)
    convolution_values = np.correlate(sequence_array, 1 - sequence_array, mode="full")
    return np.max(convolution_values) / len(sequence) * 2

def evaluate(data):
    return compute_upper_bound(data["values"])""",
        "gen": lambda: {"values": [random.random() for _ in range(600)]},
    },
    "first-autocorrelation-30k": {
        "verifier": """import numpy as np

def evaluate(data):
    f = np.array(data["values"], dtype=np.float64)
    f = np.abs(f)
    n_points = len(f)
    dx = 0.5 / n_points
    autoconv = np.convolve(f, f, mode="full") * dx
    integral_sq = (np.sum(f) * dx) ** 2
    return float(np.max(autoconv) / integral_sq)""",
        "gen": lambda: {"values": [random.random() for _ in range(30000)]},
    },
    "second-autocorrelation-50k": {
        "verifier": """import numpy as np

def evaluate(data):
    f = np.array(data["values"], dtype=np.float64)
    f = np.abs(f)
    convolution = np.convolve(f, f, mode="full")
    num_conv_points = len(convolution)
    x_points = np.linspace(-0.5, 0.5, num_conv_points + 2)
    x_intervals = np.diff(x_points)
    y_points = np.concatenate(([0], convolution, [0]))
    l2_norm_squared = 0.0
    for i in range(num_conv_points + 1):
        y1, y2, h = y_points[i], y_points[i + 1], x_intervals[i]
        l2_norm_squared += (h / 3) * (y1**2 + y1 * y2 + y2**2)
    norm_1 = np.sum(np.abs(convolution)) / (num_conv_points + 1)
    norm_inf = np.max(np.abs(convolution))
    return float(l2_norm_squared / (norm_1 * norm_inf))""",
        "gen": lambda: {"values": [random.random() for _ in range(50000)]},
    },
    "min-distance-ratio-2d-13": {
        "verifier": """import numpy as np

def evaluate(data):
    vectors = np.array(data["vectors"], dtype=np.float64)
    n = vectors.shape[0]
    diff = vectors[:, None, :] - vectors[None, :, :]
    dist_matrix = np.sqrt(np.sum(diff**2, axis=-1))
    mask = np.triu(np.ones((n, n), dtype=bool), k=1)
    pairwise = dist_matrix[mask]
    return float((np.max(pairwise) / np.min(pairwise)) ** 2)""",
        "gen": lambda: {"vectors": [[random.uniform(-10, 10), random.uniform(-10, 10)] for _ in range(13)]},
    },
}

client = together.Together(api_key=os.environ["TOGETHER_API_KEY"])

print("Initializing session...")
try:
    init = client.code_interpreter.execute(
        code="import json, numpy as np\nprint('ready')",
        language="python",
    )
    print(f"Full response: {init}")
    session_id = init.data.session_id
    print(f"Session: {session_id}")
except Exception as e:
    print(f"Init failed: {type(e).__name__}: {e}")
    raise

problems = list(VERIFIERS.keys())
completed = 0
errors = 0
start = time.time()

while time.time() - start < TIMEOUT:
    name = random.choice(problems)
    p = VERIFIERS[name]
    data = p["gen"]()
    data_json = json.dumps(data)

    code = f'import json\n{p["verifier"]}\nwith open("data.json") as f:\n    data = json.load(f)\nscore = evaluate(data)\nprint(f"SCORE:{{score}}")'

    t0 = time.time()
    resp = client.code_interpreter.execute(
        code=code,
        language="python",
        session_id=session_id,
        files=[{"name": "data.json", "content": data_json, "encoding": "string"}],
    )
    dt = time.time() - t0

    outputs = resp.data.outputs if resp.data else []
    stdout = "".join(str(o.data) for o in outputs if o.type == "stdout")
    stderr = "".join(str(o.data) for o in outputs if o.type == "stderr")

    if "SCORE:" in stdout:
        score = stdout.strip().split("SCORE:")[1]
        print(f"  [{completed+1}] {name:30s} score={score:>20s}  ({dt:.2f}s)")
        completed += 1
    else:
        print(f"  [{completed+1}] {name:30s} ERROR ({dt:.2f}s): {stderr[:100]}")
        errors += 1
        completed += 1

elapsed = time.time() - start
print(f"\n--- Results ---")
print(f"Completed: {completed} evaluations in {elapsed:.1f}s")
print(f"Errors: {errors}")
print(f"Avg: {elapsed/completed:.2f}s per evaluation" if completed else "No evaluations")
print(f"Throughput: {completed/elapsed:.1f} evals/min" if elapsed > 0 else "")
