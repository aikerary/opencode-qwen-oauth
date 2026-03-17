# Contributing to opencode-qwen-oauth

Thank you for your interest in contributing! This plugin adds Alibaba Cloud OAuth (device code + PKCE) authentication to [OpenCode](https://github.com/sst/opencode), letting users access Qwen models without an API key.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [How to Contribute](#how-to-contribute)
- [Commit Convention](#commit-convention)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)

---

## Code of Conduct

Be respectful. Harassment, discrimination, or toxic behavior of any kind will not be tolerated. We're here to build useful software together.

---

## Getting Started

Before contributing, make sure you understand what this plugin does:

- It implements the **OAuth 2.0 Device Authorization Grant** (RFC 8628) with **PKCE** against `chat.qwen.ai`
- It hooks into OpenCode's plugin system via `@opencode-ai/plugin`
- It transparently manages token refresh and URL rewriting for DashScope endpoints

---

## Development Setup

**Prerequisites:** [Bun](https://bun.sh) ≥ 1.x, Node.js ≥ 20, TypeScript knowledge.

```bash
# 1. Fork and clone the repo
git clone https://github.com/<your-username>/opencode-qwen-oauth.git
cd opencode-qwen-oauth

# 2. Install dependencies
bun install

# 3. Type-check
bun run typecheck

# 4. Build
bun run build
```

To test the plugin locally with OpenCode, copy it into your plugins folder:

```bash
cp -r . ~/.config/opencode/plugins/qwen-auth
```

---

## How to Contribute

### Bug fixes

1. Open an issue first (or comment on an existing one) so we can discuss the root cause.
2. Fork, fix, and open a PR with a clear description of what was broken and how you fixed it.

### New features

1. Open an issue describing the feature and the use case before starting work.
2. Keep changes focused — one feature per PR.

### Documentation

Improvements to `README.md`, code comments, or this file are always welcome. No issue needed.

### Tests

There are currently no automated tests. Adding unit tests (e.g. for `generatePKCE`, `normalizeEndpoint`, `refreshQwenToken`) is a great first contribution.

---

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`.

Examples:

```
feat(auth): add support for CN region DashScope endpoint
fix(token): handle 401 response during polling without crashing
docs: clarify resource_url rewriting in README
```

---

## Pull Request Process

1. Branch from `main` with a descriptive name: `feat/cn-region`, `fix/polling-backoff`.
2. Keep commits atomic and well-described.
3. Update `README.md` if your change affects usage or configuration.
4. Make sure `bun run typecheck` passes with no errors.
5. Fill in the PR template (what, why, how to test).
6. A maintainer will review within a few days. Be patient and responsive to feedback.

---

## Reporting Issues

When filing a bug, please include:

- OpenCode version (`opencode --version`)
- Bun version (`bun --version`)
- The relevant section of `opencode.json` (redact any tokens)
- What you expected vs. what happened
- Any error messages or logs

For **security vulnerabilities** (e.g. token leakage), please **do not open a public issue**. Contact the maintainer directly via email or a private GitHub security advisory.

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
