import json
import threading
import time
from e2b import Sandbox

LEAN_TEMPLATE = "lean-formal-conjectures-v4-28"
REPL_START_CMD = (
    "cd /home/user/formal-conjectures && "
    "/home/user/.elan/bin/lake env /home/user/repl/.lake/build/bin/repl"
)
WARM_IMPORT = "import FormalConjectures.Util.ProblemImports"


class LeanRepl:
    def __init__(self, sandbox: Sandbox):
        self.sandbox = sandbox
        self.pid: int = 0
        self._buffer = ""
        self._lock = threading.Lock()
        self._response_ready = threading.Event()
        self._thread: threading.Thread | None = None

    def _find_running_pid(self) -> int | None:
        procs = self.sandbox.commands.list()
        for p in procs:
            if "repl" in (p.cmd or "") or any("repl" in a for a in p.args):
                return p.pid
        return None

    def _attach(self, pid: int, stream_timeout: float) -> None:
        self.pid = pid

        handle = self.sandbox.commands.connect(pid, timeout=stream_timeout)

        def _drain():
            handle.wait(
                on_stdout=self._on_stdout,
                on_stderr=lambda d: print(f"[lean:stderr] {d.strip()[:200]}") if d.strip() else None,
            )

        self._thread = threading.Thread(target=_drain, daemon=True)
        self._thread.start()

    def start_fresh(self, stream_timeout: float = 600) -> None:
        try:
            self.sandbox.commands.run("pkill -f repl", timeout=5)
        except Exception:
            pass
        time.sleep(1)

        handle = self.sandbox.commands.run(
            REPL_START_CMD,
            background=True,
            stdin=True,
            timeout=stream_timeout,
        )
        self.pid = handle.pid
        print(f"[lean] REPL started fresh (pid={self.pid})")

        def _drain():
            handle.wait(
                on_stdout=self._on_stdout,
                on_stderr=lambda d: print(f"[lean:stderr] {d.strip()[:200]}") if d.strip() else None,
            )

        self._thread = threading.Thread(target=_drain, daemon=True)
        self._thread.start()

    def start(self, stream_timeout: float = 120) -> None:
        self.start_fresh(stream_timeout=stream_timeout)

    def _on_stdout(self, data: str) -> None:
        with self._lock:
            self._buffer += data
            trimmed = self._buffer.strip()
            if not trimmed:
                return
            try:
                json.loads(trimmed)
                self._response_ready.set()
            except json.JSONDecodeError:
                pass

    def send(self, cmd: str, env: int | None = None, timeout: float = 300) -> dict:
        with self._lock:
            self._buffer = ""
        self._response_ready.clear()

        obj: dict = {"cmd": cmd}
        if env is not None:
            obj["env"] = env
        self.sandbox.commands.send_stdin(self.pid, json.dumps(obj) + "\n\n")

        if not self._response_ready.wait(timeout=timeout):
            raise TimeoutError(
                f"REPL timeout after {timeout}s. Buffer: {self._buffer[:500]}"
            )

        with self._lock:
            return json.loads(self._buffer.strip())

    def warm(self, timeout: float = 300) -> int:
        print("[lean] running warm import...")
        t0 = time.time()
        resp = self.send(WARM_IMPORT, timeout=timeout)
        elapsed = time.time() - t0
        errors = [m for m in resp.get("messages", []) if m.get("severity") == "error"]
        if errors:
            raise RuntimeError(f"Warm import errors: {errors}")
        env = resp.get("env", 0)
        print(f"[lean] warm import done (env={env}, {elapsed:.1f}s)")
        return env
