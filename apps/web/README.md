# health-store web app

This package contains the Next.js application for health-store.

For the full product README, screenshots, architecture, and setup guide, see:

- [English README](../../README.md)
- [中文 README](../../README.zh-CN.md)

Common package commands:

```bash
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web test
pnpm --filter web lint
pnpm --filter web db:migrate
```

The app reads `DATABASE_PATH` when provided; otherwise it defaults to `../../data/health.db` from this package directory.
