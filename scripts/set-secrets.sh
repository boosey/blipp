#!/bin/bash
# Batch-set Cloudflare Worker secrets from an env file.
# Usage: bash scripts/set-secrets.sh secrets.env [--env staging|production]
#
# File format (one per line):
#   KEY=value
#   # comments and blank lines are skipped
#
# WARNING: Delete the secrets file immediately after use!

set -euo pipefail

# Use global wrangler if available (avoids WSL/cross-platform npx issues)
if command -v wrangler > /dev/null 2>&1; then
  WRANGLER="wrangler"
else
  WRANGLER="npx wrangler"
fi

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <secrets-file> [--env <environment>]"
  echo ""
  echo "Example: $0 secrets.env"
  echo "         $0 secrets.env --env production"
  exit 1
fi

SECRETS_FILE="$1"
shift
ENV_FLAG="${*:-}"

if [ ! -f "$SECRETS_FILE" ]; then
  echo "Error: File '$SECRETS_FILE' not found"
  exit 1
fi

# Strip Windows \r line endings
sed -i 's/\r$//' "$SECRETS_FILE" 2>/dev/null || true

echo "Setting Cloudflare Worker secrets from $SECRETS_FILE..."
echo ""

count=0
while IFS= read -r line; do
  # Skip empty lines and comments
  [[ -z "$line" || "$line" == \#* ]] && continue

  # Split on first = only
  key="${line%%=*}"
  value="${line#*=}"

  # Skip if no = found
  [[ "$key" == "$line" ]] && continue

  echo "  Setting: $key"
  echo "$value" | $WRANGLER secret put "$key" $ENV_FLAG 2>&1 | grep -v "^$" || true
  count=$((count + 1))
done < "$SECRETS_FILE"

echo ""
echo "Done! Set $count secrets."
echo ""
echo "IMPORTANT: Delete '$SECRETS_FILE' now!"
echo "  rm $SECRETS_FILE"
