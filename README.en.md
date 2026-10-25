<p align="center">
  <a href="https://s.flyfish.dev">
    <img src="web/static/brand.svg" width="76" height="76" alt="AI Shortlink logo">
  </a>
</p>

<h1 align="center">AI Shortlink</h1>

[![Deploy to VibeNest](https://vibenest.net/deploy-to-vibenest.svg)](https://vibenest.net/deploy?repo=https://github.com/NikitaBabenko/shortlink)

[VibeNest setup and verification status](VIBENEST.md)

<p align="center">
  <strong>Keep every shared entry point controllable after it leaves your hands.</strong>
  <br>
  A self-hosted short link and live QR platform built for ownership, review, analytics, and responsible AI-assisted operations.
</p>

<p align="center">
  <a href="README.md">简体中文</a> · <a href="README.en.md">English</a>
</p>

<p align="center">
  <a href="https://github.com/flyfish-dev/shortlink/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/flyfish-dev/shortlink/ci.yml?branch=main&style=flat-square&label=CI"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0--only-5A31F4?style=flat-square"></a>
  <img alt="Go" src="https://img.shields.io/badge/Go-1.23+-00ADD8?style=flat-square&logo=go&logoColor=white">
  <img alt="Docker" src="https://img.shields.io/badge/Docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white">
  <a href="https://s.flyfish.dev"><img alt="Production" src="https://img.shields.io/badge/production-s.flyfish.dev-111827?style=flat-square"></a>
</p>

<p align="center">
  <a href="https://s.flyfish.dev">Live product</a>
  · <a href="#why-ai-shortlink">Principles</a>
  · <a href="#capabilities">Capabilities</a>
  · <a href="#quick-start">Quick start</a>
  · <a href="ROADMAP.md">Roadmap</a>
  · <a href="CONTRIBUTING.md">Contributing</a>
</p>

## Product preview

![AI Shortlink modern admin console demo](docs/assets/ai-shortlink-demo.gif)

The recording comes from a real instance and moves through the operations dashboard, compact short-link actions, live QR entry configuration, QR pools, and SVG / PNG / WEBP publishing. The current production build is available at [s.flyfish.dev](https://s.flyfish.dev).

## Why AI Shortlink

Once a link or QR code is printed, published, or forwarded, it is difficult to take back. Its destination, permissions, and operating policy still need to evolve. AI Shortlink treats links and QR codes as durable digital entry points rather than one-time conversion artifacts.

- **Stable entry, evolving destination.** Keep the public address fixed while safely changing targets and distribution rules.
- **Control before automation.** Automated changes should be reviewable, confirmable, reversible, and auditable.
- **Explicit ownership.** Users manage only their own resources; administrators manage global settings and approvals.
- **Lightweight, not incomplete.** A single Go service with an embedded admin UI and SQLite by default, plus MySQL/MariaDB for larger deployments.

### What does “AI” mean?

[Issue #1](https://github.com/flyfish-dev/shortlink/issues/1) asked whether AI only means that the project was built with AI. It does not, and it also does not imply that every current feature is AI-powered.

The name captures two directions:

1. **Engineering practice:** human-led, AI-assisted development across design, implementation, testing, and documentation. Maintainers remain responsible for every decision.
2. **Product direction:** optional model integrations for configuration drafts, review context, risk signals, and operational insights.

The current release focuses on dependable link infrastructure. **It does not call an LLM by default and does not send link or user data to a third-party model provider.** Future AI features must be opt-in, data-minimal, human-confirmed, explainable, and auditable. See [ROADMAP.md](ROADMAP.md) for the staged plan.

## Capabilities

| Area | Included today |
| --- | --- |
| Short links | Custom codes, redirect types, schedules, visit limits, fallback URLs, QR codes, analytics |
| Live QR operations | Stable entry, multi-code pools, ordering, weights, rotation strategies, transactional saves |
| Branded QR codes | classic / rounded / dots, colors, center logo, live preview, SVG / PNG / WEBP export |
| Team workflow | Multi-user ownership, admin review, approval/rejection email, audit records |
| Authentication | Magic Link, GitHub OAuth, trusted-browser login, recovery key, account status controls |
| Analytics | 30-day trends, unique IPs, device/browser breakdowns, display and long-press intent events |
| Deployment | Docker, Linux amd64 binary, Render, SQLite, MySQL / MariaDB |
| Internationalization | Chinese and English product names, UI, and transactional email copy |

## Guided deployment on VibeNest

This fork uses a pinned, prebuilt Linux image through the root `Dockerfile`. VibeNest detects **Dockerfile, port 8080** for the single application. Full acceptance of this updated button path is still pending; the earlier manual pilot results are recorded in [VIBENEST.md](VIBENEST.md).

1. Click **Deploy to VibeNest** above and register or sign in. Check that the repository remains `NikitaBabenko/shortlink` and the branch is `main`. If VibeNest reuses an existing project, review its saved settings; an old explicit Compose selection is not automatically reset. Use **Auto-detect** or **Dockerfile**, with internal port `8080`.
2. Before opening the setup wizard or creating data, open **Project Settings → Environment**. Set `APP_BASE_URL` to the actual public HTTPS origin shown for your project (no path), and `DATA_DIR=/app/data`. Keep secure cookies enabled. The image defaults to pilot mode and bootstrap username `operator`; it contains no default password.
3. Open **Project Settings → Storage**, enter `/app/data`, and choose **Attach Volume**. This immediately triggers a redeploy. Wait for it to finish and verify that the volume is attached without an error **before installing the application**. The first button launch has no persistent mount; the Compose volume is not applied by the Dockerfile buildpack.
4. In **Environment**, use **Reveal** for the project's generated `SETUP_BOOTSTRAP_PASSWORD`. Open `/setup` over HTTPS, enter username `operator` and that password in the HTTP Basic prompt, then complete the SQLite installation and administrator setup. If the password is missing or setup is unavailable, stop and resolve the configuration; do not disable the guard. Keep the password and recovery key private.
5. Create a test link and complete its tenant and platform approvals. Verify its public redirect and QR image. Keep the same volume and `APP_SECRET` through a normal redeploy and verify that the administrator session and link still work before storing important data.

The single-service `docker-compose.yml` and its named `app_data` volume remain available for manual use; the full source-build Dockerfile, including the required Linux setup-auth tests, remains at `deploy/vibenest/Dockerfile`. For local Compose use, copy `.env.example` to `.env`, supply a unique bootstrap password of at least 24 characters, and set `COOKIE_SECURE=false` only for plain HTTP localhost. The original optional MySQL development stack remains in `docker-compose.dev.yml`. The upstream quick-start commands below target the upstream repository.

## Quick start

Docker with embedded SQLite is the smallest deployment:

```bash
git clone https://github.com/flyfish-dev/shortlink.git
cd shortlink
cp .env.example .env
docker compose up -d --build
```

Open `http://localhost:8080/setup` and complete the setup wizard. Runtime data is stored in a Docker volume.

For local builds, install Go 1.23+, a C compiler, and SQLite3 development headers:

```bash
make test
make build
./bin/ai-shortlink
```

See the [deployment guide](docs/DEPLOYMENT.md) for MySQL/MariaDB, GitHub OAuth, SMTP, HTTPS reverse proxying, systemd, and Render.

## AI evolution

| Stage | Goal | Status |
| --- | --- | --- |
| Trusted entry foundation | Links, live QR, ownership, review, analytics, authentication, deployment | Delivered; hardening continues |
| AI integration foundation | Optional providers, explicit data scope, prompt versions, invocation audit, graceful fallback | Planned |
| Configuration assistant | Turn natural-language intent into a reviewable configuration draft | Planned |
| Review assistant | Summarize destination context and risk signals without replacing admin judgment | Planned |
| Operational insights | Explain trends, flag anomalies, and propose traceable optimizations | Exploring |

The roadmap is not a release-date commitment. Features should begin as discussable Issues before implementation. Share real use cases through a [Feature request](https://github.com/flyfish-dev/shortlink/issues/new?template=feature_request.yml).

## Documentation

- [Deployment guide](docs/DEPLOYMENT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Users, ownership, and review](docs/USER_MANAGEMENT.md)
- [Roadmap](ROADMAP.md)
- [Contributing](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Support](SUPPORT.md)
- [Code of Conduct](CODE_OF_CONDUCT.md)

## License

AI Shortlink is licensed under [GNU Affero General Public License v3.0 only](LICENSE), SPDX `AGPL-3.0-only`. If you modify, distribute, or provide this project as a network service, follow the corresponding source-availability and notice requirements. See [NOTICE](NOTICE) for attribution details.

Copyright (C) 2026 [Flyfish Dev](https://flyfish.dev)
