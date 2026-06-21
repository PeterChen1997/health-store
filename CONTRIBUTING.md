# Contributing

Thank you for your interest in health-store!

## Development Setup

**Requirements**

| Tool | Version |
| --- | --- |
| Node.js | 20 or newer |
| pnpm | 9 or newer |
| Python | 3.10 or newer |

```bash
pnpm install
pnpm db:migrate
```

See [Quick Start](README.md#quick-start) for full setup including the OCR service.

## Running Tests and Checks

```bash
# TypeScript unit tests
pnpm --filter web test

# ESLint
pnpm --filter web lint

# TypeScript type checking
pnpm --filter web typecheck

# Format
pnpm --filter web format

# Python OCR service tests
cd services/ocr
python -m unittest test_main -v
```

## Pull Request Guidelines

- Keep changes focused. One concern per PR.
- Add or update tests for new behaviour.
- Run `lint`, `typecheck`, and `test` before submitting.
- Write a short *why* in the PR description, not just a *what*.
- PRs are opened as drafts by default; mark ready when checks pass.

## Code Conventions

- TypeScript: use `type` (not `interface`), no `as any`, arrays with `.at(0)` not `[0]`.
- Zod for all external input validation at API boundaries.
- No comments that just restate what the code does — only add a comment when the *why* is non-obvious.
