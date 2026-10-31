# Cloudflare Pages hosting

Two independent Pages projects, both published by GitHub Actions through the direct upload API.

## Runtime project (CF_ASSETS_PROJECT)

Launcher files tied to the web app. History is kept by channel usage.

    /registry.json                        ledger: every runtime, its files, parts and hashes
    /ort/<ort-version>/<file>             single-part file
    /ort/<ort-version>/<file>.part<N>     parts of files above the part target
    /ort/<ort-version>/<file>.parts.json  descriptor: part paths, sizes, sha256

Retention: production keeps every runtime a supported app version can use (versions from the workers/api MIN_CLIENT_VERSION), other channels keep their five newest.

## Models project (CF_MODELS_PROJECT)

Hot-loaded models mirrored from upstream. Only the latest revision exists.

    /index.json                            directory of all models
    /models/<id>/model.json                persistent pointer: revision, files, parts, hashes
    /models/<id>/<file>.parts.json         persistent descriptor, part paths point into the current revision
    /blobs/<id>/<revision>/<file>[.partN]  immutable bytes of the current revision
    /registry.json                         ledger: upstream fingerprints and part hashes

Persistent URLs never change; their content follows the latest revision. A model removed from the catalog is delisted on the next run.

## Parts

Files above 24 MiB are split into the fewest parts that fit, with balanced sizes. Pages allows 25 MiB per file and 20000 files per project.
Clients read a descriptor, download parts with an adaptive number of connections and verify every part by sha256.
