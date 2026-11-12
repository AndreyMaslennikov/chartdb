#!/usr/bin/env bash
# Builds the ChartDB docker image for linux/amd64, see _build.sh for the options.
exec "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/_build.sh" amd64 "$@"
