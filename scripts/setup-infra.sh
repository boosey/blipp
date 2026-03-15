#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
# Blipp — Cloudflare Infrastructure Setup
# Creates R2 buckets, queues, and Hyperdrive configs
# for both staging and production environments.
#
# Prerequisites:
#   - wrangler CLI installed and authenticated (wrangler login)
#   - Neon connection strings ready (run setup-db.sh first)
#
# Usage:
#   bash scripts/setup-infra.sh <neon-config.env>
#
# Input file format (see scripts/templates/neon-config.env.template):
#   STAGING_DATABASE_URL=postgres://...
#   PRODUCTION_DATABASE_URL=postgres://...
# ─────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }
header()  { echo -e "\n${BOLD}${CYAN}══  $1  ══${NC}\n"; }

# ── Parse input ──

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <neon-config.env>"
  echo ""
  echo "Create the config file from the template:"
  echo "  cp scripts/templates/neon-config.env.template neon-config.env"
  echo "  # Edit neon-config.env with your Neon connection strings"
  echo "  bash $0 neon-config.env"
  exit 1
fi

CONFIG_FILE="$1"

if [ ! -f "$CONFIG_FILE" ]; then
  error "File '$CONFIG_FILE' not found"
  exit 1
fi

# Strip Windows \r line endings
sed -i 's/\r$//' "$CONFIG_FILE" 2>/dev/null || true

# Load config (parse key=value, handling & and special chars in values)
STAGING_DATABASE_URL=""
PRODUCTION_DATABASE_URL=""
while IFS= read -r line; do
  [[ -z "$line" || "$line" == \#* ]] && continue
  key="${line%%=*}"
  value="${line#*=}"
  case "$key" in
    STAGING_DATABASE_URL) STAGING_DATABASE_URL="$value" ;;
    PRODUCTION_DATABASE_URL) PRODUCTION_DATABASE_URL="$value" ;;
  esac
done < "$CONFIG_FILE"

if [ -z "$STAGING_DATABASE_URL" ] || [ -z "$PRODUCTION_DATABASE_URL" ]; then
  error "Both STAGING_DATABASE_URL and PRODUCTION_DATABASE_URL must be set in $CONFIG_FILE"
  exit 1
fi

# ── Verify wrangler auth ──

if ! npx wrangler whoami &>/dev/null 2>&1; then
  error "wrangler not authenticated. Run: npx wrangler login"
  exit 1
fi
success "wrangler authenticated"

# ── R2 Buckets ──

header "R2 Buckets"

create_bucket() {
  local name="$1"
  if npx wrangler r2 bucket list 2>/dev/null | grep -q "$name"; then
    success "R2 bucket '$name' already exists"
  else
    info "Creating R2 bucket '$name'..."
    npx wrangler r2 bucket create "$name"
    success "R2 bucket '$name' created"
  fi
}

create_bucket "blipp-audio-staging"
create_bucket "blipp-audio"

# ── Queues ──

header "Queues (14 total: 7 staging + 7 production)"

QUEUE_NAMES=("feed-refresh" "distillation" "narrative-generation" "clip-generation" "briefing-assembly" "transcription" "orchestrator")

create_queue() {
  local name="$1"
  if npx wrangler queues list 2>/dev/null | grep -q "$name"; then
    success "Queue '$name' already exists"
  else
    info "Creating queue '$name'..."
    npx wrangler queues create "$name"
    success "Queue '$name' created"
  fi
}

for q in "${QUEUE_NAMES[@]}"; do
  create_queue "${q}-staging"
done

for q in "${QUEUE_NAMES[@]}"; do
  create_queue "$q"
done

# ── Hyperdrive ──

header "Hyperdrive Configs"

STAGING_HD_ID=""
PROD_HD_ID=""

create_hyperdrive() {
  local name="$1"
  local conn_string="$2"
  local id_var="$3"

  local existing
  existing=$(npx wrangler hyperdrive list 2>/dev/null | grep "$name" || true)

  if [ -n "$existing" ]; then
    success "Hyperdrive '$name' already exists"
    local extracted_id
    extracted_id=$(echo "$existing" | grep -oP '[a-f0-9-]{36}' | head -1 || true)
    eval "$id_var=\"$extracted_id\""
  else
    info "Creating Hyperdrive '$name'..."
    local output
    output=$(npx wrangler hyperdrive create "$name" --connection-string="$conn_string" 2>&1)
    success "Hyperdrive '$name' created"
    local extracted_id
    extracted_id=$(echo "$output" | grep -oP '[a-f0-9-]{36}' | head -1 || true)
    eval "$id_var=\"$extracted_id\""
  fi
}

create_hyperdrive "blipp-db-staging" "$STAGING_DATABASE_URL" "STAGING_HD_ID"
create_hyperdrive "blipp-db" "$PRODUCTION_DATABASE_URL" "PROD_HD_ID"

# ── Patch wrangler.jsonc ──

header "Patching wrangler.jsonc"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WRANGLER_FILE="$(dirname "$SCRIPT_DIR")/wrangler.jsonc"

if [ -n "$STAGING_HD_ID" ]; then
  if grep -q '<staging-hyperdrive-id>' "$WRANGLER_FILE"; then
    sed -i "s/<staging-hyperdrive-id>/$STAGING_HD_ID/g" "$WRANGLER_FILE"
    success "Patched staging Hyperdrive ID: $STAGING_HD_ID"
  else
    info "Staging Hyperdrive ID already set in wrangler.jsonc"
  fi
else
  warn "Could not capture staging Hyperdrive ID — update wrangler.jsonc manually"
fi

if [ -n "$PROD_HD_ID" ]; then
  if grep -q '<production-hyperdrive-id>' "$WRANGLER_FILE"; then
    sed -i "s/<production-hyperdrive-id>/$PROD_HD_ID/g" "$WRANGLER_FILE"
    success "Patched production Hyperdrive ID: $PROD_HD_ID"
  else
    info "Production Hyperdrive ID already set in wrangler.jsonc"
  fi
else
  warn "Could not capture production Hyperdrive ID — update wrangler.jsonc manually"
fi

# ── Summary ──

header "Done!"

echo -e "${BOLD}Resources created:${NC}"
echo "  R2 buckets:  blipp-audio-staging, blipp-audio"
echo "  Queues:      14 (7 staging + 7 production)"
echo "  Hyperdrive:  blipp-db-staging (${STAGING_HD_ID:-unknown})"
echo "               blipp-db (${PROD_HD_ID:-unknown})"
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo "  1. Verify wrangler.jsonc has correct Hyperdrive IDs"
echo "  2. Set secrets: bash scripts/set-secrets.sh secrets-staging.env"
echo "  3. Set secrets: bash scripts/set-secrets.sh secrets-production.env --env production"
echo "  4. Deploy staging: npx wrangler deploy"
echo ""
echo -e "${YELLOW}IMPORTANT: Delete '$CONFIG_FILE' now — it contains database credentials.${NC}"
