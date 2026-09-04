#!/usr/bin/env bash
set -e
sed -E \
  -e "s/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}'s Account/[redacted-account]/g" \
  -e "s/[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}/[redacted-email]/g" \
  -e 's/\(".*"\) Environment Variable/("[configured]") Environment Variable/g' \
  -e 's/│([[:space:]]*)[a-f0-9]{32}([[:space:]]*)│/│\1[redacted-account-id]\2│/g'
