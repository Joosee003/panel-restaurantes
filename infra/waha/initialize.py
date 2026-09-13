#!/usr/bin/env python3
"""Create private deployment files without printing secrets or changing a service."""

import argparse
import hashlib
import os
from pathlib import Path
import secrets
from urllib.parse import urlsplit


def https_origin(value):
    parsed = urlsplit(value)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username
            or parsed.password or parsed.query or parsed.fragment
            or parsed.path not in ("", "/") or any(c.isspace() for c in value)):
        raise argparse.ArgumentTypeError("Use an HTTPS origin without a path or credentials")
    return value.rstrip("/")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, type=https_origin)
    parser.add_argument("--output-dir", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    target = args.output_dir.resolve()
    if not target.is_dir():
        parser.error("The output directory must already exist")
    paths = [target / ".env", target / "backend-secrets.env"]
    if any(p.exists() or p.is_symlink() for p in paths):
        parser.error("Private files already exist; refusing to replace credentials")
    key = secrets.token_hex(32)
    webhook_secret = secrets.token_hex(32)
    values = [
        f"WAHA_BASE_URL={args.base_url}\n"
        f"WAHA_API_KEY=sha512:{hashlib.sha512(key.encode()).hexdigest()}\n"
        "WAHA_LOCAL_PORT=3000\nWAHA_MEMORY_LIMIT=1g\nWAHA_CPU_LIMIT=1.0\n",
        "# Private server-side application variables. Never use NEXT_PUBLIC_.\n"
        f"WAHA_BASE_URL={args.base_url}\nWAHA_API_KEY={key}\n"
        f"WAHA_WEBHOOK_SECRET={webhook_secret}\n"
        "GASTROHELP_WAHA_WEBHOOK_URL=https://panel.gastrohelp.es/api/whatsapp/waha/webhook\n",
    ]
    created = []
    try:
        for path, value in zip(paths, values):
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            created.append(path)
            with os.fdopen(fd, "w") as output:
                output.write(value)
    except Exception:
        for path in created:
            path.unlink(missing_ok=True)
        raise
    print("Created .env and backend-secrets.env with mode 0600. No service was changed.")
    print("Transfer backend-secrets.env through the deployment secret store; never paste it in chat.")


if __name__ == "__main__":
    main()
