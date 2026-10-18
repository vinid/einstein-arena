"""Writes report/<run-id>.html, a static copy of the run's dashboard."""
import json
import os
import sys
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from report.collect import collect

RUN = sys.argv[1]
template = (Path(__file__).parent / "template.html").read_text()
out = Path(__file__).parent / f"{RUN}.html"
out.write_text(template.replace("/*DATA*/null", json.dumps(collect(RUN))))
print(out)
