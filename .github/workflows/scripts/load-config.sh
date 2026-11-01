#!/usr/bin/env bash
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 "$HERE/config.py" masks "$1" || return 1
CONFIG_EXPORTS="$(python3 "$HERE/config.py" shell "$1")" || return 1
eval "$CONFIG_EXPORTS"
unset CONFIG_EXPORTS
