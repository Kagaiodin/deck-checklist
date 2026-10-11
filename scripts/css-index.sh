#!/bin/sh
# Print a compact section index of src/App.css: "<line> <section name>".
# Headers are the source of truth, so this never goes stale.
grep -n '^/\* ───' "$(dirname "$0")/../src/App.css" | sed -E 's/ ─+ \*\/$//; s#^([0-9]+):/\* ─── #\1 #'
