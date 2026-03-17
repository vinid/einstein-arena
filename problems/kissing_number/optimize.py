import json
import os
import time
import math
import tempfile
import fcntl
import numpy as np
import jax
import jax.numpy as jnp
from functools import partial
try:
    import cvxpy as cp
except Exception:
    cp = None

os.environ["PYTHONUNBUFFERED"] = "1"

N = 594
D = 11
MASK = jnp.triu(jnp.ones((N, N)), k=1)
CHECKPOINT = os.path.join(os.path.dirname(__file__), "best.json")
TIMEOUT = 30 * 60

def load_593():
    ns = {}
    exec(open(os.path.join(os.path.dirname(__file__), "alpha_evlovle.py")).read(), ns)
    vecs = ns["sphere_centers"].astype(np.float64)
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    return vecs / norms

BASE_593 = None
def get_base():
    global BASE_593
    if BASE_593 is None:
        BASE_593 = load_593()
    return BASE_593

def normalize_np(v):
    norms = np.linalg.norm(v, axis=1, keepdims=True)
    return v / np.maximum(norms, 1e-15)

def score_np(directions):
    centers = 2.0 * normalize_np(directions)
    diff = centers[:, None, :] - centers[None, :, :]
    dist = np.sqrt(np.sum(diff ** 2, axis=-1))
    mask = np.triu(np.ones((N, N), dtype=bool), k=1)
    return float(np.sum(np.maximum(0.0, 2.0 - dist[mask])))

def point_penalties(directions):
    centers = 2.0 * normalize_np(directions)
    diff = centers[:, None, :] - centers[None, :, :]
    dist = np.sqrt(np.sum(diff ** 2, axis=-1))
    overlap = np.maximum(0.0, 2.0 - dist)
    np.fill_diagonal(overlap, 0.0)
    return overlap.sum(axis=1)

def perturb_directions(directions, n_points=24, scale=0.01):
    penalties = point_penalties(directions)
    idxs = np.argsort(penalties)[-n_points:]
    trial = directions.copy()
    trial[idxs] += np.random.normal(scale=scale, size=(len(idxs), D))
    return normalize_np(trial)

def random_direction(dim):
    a = np.random.normal(size=dim)
    a /= np.linalg.norm(a)
    return a

def direction_penalty(a, base_unit):
    dot = base_unit @ a
    mask = dot > 0.5
    if not np.any(mask):
        return 0.0
    d = 2.0 - 2.0 * np.sqrt(2.0 - 2.0 * np.clip(dot[mask], -1.0, 1.0))
    return float(np.sum(np.maximum(d, 0.0)))

def penalty_for_integer(w, base_norms, base):
    w_norm = np.linalg.norm(w)
    if w_norm == 0.0:
        return float("inf")
    dot = (base @ w) / (base_norms * w_norm)
    mask = dot > 0.5
    if not np.any(mask):
        return 0.0
    d = 2.0 - 2.0 * np.sqrt(2.0 - 2.0 * np.clip(dot[mask], -1.0, 1.0))
    return float(np.sum(np.maximum(d, 0.0)))

def improve_integer(w, base_norms, base, max_iters=2000):
    best_w = w.copy()
    best_pen = penalty_for_integer(best_w, base_norms, base)
    for _ in range(max_iters):
        idx = np.random.randint(w.shape[0])
        delta = 1 if np.random.random() < 0.5 else -1
        w2 = best_w.copy()
        w2[idx] += delta
        if np.all(w2 == 0):
            continue
        pen2 = penalty_for_integer(w2, base_norms, base)
        if pen2 < best_pen - 1e-12:
            best_w = w2
            best_pen = pen2
            if best_pen == 0.0:
                break
    return best_w, best_pen

def integerise_and_refine(a, base_norms, base):
    best_w = None
    best_pen = float("inf")
    for scale in [2 ** k for k in range(3, 17)]:
        w = np.rint(a * scale).astype(np.int64)
        if np.all(w == 0):
            continue
        pen = penalty_for_integer(w, base_norms, base)
        if pen < best_pen:
            best_w = w.copy()
            best_pen = pen
        w_imp, pen_imp = improve_integer(w, base_norms, base, max_iters=2000)
        if pen_imp < best_pen:
            best_w = w_imp
            best_pen = pen_imp
        if best_pen == 0.0:
            break
    if best_pen > 0.0 and best_w is not None:
        for _ in range(3):
            w_imp, pen_imp = improve_integer(best_w, base_norms, base, max_iters=5000)
            if pen_imp < best_pen:
                best_w = w_imp
                best_pen = pen_imp
            if best_pen == 0.0:
                break
    return best_w, best_pen

