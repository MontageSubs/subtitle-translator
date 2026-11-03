#!/usr/bin/env python3
import json
import os
import re
import shlex
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
INPUTS = json.loads((ROOT / ".github/config/manifest.json").read_text(encoding="utf-8"))["inputs"]
MASK_MIN_LENGTH = 6
HOST_LABELS = {"status": "status", "statusApi": "status-api", "assets": "assets", "models": "models"}
LIMITERS = {
    "LIMITER_RATE_PER_MINUTE": ("LIMITER_RATE", 1001, 60),
    "LIMITER_BURST_PER_10S": ("LIMITER_BURST", 1002, 10),
    "LIMITER_SESSION_PER_MINUTE": ("LIMITER_SESSION", 1003, 60),
}
PROFILES = {
    "worker": ["SITE", "CF", "TR_CONFIG", "CF_TOKEN_WORKERS", "DB_TURSO_URL", "DB_TURSO_TOKEN", "TR_PROVIDER_KEY_GOOGLE", "TR_CAPTCHA_SECRET", "TR_SIGNING_SALT", "TR_PRIVACY_SALT_IP", "TR_SIGNING_SECRET_A", "TR_SIGNING_SECRET_B", "TR_PROVIDER_KEY_GOOGLE_V2", "TR_PROVIDER_KEY_DEEPL"],
    "status": ["SITE", "CF", "ST_CONFIG", "CF_TOKEN_WORKERS", "CF_TOKEN_STATUS", "DB_TURSO_URL", "DB_TURSO_TOKEN", "ST_ADMIN_TOKEN"],
    "build": ["SITE", "CF"],
    "pages": ["SITE", "CF", "CF_TOKEN_PAGES"],
    "models": ["SITE", "CF", "CF_TOKEN_PAGES"],
    "status-admin": ["SITE", "CF", "CF_TOKEN_STATUS", "DB_TURSO_URL", "DB_TURSO_TOKEN", "ST_ADMIN_TOKEN", "ST_GATE_TOKEN"],
    "database": ["CF", "CF_TOKEN_WORKERS", "TR_PRIVACY_SALT_IP"],
    "cloudflare": ["CF", "CF_TOKEN_WORKERS"],
    "turso": ["DB_TURSO_URL", "DB_TURSO_TOKEN"],
}
TYPE_PATTERNS = {
    "int": r"\d+",
    "bool": r"[01]",
    "hostname": r"[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+",
    "url": r"https?://\S+",
    "hex32": r"[a-f0-9]{32}",
    "uuid": r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}",
}


class ConfigFailure(Exception):
    pass


