# Session Activity Indicators Design

**Issue:** #109  
**Milestone:** 0.7.0  
**Base branch:** `prerelease/0.7.x`

## Goal

Show independent, accessible per-session tab indicators for active work and unread completed responses. A working session displays a theme-aware progress ring. A completed response on a session that is not currently viewed displays a green dot until that live tab is viewed, after which the dot clears while the session remains waiting. These requirements are recorded on #109.

## Existing boundaries

`ManagedSessionSnapshot` already separates process lifecycle (`starting | running | closing`) from activity (`idle | working | waiting`), and every live snapshot crosses the panel protocol directly (`src/sessions/sessionTypes.ts:L5-L20`, `src/panel/protocol.ts:L43-L60`). `SessionManager.setActivity` publishes immutable activity changes, while the attention watcher currently maps `UserPromptSubmit` to working, `Stop` to idle, selected prompt notifications to waiting, and `SessionEnd` to idle (`src/sessions/sessionManager.ts:L361-L369`, `src/attention/attentionSignalWatcher.ts:L262-L288`).

The panel already tracks the active session, observes webview visibility, and posts incremental session and active-session updates (`src/panel/sessionPanelProvider.ts:L71-L120`, `src/panel/sessionPanelProvider.ts:L402-L428`). The renderer already turns a tab click into `selectSession` and applies selected, starting, and closing presentation in `createTab` (`src/panel/webview/renderer.ts:L430-L449`, `src/panel/webview/renderer.ts:L676-L695`). The feature therefore extends established state and transport seams rather than inspecting rendered terminal text, satisfying #109's structured-signal requirement.

## Decisions

### D1 — Unread response is orthogonal snapshot state

Add a required boolean `hasUnreadResponse` to `ManagedSessionSnapshot` alongside `activity`. Do not add `unread` to `SessionActivity`: a session can be waiting with either a viewed or unviewed response, and unread status must clear without changing its activity. Keeping the boolean orthogonal also preserves the existing separation from lifecycle and selected-tab state required by #109.

The field is ephemeral live-session state. It defaults to `false`, is never persisted in resumable-session metadata, and disappears when the live record is removed. The protocol's exact-key validator must require the field because snapshots are transported directly and currently reject missing or excess keys (`src/panel/protocol.ts:L259-L288`).

### D2 — Apply attention transitions atomically

Replace the watcher's activity-only mutation boundary with one atomic manager operation that can update both `activity` and `hasUnreadResponse` in a single published snapshot. This prevents transient combinations such as `waiting` with a stale unread value from being rendered or consumed by #113. Preserve no-op behavior for unknown sessions and unchanged transitions, matching `setActivity` today (`src/sessions/sessionManager.ts:L361-L369`).

The structured hook mapping becomes:

| Signal | Activity | Unread response |
| --- | --- | --- |
| New live session | `idle` | `false` |
| `UserPromptSubmit` | `working` | `false` |
| `Stop` while the session is viewed | `waiting` | `false` |
| `Stop` while the session is not viewed | `waiting` | `true` |
| `Notification: permission_prompt | agent_needs_input | elicitation_dialog` | `waiting` | `false` |
| `Notification: idle_prompt` | `idle` | `false` |
| `SessionEnd`, close, failure, or removal | no observable live state | no observable live state |

This intentionally changes the current `Stop → idle` mapping (`src/attention/attentionSignalWatcher.ts:L269-L272`). It implements the approved #109 refinement that a completed response remains waiting after its unread marker clears.

### D3 — “Viewed” means active in a visible Claude Workspaces view

A completed response is viewed at event time only when its session is active and the Claude Workspaces webview is visible. Window focus is not part of this rule: the panel provider has a reliable visibility signal, while active-session identity already belongs to the session source (`src/panel/sessionPanelProvider.ts:L79-L115`, `src/sessions/sessionManager.ts:L67-L74`).

Unread state clears through either of these user-visible paths:

