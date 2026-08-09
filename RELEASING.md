# Releasing

Releases are published to npm by manually running
`.github/workflows/release.yml`. The workflow installs dependencies, runs the
Jest suite, builds the TypeScript package, and validates the npm package
contents before publishing.

## One-time setup

1. Create an npm granular access token with read and write access to
   `@simula/ads-react-native` and permission to bypass two-factor authentication.
2. Add the token to the GitHub `npm` environment as an `NPM_TOKEN` secret.
3. Optionally add required reviewers to the `npm` environment to require manual
   approval before publication.

## Publish a version

1. Update the version in `package.json` and `package-lock.json` with
   `npm version <version> --no-git-tag-version`.
2. Set `s.version` in `simula-ads-react-native.podspec` to the same version.
3. Merge those changes into the branch or tag that should be released.
4. Open the `Release` workflow in GitHub Actions and select `Run workflow`.
5. Select the release ref, enter the version, and start the workflow.

The requested version must exactly match both package versions. The workflow
builds and tests the selected ref, creates the npm tarball, and publishes that
exact artifact with npm provenance. If any validation fails, the publish job
does not run.
