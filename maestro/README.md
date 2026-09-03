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
| `01-home-screen.yml` | Home-screen idle hero smoke | home, smoke |
| `02-create-session.yml` | Sender panel (pairing code + share actions) | session, create, smoke |
| `03-join-session.yml` | Receiver / join panel | session, join, smoke |
| `04-qr-overlay.yml` | QR overlay open/close on the sender panel | session, qr, ui |
| `06-error-states.yml` | Invalid pairing code rejection | error, edge-case |
| `07-404-page.yml` | 404 screen + return home | 404, navigation |
| `10-complete-journey.yml` | Single-device panel navigation round-trip | complete, journey, e2e |

## Notes

- The flows target the single-screen app: every surface lives on one page (idle hero → sender/receiver panels), so single-device flows cover the reachable UI. Two-device transfers, reconnect, and rejoin require a second peer and are covered by the Playwright suite in `scripts/e2e.mjs`, which CI runs live.
- Viewport/theme/responsive coverage lives in the Playwright audits (`scripts/audit.mjs`, `scripts/audit-dark.mjs`), which is why no Maestro flow duplicates them.
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
