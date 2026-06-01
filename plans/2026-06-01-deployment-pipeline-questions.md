# Relay Deployment Pipeline - Open Questions

Date: 2026-06-01

These questions need answers before implementing the CI/CD pipeline.

---

## 1. Telemetry Server Deployment

Is the telemetry server a separate repo, or part of this monorepo?
If separate, should the production workflow trigger a deployment there too?

## 2. VPS Deployment Method

How should the VPS deployment work?
- SSH + Docker compose?
- Ansible?
- Something else?

## 3. NPM Token

Are you publishing under the same npm account for both `next` and `latest` tags,
or different scopes?

## 4. Branch Protection

- Should `master` require PR reviews before auto-deploy?
- Should `release/*` be protected from direct pushes?

---

## Proposed Pipeline Summary

| Stage    | Branch        | Trigger | NPM Tag  | Deployment        |
|----------|---------------|---------|----------|-------------------|
| Dev      | any other     | Push    | -        | None              |
| Staging  | `master`      | Push    | `next`   | Auto to staging-0 |
| Prod     | `release/*`   | Manual  | `latest` | Manual to prod-0  |
