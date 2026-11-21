# Bottom bar verification

Record the extension commit, VS Code build, OS, and theme. Open a saved multi-root
workspace in an isolated Extension Development Host with a synthetic Claude
executable. Use the VS Code Panel Position controls to test a bottom dock and a
side dock. Use the sizes below as webview targets, with a tighter panel as a
stress case.

| Placement | Webview size | Check |
| --- | --- | --- |
| Bottom | 960 × 420 CSS pixels | Live tabs and actions share a row, with Sessions visible only when tabs overflow |
| Side | 360 × 640 CSS pixels | Sessions reaches every live tab when the header overflows and the terminal remains visible |
| Constrained | 320 × 320 CSS pixels | Bottom bar and popup controls fit. Long paths wrap. Terminal and open pane scroll within their own areas |

## Session controls

1. Open two sessions in different roots. Check **Launch details**, active and
   waiting states, keyboard tab and menu navigation, and the **Configure**
   workspace picker. Confirm that tabs start on the left and **New Session**,
   **Actions**, and **Configure** stay on the right of the same row. Resize until
   **Sessions** appears. Confirm that the active tab stays visible when it fits
   and that the picker lists every live session. Resize until the tabs fit again
   and check that focus returns to a visible tab or action. Rename or close a
   live session using its tab context action.
2. Open **Actions → Resume Session…**. In a synthetic renderer run use 250 saved
   records, including two identical names with distinct launch paths. Find a
   record by name, root label, or full path. Scroll to the oldest row and check
   that search remains at the top. Change docking or resize during an open
   search and check the query and focus.
3. Use the **×** on a filtered row. Check that the other matching row remains
   and focus moves to the next result or the search field. Select a result
   directly to resume it. Use **Actions → Restore Draft…** to restore a named
   draft-only session, including when all live tabs fit.

## Shared pane and native terminal

1. Open **Prompt editor**, edit a draft, and switch to **Reply capture**. Open
   the editor again and verify its text and selection. Switch sessions with the
   pane open. Check each session's own draft, recent prompts, and reply.
2. Drag the divider, resize it with the arrow keys, and try Expand and Collapse.
   Change docking with each pane open. Check that the shared divider and terminal
   remain usable and the saved size carries across docks. At the constrained
   size, set the divider to its maximum and open the **Launch details** popup.
   Check that full paths wrap, the popup fits the panel, and the terminal keeps
   its size. Press Escape and check that focus returns to **Launch details**.
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
