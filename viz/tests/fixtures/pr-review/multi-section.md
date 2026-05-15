---
viz: pr-review
title: PR #482 — Add OAuth flow
---

# Summary

Overall direction is right but two blocking security issues. Login UX needs polish before merge.

## High

### Token stored in localStorage instead of httpOnly cookie
- file: src/auth/session.ts:34
- impact: XSS can exfiltrate the token, full account takeover
- fix: Set httpOnly cookie server-side; remove localStorage write
- status: fixed

### Missing CSRF token on /oauth/callback
- file: src/routes/oauth.ts:88
- impact: Attacker can complete OAuth flow on victim's behalf
- fix: Verify state parameter matches session-bound nonce
- status: fixed

## Medium

### Login button has no loading state
- file: src/components/LoginButton.tsx:12
- impact: Double-click submits twice
- fix: Disable button while request in flight
- status: open

### No rate limit on /oauth/start
- file: src/routes/oauth.ts:42
- impact: Endpoint can be hammered by bots
- fix: Add per-IP token bucket (10 req/min)
- status: open

## Low

### Inconsistent error message capitalization
- file: src/errors.ts:12
- impact: UX nit
- fix: Title-case all error strings
- status: wontfix
