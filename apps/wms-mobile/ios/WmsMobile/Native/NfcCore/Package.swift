// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "NfcCore",
    platforms: [.macOS(.v13)],
    products: [.library(name: "NfcCore", targets: ["NfcCore"])],
    targets: [
        .target(name: "NfcCore"),
        .testTarget(name: "NfcCoreTests", dependencies: ["NfcCore"])
    ],
    swiftLanguageVersions: [.v5]
)
