# Deploy AI Shortlink on VibeNest

[![Deploy to VibeNest](https://vibenest.net/deploy-to-vibenest.svg)](https://vibenest.net/deploy?repo=https://github.com/NikitaBabenko/shortlink)

This independent integration fork preserves the upstream AGPL license and adds a narrow setup-authentication guard for hosted pilots. **The current Dockerfile button path is prepared, but its production acceptance is not complete.** The October 18 results below cover earlier manually configured installations, not this packaging revision.

## Current recipe — 25 October 2026

The root `Dockerfile` contains one `FROM` instruction referencing the immutable public image:

```text
ghcr.io/nikitababenko/shortlink@sha256:3064194fec73afe3229172d9d9a146b4f35dad4c9bfc7a7a1688dd9b73f02728
```

That image was built from application source `6473aa729ee397fe6ca60da4e10b469c1d46cc5e`. The [manual publication run](https://github.com/NikitaBabenko/shortlink/actions/runs/40168047901) passed the full Go tests, vet/build checks, JavaScript syntax checks and the Dockerfile's Linux setup-auth test gate before publishing the same verified artifact. The root wrapper performs no source compilation. Its configuration commit is separate from the application revision inherited by the image.

The inspected VibeNest production detector selects **Dockerfile on port 8080** when this root Dockerfile and the current one-service Compose file are present. It does not use the Compose preparation path. The public fork can use the normal anonymous public repository source; all platform admission, security and resource checks still apply. If the button reuses a project previously pinned to Compose, choose Auto-detect or Dockerfile in its Deployment settings. Keep existing installations on their tested revision/configuration until their storage and secrets have been deliberately accounted for.

The one-service Compose file is preserved for manual use, including its `app_data:/app/data` mount and `/healthz` health check. **Those Compose settings do not configure storage for the Dockerfile buildpack.** The original MySQL development stack remains byte-for-byte in `docker-compose.dev.yml`; its explicit development override is `deploy/compose.dev-build.yml`. All application source, tests and the original full build at `deploy/vibenest/Dockerfile` remain available.

## Required owner steps

Follow the [guided deployment instructions](README.en.md#guided-deployment-on-vibenest). The badge starts deployment; it does not complete persistent storage or administrator setup.

After the first button launch and **before running the setup wizard or creating useful data**:

1. Set `APP_BASE_URL=https://YOUR-ACTUAL-SUBDOMAIN.vibenest.net` and `DATA_DIR=/app/data` through **Project Settings → Environment**. Use the actual project origin, not the preview's suggested name. `APP_BASE_URL` takes precedence over `APP_URL`. The image's `/app` working directory and default `./data` also resolve to `/app/data`, but the explicit setting makes the storage destination clear.
2. In **Storage**, attach `/app/data`. **Attach Volume immediately triggers a redeploy.** Wait for completion and confirm the attached volume without an error. Deployment success alone does not establish that a writable persistent mount exists. Do not install into the first launch's ephemeral filesystem and assume that a later mount will migrate it.
3. Through **Environment → Reveal**, retrieve the generated `SETUP_BOOTSTRAP_PASSWORD`. The inspected platform's ordinary deploy path generates missing declared internal secrets, including this password and `APP_SECRET`, and preserves nonempty values on redeployment. Verify they exist; never put their values into Git, logs or a URL. The default bootstrap username is `operator`, and the image has `VIBENEST_PILOT=true` and `COOKIE_SECURE=true` without a default password.
4. Open `/setup` over HTTPS, enter the bootstrap credentials in the browser's HTTP Basic prompt, and complete SQLite and administrator setup. Keep the recovery key private. Create a test short link, complete both tenant and platform review, and check its public redirect and QR image.
5. Perform a normal redeploy on the same provider application and volume. Confirm that the administrator session, link, approvals and application configuration survive. Keep `APP_SECRET` stable. Release hardware only after the persistence check if this is a temporary pilot.

This is a guided flow: first button deploy, storage-attachment redeploy, then a separate replacement to check data persistence. None of those runtime outcomes is certified by the presence of this Dockerfile. Free-tier verification must use the actual 256 MB RAM, 0.5 vCPU and 4 GB allocation and measure startup/idle/peak usage, disk usage and OOM/restart behavior.

## Setup protection and existing data

The guard covers `/setup`, its descendants and every `/api/setup/*` route and method. Missing or invalid bootstrap configuration returns HTTP 503; missing or incorrect authentication returns HTTP 401. Cross-origin state-changing setup requests return HTTP 403. Keep `APP_BASE_URL` equal to the public HTTPS origin so same-origin requests behind the platform proxy are recognized. Command-line clients may omit Origin/Fetch Metadata headers but still require the bootstrap credentials.

Bootstrap credentials are read only from environment variables, not saved to `app-config.json` or exposed in the public bootstrap response. Public short-link redirects, QR images, login and existing administrator sessions retain their application behavior. Keep pilot mode enabled. OAuth and SMTP require the owner's own credentials and are not configured by the badge.

Preserve the entire `/app/data` directory: SQLite, `app-config.json` and uploads. If `APP_SECRET` is absent, the application generates a secret in `app-config.json`; an environment secret takes precedence. Never add a different environment secret over an existing installation's saved secret or remove its volume to manufacture a successful migration. A fresh application with an empty volume is a new installation, not restoration of historical data.

## Current acceptance boundary

On October 25, the previous Compose button path preserved repository/main through registration and sign-in and attached the existing Free allocation. It stopped before a deployment attempt or provider application was created because the platform could not prepare its isolated managed-fork branch (GitHub returned 404). The allocation was released through the normal owner interface. No unsafe upstream fallback, permission override or manual managed-ref write was used.

The root Dockerfile recipe uses the platform's existing single-container path and avoids requiring that Compose managed-source preparation. Its actual image identity, public HTTPS behavior, protected setup, useful link/QR scenario, resource limits and replacement persistence still require production acceptance. Historical results below do not close those checks.

## Pilot results — 18 October 2026

Guarded application revision `7657f986d96b5cea2ad5d640688ce58b7a5d8cd2` completed a fresh Dockerfile deployment (attempt 5334). The running image was `sha256:554cd15109cc702c1a9eba130e3f257c0677c8d97da2480cd654039faaa35efd`. Its Dockerfile requires the actual-router/SQLite, middleware and configuration tests to succeed before compilation. The successful exact-revision image build confirms that blocking build step completed; the available condensed deployment log did not expose individual test stdout lines.

All 24 initial HTTP checks passed: HTTPS health, setup guard rejection of missing/wrong credentials, cross-origin rejection, authorized fresh setup/database test/install, anonymous admin rejection, authenticated session, reviewed short-link redirect, QR image, repeat-install refusal and Secure cookies. All 19 checks after one normal owner-interface Restart also passed. The same container and image restarted; the administrator session, SQLite link and approvals persisted. This is restart persistence, not a replacement-container persistence claim for this guarded revision.

Six platform-agent samples from 15:04:52 to 15:10:11 UTC (5 minutes 19 seconds) showed 2.68–4.76 MB memory usage, a 256 MB memory limit and zero automatic restarts. These samples do not measure the startup peak. Actual CPU cgroup quota, filesystem usage/quota and long-duration capacity remain unverified. The Free allocation was released through the normal owner interface after testing; the installation is not an always-on demo.

### Earlier unguarded runtime evidence

Application revision `4612893c3b1e86243732552370d57201a8529faf` completed two VibeNest deployments. HTTPS, administrator authentication, rejection of anonymous administrator access, a public 302 redirect, and a QR image passed. A replacement container retained the administrator session, SQLite link, and approval state. A bounded test of 20 redirects with two concurrent clients passed before and after redeployment. The upstream application requires both tenant and platform review before a link becomes publicly active; complete those reviews in your own instance.

Platform-agent samples across approximately 12 minutes showed 2.59–5.97 MB memory usage, a 256 MB memory limit, and zero automatic restarts. These are sampled observations, not a measured startup peak or a capacity guarantee. The allocation was the existing Free server, with 0.5 platform CPU units and 4 GB storage shown in inventory. The actual CPU cgroup quota and filesystem usage/quota were not independently measured. No SMTP, OAuth, AI provider, custom domain, or long-duration workload was tested.

The temporary pilot was stopped and its Free server released after testing; the historical pilot URL is not an always-on demo. Before sharing a new instance, configure the volume and environment, complete setup, and keep the recovery key private.

A later normal resume of the historical installation was refused because its domain remained assigned to a saved provider application. No provider override or resource rebind was performed. The guarded test above used a separately authorized blank synthetic installation, not recovery of the historical data. This resume limitation is separate from the successful fresh guided-installation result.

Upstream: https://github.com/flyfish-dev/shortlink
