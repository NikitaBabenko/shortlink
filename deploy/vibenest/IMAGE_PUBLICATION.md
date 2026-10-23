# Reviewed pilot image publication

This is a preparation-only workflow. Repository Actions remain disabled until
the OSS coordinator reviews the exact commit and assigns a build slot. Parse
DMARC has priority for the first slot. Image publication does not authorize a
VibeNest deployment or close the Shortlink runtime acceptance task.

## Build contract

`.github/workflows/publish-image.yml` runs only through `workflow_dispatch` on a
standard `ubuntu-latest` runner, with a 30-minute timeout. Its `exact_sha` input
must be a full lowercase commit SHA equal to the selected workflow revision.
The build uses that exact public Git commit as its context, without checkout
credentials or a local working tree, and the unchanged
`deploy/vibenest/Dockerfile`. That Dockerfile runs the Linux CGO/SQLite setup,
authentication, and pilot tests before compiling the guarded application.
`--no-cache` requires those tests to execute on every authorized build.

Only `contents: read` and `packages: write` are granted. `GITHUB_TOKEN` is used
only for registry login; no PAT, application secrets, build arguments, or build
secrets are supplied. The workflow publishes one Linux amd64 image with source
and revision OCI labels and registry provenance (`mode=max`). No Actions
artifacts or cache exports/uploads are configured. Metadata stays on the
ephemeral runner; the immutable registry digest is written to the run summary.
The provenance records resolved base images; base tags in the original
Dockerfile remain mutable, so repeat builds need not have the same digest.

## Coordinator review and future execution

The following commands are a future runbook, not authorization to run them.
Refresh Actions availability and billing evidence before the assigned build.
Do not increase paid budgets, token scopes, or retry a known billing failure.
The existing `ci.yml` still has push/PR triggers and Go caching. Before enabling
repository Actions, disable that CI workflow through the normal GitHub workflow
control and verify its disabled state. Keep it disabled throughout this image
publication. No push or PR is needed to start the reviewed manual build.

Read-only checks (PowerShell):

```powershell
$reviewedSha = '<full reviewed commit SHA>'
gh api repos/NikitaBabenko/shortlink/actions/permissions
gh api repos/NikitaBabenko/shortlink/actions/workflows
gh api repos/NikitaBabenko/shortlink/commits/main --jq .sha
```

After explicit coordinator build-slot assignment and review, disable CI if
needed, enable Actions using the normal repository settings, and verify that
only the publication workflow is enabled. Stop if the existing authorization
does not allow these settings changes. Then dispatch exactly once, only if
`main` still equals `$reviewedSha`:

```powershell
gh workflow run publish-image.yml --repo NikitaBabenko/shortlink --ref main -f "exact_sha=$reviewedSha"
gh run list --repo NikitaBabenko/shortlink --workflow publish-image.yml --commit $reviewedSha --limit 5
```

A changed `main` must fail the workflow's exact-SHA check rather than build a
different revision. Review any new revision before a new dispatch. Do not
retry a failed build automatically. Repository concurrency prevents overlapping
Shortlink publication jobs; the coordinator still owns the cross-project slot.

## Required artifact acceptance

1. Record the run URL, source SHA, successful Linux test/build logs and the
   **digest** from the run summary. A tag alone is insufficient evidence.
2. Check the GHCR package's public visibility and repository linkage. A first
   publication may create a private package; request/use only the authorized
   normal package-visibility control. Stop on 403 instead of expanding scopes.
3. Using a clean, anonymous registry client, resolve that exact digest, inspect
   the Linux amd64 manifest/config labels, and inspect the attached provenance.
   Confirm the source repository/revision and materials match the reviewed SHA.
   Preserve this evidence before changing any deployment configuration. Registry
   metadata inspection does not require running or pulling application layers.
4. Refer to the accepted artifact as `ghcr.io/nikitababenko/shortlink@sha256:...`.
   Do not put a guessed digest or mutable tag into the deployment manifest.

The existing Compose file remains source-build based until artifact acceptance.
Its `/app/data` volume, owner-supplied setup credentials, secure cookies and
`APP_URL` behavior must survive any subsequent reviewed image-only adaptation.
Real button → authentication → normal gated deployment → useful authenticated
scenario → data persistence acceptance still requires a separately assigned
Free/runtime slot and current security/admission checks. Historical manual
stands and a published image do not satisfy that acceptance.
