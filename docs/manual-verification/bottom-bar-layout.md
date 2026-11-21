# Bottom bar verification

Record the extension commit, VS Code build, OS, and theme. Open a saved multi-root
workspace in an isolated Extension Development Host with a synthetic Claude
executable. Use the VS Code Panel Position controls to test a bottom dock and a
side dock. Use the sizes below as webview targets, with a tighter panel as a
stress case.

| Placement | Webview size | Check |
| --- | --- | --- |
| Bottom | 960 × 420 CSS pixels | Full live-tab strip, native terminal, shared pane, and top actions fit |
| Side | 360 × 640 CSS pixels | Sessions picker reaches every live session, terminal remains visible, and tools wrap |
| Constrained | 320 × 320 CSS pixels | Bottom bar and popup controls fit. Long paths wrap. Terminal and open pane scroll within their own areas |

## Session controls

1. Open two sessions in different roots. Check **Launch details**, active and
   waiting states, keyboard tab and menu navigation, and the **Configure**
   workspace picker. Rename or close the intended live session using its tab
   context action.
2. Open **Actions → Resume Session…**. In a synthetic renderer run use 250 saved
   records, including two identical names with distinct launch paths. Find a
   record by name, root label, or full path. Scroll to the oldest row and check
   that search remains at the top. Change docking or resize during an open
   search and check the query and focus.
3. Use the **×** on a filtered row. Check that the other matching row remains
   and focus moves to the next result or the search field. Select a result
   directly to resume it. Open **Sessions** and restore a named draft-only
   session.

## Shared pane and native terminal

1. Open **Prompt editor**, edit a draft, and switch to **Reply capture**. Open
   the editor again and verify its text and selection. Switch sessions with the
   pane open. Check each session's own draft, recent prompts, and reply.
2. Drag the divider, resize it with the arrow keys, and try Expand and Collapse.
   Change docking with each pane open. Check that the shared divider and terminal
   remain usable and the saved size carries across docks. At the constrained
   size, expand **Launch details** and set the divider to its maximum. Check
   that the full paths wrap and the raw terminal retains multiple rows.
3. Open **Reply capture** before a reply arrives. Check the availability status,
   automatic reply or manual import, Copy and Review targets, and focus while a
   delayed reply arrives. Open and dismiss a prompt picker with Escape.
4. Choose **Raw** or **Respond in terminal**. Confirm that focus enters the same
   terminal. With a synthetic prompt, exercise native keyboard input while the
   reply pane is open. Repeat the flows in a high-contrast theme.

For physical IME, native permission, and clipboard readback qualification on an
installed candidate, use the existing
[composer acceptance](https://github.com/glitchwerks/vscode-claude-workspaces/issues/145)
and [reply acceptance](https://github.com/glitchwerks/vscode-claude-workspaces/issues/225)
requirements. Record evidence against the candidate that was actually exercised.
