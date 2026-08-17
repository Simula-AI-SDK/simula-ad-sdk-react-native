# Releasing

Releases are published to npm by manually running
`.github/workflows/release.yml`. The workflow installs dependencies, runs the
Jest suite, builds the TypeScript package, and validates the npm package
contents before publishing. After npm publication succeeds, it creates a tag
matching the package version and a GitHub release containing the npm tarball.

## One-time setup

1. Create the GitHub `npm` environment:

   ```sh
   gh api --method PUT repos/Simula-AI-SDK/simula-ad-sdk-react-native/environments/npm
   ```

2. In the npm settings for `@simula/ads-react-native`, add a GitHub Actions
   trusted publisher with these exact values:

   - Organization or user: `Simula-AI-SDK`
   - Repository: `simula-ad-sdk-react-native`
   - Workflow filename: `release.yml`
   - Environment: `npm`
   - Allowed action: `npm publish`

3. Optionally add required reviewers to the GitHub `npm` environment to require
   manual approval before publication.

4. After one successful trusted publication, remove the old `NPM_TOKEN` GitHub
   secret, revoke the npm automation token, and configure npm publishing access
   to disallow token-based publication.

## Publish a version

1. Update the version in `package.json` and `package-lock.json` with
   `npm version <version> --no-git-tag-version`.
2. Set `s.version` in `simula-ads-react-native.podspec` to the same version.
3. Merge those changes into the commit that should be released.
4. Open the `Release` workflow in GitHub Actions and select `Run workflow`.
5. Select the release ref, enter the version, and start the workflow.

The requested version must exactly match `package.json`, both version fields in
`package-lock.json`, and the podspec. The workflow also verifies that the
Android `ad.simula:ad-sdk` version exists on Maven Central and the iOS
`SimulaAdSDK` version exists on CocoaPods. It rejects versions that already
exist on npm or already have a Git tag or GitHub release.

The selected ref is built and tested, and its exact tarball is published through
npm Trusted Publishing with automatic provenance. Only after publication
succeeds does the workflow create the version tag and GitHub release. If any
validation fails, nothing is published or tagged.