def parse_block(name, raw, errors):
    spec = INPUTS[name]["keys"]
    values = {}
    for number, line in enumerate(raw.splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        key = key.strip()
        if not separator:
            errors.append(f"{name}: line {number} is not KEY=VALUE")
        elif key not in spec:
            errors.append(f"{name}: unknown key {key}")
        elif key in values:
            errors.append(f"{name}: duplicate key {key}")
        else:
            values[key] = value.strip()
    return values


def check_value(label, kind, value, errors):
    if kind == "list":
        if any(not item.strip() for item in value.split(",")):
            errors.append(f"{label}: empty list item")
    elif kind == "json":
        try:
            json.loads(value)
        except ValueError:
            errors.append(f"{label}: invalid JSON")
    elif kind != "str" and not re.fullmatch(TYPE_PATTERNS[kind], value):
        errors.append(f"{label}: expected {kind}")


def load_inputs(profile):
    errors = []
    loaded = {}
    for name in PROFILES[profile]:
        spec = INPUTS[name]
        raw = os.environ.get(name, "").strip()
        if spec["kind"] == "value":
            if raw:
                loaded[name] = raw
            elif spec["required"]:
                errors.append(f"{name}: not set")
            continue
        values = parse_block(name, raw, errors) if raw else {}
        merged = {}
        for key, key_spec in spec["keys"].items():
            value = values.get(key, "")
            if value:
                check_value(f"{name}.{key}", key_spec["type"], value, errors)
            elif key_spec["required"]:
                errors.append(f"{name}.{key}: missing")
            merged[key] = value
        loaded[name] = merged
    if errors:
        for line in errors:
            print(f"::error::config {line}")
        raise ConfigFailure()
    return loaded


def sensitive_values(loaded):
    found = []
    for name, value in loaded.items():
        found.extend([value] if INPUTS[name]["kind"] == "value" else value.values())
    return [item for item in found if len(item) >= MASK_MIN_LENGTH]


def register_masks(values):
    forms = set()
    for value in values:
        forms.add(value)
        if "://" in value:
            forms.add(urllib.parse.urlparse(value).netloc)
    for form in sorted(form for form in forms if len(form) >= MASK_MIN_LENGTH):
        print(f"::add-mask::{form}")


def hosts(site):
    base = site["DOMAIN"]
    result = {"worker": f"https://{base}"}
    result.update({role: f"https://{label}.{base}" for role, label in HOST_LABELS.items()})
    return result


def pages_origins(site, cf):
    urls = hosts(site)
    runtime = f"{urls['assets']},https://{cf['PAGES_ASSETS']}.pages.dev"
    models = f"{urls['models']},https://{cf['PAGES_MODELS']}.pages.dev" if cf["PAGES_MODELS"] else ""
    return runtime, models


def feedback_url(site):
    return site["FEEDBACK_URL"] or site["FRONTEND_URL"].rstrip("/") + "/docs/feedback/"


def repository_url():
    return f"{os.environ.get('GITHUB_SERVER_URL', 'https://github.com').rstrip('/')}/{os.environ['GITHUB_REPOSITORY']}"


def compute_exports(profile, loaded):
    cf = loaded.get("CF", {})
    site = loaded.get("SITE", {})
    pairs = {}
    extra = []
    tokens = {"worker": "CF_TOKEN_WORKERS", "status": "CF_TOKEN_WORKERS", "cloudflare": "CF_TOKEN_WORKERS", "database": "CF_TOKEN_WORKERS", "pages": "CF_TOKEN_PAGES", "models": "CF_TOKEN_PAGES"}
    if cf:
        if profile in tokens:
            pairs.update(CLOUDFLARE_API_TOKEN=loaded[tokens[profile]], CLOUDFLARE_ACCOUNT_ID=cf["ACCOUNT_ID"])
        extra += list(cf.values())
    if profile == "build":
        urls = hosts(site)
        runtime, models = pages_origins(site, cf)
        pairs.update(
            VITE_WORKER_URL=urls["worker"], VITE_STATS_URL=f"{urls['status']}/stats.json", VITE_STATUS_URL=urls["status"],
            VITE_TURNSTILE_SITE_KEY=site["TURNSTILE_SITE_KEY"], VITE_SITE_URL=site["FRONTEND_URL"],
            VITE_RUNTIME_SOURCES=runtime, VITE_MODEL_SOURCES=models,
        )
    elif profile == "pages":
        pairs.update(PAGES_ASSETS=cf["PAGES_ASSETS"], MAIN_SITE_URL=site["FRONTEND_URL"])
    elif profile == "models":
        pairs.update(PAGES_MODELS=cf["PAGES_MODELS"], MAIN_SITE_URL=site["FRONTEND_URL"])
    elif profile == "status-admin":
        urls = hosts(site)
        pairs.update(
            STATUS_WORKER_URL=urls["statusApi"], TOKEN=loaded["ST_ADMIN_TOKEN"], GATE_TOKEN=loaded["ST_GATE_TOKEN"],
            CF_ACCOUNT_ID=cf["ACCOUNT_ID"], PAGES_TOKEN=loaded["CF_TOKEN_STATUS"], PAGES_PROJECT=cf["PAGES_STATUS"],
            TURSO_URL=loaded["DB_TURSO_URL"], TURSO_TOKEN=loaded["DB_TURSO_TOKEN"],
            SITE_STATUS_URL=urls["status"], SITE_URL=site["FRONTEND_URL"], SITE_FEEDBACK_URL=feedback_url(site), SITE_REPO_URL=repository_url(),
        )
        extra.append(urls["statusApi"])
    elif profile == "cloudflare":
        pairs.update(D1_DATABASE_ID=cf["D1_ID"], D1_NAME=cf["D1_NAME"], WORKER_NAME=cf["WORKER_API"])
    elif profile == "database":
        pairs.update(D1_DATABASE_ID=cf["D1_ID"], D1_NAME=cf["D1_NAME"], PRIVACY_SALT_IP=loaded["TR_PRIVACY_SALT_IP"])
    elif profile == "turso":
        pairs.update(TURSO_URL=loaded["DB_TURSO_URL"], TURSO_TOKEN=loaded["DB_TURSO_TOKEN"])
    return pairs, [item for item in extra if item]


def command_masks(profile):
    loaded = load_inputs(profile)
    _, extra = compute_exports(profile, loaded)
    register_masks(sensitive_values(loaded) + extra)


def command_shell(profile):
    pairs, _ = compute_exports(profile, load_inputs(profile))
    for name, value in pairs.items():
        print(f"export {name}={shlex.quote(value)}")


def toml_value(value):
    return json.dumps(value, ensure_ascii=False)


def read_base(directory, name):
    text = (ROOT / directory / "wrangler.base.toml").read_text(encoding="utf-8").replace("__NAME__", name)
    return re.sub(r'^main\s*=\s*".*"', f'main = "{(ROOT / directory / "src/index.ts").as_posix()}"', text, flags=re.MULTILINE)


def d1_section(cf):
    return f'\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = {toml_value(cf["D1_NAME"])}\ndatabase_id = {toml_value(cf["D1_ID"])}\n'


def vars_section(variables):
    return "\n[vars]\n" + "".join(f"{name} = {toml_value(value)}\n" for name, value in sorted(variables.items()))


def write_private(path, text):
    Path(path).write_text(text, encoding="utf-8")
    os.chmod(path, 0o600)


def render_worker(loaded, config_path, secrets_path):
    site, cf, policy = loaded["SITE"], loaded["CF"], loaded["TR_CONFIG"]
    variables = {
        "CORS_ORIGINS": ",".join(origin.strip() for origin in site["FRONTEND_ORIGINS"].split(",")),
        "ENDPOINT_PRIMARY": hosts(site)["worker"],
        "ENDPOINT_FALLBACK": f"https://{site['FALLBACK']}" if site["FALLBACK"] else "",
    }
    spec = INPUTS["TR_CONFIG"]["keys"]
    variables.update({key: value for key, value in policy.items() if value and spec[key]["to"] == "api"})
    text = read_base("workers/api", cf["WORKER_API"]) + vars_section(variables)
    for key, (binding, namespace, period) in LIMITERS.items():
        text += f'\n[[ratelimits]]\nname = "{binding}"\nnamespace_id = "{namespace}"\nsimple = {{ limit = {int(policy[key])}, period = {period} }}\n'
    write_private(config_path, text + d1_section(cf))
    secrets = {
        INPUTS[name]["to"]["api"]: loaded[name]
        for name in PROFILES["worker"]
        if name in loaded and INPUTS[name]["kind"] == "value" and "api" in INPUTS[name].get("to", {})
    }
    write_private(secrets_path, json.dumps(secrets))


def render_status(loaded, config_path, secrets_path):
    site, cf = loaded["SITE"], loaded["CF"]
    variables = {
        "CF_ACCOUNT_ID": cf["ACCOUNT_ID"], "PAGES_PROJECT": cf["PAGES_STATUS"],
        "SITE_URL": site["FRONTEND_URL"].rstrip("/") + "/", "SITE_FEEDBACK_URL": feedback_url(site),
        "SITE_REPO_URL": repository_url(), "SITE_STATUS_URL": hosts(site)["status"], "LOG_DEBUG": loaded["ST_CONFIG"]["LOG_DEBUG"],
    }
    base = read_base("workers/status", cf["WORKER_STATUS"]).replace("__CRON__", loaded["ST_CONFIG"]["CRON"])
    write_private(config_path, base + d1_section(cf) + vars_section(variables))
    secrets = {"TURSO_URL": loaded["DB_TURSO_URL"], "TURSO_TOKEN": loaded["DB_TURSO_TOKEN"], "PAGES_TOKEN": loaded["CF_TOKEN_STATUS"], "ADMIN_TOKEN": loaded["ST_ADMIN_TOKEN"]}
    write_private(secrets_path, json.dumps(secrets))


def command_verify(target):
    profile = "worker" if target == "worker" else "status"
    loaded = load_inputs(profile)
    pairs, _ = compute_exports(profile, loaded)
    name = loaded["CF"]["WORKER_API" if target == "worker" else "WORKER_STATUS"]
    request = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{pairs['CLOUDFLARE_ACCOUNT_ID']}/workers/scripts",
        headers={"Authorization": f"Bearer {pairs['CLOUDFLARE_API_TOKEN']}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            scripts = json.load(response).get("result") or []
    except urllib.error.HTTPError as error:
        print(f"::error::cannot list Workers (HTTP {error.code})")
        return 1
    except (urllib.error.URLError, ValueError):
        print("::error::cannot reach the Cloudflare API")
        return 1
    if any(script.get("id") == name for script in scripts):
        return 0
    print("::error::the Worker is missing from the account after deploy")
    return 1


def main():
    command = sys.argv[1] if len(sys.argv) > 1 else ""
    try:
        if command == "masks":
            command_masks(sys.argv[2])
        elif command == "shell":
            command_shell(sys.argv[2])
        elif command == "verify":
            return command_verify(sys.argv[2])
        elif command in ("worker", "status"):
            loaded = load_inputs(command)
            register_masks(sensitive_values(loaded))
            (render_worker if command == "worker" else render_status)(loaded, sys.argv[2], sys.argv[3])
        else:
            print("usage: config.py masks|shell|verify|worker|status <args>", file=sys.stderr)
            return 2
    except ConfigFailure:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
