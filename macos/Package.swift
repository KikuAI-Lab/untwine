// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "UntwineMac",
  platforms: [
    .macOS(.v13)
  ],
  products: [
    .executable(name: "UntwineMac", targets: ["UntwineMac"])
  ],
  targets: [
    .executableTarget(
      name: "UntwineMac",
      path: "Sources/UntwineMac"
    )
  ],
  swiftLanguageModes: [.v5]
)
