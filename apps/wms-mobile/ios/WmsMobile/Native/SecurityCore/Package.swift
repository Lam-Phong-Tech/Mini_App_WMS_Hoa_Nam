// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "WmsSecurityCore",
    platforms: [.macOS(.v13), .iOS("15.1")],
    products: [.library(name: "WmsSecurityCore", targets: ["WmsSecurityCore"])],
    targets: [
        .target(name: "WmsSecurityCore", linkerSettings: [.linkedFramework("Security")]),
        .testTarget(name: "WmsSecurityCoreTests", dependencies: ["WmsSecurityCore"]),
    ],
    swiftLanguageVersions: [.v5]
)