def cvxpy_find_direction(base_unit):
    if cp is None:
        return None
    dim = base_unit.shape[1]
    v = cp.Variable(dim)
    t = cp.Variable()
    constraints = [cp.norm(v) <= 1]
    for i in range(base_unit.shape[0]):
        constraints.append(v @ base_unit[i] <= t)
    prob = cp.Problem(cp.Minimize(t), constraints)
    try:
        prob.solve(solver=cp.SCS, max_iters=2500, verbose=False)
    except Exception:
        return None
    if prob.status not in (cp.OPTIMAL, cp.OPTIMAL_INACCURATE):
        return None
    if v.value is None:
        return None
    a = np.array(v.value, dtype=np.float64)
    norm = np.linalg.norm(a)
    if norm <= 1e-12:
        return None
    return a / norm

def hill_climb_direction(start_a, base_unit, max_steps=500):
    a = start_a.copy()
    cur_pen = direction_penalty(a, base_unit)
    dim = a.shape[0]
    for step in range(max_steps):
        sigma = 0.3 * math.exp(-5.0 * step / max_steps)
        cand = a + sigma * np.random.normal(size=dim)
        cand_norm = np.linalg.norm(cand)
        if cand_norm == 0.0:
            continue
        cand /= cand_norm
        cand_pen = direction_penalty(cand, base_unit)
        if cand_pen < cur_pen - 1e-15:
            a = cand
            cur_pen = cand_pen
            if cur_pen == 0.0:
                break
    return a

def search_direction(base_unit, max_seconds):
    start_time = time.time()
    best_dir = None
    best_pen = float("inf")
    best_maxdot = 1.0
    cvx_dir = cvxpy_find_direction(base_unit)
    if cvx_dir is not None:
        a = hill_climb_direction(cvx_dir, base_unit, max_steps=300)
        pen = direction_penalty(a, base_unit)
        maxdot = float(np.max(base_unit @ a))
        best_dir = a
        best_pen = pen
        best_maxdot = maxdot
    while time.time() - start_time < max_seconds:
        a = random_direction(base_unit.shape[1])
        a = hill_climb_direction(a, base_unit, max_steps=300)
        pen = direction_penalty(a, base_unit)
        maxdot = float(np.max(base_unit @ a))
        if (pen < best_pen - 1e-15) or (abs(pen - best_pen) <= 1e-15 and maxdot < best_maxdot):
            best_dir = a
            best_pen = pen
            best_maxdot = maxdot
            if best_pen == 0.0:
                break
    if best_dir is None:
        best_dir = random_direction(base_unit.shape[1])
    return best_dir, best_pen, best_maxdot

def construct_594(search_seconds=25.0, attempts=3):
    base = get_base()
    base_raw = base.copy()
    base_norms = np.linalg.norm(base_raw, axis=1)
    best_full = None
    best_label = ""
    best_score = float("inf")
    per_attempt = search_seconds / attempts
    for attempt in range(attempts):
        direction, dir_pen, maxdot = search_direction(base, per_attempt)
        float_extra = direction.reshape(1, D)
        float_full = normalize_np(np.vstack([base, float_extra]))
        float_score = score_np(float_full)
        if float_score < best_score:
            best_full = float_full
            best_score = float_score
            best_label = f"dir pen={dir_pen:.6f} maxdot={maxdot:.6f} attempt={attempt + 1}/{attempts}"
        int_w, int_pen = integerise_and_refine(direction, base_norms, base_raw)
        if int_w is not None:
            int_extra = normalize_np(int_w.reshape(1, D).astype(np.float64))
            int_full = normalize_np(np.vstack([base, int_extra]))
            int_score = score_np(int_full)
            if int_score < best_score:
                best_full = int_full
                best_score = int_score
                best_label = f"int pen={int_pen:.6f} attempt={attempt + 1}/{attempts}"
    return best_full, best_score, best_label

@jax.jit
def jax_loss(directions):
    norms = jnp.sqrt(jnp.sum(directions ** 2, axis=1, keepdims=True) + 1e-30)
    dirs = directions / norms
    centers = 2.0 * dirs
    diff = centers[:, None, :] - centers[None, :, :]
    dist = jnp.sqrt(jnp.sum(diff ** 2, axis=-1) + 1e-30)
    overlap = jnp.maximum(0.0, 2.0 - dist)
    return jnp.sum(overlap * MASK)

jax_grad = jax.jit(jax.grad(jax_loss))

@partial(jax.jit, static_argnums=())
def adam_step(params, m, v, step, lr=0.001):
    g = jax_grad(params)
    norms = jnp.sqrt(jnp.sum(params ** 2, axis=1, keepdims=True) + 1e-30)
    dirs = params / norms
    g = g - dirs * jnp.sum(g * dirs, axis=1, keepdims=True)

    m = 0.9 * m + 0.1 * g
    v = 0.999 * v + 0.001 * g ** 2
    m_hat = m / (1.0 - 0.9 ** (step + 1))
    v_hat = v / (1.0 - 0.999 ** (step + 1))
    params = params - lr * m_hat / (jnp.sqrt(v_hat) + 1e-8)

    norms = jnp.sqrt(jnp.sum(params ** 2, axis=1, keepdims=True) + 1e-30)
    params = params / norms
    return params, m, v