1. The user selects the unread live tab while the view is visible. The renderer already emits `selectSession` for a tab click (`src/panel/webview/renderer.ts:L442-L449`).
2. The Claude Workspaces view becomes visible while its active tab is unread. The provider already listens for visibility changes (`src/panel/sessionPanelProvider.ts:L114-L120`).

Selecting a session through a background command without revealing the view does not clear unread state. Notification-click routing reveals the Sessions view before activating its session, so it will clear through the same visible-view rule (`src/attention/attentionNotificationSelection.ts:L15-L32`).

### D4 — Keep working, unread, selection, and lifecycle visually independent

`createTab` renders status children instead of assigning the whole display name through `textContent`:

- `state === "running" && activity === "working"`: show a theme-aware ring before the label.
- `state === "running" && hasUnreadResponse`: show a green dot before the label.
- viewed waiting or idle: show no activity marker.
- starting or closing: retain the existing subdued lifecycle styling and suppress both markers.
- selected: retain the existing active-tab treatment regardless of activity.

The ring and dot are decorative descendants. The button's accessible name and tooltip include `working` or `unread response`, so neither meaning relies on motion or color alone. Concurrent sessions render directly from their own snapshots, preserving independent indicators.

### D5 — #113 counts waiting, not unread

The future aggregate badge in #113 continues to count distinct live sessions where `state === "running" && activity === "waiting"`. Viewing a response clears only `hasUnreadResponse`; the session remains part of the waiting count. This matches the approved interaction shown before implementation and #113's existing requirement to count waiting sessions rather than unread markers (#113).

## Data flow

```text
Claude hook
  → AttentionSignalWatcher
  → atomic SessionManager attention transition
  → ManagedSessionSnapshot { state, activity, hasUnreadResponse }
  → SessionPanelProvider incremental update
  → closed panel protocol
  → renderer tab ring / green dot / accessible name

visible tab selection or view reveal
  → mark live session viewed
  → hasUnreadResponse = false
  → same snapshot publication path
```

## Component changes

- `src/sessions/sessionTypes.ts`: require `hasUnreadResponse` on live snapshots.
- `src/sessions/sessionManager.ts`: initialize unread state, apply atomic attention transitions, and clear unread for a viewed live session.
- `src/attention/attentionSignalWatcher.ts`: map structured hook events to the atomic attention transition and evaluate the injected viewed predicate for `Stop`.
- `src/extension.ts`: maintain the panel visibility boundary and wire the view predicate without coupling hook ingestion to renderer internals.
- `src/panel/sessionPanelProvider.ts`: report visibility changes and clear the active session when it becomes visibly viewed.
- `src/panel/protocol.ts`: validate the required unread boolean.
- `src/panel/webview/renderer.ts`: render independent status markers and accessible tab text.
- `src/panel/webview/styles.css`: style the theme-aware working ring and green unread dot while preserving active and lifecycle styles.
- `README.md`: document the working ring, unread dot, clearing behavior, and relationship to waiting.

## Testing

- Protocol tests require a boolean `hasUnreadResponse`, accept both values, and reject omission or non-booleans.
- Session-manager tests cover defaults, atomic transitions, no-op updates, clearing viewed state, closing/removal, and independent concurrent sessions.
- Attention-watcher tests cover `UserPromptSubmit`, viewed and unviewed `Stop`, prompt notifications, idle prompts, and session end.
- Panel-provider tests cover visible-active suppression, tab selection clearing, hidden selection retention, reveal clearing, and view replacement/disposal.
- Renderer tests cover ring and dot markup, selected versus unselected tabs, starting/closing suppression, accessible names, independent concurrent indicators, and dot removal after an update.
- Integration tests cover a structured hook sequence from working through unread response to viewed waiting.
- The full unit and supported-host integration suites remain the release gate.

## Out of scope

- Persisting unread state after a managed process exits.
- Adding unread markers to resumable saved sessions.
- Changing native waiting-session notification policy from #51.
- Implementing the aggregate view badge tracked by #113.
- Inferring response completion from terminal text.
