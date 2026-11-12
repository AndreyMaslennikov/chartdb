#!/usr/bin/env bash
# Builds the ChartDB docker image for linux/arm64, see _build.sh for the options.
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_build.sh" arm64 "$@"
