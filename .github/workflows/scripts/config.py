#!/usr/bin/env python3
import base64
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
MANIFEST = json.loads((ROOT / ".github/config/manifest.json").read_text(encoding="utf-8"))
INPUTS = MANIFEST["inputs"]
MASK_MIN_LENGTH = 6

PROFILES = {
    "worker": ["DOMAIN", "SITE", "CF_NAMES", "TR_RUNTIME", "CF_ACCOUNT", "CF_TOKEN_WORKERS", "DB_TURSO_URL", "DB_TURSO_TOKEN", "TR_POLICY", "TR_KEY_GOOGLE", "TR_TURNSTILE_SECRET", "TR_SALT_KEYRING", "TR_SALT_IPHASH", "TR_SECRET_A", "TR_SECRET_B"],
    "status": ["DOMAIN", "SITE", "CF_NAMES", "ST_RUNTIME", "CF_ACCOUNT", "CF_TOKEN_WORKERS", "CF_TOKEN_STATUS", "DB_TURSO_URL", "DB_TURSO_TOKEN", "ST_ADMIN_TOKEN"],
    "pages": ["DOMAIN", "SITE", "CF_NAMES", "CF_ACCOUNT", "CF_TOKEN_PAGES"],
    "models": ["DOMAIN", "SITE", "CF_NAMES", "CF_ACCOUNT", "CF_TOKEN_PAGES"],
    "status-admin": ["DOMAIN", "SITE", "CF_NAMES", "CF_ACCOUNT", "CF_TOKEN_STATUS", "DB_TURSO_URL", "DB_TURSO_TOKEN", "ST_ADMIN_TOKEN"],
    "status-cycle": ["DOMAIN", "ST_ADMIN_TOKEN"],
    "database": ["CF_ACCOUNT", "CF_TOKEN_WORKERS", "TR_SALT_IPHASH"],
    "turso": ["DB_TURSO_URL", "DB_TURSO_TOKEN"],
    "cloudflare": ["CF_ACCOUNT", "CF_TOKEN_WORKERS"],
    "rotate": ["CF_ACCOUNT", "CF_TOKEN_WORKERS", "CF_NAMES"],
    "build": ["DOMAIN", "SITE", "CF_NAMES"],
    "waf": ["DOMAIN", "SITE"],
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


def check_value(label, spec, value, errors):
    kind = spec["type"]
    if kind == "list":
        if any(not item.strip() for item in value.split(",")):
            errors.append(f"{label}: empty list item")
    elif kind == "json":
        try:
            json.loads(value)
        except ValueError:
            errors.append(f"{label}: invalid JSON")
    elif kind == "str":
        if not value:
            errors.append(f"{label}: empty")
    elif not re.fullmatch(TYPE_PATTERNS[kind], value):
        errors.append(f"{label}: expected {kind}")


def load_inputs(profile):
    errors = []
    loaded = {}
    for name in PROFILES[profile]:
        spec = INPUTS[name]
        raw = os.environ.get(name, "")
        if spec["kind"] == "value":
            if not raw.strip():
                if spec.get("required", True):
                    errors.append(f"{name}: not set")
                continue
            loaded[name] = raw.strip()
            continue
        needs_input = any(key_spec["required"] and not key_spec.get("default") for key_spec in spec["keys"].values())
        if not raw.strip() and needs_input:
            errors.append(f"{name}: not set")
            continue
        values = parse_block(name, raw, errors)
        merged = {}
        for key, key_spec in spec["keys"].items():
            value = values.get(key, "") or key_spec.get("default") or ""
            if value == "" and key_spec["required"]:
                errors.append(f"{name}.{key}: missing")
                continue
            if value != "":
                check_value(f"{name}.{key}", key_spec, value, errors)
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
        spec = INPUTS[name]
        if spec["kind"] == "value" and spec.get("sensitive"):
            found.append(value)
        elif spec["kind"] == "block" and spec["store"] == "secret":
            found.extend(v for key, v in value.items() if v and not spec["keys"][key].get("public"))
    return [v for v in found if len(v) >= MASK_MIN_LENGTH]


def url_parts(value):
    if "://" not in value:
        return set()
    parsed = urllib.parse.urlparse(value)
    parts = {parsed.netloc}
    if parsed.scheme == "libsql":
        parts.add("https://" + parsed.netloc)
    return {part for part in parts if part}


def variants(value):
    raw = value.encode("utf-8")
    forms = {value} | url_parts(value)
    forms |= { urllib.parse.quote(value, safe=""), base64.b64encode(raw).decode(), base64.urlsafe_b64encode(raw).decode()}
    forms |= {form.rstrip("=") for form in list(forms)}
    return [form for form in forms if len(form) >= MASK_MIN_LENGTH]


def register_masks(values):
    runner_temp = os.environ.get("RUNNER_TEMP")
    forms = sorted({form for value in values for form in variants(value)})
    for form in forms:
        print(f"::add-mask::{form}")
    if runner_temp and forms:
        target = Path(runner_temp) / ".redact"
        with open(target, "a", encoding="utf-8") as handle:
            handle.write("".join(form + "\n" for form in forms))
        os.chmod(target, 0o600)


def hosts(loaded):
    base = loaded["DOMAIN"]["BASE"]
    layout = MANIFEST["hosts"]
    result = {"worker": f"https://{base}"}
    for role, label in layout.items():
        result[role] = f"https://{label}.{base}"
    return result


def derive(loaded):
    urls = hosts(loaded)
    domain = loaded["DOMAIN"]
    out = {
        "worker_url": urls["worker"],
        "fallback_url": f"https://{domain['FALLBACK']}" if domain.get("FALLBACK") else "",
        "status_url": urls["statusPage"],
        "stats_url": f"{urls['statusPage']}/stats.json",
        "status_api_url": urls["statusApi"],
        "assets_url": urls["assets"],
        "models_url": urls["models"],
    }
    projects = loaded.get("CF_NAMES")
    if projects:
        out["runtime_sources"] = f"{urls['assets']},https://{projects['ASSETS']}.pages.dev"
        if projects.get("MODELS"):
            out["models_sources"] = f"{urls['models']},https://{projects['MODELS']}.pages.dev"
    return out


def compute_exports(profile, loaded):
    derived = derive(loaded) if "DOMAIN" in loaded else {}
    account = loaded.get("CF_ACCOUNT", {})
    site = loaded.get("SITE", {})
    projects = loaded.get("CF_NAMES", {})
    pairs = {}
    extra = []
    if profile in ("worker", "status"):
        pairs.update(CLOUDFLARE_API_TOKEN=loaded["CF_TOKEN_WORKERS"], CLOUDFLARE_ACCOUNT_ID=account["ACCOUNT_ID"])
    elif profile == "pages":
        frontend = site["FRONTEND_URL"]
        pairs.update(
            CLOUDFLARE_API_TOKEN=loaded["CF_TOKEN_PAGES"], CLOUDFLARE_ACCOUNT_ID=account["ACCOUNT_ID"],
            CF_ASSETS_PROJECT=projects["ASSETS"], MAIN_SITE_URL=frontend,
        )
    elif profile == "models":
        pairs.update(
            CLOUDFLARE_API_TOKEN=loaded["CF_TOKEN_PAGES"], CLOUDFLARE_ACCOUNT_ID=account["ACCOUNT_ID"],
            CF_MODELS_PROJECT=projects.get("MODELS", ""), MODELS_SOURCES=derived.get("models_sources", ""), MAIN_SITE_URL=site["FRONTEND_URL"],
        )
    elif profile == "status-admin":
        pairs.update(
            STATUS_WORKER_URL=derived["status_api_url"], TOKEN=loaded["ST_ADMIN_TOKEN"],
            CF_ACCOUNT_ID=account["ACCOUNT_ID"], CF_PAGES_API_TOKEN=loaded["CF_TOKEN_STATUS"], PAGES_STATUS=projects["STATUS"],
            TURSO_URL=loaded["DB_TURSO_URL"], TURSO_TOKEN=loaded["DB_TURSO_TOKEN"],
            STATUS_URL=derived["status_url"], MAIN_SITE_URL=site["FRONTEND_URL"], FEEDBACK_URL=feedback_url(site),
            GITHUB_REPO_URL=repository_url(),
        )
        extra.append(derived["status_api_url"])
    elif profile == "status-cycle":
        pairs.update(WORKER_URL=derived["status_api_url"], TOKEN=loaded["ST_ADMIN_TOKEN"])
        extra.append(derived["status_api_url"])
    elif profile == "database":
        pairs.update(CLOUDFLARE_API_TOKEN=loaded["CF_TOKEN_WORKERS"], CLOUDFLARE_ACCOUNT_ID=account["ACCOUNT_ID"], D1_DATABASE_ID=account["D1_ID"], D1_NAME=account["D1_NAME"], SALT_IPHASH=loaded["TR_SALT_IPHASH"])
    elif profile == "turso":
        pairs.update(TURSO_URL=loaded["DB_TURSO_URL"], TURSO_TOKEN=loaded["DB_TURSO_TOKEN"])
    elif profile == "rotate":
        pairs.update(CLOUDFLARE_API_TOKEN=loaded["CF_TOKEN_WORKERS"], CLOUDFLARE_ACCOUNT_ID=account["ACCOUNT_ID"], WORKER_NAME=projects["WORKER_TRANSLATE"])
    elif profile == "cloudflare":
        pairs.update(CLOUDFLARE_API_TOKEN=loaded["CF_TOKEN_WORKERS"], CLOUDFLARE_ACCOUNT_ID=account["ACCOUNT_ID"], D1_DATABASE_ID=account["D1_ID"], D1_NAME=account["D1_NAME"])
    elif profile == "build":
        pairs.update(
            VITE_WORKER_URL=derived["worker_url"], VITE_STATS_URL=derived["stats_url"], VITE_STATUS_URL=derived["status_url"],
            VITE_TURNSTILE_SITE_KEY=site["TURNSTILE_SITE_KEY"], VITE_SITE_URL=site["FRONTEND_URL"],
            VITE_RUNTIME_SOURCES=derived["runtime_sources"], VITE_MODEL_SOURCES=derived.get("models_sources", ""),
        )
    if account:
        extra += [account["ACCOUNT_ID"], account["D1_ID"]]
    return pairs, extra


def command_masks(profile):
    loaded = load_inputs(profile)
    pairs, extra = compute_exports(profile, loaded)
    register_masks(sensitive_values(loaded) + [value for value in extra if value])


def command_shell(profile):
    loaded = load_inputs(profile)
    pairs, _ = compute_exports(profile, loaded)
    for name, value in pairs.items():
        print(f"export {name}={shlex.quote(value)}")


def feedback_url(site):
    return site.get("FEEDBACK_URL") or site["FRONTEND_URL"].rstrip("/") + "/docs/feedback/"


def repository_url():
    server = os.environ.get("GITHUB_SERVER_URL", "https://github.com").rstrip("/")
    return f"{server}/{os.environ['GITHUB_REPOSITORY']}"


def toml_value(value):
    return json.dumps(value, ensure_ascii=False)


def read_base(directory, name):
    text = (ROOT / directory / "wrangler.base.toml").read_text(encoding="utf-8").replace("__NAME__", name)
    entry = (ROOT / directory / "src/index.ts").as_posix()
    return re.sub(r'^main\s*=\s*".*"', f'main = "{entry}"', text, flags=re.MULTILINE)


def d1_section(account):
    return f'\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = {toml_value(account["D1_NAME"])}\ndatabase_id = {toml_value(account["D1_ID"])}\n'


def render_worker(loaded, config_path, secrets_path):
    derived = derive(loaded)
    runtime = loaded["TR_RUNTIME"]
    policy = loaded["TR_POLICY"]
    variables = {"ALLOWED_ORIGINS": ",".join(item.strip() for item in loaded["SITE"]["FRONTEND_ORIGINS"].split(",")), "SERVICE_URL": derived["worker_url"], "FALLBACK_URL": derived["fallback_url"]}
    for block_name, block in (("TR_RUNTIME", runtime), ("TR_POLICY", policy)):
        spec = INPUTS[block_name]["keys"]
        for key, value in block.items():
            target = spec[key].get("delivers", {}).get("worker")
            if target:
                variables[target] = value
    lines = [read_base("workers/api", loaded["CF_NAMES"]["WORKER_TRANSLATE"]), "\n[vars]\n"]
    lines += [f"{name} = {toml_value(value)}\n" for name, value in sorted(variables.items())]
    limiters = [("RATE_LIMITER", 1001, policy["LIMIT_RATE_PER_MINUTE"], 60), ("BURST_LIMITER", 1002, policy["LIMIT_BURST_PER_10S"], 10), ("SESSION_LIMITER", 1003, policy["LIMIT_SESSION_PER_MINUTE"], 60)]
    for name, namespace, limit, period in limiters:
        lines.append(f'\n[[ratelimits]]\nname = "{name}"\nnamespace_id = "{namespace}"\nsimple = {{ limit = {int(limit)}, period = {period} }}\n')
    lines.append(d1_section(loaded["CF_ACCOUNT"]))
    Path(config_path).write_text("".join(lines), encoding="utf-8")
    secrets = {}
    for name, spec in INPUTS.items():
        target = spec.get("delivers", {}).get("worker")
        if spec["kind"] == "value" and spec.get("sensitive") and target and name in loaded:
            secrets[target] = loaded[name]
    optional = [name for name, spec in INPUTS.items() if name.startswith("TR_KEY_") and not spec.get("required", True)]
    for name in optional:
        value = os.environ.get(name, "").strip()
        if value:
            secrets[INPUTS[name]["delivers"]["worker"]] = value
            register_masks([value])
    Path(secrets_path).write_text(json.dumps(secrets), encoding="utf-8")


def render_status(loaded, config_path, secrets_path):
    derived = derive(loaded)
    site = loaded["SITE"]
    frontend = site["FRONTEND_URL"].rstrip("/") + "/"
    variables = {
        "PAGES_STATUS": loaded["CF_NAMES"]["STATUS"], "CF_ACCOUNT_ID": loaded["CF_ACCOUNT"]["ACCOUNT_ID"],
        "MAIN_SITE_URL": frontend, "FEEDBACK_URL": feedback_url(site), "GITHUB_REPO_URL": repository_url(),
        "STATUS_URL": derived["status_url"], "DEBUG": loaded["ST_RUNTIME"]["DEBUG"],
    }
    base = read_base("workers/status", loaded["CF_NAMES"]["WORKER_STATUS"]).replace("__CRON__", loaded["ST_RUNTIME"]["CRON"])
    lines = [base, d1_section(loaded["CF_ACCOUNT"]), "\n[vars]\n"]
    lines += [f"{name} = {toml_value(value)}\n" for name, value in variables.items()]
    Path(config_path).write_text("".join(lines), encoding="utf-8")
    secrets = {
        "TURSO_URL": loaded["DB_TURSO_URL"], "TURSO_TOKEN": loaded["DB_TURSO_TOKEN"],
        "CF_PAGES_API_TOKEN": loaded["CF_TOKEN_STATUS"], "ADMIN_API_SECRET": loaded["ST_ADMIN_TOKEN"],
    }
    Path(secrets_path).write_text(json.dumps(secrets), encoding="utf-8")


def zone_hosts(loaded):
    domain = loaded["DOMAIN"]
    zones = [domain["BASE"]] + ([domain["FALLBACK"]] if domain.get("FALLBACK") else [])
    retiring = [h.strip() for h in domain.get("RETIRING", "").split(",") if h.strip()]
    result = {}
    for zone in zones:
        members = [zone] + [h for h in retiring if h != zone and h.endswith("." + zone)]
        result[zone] = members
    return result


def render_waf(loaded):
    paths = MANIFEST["routes"]["current"] + MANIFEST["routes"]["legacy"]
    origins = [item.strip() for item in loaded["SITE"]["FRONTEND_ORIGINS"].split(",")]
    quote = lambda items: " ".join(json.dumps(item) for item in items)
    layout = MANIFEST["hosts"]
    out = ["## Cloudflare WAF rules for this configuration", ""]
    for zone, members in zone_hosts(loaded).items():
        out += [f"### Zone `{zone}`", "", "Custom rule, action Block:", "", "```", f"(http.host in {{{quote(members)}}} and (not http.request.uri.path in {{{quote(paths)}}} or not http.request.headers[\"origin\"][0] in {{{quote(origins)}}}))", "```", "",
                "Rate limiting rule:", "", "```", f"(http.host in {{{quote(members)}}} and http.request.uri.path in {{{quote(paths)}}})", "```", ""]
    base = loaded["DOMAIN"]["BASE"]
    static_hosts = [f"{layout[role]}.{base}" for role in ("statusPage", "assets", "models")]
    referrers = " and ".join(f'not starts_with(http.referer, "{origin}/")' for origin in origins)
    out += [f"### Zone `{base}`, static hosts", "", "Custom rule, action Block: only the web app, or this zone's own Workers, may read status, runtime assets and models:", "", "```",
            f"(http.host in {{{quote(static_hosts)}}} and not http.request.headers[\"origin\"][0] in {{{quote(origins)}}} and {referrers} and cf.worker.upstream_zone ne \"{base}\")", "```", ""]
    out += [f"### Zone `{base}`, status admin", "", "Custom rule, action Block (replace the placeholder with the value of ST_ADMIN_TOKEN):", "", "```",
            f"(http.host eq \"{layout['statusApi']}.{base}\" and http.request.headers[\"x-gateway-automation-token\"][0] ne \"<ST_ADMIN_TOKEN>\")", "```", ""]
    return "\n".join(out)


def command_waf():
    loaded = load_inputs("waf")
    text = render_waf(loaded)
    target = os.environ.get("GITHUB_STEP_SUMMARY")
    if target:
        with open(target, "a", encoding="utf-8") as handle:
            handle.write(text + "\n")
    else:
        print(text)


def command_verify(target):
    profile = "worker" if target == "worker" else "status"
    loaded = load_inputs(profile)
    pairs, _ = compute_exports(profile, loaded)
    key = "WORKER_TRANSLATE" if target == "worker" else "WORKER_STATUS"
    name = loaded["CF_NAMES"][key]
    request = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{pairs['CLOUDFLARE_ACCOUNT_ID']}/workers/scripts",
        headers={"Authorization": f"Bearer {pairs['CLOUDFLARE_API_TOKEN']}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            scripts = json.load(response).get("result") or []
    except urllib.error.HTTPError as error:
        print(f"::error::cannot list Workers (HTTP {error.code}); the token needs Account: Workers Scripts")
        return 1
    except (urllib.error.URLError, ValueError):
        print("::error::cannot reach the Cloudflare API to verify the deployment")
        return 1
    if any(script.get("id") == name for script in scripts):
        print(f"verified: worker {name} exists in the account")
        return 0
    print(f"::error::worker {name} was not found in the account after deploy")
    return 1


def command_docs(check):
    from_manifest = render_docs()
    target = ROOT / "docs/github/VARIABLES.md"
    if check:
        router = (ROOT / "workers/api/src/app/router.ts").read_text(encoding="utf-8")
        declared = sorted(re.findall(r'^\s*"(/[a-z-]+)":', router, flags=re.MULTILINE))
        expected = sorted(MANIFEST["routes"]["current"] + MANIFEST["routes"]["legacy"])
        if declared != expected:
            print("::error::manifest routes differ from workers/api/src/app/router.ts")
            return 1
        if not target.exists() or target.read_text(encoding="utf-8") != from_manifest:
            print("::error::docs/github/VARIABLES.md is out of date; run: python3 .github/workflows/scripts/config.py docs")
            return 1
        return 0
    target.write_text(from_manifest, encoding="utf-8")
    return 0


def delivery(spec, key_spec=None):
    source = key_spec or spec
    delivers = source.get("delivers", {})
    if key_spec is None and spec["kind"] == "value" and spec.get("sensitive"):
        if "worker" in delivers or "status" in delivers:
            return "Cloudflare secret (hidden)"
        return "CI only"
    if "worker" in delivers:
        return "Worker variable (visible to dashboard users)"
    if "status" in delivers:
        return "Cloudflare secret (hidden)"
    if delivers.get("wrangler") == "ratelimits":
        return "Rate-limiter binding (deploy config)"
    return "Build time or CI only"


def render_docs():
    out = ["# Configuration reference", "", "Generated from `.github/config/manifest.json` by `config.py docs`. Do not edit by hand.", "",
           "Every name lives in exactly one place. Blocks hold one `KEY=VALUE` pair per line; blank lines and lines that start with `#` are ignored.", "",
           "Credentials are never merged into blocks. Secret blocks exist so that tuning values never appear in public Actions logs.", ""]
    for name, spec in INPUTS.items():
        store = "Secret" if spec["store"] == "secret" else "Variable"
        out += [f"## `{name}`", "", f"- Stored as: GitHub repository **{store}**", f"- Type: {'block' if spec['kind'] == 'block' else 'single value'}", f"- Purpose: {spec['description']}"]
        if spec["kind"] == "value":
            out += [f"- Delivered as: {delivery(spec)}", f"- Required: {'yes' if spec.get('required', True) else 'no'}", f"- Example: `{spec['example']}`", ""]
            continue
        out += ["", "| Key | Required | Type | Delivered as | Format example | Meaning |", "| --- | --- | --- | --- | --- | --- |"]
        for key, key_spec in spec["keys"].items():
            if key_spec.get("default"):
                required = f"no, default `{key_spec['default']}`"
            else:
                required = "yes" if key_spec["required"] else "no"
            example = key_spec.get("example", "")
            out.append(f"| `{key}` | {required} | {key_spec['type']} | {delivery(spec, key_spec)} | `{example}` | {key_spec['description']}{(' Used for: ' + key_spec['usage']) if key_spec.get('usage') else ''} |")
        out.append("")
    return "\n".join(out).rstrip() + "\n"


def main():
    if len(sys.argv) < 2:
        print("usage: config.py masks|shell|verify|worker|status|waf|docs|check-docs <args>", file=sys.stderr)
        return 2
    command = sys.argv[1]
    try:
        if command == "docs":
            return command_docs(False)
        if command == "check-docs":
            return command_docs(True)
        if command == "verify":
            return command_verify(sys.argv[2])
        if command == "waf":
            command_waf()
            return 0
        if command == "masks":
            command_masks(sys.argv[2])
            return 0
        if command == "shell":
            command_shell(sys.argv[2])
            return 0
        if command in ("worker", "status"):
            loaded = load_inputs(command)
            register_masks(sensitive_values(loaded))
            (render_worker if command == "worker" else render_status)(loaded, sys.argv[2], sys.argv[3])
            os.chmod(sys.argv[2], 0o600)
            os.chmod(sys.argv[3], 0o600)
            print(f"config ok: {command}")
            return 0
    except ConfigFailure:
        return 1
    print(f"unknown command: {command}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
