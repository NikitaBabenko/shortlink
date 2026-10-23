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

The original CI is preserved byte-for-byte at
`.github/disabled-workflows/ci.yml`, outside the active workflow directory. All
its checks (full Go tests, vet, build, three JS syntax checks and whitespace)
run in the same manual job before image creation. Go setup is commit-pinned,
with Actions caching disabled. Source is fetched anonymously at the exact SHA.

Buildx creates one Linux amd64 OCI archive in `RUNNER_TEMP`, with a fresh empty
Docker configuration and no registry credentials. Source/revision OCI labels
and max-mode SLSA v0.2 provenance are included. `verify_oci.py` hashes the
referenced blobs, checks the exported index against Buildx and skopeo metadata,
and checks the image platform, non-root user, entrypoint, guarded defaults and
provenance subject/source SHA/Dockerfile. Any mismatch stops before login.

Only then does the final step receive `GITHUB_TOKEN`, log in via password stdin
to a temporary auth file, and copy the already verified archive with
`skopeo copy --all --preserve-digests`. It fails if the published digest differs;
there is no second image build. The auth file is removed by an EXIT trap.
Only `contents: read` and `packages: write` are granted. GitHub permissions are
job-scoped, so `packages: write` cannot be restricted to a single step in this
one-job design; only the final step explicitly receives the token. Actions
can also access the job token through GitHub context, which is why the sole
setup action is pinned. No PAT, application secrets, build arguments or build
secrets are supplied. No Actions artifacts or cache uploads are configured.
The archive and metadata stay on the ephemeral runner; the digest is written
to the run summary. Base tags in the original Dockerfile remain mutable;
provenance records the resolved materials, not a promise of identical rebuilds.

## Coordinator review and future execution

The following commands are a future runbook, not authorization to run them.
Refresh Actions availability and billing evidence before the assigned build.
Do not increase paid budgets, token scopes, or retry a known billing failure.
The only file in `.github/workflows` must be the manual publisher. Verify the
remote tree and workflow list before enabling Actions; the preserved CI file
must remain outside that directory. No push or PR is needed to start the build.

Read-only checks (PowerShell):

```powershell
$reviewedSha = '<full reviewed commit SHA>'
gh api repos/NikitaBabenko/shortlink/actions/permissions
gh api repos/NikitaBabenko/shortlink/actions/workflows
gh api repos/NikitaBabenko/shortlink/commits/main --jq .sha
```

After explicit coordinator build-slot assignment and review, enable Actions
using the normal repository settings and verify the remote tree still contains
only the manual publisher. Stop if the existing authorization does not allow
these settings changes. Then dispatch exactly once, only if `main` still equals
`$reviewedSha`:

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
2. First publication creates a **private** package even for a public repository.
   After a successful push, open the owner's GitHub profile → Packages →
   `shortlink` → Package settings. Verify the linked repository is
   `NikitaBabenko/shortlink` and the workflow repository has write access. Under
   Danger Zone → Change visibility, select Public, type `shortlink` to confirm,
   then use the normal confirmation button. This public visibility change is
   irreversible; perform it only under the coordinator's explicit public-image
   publication authorization. No workflow dispatch or rebuild is needed after
   changing visibility. Do not use `GITHUB_TOKEN` to invent a visibility API or
   expand PAT scopes; stop on 403/absent authorized controls and report the
   concrete blocker. The package page is expected at
   `https://github.com/NikitaBabenko/shortlink/pkgs/container/shortlink` after
   publication; it is not evidence that the package already exists.
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

References: [GitHub package visibility](https://docs.github.com/en/packages/learn-github-packages/configuring-a-packages-access-control-and-visibility),
[GitHub container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry),
[Skopeo copy and digest preservation](https://github.com/containers/skopeo/blob/main/docs/skopeo-copy.1.md),
[BuildKit provenance](https://docs.docker.com/build/metadata/attestations/slsa-provenance/).
