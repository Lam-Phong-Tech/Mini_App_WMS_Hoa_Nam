#!/usr/bin/env bash
set -euo pipefail
mkdir -p ios-output
[[ "$(uname -s)" == Darwin ]] || { echo 'macOS required'; exit 1; }
grep -Eq "BUILD_PROFILE: DeploymentTier = 'dev-test'" src/config/buildProfile.ts
xcodebuild -version | tee ios-output/xcode.txt
node --version | tee ios-output/node.txt
bundle config set --local path vendor/bundle
bundle install --jobs 4 --retry 2 > ios-output/bundler.log 2>&1
bundle exec ruby scripts/ios/register-native.rb | tee ios-output/native-registration.log
export NODE_BINARY="$(command -v node)"
export CI=1
(cd ios && bundle exec pod install --repo-update) > ios-output/pods.log 2>&1 || { tail -100 ios-output/pods.log; exit 1; }
xcodebuild -workspace ios/WmsMobile.xcworkspace -scheme WmsMobile -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' -archivePath "$PWD/ios-output/WmsMobile.xcarchive" -derivedDataPath "$RUNNER_TEMP/wms-ios-derived" archive CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= DEVELOPMENT_TEAM= COMPILER_INDEX_STORE_ENABLE=NO > ios-output/archive.log 2>&1 || { tail -140 ios-output/archive.log; exit 1; }
app="$PWD/ios-output/WmsMobile.xcarchive/Products/Applications/WmsMobile.app"
[[ -d "$app" ]] || { echo 'Device app archive not produced'; exit 1; }
file "$app/WmsMobile" | tee ios-output/executable.txt
otool -l "$app/WmsMobile" > ios-output/macho-load-commands.txt
python3 scripts/ios/package_unsigned.py "$app" "ios-output/ScannerHNApp-DEVTEST-unsigned.ipa" --source-sha "$GITHUB_SHA" | tee ios-output/ipa-verification.json
shasum -a 256 ios-output/ScannerHNApp-DEVTEST-unsigned.ipa > ios-output/SHA256SUMS.txt
