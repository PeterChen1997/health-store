# Security Policy

## Intended Use — Local, Single-User Only

health-store is a **local, single-user application with no authentication layer**.

It is designed to run exclusively on `localhost`. **Do not expose it to the internet or a shared network.** Anyone who can reach the server can read and modify all health data.

For local use the risk is low, but be aware:

- The web app binds to all interfaces by default (`0.0.0.0`). If you run it on a machine accessible to others, restrict it with `next dev --hostname 127.0.0.1`.
- API keys (LLM provider, etc.) are read from `.env.local`. Keep that file out of version control.

## Sensitive Data

- Keep `data/`, `.env.local`, uploaded reports, and any real health screenshots out of git.
- The committed README screenshots contain **synthetic demo data only** — no real health records.
- AI-generated health explanations are for personal reference only — not medical diagnosis.

## Reporting a Vulnerability

If you find a security issue, please open a [GitHub Issue](../../issues) with the label `security`, or contact the maintainer directly via GitHub. Please do not include exploit details in public issues until a fix is in place.
