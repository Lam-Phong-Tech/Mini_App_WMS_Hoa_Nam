// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "WmsDocumentCore",
    platforms: [.macOS(.v13), .iOS(.v15)],
    products: [.library(name: "WmsDocumentCore", targets: ["WmsDocumentCore"])],
    targets: [
        .target(name: "WmsDocumentCore"),
        .testTarget(name: "WmsDocumentCoreTests", dependencies: ["WmsDocumentCore"])
    ],
    swiftLanguageVersions: [.v5]
)
