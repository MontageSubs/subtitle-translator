#!/usr/bin/env python3
import os
import sys
from pathlib import Path

location = os.environ.get("RUNNER_TEMP")
registry = Path(location) / ".redact" if location else None
patterns = []
if registry and registry.exists():
    patterns = sorted({line.rstrip("\n") for line in registry.read_text(encoding="utf-8").splitlines() if line.strip()}, key=len, reverse=True)

for line in sys.stdin:
    for pattern in patterns:
        if pattern in line:
            line = line.replace(pattern, "[redacted]")
    sys.stdout.write(line)
