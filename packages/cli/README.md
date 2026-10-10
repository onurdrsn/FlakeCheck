# @onurdrsn/flakecheck

[![npm version](https://img.shields.io/npm/v/@onurdrsn/flakecheck.svg?style=flat-square)](https://www.npmjs.com/package/@onurdrsn/flakecheck)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](https://opensource.org/licenses/MIT)

Official command-line interface (CLI) for **FlakeCheck** — the automated CI test reliability platform that eliminates false alarms, isolates flaky tests, and protects developer release velocity.

---

## 🚀 Quick Start

### 1. Installation

Install the CLI globally with npm:

```bash
npm install -g @onurdrsn/flakecheck
```

Or run directly with `npx`:

```bash
npx @onurdrsn/flakecheck --help
```

---

## 🛠️ Usage & Commands

### Initialize Repository Configuration

Connect your project to the FlakeCheck Gateway. Create `.flakecheckrc.json` in your project root:

```bash
flakecheck init \
  --gateway https://flakecheck.domain \
  --repo owner/repo-name \
  --token <YOUR_PROJECT_TOKEN>
```

> **Note:** Generate your repository project token from the FlakeCheck Web Dashboard under **Account Settings**.

---

### Ingest Test Reports

Stream test execution output directly to FlakeCheck. Automatically detects current Git commit and branch:

```bash
# JUnit XML (Jest, Vitest, Pytest, Go, Maven, Gradle)
flakecheck ingest ./test-results/*.xml --format junit

# Jest / Vitest (JSON output)
flakecheck ingest ./jest-results.json --format jest

# Playwright Test
flakecheck ingest ./playwright-report.json --format playwright

# Go Test JSON
flakecheck ingest ./go-test.json --format go
```

You can also explicitly pass git metadata if running in non-standard environments:

```bash
flakecheck ingest ./results.xml --format junit --commit <GIT_SHA> --branch <BRANCH_NAME>
```

---

### Analyze Repository Window

Run deterministic classification across recent test runs:

```bash
# Pretty terminal output with classification breakdown
flakecheck analyze

# Inspect a larger window
flakecheck analyze --window 50

# Output raw JSON for pipeline automation
flakecheck analyze --json

# Fail CI pipeline (exit 2) if flakes are detected
flakecheck analyze --fail-on-flake
```

---

### Generate CI & Pull Request Reports

Generate formatted Markdown reports with status badges and metrics (automatically writes to `$GITHUB_STEP_SUMMARY` in GitHub Actions):

```bash
flakecheck report --dashboard https://flakecheck.domain/dashboard
```

---

### Diagnostic Health Check

Verify local configuration, gateway reachability, and backend microservice health:

```bash
flakecheck doctor
```

---

### Manage Flakes & Quarantine

Inspect active flaky tests:

```bash
# Table output
flakecheck flakes

# JSON output
flakecheck flakes --format json

# Quarantine a problematic test
flakecheck quarantine <testId> --action add --reason "Under investigation"

# Graduate a fixed test from quarantine
flakecheck quarantine <testId> --action remove
```

---

## ⚙️ Configuration File (`.flakecheckrc.json`)

The `flakecheck init` command creates a local `.flakecheckrc.json` file in your repository:

```json
{
  "gatewayUrl": "https://flakecheck.domain",
  "repo": "owner/repository",
  "token": "fc_xxxxxxxxxxxxxxxxxxxxxxxx"
}
```

---

## 📄 License

MIT © [Onur Dursun](https://github.com/onurdrsn)
