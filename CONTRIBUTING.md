# Contributing to HoverSense

Thank you for your interest in contributing! HoverSense is an educational project, and all improvements that make the profiling pipeline more transparent, accurate, or legible are welcome.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR-USERNAME/hoversense.git`
3. Create a feature branch: `git checkout -b feat/your-feature-name`
4. Make your changes
5. Run the tests: `npm test`
6. Commit with a descriptive message
7. Push and open a Pull Request

## Development Setup

```bash
# No install step needed for the app itself
# Start the dev server
npm run dev
# or
npx serve . -p 3000
```

## What We Welcome

- Bug fixes in the rule engine, ML model, or dashboard rendering
- Improved heuristic thresholds backed by citations
- New content cards or categories
- Accessibility improvements
- Documentation improvements and corrections to the research citations
- Additional unit tests

## What We Ask You Not To Do

- Do not add external runtime dependencies (this is intentionally zero-dependency)
- Do not add server-side components, databases, or any form of data persistence
- Do not introduce real user tracking or analytics SDKs — this project's integrity depends on it being purely educational

## Code Style

- ES2022 vanilla JavaScript with ES Modules
- No build step, no transpiler
- Comments that explain *why*, not just *what*
- Keep functions pure where possible; flag stateful operations clearly

## Commit Message Format

```
type(scope): short description

Longer explanation if needed.

Refs: #issue-number
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `style`, `chore`

## Reporting Bugs

Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) template. Include your browser, OS, and a clear description of the unexpected behavior.

## Code of Conduct

By participating, you agree to our [Code of Conduct](CODE_OF_CONDUCT.md).
