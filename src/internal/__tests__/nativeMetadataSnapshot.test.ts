import { readFileSync } from "fs";
import { resolve } from "path";

const repositoryRoot = resolve(__dirname, "../../..");
const jsSource = readFileSync(
  resolve(repositoryRoot, "src/nativeAd/NativeAd.tsx"),
  "utf8",
);
const androidSource = readFileSync(
  resolve(
    repositoryRoot,
    "android/src/main/java/com/simulaads/reactnative/SimulaNativeAdView.kt",
  ),
  "utf8",
);
const iosSource = readFileSync(
  resolve(repositoryRoot, "ios/SimulaNativeAdView.swift"),
  "utf8",
);

describe("NativeAd metadata load-time snapshot contract", () => {
  it("keeps metadata changes out of the current JS load identity", () => {
    expect(jsSource).toContain("const metadataLoadKey = JSON.stringify([");
    expect(jsSource).toContain("const [metadataSnapshot, setMetadataSnapshot]");
    expect(jsSource).toContain("metadataJson={metadataJson}");
  });

  it("captures immutable metadata when Android commits a new slot identity", () => {
    const identityGuard = androidSource.indexOf(
      "if (committedKey == propKey) return",
    );
    const snapshot = androidSource.indexOf(
      "val metadataSnapshot = parseMetadata(metadataJson)",
    );

    expect(identityGuard).toBeGreaterThan(-1);
    expect(snapshot).toBeGreaterThan(identityGuard);
    expect(androidSource).toContain("metadata = metadataSnapshot");
  });

  it("does not remount iOS for metadata-only updates after mounting", () => {
    expect(iosSource).toMatch(
      /@objc var metadataJson: NSString\? \{\s*didSet \{\s*if hostingController == nil \{ setNeedsMount\(\) \}/,
    );
    expect(iosSource).toContain(
      "metadata: parseMetadata(metadataJson as String?)",
    );
  });
});
