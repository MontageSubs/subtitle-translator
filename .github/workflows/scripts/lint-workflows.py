#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
KNOWN = set(json.loads((ROOT / ".github/config/manifest.json").read_text(encoding="utf-8"))["inputs"]) | {"GITHUB_TOKEN"}

FORBIDDEN = [
    (r"pull_request_target", "pull_request_target runs untrusted code with secrets"),
    (r"toJSON\(\s*secrets", "toJSON(secrets) exposes every secret"),
    (r"\bprintenv\b", "printenv prints the environment"),
    (r"(^|[\s;|&])env\s*($|[|;&>])", "bare env prints the environment"),
    (r"set\s+-[a-z]*x", "xtrace prints expanded commands"),
    (r"set\s+-o\s+xtrace", "xtrace prints expanded commands"),
    (r"WRANGLER_LOG\s*[:=]\s*[\"']?(debug|trace)", "wrangler debug logging prints request details"),
    (r"upload-artifact", "artifacts can carry secrets out of the run"),
    (r"ACTIONS_STEP_DEBUG|ACTIONS_RUNNER_DEBUG", "debug logging widens what is printed"),
    (r"curl\s+(-[a-zA-Z]*v|--verbose)", "verbose curl prints headers"),
    (r"os\.environ\s*\)", "dumping os.environ"),
    (r"GITHUB_STEP_SUMMARY|::notice|::warning", "job summaries and annotations are not allowed"),
    (r"\$\{\{\s*vars\.", "repository variables are visible in logs; use secrets"),
    (r"console\.log\(\s*process\.env\s*\)", "dumping process.env"),
]
EXPRESSION = re.compile(r"\$\{\{\s*(secrets|vars)\.([A-Za-z0-9_]+)\s*\}\}")
MAPPING_LINE = re.compile(r"^\s+[A-Za-z0-9_]+:\s+\$\{\{\s*(secrets|vars)\.[A-Za-z0-9_]+\s*\}\}\s*$")


def main():
    problems = []
    files = sorted((ROOT / ".github/workflows").glob("*.yml")) + sorted((ROOT / ".github/workflows/scripts").glob("*"))
    for path in files:
        if path.name == "lint-workflows.py" or not path.is_file():
            continue
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            where = f"{path.relative_to(ROOT)}:{number}"
            for pattern, reason in FORBIDDEN:
                if re.search(pattern, line):
                    problems.append(f"{where}: {reason}")
            for scope, name in EXPRESSION.findall(line):
                if name not in KNOWN:
                    problems.append(f"{where}: {scope}.{name} is not declared in the manifest")
                if not MAPPING_LINE.match(line):
                    problems.append(f"{where}: {scope}.{name} must only appear as an env mapping line")
    for problem in problems:
        print(f"::error::{problem}")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