def adam_optimize(directions_np, schedule=None, report_every=200, label="adam"):
    if schedule is None:
        schedule = [
            (2000, 0.003),
            (4000, 0.001),
            (6000, 0.0003),
            (4000, 0.0001),
            (4000, 0.00003),
        ]
    vecs = jnp.array(directions_np, dtype=jnp.float32)
    m = jnp.zeros_like(vecs)
    v = jnp.zeros_like(vecs)
    best = float(jax_loss(vecs))
    best_vecs = vecs
    total_steps = sum(steps for steps, _ in schedule)
    step = 0
    for phase_steps, lr in schedule:
        for _ in range(phase_steps):
            step += 1
            vecs, m, v = adam_step(vecs, m, v, jnp.float32(step - 1), lr=lr)
            if step % report_every == 0 or step == total_steps:
                loss = float(jax_loss(vecs))
                if loss < best:
                    best = loss
                    best_vecs = vecs
                print(f"  [{label}] step {step}/{total_steps} lr={lr:.5g} loss={loss:.6f} best={best:.6f}", flush=True)
    return np.array(best_vecs, dtype=np.float64), best

def load_checkpoint():
    if not os.path.exists(CHECKPOINT):
        return None, float("inf")
    fd = os.open(CHECKPOINT, os.O_RDONLY)
    try:
        fcntl.flock(fd, fcntl.LOCK_SH)
        with os.fdopen(os.dup(fd), "r") as f:
            data = json.load(f)
        return np.array(data["vectors"], dtype=np.float64), float(data["score"])
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)

def save_checkpoint(vectors, score):
    data = {"score": score, "vectors": vectors.tolist()}
    tmp_fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(CHECKPOINT), suffix=".tmp")
    try:
        with os.fdopen(tmp_fd, "w") as f:
            json.dump(data, f)
        fd = os.open(CHECKPOINT, os.O_RDWR | os.O_CREAT)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            existing_score = float("inf")
            try:
                with os.fdopen(os.dup(fd), "r") as f:
                    existing_score = float(json.load(f)["score"])
            except (json.JSONDecodeError, KeyError, ValueError):
                pass
            if score < existing_score:
                os.rename(tmp_path, CHECKPOINT)
                return True
            else:
                os.unlink(tmp_path)
                return False
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
            os.close(fd)
    except:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)
        raise

def run():
    pid = os.getpid()
    np.random.seed(int.from_bytes(os.urandom(4), "little"))

    ckpt_vecs, ckpt_score = load_checkpoint()

    if ckpt_vecs is not None:
        directions = ckpt_vecs
        best_score = ckpt_score
        print(f"[{pid}] Using checkpoint without construction: {ckpt_score:.6f}", flush=True)
        directions, score = adam_optimize(
            directions,
            schedule=[
                (6000, 0.00003),
                (6000, 0.00001),
                (6000, 0.000003),
            ],
            report_every=200,
            label="polish",
        )
        if score < best_score:
            best_score = score
            directions = normalize_np(directions)
            saved = save_checkpoint(directions, score)
            print(f"[{pid}] New best after polish: {score:.6f}" + (" (SAVED)" if saved else ""), flush=True)
        restart_specs = [
            (12, 0.0025),
            (18, 0.004),
            (24, 0.006),
        ]
        for attempt, (n_points, scale) in enumerate(restart_specs, start=1):
            trial = perturb_directions(directions, n_points=n_points, scale=scale)
            trial, score = adam_optimize(
                trial,
                schedule=[
                    (2000, 0.00003),
                    (3000, 0.00001),
                    (3000, 0.000003),
                ],
                report_every=200,
                label=f"restart-{attempt}",
            )
            if score < best_score:
                best_score = score
                directions = normalize_np(trial)
                saved = save_checkpoint(directions, score)
                print(f"[{pid}] New best after restart {attempt}: {score:.6f}" + (" (SAVED)" if saved else ""), flush=True)
            else:
                print(f"[{pid}] Restart {attempt} no improvement (best={best_score:.6f})", flush=True)
    else:
        directions, init_score, seed_label = construct_594()
        print(f"[{pid}] AE593+constructed: {init_score:.6f} ({seed_label})", flush=True)
        best_score = init_score
        save_checkpoint(directions, best_score)
        print(f"[{pid}] Starting fresh: {init_score:.6f}", flush=True)
        directions, score = adam_optimize(directions, report_every=200, label="adam")
        if score < best_score:
            best_score = score
            saved = save_checkpoint(directions, score)
            print(f"[{pid}] New best: {score:.6f}" + (" (SAVED)" if saved else ""), flush=True)
        else:
            print(f"[{pid}] No improvement (best={best_score:.6f})", flush=True)

    print(f"\n[{pid}] Done. Best={best_score:.6f}", flush=True)

if __name__ == "__main__":
    run()
