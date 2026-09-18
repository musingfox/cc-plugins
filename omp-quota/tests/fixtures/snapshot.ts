// Live `omp usage --json` of 2026-09-18 with every metadata object, scope.projectId,
// scope.accountId, and resetCredits removed. accountDataIn (account-data.ts) guards it.
export const SNAPSHOT = {
  "generatedAt": 1789708507153,
  "reports": [
    {
      "provider": "openai-codex",
      "fetchedAt": 1789708505898,
      "limits": [
        {
          "id": "openai-codex:primary",
          "label": "5 hours",
          "scope": { "provider": "openai-codex", "windowId": "5h", "shared": true },
          "window": { "id": "5h", "label": "5 hours", "durationMs": 18000000, "resetsAt": 1789726506000 },
          "amount": { "used": 0, "limit": 100, "remaining": 100, "usedFraction": 0, "remainingFraction": 1, "unit": "percent" },
          "status": "ok"
        },
        {
          "id": "openai-codex:secondary",
          "label": "7 days",
          "scope": { "provider": "openai-codex", "windowId": "7d", "shared": true },
          "window": { "id": "7d", "label": "7 days", "durationMs": 604800000, "resetsAt": 1789835809000 },
          "amount": { "used": 94, "limit": 100, "remaining": 6, "usedFraction": 0.94, "remainingFraction": 0.06000000000000005, "unit": "percent" },
          "status": "warning"
        }
      ]
    },
    {
      "provider": "ollama-cloud",
      "fetchedAt": 1789708505900,
      "limits": [],
      "notes": [
        "Ollama does not expose a standalone quota usage API; per-response token usage is reported during requests."
      ]
    },
    {
      "provider": "google-antigravity",
      "fetchedAt": 1789708505900,
      "limits": [
        {
          "id": "google-antigravity:google:default:gemini-weekly",
          "label": "Gemini",
          "scope": { "provider": "google-antigravity", "windowId": "weekly" },
          "window": { "id": "weekly", "label": "Weekly", "durationMs": 604800000, "resetsAt": 1790313306000 },
          "amount": { "unit": "percent", "remainingFraction": 1, "usedFraction": 0, "remaining": 100, "used": 0, "limit": 100 },
          "status": "ok"
        },
        {
          "id": "google-antigravity:google:default:gemini-5h",
          "label": "Gemini",
          "scope": { "provider": "google-antigravity", "windowId": "5h" },
          "window": { "id": "5h", "label": "5 Hour", "durationMs": 18000000, "resetsAt": 1789726506000 },
          "amount": { "unit": "percent", "remainingFraction": 1, "usedFraction": 0, "remaining": 100, "used": 0, "limit": 100 },
          "status": "ok"
        },
        {
          "id": "google-antigravity:anthropic:default:3p-weekly",
          "label": "Claude & GPT (shared)",
          "scope": { "provider": "google-antigravity", "windowId": "weekly", "shared": true, "sharedGroup": "3p-weekly:weekly" },
          "window": { "id": "weekly", "label": "Weekly", "durationMs": 604800000, "resetsAt": 1790313306000 },
          "amount": { "unit": "percent", "remainingFraction": 1, "usedFraction": 0, "remaining": 100, "used": 0, "limit": 100 },
          "status": "ok"
        },
        {
          "id": "google-antigravity:openai:default:3p-weekly",
          "label": "Claude & GPT (shared)",
          "scope": { "provider": "google-antigravity", "windowId": "weekly", "shared": true, "sharedGroup": "3p-weekly:weekly" },
          "window": { "id": "weekly", "label": "Weekly", "durationMs": 604800000, "resetsAt": 1790313306000 },
          "amount": { "unit": "percent", "remainingFraction": 1, "usedFraction": 0, "remaining": 100, "used": 0, "limit": 100 },
          "status": "ok"
        },
        {
          "id": "google-antigravity:anthropic:default:3p-5h",
          "label": "Claude & GPT (shared)",
          "scope": { "provider": "google-antigravity", "windowId": "5h", "shared": true, "sharedGroup": "3p-5h:5h" },
          "window": { "id": "5h", "label": "5 Hour", "durationMs": 18000000, "resetsAt": 1789726506000 },
          "amount": { "unit": "percent", "remainingFraction": 1, "usedFraction": 0, "remaining": 100, "used": 0, "limit": 100 },
          "status": "ok"
        },
        {
          "id": "google-antigravity:openai:default:3p-5h",
          "label": "Claude & GPT (shared)",
          "scope": { "provider": "google-antigravity", "windowId": "5h", "shared": true, "sharedGroup": "3p-5h:5h" },
          "window": { "id": "5h", "label": "5 Hour", "durationMs": 18000000, "resetsAt": 1789726506000 },
          "amount": { "unit": "percent", "remainingFraction": 1, "usedFraction": 0, "remaining": 100, "used": 0, "limit": 100 },
          "status": "ok"
        }
      ]
    },
    {
      "provider": "xai-oauth",
      "fetchedAt": 1789708507097,
      "limits": [
        {
          "id": "xai-oauth:credits:1w",
          "label": "SuperGrok Weekly Credits",
          "scope": { "provider": "xai-oauth", "windowId": "1w", "shared": true },
          "window": { "id": "1w", "label": "Weekly", "durationMs": 604800000, "resetsAt": 1790248270769 },
          "amount": { "used": 0, "limit": 100, "remaining": 100, "usedFraction": 0, "remainingFraction": 1, "unit": "percent" },
          "status": "ok"
        }
      ]
    },
    {
      "provider": "cursor",
      "fetchedAt": 1789708505901,
      "limits": [
        {
          "id": "cursor:requests:gpt-4",
          "label": "gpt-4 requests",
          "scope": { "provider": "cursor", "windowId": "monthly" },
          "window": { "id": "monthly", "label": "Monthly", "resetsAt": 1789749656000 },
          "amount": { "used": 0, "unit": "requests" }
        },
        {
          "id": "cursor:usd:individual-auto",
          "label": "Cursor Models",
          "scope": { "provider": "cursor", "windowId": "monthly" },
          "window": { "id": "monthly", "label": "Monthly", "resetsAt": 1789749656000 },
          "amount": { "used": 100, "usedFraction": 1, "unit": "percent" },
          "status": "exhausted"
        },
        {
          "id": "cursor:usd:individual-api",
          "label": "Other Models",
          "scope": { "provider": "cursor", "windowId": "monthly" },
          "window": { "id": "monthly", "label": "Monthly", "resetsAt": 1789749656000 },
          "amount": { "used": 20, "limit": 20, "remaining": 0, "usedFraction": 1, "remainingFraction": 0, "unit": "usd" },
          "status": "exhausted"
        },
        {
          "id": "cursor:usd:individual-ondemand",
          "label": "On-Demand Usage",
          "scope": { "provider": "cursor", "windowId": "monthly" },
          "window": { "id": "monthly", "label": "Monthly", "resetsAt": 1789749656000 },
          "amount": { "used": 20.18, "limit": 20, "remaining": 0, "usedFraction": 1.009, "remainingFraction": 0, "unit": "usd" },
          "status": "exhausted"
        }
      ]
    },
    {
      "provider": "anthropic",
      "fetchedAt": 1789708506359,
      "limits": [
        {
          "id": "anthropic:5h",
          "label": "Claude 5 Hour",
          "scope": { "provider": "anthropic", "windowId": "5h", "shared": true },
          "window": { "id": "5h", "label": "5 Hour", "durationMs": 18000000, "resetsAt": 1789714800191 },
          "amount": { "used": 14, "limit": 100, "remaining": 86, "usedFraction": 0.14, "remainingFraction": 0.86, "unit": "percent" },
          "status": "ok"
        },
        {
          "id": "anthropic:7d",
          "label": "Claude 7 Day",
          "scope": { "provider": "anthropic", "windowId": "7d", "shared": true },
          "window": { "id": "7d", "label": "7 Day", "durationMs": 604800000, "resetsAt": 1790197200191 },
          "amount": { "used": 6, "limit": 100, "remaining": 94, "usedFraction": 0.06, "remainingFraction": 0.94, "unit": "percent" },
          "status": "ok"
        },
        {
          "id": "anthropic:7d:fable",
          "label": "Claude 7 Day (Fable)",
          "scope": { "provider": "anthropic", "windowId": "7d", "tier": "fable" },
          "window": { "id": "7d", "label": "7 Day", "durationMs": 604800000, "resetsAt": 1790197200000 },
          "amount": { "used": 0, "limit": 100, "remaining": 100, "usedFraction": 0, "remainingFraction": 1, "unit": "percent" },
          "status": "ok"
        }
      ]
    }
  ],
  "accountsWithoutUsage": [],
  "disabledCredentials": [],
  "capacity": {
    "openai-codex": [
      { "window": "5h", "durationMs": 18000000, "meter": "chat", "accounts": 1, "usedAccounts": 0, "remainingAccounts": 1 },
      { "window": "7d", "durationMs": 604800000, "meter": "chat", "accounts": 1, "usedAccounts": 0.94, "remainingAccounts": 0.06000000000000005 }
    ],
    "google-antigravity": [
      { "window": "5h", "durationMs": 18000000, "accounts": 1, "usedAccounts": 0, "remainingAccounts": 1 },
      { "window": "7d", "durationMs": 604800000, "accounts": 1, "usedAccounts": 0, "remainingAccounts": 1 }
    ],
    "xai-oauth": [
      { "window": "7d", "durationMs": 604800000, "accounts": 1, "usedAccounts": 0, "remainingAccounts": 1 }
    ],
    "cursor": [
      { "window": "Monthly", "accounts": 1, "usedAccounts": 1.009, "remainingAccounts": 0 }
    ],
    "anthropic": [
      { "window": "5h", "durationMs": 18000000, "accounts": 1, "usedAccounts": 0.14, "remainingAccounts": 0.86 },
      { "window": "7d", "durationMs": 604800000, "accounts": 1, "usedAccounts": 0.06, "remainingAccounts": 0.94 }
    ]
  }
}

export const SNAPSHOT_STDOUT = JSON.stringify(SNAPSHOT)
