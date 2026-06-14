# Plan: Deduplicate Cursor Accounts & Verify Upsert Flow

**Date**: 2026-06-11
**Status**: Pending
**Related files**: `src/commands/account/login.tsx`, `src/config/accounts-config.ts`, `src/commands/usage.tsx`

---

## Background

During initial Cursor provider development, the user ran `relay account login cursor` multiple times. Each invocation called `addAccount()` directly, which always created a new account (regardless of whether one with the same name+provider already existed).

The login command now uses `upsertAccount()` (added in `src/commands/account/login.tsx:42-55`), which finds an existing account by `name + provider` and updates it, or creates a new one if none exists. However, the **3 duplicate accounts** created by previous runs are still present and visible in `relay usage --all` — no usage data is shown because the stored tokens are PKCE session tokens, not web dashboard `WorkosCursorSessionToken` cookies.

### Current Account State

```
○ imamuzzaki@gmail.com (copilot)   — acc_1779789797855_iwam9bz
○ imamuzzaki@gmail.com (zai)        — acc_1779789856248_u0sbyi4
○ imamuzzaki@gmail.com (minimax)    — acc_1779789885075_1r43rk5
○ imamuzzaki@gmail.com (cursor)     — acc_1781147595011_8czqubk   ← duplicate
○ imamuzzaki@gmail.com (cursor)     — acc_1781150936446_2un15fe   ← duplicate
○ imamuzzaki@gmail.com (cursor)     — acc_1781151564614_skltagm   ← active
```

All three Cursor accounts have the same `name="imamuzzaki@gmail.com"` and `provider="cursor"`. Only the last one (active) should remain.

---

## Tasks

### 1. Verify `upsertAccount` is wired correctly

**Files**: `src/commands/account/login.tsx:175-223` (`loginCursor` method)

**What to do**:
- Read `loginCursor` in `src/commands/account/login.tsx` and confirm both code paths (local token found, PKCE browser login) call `upsertAccount()`, not `addAccount()`.
- The method should already be using `upsertAccount({ name, provider: "cursor", apiKey })` — verify it does.
- If `addAccount()` is still being called anywhere in the file, replace it with `upsertAccount()`.

**Why**: The fix is already in place from a prior patch. We just need to verify it's correct before tackling the existing duplicates.

**Done when**: `grep -n "addAccount" src/commands/account/login.tsx` returns no results (or only the `addAccount` import line).

---

### 2. Add a deduplication step to `loginCursor`

**Files**: `src/commands/account/login.tsx`

**What to do**:
- At the start of `loginCursor`, before any other logic, call a helper that removes all existing Cursor accounts except the most recently created one.
- Add the helper function to `src/commands/account/login.tsx` (or to `src/config/accounts-config.ts` if it feels reusable).

**Helper sketch**:

```ts
/**
 * Deduplicate accounts: keep only the most recently created account for each
 * (name, provider) pair. Older duplicates are deleted.
 */
function deduplicateAccounts(): void {
  const config = loadConfig();
  const seen = new Set<string>();
  const toDelete: string[] = [];

  // Sort by createdAt descending so we keep the newest
  const sorted = Object.values(config.accounts).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  for (const acc of sorted) {
    const key = `${acc.name}::${acc.provider}`;
    if (seen.has(key)) {
      toDelete.push(acc.id);
    } else {
      seen.add(key);
    }
  }

  for (const id of toDelete) {
    delete config.accounts[id];
  }

  if (toDelete.length > 0) {
    saveConfig(config);
  }
}
```

Call this at the start of `loginCursor`, right after the header is printed.

**Why**: Cleans up the existing 3 duplicates immediately, and protects against any other duplicate-creation paths we haven't found yet.

**Done when**: Running `bun src/run.ts account login cursor` (without args / with the existing local token) leaves only **one** Cursor account in `relay account list`.

---

### 3. Manual cleanup of existing duplicates (fallback)

**If the auto-dedup helper doesn't cover it** (e.g., the user wants to verify before deleting):

Run these commands to manually remove the two older duplicate Cursor accounts:

```bash
# Get the account IDs from the list output
bun src/run.ts account list

# Remove the two non-active duplicates
bun src/run.ts account remove acc_1781147595011_8czqubk
bun src/run.ts account remove acc_1781150936446_2un15fe
```

The active account (`acc_1781151564614_skltagm`) is the newest and will be kept.

**Done when**: `relay account list` shows exactly one `imamuzzaki@gmail.com (cursor)` entry.

---

### 4. Verify `relay usage --all` is clean

**Files**: `src/commands/usage.tsx`

**What to do**:
- Run `bun src/run.ts usage --all` and confirm only one Cursor entry appears.
- The Cursor entry will show no usage data — this is expected because the stored token is a PKCE session token (type `"session"`, not `"web"`), which the web dashboard API rejects.
- The usage display should show the helpful message from `src/commands/usage.tsx:117-128`:
  > No usage data available. Your session token may have expired. Run this to refresh: `relay account login cursor`

**Done when**: `relay usage --all` output contains exactly one `imamuzzaki@gmail.com` Cursor block with the "session token may have expired" message.

---

### 5. Run lint, typecheck, and tests

**What to do**:
```bash
bun run check                              # oxlint + oxfmt
bun run typecheck                          # TypeScript strict
bun test                                   # Unit tests (110 pass, 14 pre-existing fail)
```

**Done when**: No new failures introduced. The 5 pre-existing `tsc` errors and 14 pre-existing test failures must remain unchanged.

---

## Out of Scope

These are **not** part of this plan and should not be worked on:

- **Web dashboard token capture**: The `WorkosCursorSessionToken` cookie is HttpOnly and Chrome v11-encrypted on Linux. Decrypting it requires libsecret access + portal decryption, which is impractical without user interaction. Manual paste of the cookie (via `relay account edit --key ...`) remains the workaround.
- **Auto-refresh of expired tokens**: The cursor-agent stores tokens at `~/.config/cursor/auth.json`, but it doesn't expose a programmatic refresh endpoint. Token refresh is tied to the cursor-agent's own browser login.
- **Provider registry updates**: No changes needed in `src/config/provider-registry.ts` — Cursor is already registered correctly.

---

## Verification Checklist

- [ ] `relay account list` shows **one** Cursor account
- [ ] `relay account login cursor` does not create a new account when one already exists
- [ ] `relay usage --all` shows **one** Cursor block (with the expected "no usage" message)
- [ ] `bun run check` passes (no new lint errors)
- [ ] `bun run typecheck` has only the 5 pre-existing errors
- [ ] `bun test` has 110 pass, 14 fail (same as before)
- [ ] No `addAccount(` calls remain in `src/commands/account/login.tsx`

---

## Key File References

| File | Lines | Purpose |
|------|-------|---------|
| `src/commands/account/login.tsx` | 25-55 | `findAccount` and `upsertAccount` helpers |
| `src/commands/account/login.tsx` | 175-286 | `loginCursor` method (uses upsert) |
| `src/commands/usage.tsx` | 117-128 | "No usage data" message for Cursor |
| `src/config/accounts-config.ts` | 149-164 | `updateAccount` (used by upsert) |
| `src/config/accounts-config.ts` | 165-177 | `deleteAccount` (used by dedup) |
| `src/utils/cursor-auth.ts` | 295-324 | `getCursorSessionToken` (local token reader) |
| `src/providers/cursor.ts` | 137-156 | `getUsage` checks if key is `crsr_` API key vs session token |
