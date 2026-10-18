# Deploy AI Shortlink on VibeNest

[![Deploy to VibeNest](https://vibenest.net/deploy-to-vibenest.svg)](https://vibenest.net/deploy?repo=https://github.com/NikitaBabenko/shortlink)

This independent integration fork preserves the upstream AGPL license and adds a narrow setup-authentication guard for hosted pilots. A guided fresh installation, protected setup, public short links, QR images and restart persistence passed on VibeNest production on 18 October 2026, with a measured 256 MB container memory limit. This verifies the tested runtime scenario; it is not full Free-tier certification or an unattended one-click installation. The badge opens VibeNest's repository preview; it does not configure the persistent mount or complete the application's setup wizard.

Use SQLite mode, internal port `8080`, and persistent storage mounted at `/app/data`. Do not enable the optional `mysql` Compose profile for the initial pilot. When choosing the root Dockerfile instead of Compose, explicitly configure the same persistent mount before deploying.

Set `APP_ADDR=:8080`, `DATA_DIR=/app/data`, `DATABASE_MODE=embedded`, `COOKIE_SECURE=true`, and `APP_BASE_URL=https://YOUR-SUBDOMAIN.vibenest.net`. For a fresh installation, set a unique private `APP_SECRET` before the first deployment; the guarded pilot used 32 random bytes encoded as hex. Preserve the entire data directory across redeploys and keep the application secret stable. Configure trusted-proxy handling according to the actual platform topology.

Before the first deployment, set `VIBENEST_PILOT=true`, `SETUP_BOOTSTRAP_USER` to an operator-selected username, and `SETUP_BOOTSTRAP_PASSWORD` to a unique randomly generated password of at least 24 characters (32 random bytes encoded as hex is suitable). The username must not contain a colon or CR/LF. Supply these through private environment settings, never Git or a public URL. The runtime Dockerfile enables `VIBENEST_PILOT=true` by default and contains no default credentials.

Open `/setup` over HTTPS, enter the bootstrap credentials in the browser's HTTP Basic authentication prompt, and complete the application wizard to create the administrator. The guard covers `/setup`, its descendants, and every `/api/setup/*` route and method, including the database test. Missing or invalid bootstrap configuration returns HTTP 503; missing or incorrect authentication returns HTTP 401. Cross-origin state-changing setup requests return HTTP 403. Keep `APP_BASE_URL` equal to the public HTTPS origin so same-origin browser requests behind the platform proxy are recognized. Command-line operator clients may omit Origin/Fetch Metadata headers but still require the bootstrap credentials.

Bootstrap credentials are read only from environment variables and are not saved to `app-config.json` or exposed in the public bootstrap response. They remain required for setup endpoints after installation. Public short-link redirects, QR images, login and existing administrator sessions retain their application behavior. After setup, the operator may remove both bootstrap credential variables to close all setup routes with HTTP 503 while leaving the application available. Keep pilot mode enabled. Outside this Docker image, an absent or explicit false pilot flag preserves upstream behavior; a malformed nonempty flag enables the guard instead of disabling it.

OAuth and SMTP integrations require the operator's own credentials and are not configured by the badge. Never put secrets in Git.

## Automatic configuration: current boundary

The repository's existing `render.yaml` declares Docker, `/healthz`, SQLite mode and several environment defaults, but no persistent disk. VibeNest's inspected Render adapter currently rejects a `disk` declaration as `render_persistent_disk_unsupported`. Adding that field is not a working automatic-volume integration. The live badge preview follows the single-project launch path; a preview success does not prove that Render environment settings were applied.

The minimum repeatable configuration is one root Dockerfile service on port `8080`, a required writable `/app/data` volume attached before the first process starts, and the environment listed above. The volume must contain the SQLite database, `app-config.json` and uploads. If `APP_SECRET` is absent, the application generates a secret and saves it in `app-config.json`; if an environment secret is supplied, it takes precedence. Keep whichever secret source is used stable across replacements. Do not introduce a new environment secret over an existing installation's saved secret.

First-administrator setup is still an explicit owner step. The fork's bootstrap guard protects that step when configured as above; keeping the URL unshared is not an access control. Protected first setup has passed in production with manual storage and environment preparation. Automatic preparation remains outside the verified path. Each Docker image build must pass the targeted real-router/SQLite setup-auth tests before compiling the application.

If a normal platform flow creates a new application and empty volume, completing its protected setup is a new synthetic installation, not restoration of the historical database. Preserve old application and volume objects. Do not reset, delete or manually rebind them to manufacture a successful restoration result.

Verification targets the actual Free allocation: 256 MB RAM, 0.5 vCPU and 4 GB storage. Check startup and peak memory, setup/login, a public short link and QR code, HTTPS, and persistence after restart/redeploy. A build or HTTP 200 alone does not establish suitability.

## Pilot results — 18 October 2026

Guarded application revision `7657f986d96b5cea2ad5d640688ce58b7a5d8cd2` completed a fresh Dockerfile deployment (attempt 5334). The running image was `sha256:554cd15109cc702c1a9eba130e3f257c0677c8d97da2480cd654039faaa35efd`. Its Dockerfile requires the actual-router/SQLite, middleware and configuration tests to succeed before compilation. The successful exact-revision image build confirms that blocking build step completed; the available condensed deployment log did not expose individual test stdout lines.

All 24 initial HTTP checks passed: HTTPS health, setup guard rejection of missing/wrong credentials, cross-origin rejection, authorized fresh setup/database test/install, anonymous admin rejection, authenticated session, reviewed short-link redirect, QR image, repeat-install refusal and Secure cookies. All 20 checks after one normal owner-interface Restart also passed. The same container and image restarted; the administrator session, SQLite link and approvals persisted. This is restart persistence, not a replacement-container persistence claim for this guarded revision.

Six platform-agent samples from 15:04:52 to 15:10:11 UTC (5 minutes 19 seconds) showed 2.68–4.76 MB memory usage, a 256 MB memory limit and zero automatic restarts. These samples do not measure the startup peak. Actual CPU cgroup quota, filesystem usage/quota and long-duration capacity remain unverified. The Free allocation was released through the normal owner interface after testing; the installation is not an always-on demo.

### Earlier unguarded runtime evidence

Application revision `4612893c3b1e86243732552370d57201a8529faf` completed two VibeNest deployments. HTTPS, administrator authentication, rejection of anonymous administrator access, a public 302 redirect, and a QR image passed. A replacement container retained the administrator session, SQLite link, and approval state. A bounded test of 20 redirects with two concurrent clients passed before and after redeployment. The upstream application requires both tenant and platform review before a link becomes publicly active; complete those reviews in your own instance.

Platform-agent samples across approximately 12 minutes showed 2.59–5.97 MB memory usage, a 256 MB memory limit, and zero automatic restarts. These are sampled observations, not a measured startup peak or a capacity guarantee. The allocation was the existing Free server, with 0.5 platform CPU units and 4 GB storage shown in inventory. The actual CPU cgroup quota and filesystem usage/quota were not independently measured. No SMTP, OAuth, AI provider, custom domain, or long-duration workload was tested.

The temporary pilot was stopped and its Free server released after testing; the historical pilot URL is not an always-on demo. Before sharing a new instance, configure the volume and environment, complete setup, and keep the recovery key private.

A later normal resume of the historical installation was refused because its domain remained assigned to a saved provider application. No provider override or resource rebind was performed. The guarded test above used a separately authorized blank synthetic installation, not recovery of the historical data. This resume limitation is separate from the successful fresh guided-installation result.

Upstream: https://github.com/flyfish-dev/shortlink
