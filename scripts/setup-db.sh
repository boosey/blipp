#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
# Blipp — Database Setup
# Creates the staging database in Neon, pushes schema,
# and seeds both staging and production databases.
#
# Prerequisites:
#   - Node.js + npm installed
#   - Prisma client generated (npx prisma generate)
#   - Neon project created with default 'neondb' database
#
# Usage:
#   bash scripts/setup-db.sh <neon-config.env>
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
  echo ""
  echo "Before running this script:"
  echo "  1. Create a Neon project at console.neon.com"
  echo "  2. Create a 'staging' database in that project (Databases > New Database)"
  echo "  3. Copy both pooled connection strings into neon-config.env"
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

# ── Push schema + seed to staging ──

header "Staging Database"

info "Pushing Prisma schema to staging..."
DATABASE_URL="$STAGING_DATABASE_URL" npx prisma db push --skip-generate
success "Schema pushed to staging"

info "Seeding staging database..."
DATABASE_URL="$STAGING_DATABASE_URL" npx prisma db seed
success "Staging database seeded"

# ── Push schema + seed to production ──

header "Production Database"

info "Pushing Prisma schema to production..."
DATABASE_URL="$PRODUCTION_DATABASE_URL" npx prisma db push --skip-generate
success "Schema pushed to production"

info "Seeding production database..."
DATABASE_URL="$PRODUCTION_DATABASE_URL" npx prisma db seed
success "Production database seeded"

# ── Summary ──

header "Done!"

echo -e "${BOLD}Both databases ready:${NC}"
echo "  Staging:    schema pushed + seeded"
echo "  Production: schema pushed + seeded"
echo ""
echo -e "${BOLD}Next steps:${NC}"
echo "  1. Run: bash scripts/setup-infra.sh $CONFIG_FILE"
echo "     (Creates R2 buckets, queues, Hyperdrive configs)"
echo ""
echo -e "${YELLOW}NOTE: Keep '$CONFIG_FILE' — you'll need it for setup-infra.sh next.${NC}"
echo -e "${YELLOW}Delete it after all setup is complete.${NC}"
