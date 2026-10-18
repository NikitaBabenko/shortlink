# Deploy AI Shortlink on VibeNest

[![Deploy to VibeNest](https://vibenest.net/deploy-to-vibenest.svg)](https://vibenest.net/deploy?repo=https://github.com/NikitaBabenko/shortlink)

This independent integration fork preserves the upstream application and AGPL license. Free-tier runtime acceptance is pending. The badge is not a certification that the application fits the tier or an upstream endorsement.

Use SQLite mode, internal port `8080`, and persistent storage mounted at `/app/data`. Do not enable the optional `mysql` Compose profile for the initial pilot. When choosing the root Dockerfile instead of Compose, explicitly configure the same persistent mount before deploying.

Set `APP_ADDR=:8080`, `DATA_DIR=/app/data`, and `COOKIE_SECURE=true` behind VibeNest HTTPS. The setup wizard stores runtime configuration and its generated application secret under the data directory. Preserve the entire directory across redeploys. Configure trusted-proxy handling according to the actual platform topology.

Complete `/setup` and create the administrator before sharing the address. OAuth and SMTP integrations require the operator's own credentials and are not configured by the badge. Never put secrets in Git.

Verification targets the actual Free allocation: 256 MB RAM, 0.5 vCPU and 4 GB storage. Check startup and peak memory, setup/login, a public short link and QR code, HTTPS, and persistence after restart/redeploy. A build or HTTP 200 alone does not establish suitability.

Upstream: https://github.com/flyfish-dev/shortlink
