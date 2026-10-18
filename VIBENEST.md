# Deploy AI Shortlink on VibeNest

[![Deploy to VibeNest](https://vibenest.net/deploy-to-vibenest.svg)](https://vibenest.net/deploy?repo=https://github.com/NikitaBabenko/shortlink)

This independent integration fork preserves the upstream application and AGPL license. A basic runtime and persistence pilot passed on 18 October 2026 with a measured 256 MB container memory limit. Full Free-tier certification and an unattended one-click installation remain pending. The badge opens VibeNest's repository preview; it does not configure the persistent mount or complete the application's setup wizard.

Use SQLite mode, internal port `8080`, and persistent storage mounted at `/app/data`. Do not enable the optional `mysql` Compose profile for the initial pilot. When choosing the root Dockerfile instead of Compose, explicitly configure the same persistent mount before deploying.

Set `APP_ADDR=:8080`, `DATA_DIR=/app/data`, `DATABASE_MODE=embedded`, `COOKIE_SECURE=true`, and `APP_BASE_URL=https://YOUR-SUBDOMAIN.vibenest.net`. Preserve the entire data directory across redeploys and keep the application secret stable. The tested VibeNest path generated `APP_SECRET` automatically. Configure trusted-proxy handling according to the actual platform topology.

Complete `/setup` and create the administrator before sharing the address. OAuth and SMTP integrations require the operator's own credentials and are not configured by the badge. Never put secrets in Git.

Verification targets the actual Free allocation: 256 MB RAM, 0.5 vCPU and 4 GB storage. Check startup and peak memory, setup/login, a public short link and QR code, HTTPS, and persistence after restart/redeploy. A build or HTTP 200 alone does not establish suitability.

## Pilot results — 18 October 2026

Application revision `4612893c3b1e86243732552370d57201a8529faf` completed two VibeNest deployments. HTTPS, administrator authentication, rejection of anonymous administrator access, a public 302 redirect, and a QR image passed. A replacement container retained the administrator session, SQLite link, and approval state. A bounded test of 20 redirects with two concurrent clients passed before and after redeployment. The upstream application requires both tenant and platform review before a link becomes publicly active; complete those reviews in your own instance.

Platform-agent samples across approximately 12 minutes showed 2.59–5.97 MB memory usage, a 256 MB memory limit, and zero automatic restarts. These are sampled observations, not a measured startup peak or a capacity guarantee. The allocation was the existing Free server, with 0.5 platform CPU units and 4 GB storage shown in inventory. The actual CPU cgroup quota and filesystem usage/quota were not independently measured. No SMTP, OAuth, AI provider, custom domain, or long-duration workload was tested.

The temporary pilot was stopped and its Free server released after testing; the historical pilot URL is not an always-on demo. Before sharing a new instance, configure the volume and environment, complete setup, and keep the recovery key private.

Upstream: https://github.com/flyfish-dev/shortlink
