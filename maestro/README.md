# ShareText Maestro E2E Test Suite

This directory contains Maestro test flows for end-to-end testing of ShareText.

## Prerequisites

1. **Java Runtime**: Maestro requires Java 11+ to run
   ```bash
   # Install Java (Windows)
   winget install EclipseAdoptium.Temurin.21.JDK
   
   # Or download from: https://adoptium.net/
   ```

2. **Maestro CLI**: Install Maestro
   ```bash
   # macOS/Linux
   curl -Ls "https://get.maestro.mobile.dev" | bash
   
   # Windows (PowerShell)
   Invoke-WebRequest -Uri "https://get.maestro.mobile.dev" -OutFile maestro-install.ps1
   .\maestro-install.ps1
   ```

3. **ShareText Running**: Start the dev server
   ```bash
   cd ShareTexts
   npm run dev
   ```

## Running Tests

### Run all tests
```bash
maestro test maestro/flows/
```

### Run specific test
```bash
maestro test maestro/flows/01-landing-page.yml
```

### Run tests with tags
```bash
maestro test --include-tags=smoke maestro/flows/
```

## Test Flows

| Flow | Description | Tags |
|------|-------------|------|
| `01-landing-page.yml` | Landing page renders correctly | landing, smoke |
| `02-create-session.yml` | Session creation flow | session, create, smoke |
| `03-join-session.yml` | Join session flow | session, join, smoke |
| `04-connected-view.yml` | Connected session UI | connected, ui |
| `05-text-transfer.yml` | Text send/receive | transfer, text, e2e |
| `06-error-states.yml` | Error handling | error, edge-case |
| `07-404-page.yml` | 404 page styling | 404, navigation |
| `08-dark-mode.yml` | Dark mode toggle | dark-mode, theme |
| `09-responsive-design.yml` | Responsive layouts | responsive, mobile, desktop |
| `10-complete-journey.yml` | Full user journey | complete, journey, e2e |

## Notes

- **Two-Device Testing**: ShareText requires two devices to test transfers. The current flows test single-device UI. For full E2E testing, use the Playwright-based probes in `scripts/`.
- **Maestro Web Support**: Web testing is in beta. Some commands may behave differently than mobile.
- **Visual Testing**: Use `takeScreenshot` commands for visual regression testing.

## Alternative: Playwright Probes

For comprehensive two-device testing, use the existing Playwright probes:

```bash
# Run all probes
node scripts/probe-room-flow.mjs

# Run specific probes
node scripts/probe-hero-story.mjs
node scripts/probe-hero-perf.mjs
node scripts/probe-checksum.mjs
```

These probes test the complete transfer pipeline including WebRTC connections.
