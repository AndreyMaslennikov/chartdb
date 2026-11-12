#!/usr/bin/env bash
#
# Builds the ChartDB docker image for linux/arm64 or linux/amd64.
# Use the wrappers build-arm64.sh / build-amd64.sh instead of calling this.
#
#   ./scripts/docker/build-arm64.sh [--save] [--name NAME] [--dry-run]
#   ./scripts/docker/build-amd64.sh [--save] [--name NAME] [--dry-run]
#
# arm64: Apple Silicon Macs, ARM servers.
# amd64: Intel Macs, Ubuntu and other x86_64 Linux servers, Docker Desktop on
#        Windows (WSL 2 backend).
# The images are Linux images, Docker Desktop runs them on macOS and Windows.
#
# The image is tagged NAME:<arch> (NAME defaults to "chartdb"). --save also
# writes scripts/docker/out/NAME-<arch>.tar.gz, load it on the target machine
# with: gunzip -c NAME-<arch>.tar.gz | docker load
#
# Notes:
# - A different architecture than the host is built under emulation, it is
#   slow. On a plain Linux host this needs qemu/binfmt
#   (docker run --privileged --rm tonistiigi/binfmt --install all).
# - `npm run build` runs out of memory with the default Node heap in the
#   builder stage, so a temporary Dockerfile with a bigger heap is used. The
#   Dockerfile in the repository is not modified.
# - No VITE_OPENAI_* build args are passed on purpose: they would end up in
#   the image layers and be served in plain text from /config.js.

set -euo pipefail

usage() {
    sed -n '3,26p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
}

ARCH="${1:-}"
[ $# -gt 0 ] && shift

SAVE=0
DRY_RUN=0
NAME="chartdb"

while [ $# -gt 0 ]; do
    case "$1" in
        --save) SAVE=1 ;;
        --dry-run) DRY_RUN=1 ;;
        --name)
            NAME="${2:?--name needs a value}"
            shift
            ;;
        -h | --help)
            usage
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            usage >&2
            exit 1
            ;;
    esac
    shift
done

case "$ARCH" in
    arm64 | amd64) ;;
    -h | --help)
        usage
        exit 0
        ;;
    *)
        echo "Architecture must be arm64 or amd64, use build-arm64.sh / build-amd64.sh" >&2
        exit 1
        ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="$ROOT/scripts/docker/out"

run() {
    if [ "$DRY_RUN" -eq 1 ]; then
        echo "+ $*"
    else
        "$@"
    fi
}

if [ "$DRY_RUN" -eq 0 ]; then
    if ! docker info >/dev/null 2>&1; then
        echo "Docker daemon is not running. Start Docker Desktop (or the docker service) and try again." >&2
        exit 1
    fi
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# Bigger Node heap for the builder stage (see the notes above)
sed 's|^WORKDIR /usr/src/app|ENV NODE_OPTIONS=--max-old-space-size=4096\nWORKDIR /usr/src/app|' \
    "$ROOT/Dockerfile" >"$TMP_DIR/Dockerfile"

TAG="$NAME:$ARCH"
echo "==> Building $TAG (linux/$ARCH)"
run docker buildx build \
    --platform "linux/$ARCH" \
    --load \
    -f "$TMP_DIR/Dockerfile" \
    -t "$TAG" \
    "$ROOT"

if [ "$SAVE" -eq 1 ]; then
    FILE="$OUT_DIR/$NAME-$ARCH.tar.gz"
    echo "==> Saving $FILE"
    if [ "$DRY_RUN" -eq 1 ]; then
        echo "+ docker save $TAG | gzip > $FILE"
    else
        mkdir -p "$OUT_DIR"
        docker save "$TAG" | gzip >"$FILE"
    fi
fi

echo
echo "Done. Run it with:"
echo "  docker run -d --name chartdb -p 8080:80 -e DISABLE_ANALYTICS=true $NAME:$ARCH"
