#!/usr/bin/env python3
"""Read-only WAHA checks. Never creates a session, scans a QR or sends a message."""

import argparse
import hashlib
import hmac
import json
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import urllib.error
import urllib.request
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
IMAGE = "devlikeapro/waha:gows-2026.8.2@sha256:23f2d002d262b54c711af02b5fe79b1948bbf31e6b64cf7776cd6bd2f7477b47"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_private_env(path):
    require(not path.is_symlink(), "Private configuration must not be a symlink")
    mode = path.stat().st_mode
    require(stat.S_ISREG(mode) and not mode & 0o077, "Private files must have mode 0600")
    result = {}
    for line in path.read_text().splitlines():
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        require(separator and re.fullmatch(r"[A-Z][A-Z0-9_]*", key), "Invalid configuration line")
        require(key not in result, "Duplicate configuration key")
        require(not any(c.isspace() for c in value), "Unexpected whitespace in configuration")
        result[key] = value
    return result


class NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def get(base, path, key=None):
    headers = {"Accept": "application/json"}
    if key:
        headers["X-Api-Key"] = key
    request = urllib.request.Request(base + path, headers=headers)
    opener = urllib.request.build_opener(NoRedirects())
    try:
        with opener.open(request, timeout=15) as response:
            body = response.read(1_000_001)
            require(len(body) <= 1_000_000, "Unexpectedly large response")
            return response.status, json.loads(body)
    except urllib.error.HTTPError as error:
        return error.code, None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-dir", type=Path, default=ROOT)
    parser.add_argument("--docker", action="store_true", help="Validate Compose and Docker host (read-only)")
    parser.add_argument("--network", action="store_true", help="GET-only HTTPS checks using private backend credentials")
    args = parser.parse_args()
    server = read_private_env(args.env_dir / ".env")
    backend = read_private_env(args.env_dir / "backend-secrets.env")
    base = server.get("WAHA_BASE_URL", "")
    parsed = urlsplit(base)
    require(parsed.scheme == "https" and parsed.hostname and not parsed.username
            and not parsed.password and not parsed.query and not parsed.fragment
            and parsed.path in ("", "/"), "An HTTPS origin is required")
    require(not parsed.hostname.endswith("example.com"), "Replace the example hostname before deployment")
    require(base == backend.get("WAHA_BASE_URL"), "Backend and service must use the same HTTPS origin")
    raw_key = backend.get("WAHA_API_KEY", "")
    require(bool(re.fullmatch(r"[a-f0-9]{64}", raw_key)), "Generate a fresh 32-byte API key")
    expected = "sha512:" + hashlib.sha512(raw_key.encode()).hexdigest()
    require(hmac.compare_digest(server.get("WAHA_API_KEY", ""), expected), "API key hash does not match")
    secret = backend.get("WAHA_WEBHOOK_SECRET", "")
    require(bool(re.fullmatch(r"[a-f0-9]{64}", secret)) and secret != raw_key, "Use an independent webhook secret")
    require(backend.get("GASTROHELP_WAHA_WEBHOOK_URL") ==
            "https://panel.gastrohelp.es/api/whatsapp/waha/webhook", "Unexpected webhook destination")
    require(re.fullmatch(r"[0-9]{2,5}", server.get("WAHA_LOCAL_PORT", ""))
            and 1024 <= int(server["WAHA_LOCAL_PORT"]) <= 65535, "Use an unprivileged local port")
    print("OK: private files, independent secrets, API hash and HTTPS configuration")
    if args.docker:
        require(shutil.which("docker"), "Docker is not installed on this host")
        result = subprocess.run(["docker", "info", "--format", "{{.OSType}}/{{.Architecture}}"],
                                text=True, capture_output=True, check=False)
        require(result.returncode == 0, "Cannot access Docker daemon")
        require(result.stdout.strip() in ("linux/x86_64", "linux/amd64"),
                "Pinned GOWS image requires a linux/amd64 host; do not force emulation")
        result = subprocess.run(["docker", "compose", "--env-file", str(args.env_dir / ".env"),
                                 "-f", str(ROOT / "compose.yaml"), "config", "--format", "json"],
                                text=True, capture_output=True, check=False)
        require(result.returncode == 0, "Compose validation failed; check version and configuration privately")
        config = json.loads(result.stdout)
        service = config["services"]["waha"]
        require(service["image"] == IMAGE, "Unexpected image or unpinned digest")
        require(all(p.get("host_ip") == "127.0.0.1" for p in service["ports"]), "WAHA must bind only to loopback")
        require(not service.get("privileged", False), "WAHA must not run privileged")
        print("OK: Docker architecture, pinned image and loopback-only Compose")
    if args.network:
        status, _ = get(base, "/api/sessions")
        require(status in (401, 403), "Public API is not rejecting unauthenticated access")
        status, _ = get(base, "/api/sessions", "invalid-preflight-key")
        require(status in (401, 403), "Public API is not rejecting an invalid API key")
        status, version = get(base, "/api/server/version", raw_key)
        require(status == 200 and isinstance(version, dict), "Authenticated version check failed")
        require(version.get("version") == "2026.8.2" and version.get("engine") == "GOWS", "Unexpected running version or engine")
        status, sessions = get(base, "/api/sessions", raw_key)
        require(status == 200 and isinstance(sessions, list), "Authenticated session check failed")
        counts = {}
        for session in sessions:
            state = str(session.get("status", "unknown"))
            require(re.fullmatch(r"[A-Z_]+|unknown", state), "Unexpected session state")
            counts[state] = counts.get(state, 0) + 1
        print("OK: API authentication; running version 2026.8.2 / GOWS")
        print("Session state counts only: " + json.dumps(counts, sort_keys=True))
    print("No messages sent. QR pairing, acknowledgements and restaurant isolation still require a pilot.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, json.JSONDecodeError) as error:
        # Do not dump HTTP bodies, request headers or private environment values.
        print("Preflight failed: " + str(error), file=sys.stderr)
        sys.exit(1)
