#!/usr/bin/env bash
set -euo pipefail
developer="$(python3 - <<'PY'
import glob,re
from pathlib import Path
choices=glob.glob('/Applications/Xcode_26*.app')
if not choices:
    raise SystemExit('Xcode26 is required by react-native-camera-kit18; installed Xcodes: '+str(glob.glob('/Applications/Xcode*.app')))
choices.sort(key=lambda p:tuple(map(int,re.findall(r'\d+',Path(p).name))))
print(choices[-1]+'/Contents/Developer')
PY
)"
export DEVELOPER_DIR="$developer"
echo "DEVELOPER_DIR=$developer" >> "$GITHUB_ENV"
xcodebuild -version
xcrun --sdk iphoneos --show-sdk-version
