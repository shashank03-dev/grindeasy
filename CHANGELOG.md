# Changelog

All notable changes to grindeasy are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[semantic versioning](https://semver.org/spec/v2.0.0.html). Versions match the
npm package (the local agent); website-only changes are noted as such.

## [Unreleased]

### Added
- Weekly per-tool breakdown: the dashboard's Weekly tab and the `grindeasy
  weekly` panel now list hours for each tool used in the last 7 days, not just
  the single top tool.
- README documents the local JSON endpoint at `/api/stats`, including a note
  that the dashboard server listens on all network interfaces.

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

[Unreleased]: https://github.com/shashank03-dev/grindeasy/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/shashank03-dev/grindeasy/compare/v0.5.2...v0.6.0
[0.5.2]: https://github.com/shashank03-dev/grindeasy/compare/v0.5.1...v0.5.2
[0.5.1]: https://github.com/shashank03-dev/grindeasy/compare/v0.5.0...v0.5.1
[0.5.0]: https://github.com/shashank03-dev/grindeasy/compare/v0.3.3...v0.5.0
[0.3.3]: https://github.com/shashank03-dev/grindeasy/releases/tag/v0.3.3
