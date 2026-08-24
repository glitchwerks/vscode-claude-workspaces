# Claude Workspaces

Manage workspace-aware Claude Code sessions across VS Code multi-root workspaces.

## Requirements

- VS Code 1.134.0 or later
- Node.js 20 or later
- npm

## Development

Install the exact dependencies from the lockfile:

```bash
npm ci
```

Available commands:

```bash
npm run check:types
npm run lint
npm run build
npm run build:production
npm run test:unit
npm run test:integration
npm test
npm run package:vsix
```

Press `F5` in VS Code to launch an Extension Development Host after installing
dependencies. Integration tests download a compatible VS Code test instance on
first use. Packaged VSIX files are written under `dist/`.
