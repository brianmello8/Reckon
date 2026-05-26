#!/bin/bash
# Checks that no source file logs something that looks like a provider API key.
# Matches patterns like: console.log(...sk-...) or console.error(...sk-...)

MATCHES=$(grep -rn --include='*.ts' --include='*.tsx' \
  -E 'console\.(log|error|warn|info|debug)\(.*sk-[A-Za-z0-9]' \
  app/ lib/ workers/ components/ 2>/dev/null || true)

if [ -n "$MATCHES" ]; then
  echo "ERROR: Potential API key logging detected:"
  echo "$MATCHES"
  exit 1
fi

echo "No API key logging detected."
exit 0
