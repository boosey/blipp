#!/bin/bash
# Batch-set Cloudflare Worker secrets from an env file.
#
# Usage:
#   bash scripts/set-secrets.sh secrets-staging.env staging
#   bash scripts/set-secrets.sh secrets-production.env production
#
# The second argument (staging|production) is REQUIRED to avoid
# wrangler warnings about ambiguous environment targeting.
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

if [ -z "${1:-}" ] || [ -z "${2:-}" ]; then
  echo "Usage: $0 <secrets-file> <environment>"
  echo ""
  echo "Examples:"
  echo "  $0 secrets-staging.env staging"
  echo "  $0 secrets-production.env production"
  echo ""
  echo "Environment must be 'staging' or 'production'."
  exit 1
fi

SECRETS_FILE="$1"
ENV_NAME="$2"

case "$ENV_NAME" in
  staging)
    ENV_FLAG='--env=""'
    DISPLAY_ENV="staging (top-level)"
    ;;
  production)
    ENV_FLAG="--env=production"
    DISPLAY_ENV="production"
    ;;
  *)
    echo "Error: Environment must be 'staging' or 'production', got '$ENV_NAME'"
    exit 1
    ;;
esac

if [ ! -f "$SECRETS_FILE" ]; then
  echo "Error: File '$SECRETS_FILE' not found"
  exit 1
fi

# Strip Windows \r line endings
sed -i 's/\r$//' "$SECRETS_FILE" 2>/dev/null || true

echo "Setting Cloudflare Worker secrets from $SECRETS_FILE ($DISPLAY_ENV)..."
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
