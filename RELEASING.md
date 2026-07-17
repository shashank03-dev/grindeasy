# Releasing grindeasy

The npm package is the local agent (`dist/` built from `src/` by `tsc`). The
website deploys separately through Vercel on every push to `main`, so it isn't
part of this checklist. Follow these steps in order; the goal is that the git
tag, the npm release, and `CHANGELOG.md` always agree.

## Before you start

- On `main`, working tree clean, and `git pull` is up to date.
- Decide the bump with [semver](https://semver.org): patch for fixes, minor for
  backward-compatible features, major for breaking changes.

## Steps

1. **Verify green.**
   ```bash
   npm run typecheck
   npm test
   ```

2. **Update `CHANGELOG.md`.** Rename the `## [Unreleased]` heading to the new
   version with today's date, start a fresh empty `## [Unreleased]` above it, and
   fix the compare links at the bottom.

3. **Bump the version** (edits `package.json` + `package-lock.json`, no tag yet):
   ```bash
   npm version <patch|minor|major> --no-git-tag-version
   ```

4. **Commit** the bump and changelog together:
   ```bash
   git commit -am "chore(release): v$(node -p "require('./package.json').version")"
   ```

5. **Tag** the release commit:
   ```bash
   git tag "v$(node -p "require('./package.json').version")"
   ```

6. **Inspect the package contents** before the irreversible publish
   (`prepublishOnly` runs `npm run build` for you):
   ```bash
   npm publish --dry-run
   ```
   Confirm the tarball has `dist/`, `README.md`, and `LICENSE` and nothing stray.

7. **Publish:**
   ```bash
   npm publish
   ```

8. **Push** the commit and tag only after the publish succeeds, so the repo never
   advertises a release that isn't on npm:
   ```bash
   git push && git push --tags
   ```

## After

- `npm view grindeasy version` should show the new version.
- `npx grindeasy@latest --version` should match.
