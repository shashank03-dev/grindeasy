# Changelog

All notable changes to grindeasy are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html). Versions match the
npm package (the local agent); website-only changes are noted as such.

## [Unreleased]

## [0.9.0] — 2026-07-17

### Added
- "Add to Slack": `grindeasy webhook` can now open your browser, let you pick a
  channel, and have Slack create the webhook for you — no more making one by
  hand. Your terminal names the channel it's about to save and asks you to
  confirm, and says plainly when saving would replace a webhook you already
  had. Pasting a URL is still offered, and is still the way to use a
  self-hosted Slack-compatible endpoint. The webhook goes straight from Slack to
  your machine: grindeasy's server brokers the handoff, stores no webhook, and
  never posts on your behalf.

## [0.8.0] — 2026-07-17

### Added
- Slack webhook setup now lives in the terminal: first-run onboarding offers to
  post your weekly recap to Slack, and `grindeasy webhook` (no argument) runs the
  same guided setup — paste the URL, it sends a test message, and only saves the
  URL if that message lands. Existing installs get the offer once. Editing
  `slackWebhookUrl` by hand still works. `grindeasy webhook test` re-posts to the
  configured URL as before.

## [0.7.0] — 2026-07-17

### Added
- Weekly per-tool breakdown: the dashboard's Weekly tab and the `grindeasy
  weekly` panel now list hours for each tool used in the last 7 days, not just
  the single top tool.
- README documents the local JSON endpoint at `/api/stats`.

### Changed
- The dashboard server now binds to loopback (`127.0.0.1`) instead of all
  interfaces, so it's reachable from your own machine but not from other devices
  on the network.
- Slack webhook notifier: set `slackWebhookUrl` in the config and grindeasy
  posts last week's recap (hours, delta, per-tool breakdown, combos, goal) to
  that channel once each new week begins. `grindeasy webhook test` posts on
  demand to verify the URL. The agent talks to Slack directly; nothing is
  uploaded to grindeasy's servers.

## [0.6.0] — 2026-07-17

### Added
- `grindeasy weekly`: a last-7-days recap panel (hours, day-by-day sparkline,
  avg/day, best day, top tool) plus an optional `weeklyGoalHours` progress ring.
- Weekly leaderboard and a per-user weekly card on the website.
- Landing hero types out the name of whichever tool it detects.

## [0.5.2] — 2026-07-16

### Changed
- Opting into the background service from an `npx` run now installs grindeasy
  globally at that moment, so the service has a permanent command to launch.

## [0.5.1] — 2026-07-16

### Added
- `--help`, `--version`, and a guard that reports unknown commands instead of
  silently doing nothing.

## [0.5.0] — 2026-07-16

### Added
- Tool auto-detection catalog covering 13 tools, with branded first-run
  onboarding.
- Terminal-green visual identity across the card, dashboard, and website.
- Landing page rework (particle hero, tool showcase, privacy section).

### Fixed
- Copilot presence now requires a real Copilot chat directory before counting.
- Discord presence timer no longer resets on unchanged sessions.

## [0.3.3] — 2026-07-11

### Added
- Background service installer (systemd user unit, launchd agent, Windows
  per-user run entry) so tracking survives closing the terminal and reboots.

[Unreleased]: https://github.com/shashank03-dev/grindeasy/compare/v0.9.0...HEAD
[0.9.0]: https://github.com/shashank03-dev/grindeasy/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/shashank03-dev/grindeasy/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/shashank03-dev/grindeasy/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/shashank03-dev/grindeasy/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/shashank03-dev/grindeasy/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/shashank03-dev/grindeasy/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/shashank03-dev/grindeasy/compare/v0.3.3...v0.5.0
[0.3.3]: https://github.com/shashank03-dev/grindeasy/releases/tag/v0.3.3
