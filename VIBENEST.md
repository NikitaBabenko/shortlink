# Deploy AI Shortlink on VibeNest

[![Deploy to VibeNest](https://vibenest.net/deploy-to-vibenest.svg)](https://vibenest.net/deploy?repo=https://github.com/NikitaBabenko/shortlink)

This independent integration fork preserves the upstream application and AGPL license. A basic runtime and persistence pilot passed on 18 October 2026 with a measured 256 MB container memory limit. Full Free-tier certification and an unattended one-click installation remain pending. The badge opens VibeNest's repository preview; it does not configure the persistent mount or complete the application's setup wizard.

Use SQLite mode, internal port `8080`, and persistent storage mounted at `/app/data`. Do not enable the optional `mysql` Compose profile for the initial pilot. When choosing the root Dockerfile instead of Compose, explicitly configure the same persistent mount before deploying.

Set `APP_ADDR=:8080`, `DATA_DIR=/app/data`, `DATABASE_MODE=embedded`, `COOKIE_SECURE=true`, and `APP_BASE_URL=https://YOUR-SUBDOMAIN.vibenest.net`. Preserve the entire data directory across redeploys and keep the application secret stable. The tested VibeNest path generated `APP_SECRET` automatically. Configure trusted-proxy handling according to the actual platform topology.

Complete `/setup` and create the administrator before sharing the address. OAuth and SMTP integrations require the operator's own credentials and are not configured by the badge. Never put secrets in Git.

## Automatic configuration: current boundary

The repository's existing `render.yaml` declares Docker, `/healthz`, SQLite mode and several environment defaults, but no persistent disk. VibeNest's inspected Render adapter currently rejects a `disk` declaration as `render_persistent_disk_unsupported`. Adding that field is not a working automatic-volume integration. The live badge preview follows the single-project launch path; a preview success does not prove that Render environment settings were applied.

The minimum repeatable configuration is one root Dockerfile service on port `8080`, a required writable `/app/data` volume attached before the first process starts, and the environment listed above. The volume must contain the SQLite database, `app-config.json` and uploads. If `APP_SECRET` is absent, the application generates a secret and saves it in `app-config.json`; if an environment secret is supplied, it takes precedence. Keep whichever secret source is used stable across replacements. Do not introduce a new environment secret over an existing installation's saved secret.

First-administrator setup is still an explicit owner step. The upstream installer accepts the first administrator on an uninstalled instance; a complete hosted onboarding flow needs owner-only access to setup before public exposure. Keeping the URL unshared is not an access control. Automatic storage, stable environment preparation and protected first setup remain acceptance requirements, not capabilities certified by this fork.

Verification targets the actual Free allocation: 256 MB RAM, 0.5 vCPU and 4 GB storage. Check startup and peak memory, setup/login, a public short link and QR code, HTTPS, and persistence after restart/redeploy. A build or HTTP 200 alone does not establish suitability.

## Pilot results — 18 October 2026

Application revision `4612893c3b1e86243732552370d57201a8529faf` completed two VibeNest deployments. HTTPS, administrator authentication, rejection of anonymous administrator access, a public 302 redirect, and a QR image passed. A replacement container retained the administrator session, SQLite link, and approval state. A bounded test of 20 redirects with two concurrent clients passed before and after redeployment. The upstream application requires both tenant and platform review before a link becomes publicly active; complete those reviews in your own instance.

Platform-agent samples across approximately 12 minutes showed 2.59–5.97 MB memory usage, a 256 MB memory limit, and zero automatic restarts. These are sampled observations, not a measured startup peak or a capacity guarantee. The allocation was the existing Free server, with 0.5 platform CPU units and 4 GB storage shown in inventory. The actual CPU cgroup quota and filesystem usage/quota were not independently measured. No SMTP, OAuth, AI provider, custom domain, or long-duration workload was tested.

The temporary pilot was stopped and its Free server released after testing; the historical pilot URL is not an always-on demo. Before sharing a new instance, configure the volume and environment, complete setup, and keep the recovery key private.

Upstream: https://github.com/flyfish-dev/shortlink
