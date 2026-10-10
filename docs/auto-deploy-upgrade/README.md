# Automatic deployment upgrade — staged proposal

**Status: Stage 1 proposal only. No deployment has been performed.**

This branch is an isolated proposal. A browser preview does not validate backend behavior, GitHub Actions dispatch, Cloud Run revision promotion, health checks, or rollback.

## Branch safety

- Branch: `preview/auto-deploy-upgrade`
- Base: `main`
- No workflow was dispatched by this change.
- No production/dev secrets or credential values belong in this branch.
- Cloud Run workflows intentionally fail closed. They are templates, not operational deployment workflows.
- Existing Pages workflow is retained with a concurrency group added.

## Proposed files

- `.github/workflows/deploy.yml`: existing Pages deployment with concurrency.
- `.github/workflows/deploy-dev.yml`: dev template; guarded and deliberately exits before deployment.
- `.github/workflows/deploy-prod.yml`: manual-only production template, production environment approval gate, deliberately exits before deployment.
- `docs/auto-deploy-upgrade/proposed-server.ts`: dispatch-only route module proposal.
- `docs/auto-deploy-upgrade/proposed-frontend.ts`: real fetch/poll/health verification flow proposal.

The server and frontend snippets are proposals kept separate from the running application until repository-specific auth, CSRF, admin-session, and UI integration points are confirmed. This avoids silently wiring a guessed security boundary into the existing large server and frontend files.

## Stage 2 — required evidence before enabling deployment

1. Run `npm run lint`, a real test runner, and `npm run build`; retain logs and exit codes.
2. Test dispatch against a fork/test repository using a dedicated test credential. Confirm GitHub returns 204 and persist a correlation ID scoped to the requesting admin.
3. Poll real workflow runs and verify the run by `display_title` containing that correlation ID.
4. Confirm the exact `/api/health` response contract and verify the candidate tagged-revision URL, not the stable service URL.
5. Confirm GCP project IDs, region, service names, Artifact Registry repository, WIF provider, service accounts, and tagged URL format from the actual project.
6. Validate dev promotion and rollback to an explicitly recorded previous healthy revision. Never use `--to-latest`.
7. Validate production approval, promotion, and rollback in the intended production environment before enabling it.
8. Confirm the existing Pages workflow remains green.

## Security invariants

- Dispatch through the GitHub API using server-side credentials; never use `exec` for dispatch.
- Never put a token in a URL or Git remote.
- Never commit `admin_github_token.json`; ignore it and remove it from history if it ever contained a real token. Revoke/rotate that token.
- Enforce authentication and CSRF separately.
- Treat HTTP 204 as dispatch accepted, not deployment success.
- Success requires, in order: accepted dispatch, the actual workflow run concluding successfully, and candidate health verification passing.
- Poll only runs authorized for the requesting admin.
- Roll back to a recorded explicit revision.

## Stage 1 checklist

- [x] Create isolated preview branch.
- [x] Add proposed dispatch-only route and frontend flow as reviewable snippets.
- [x] Add guarded dev/prod workflow templates.
- [x] Add concurrency to the existing Pages workflow.
- [ ] Scan branch and history for secrets; rotate any exposed credential as applicable.
- [ ] Run lint, tests, and build in a real environment.
- [ ] Validate dispatch, polling, health, promotion, approval, and rollback in Stage 2.

No Stage 2 or Stage 3 item is claimed complete.
