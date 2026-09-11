# Designer deploy/source mapping — Prompt 00 / D07

Checked on 2026-09-11 using public, read-only sources:

- `git ls-remote https://github.com/Duc-Nguyen98/ScannerHNApp.git HEAD refs/heads/main` returned `90b0032b970e4f40cf4ccc8a95407577f1ab720a` for both `HEAD` and `main`.
- The current GitHub Pages root `https://duc-nguyen98.github.io/ScannerHNApp/` was fetched and compared to `docs/index.html` from local clone at that commit.
- Raw file hashes differ only from line-ending normalization. After normalizing CRLF to LF, both sources have SHA-256 `92a5065b7d41cfe01660e339e822dffeb4617b7f344582b1de2f13ce99a9d843`.

This is sufficient evidence that the currently served Pages entry document is the entry document in source commit `90b0032b…`. GitHub’s Pages REST endpoint returned 404 for this public repository, so the evidence is a direct content comparison rather than a deployment-API record.
