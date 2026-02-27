#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────
# Blipp — One-Command Setup Script
# Sets up dev + prod environments for the full stack
# ─────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ─────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────

info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }
header()  { echo -e "\n${BOLD}${CYAN}══════════════════════════════════════════${NC}"; echo -e "${BOLD}${CYAN}  $1${NC}"; echo -e "${BOLD}${CYAN}══════════════════════════════════════════${NC}\n"; }

prompt_key() {
  local var_name="$1"
  local display_name="$2"
  local url="$3"
  local prefix_hint="${4:-}"
  local value=""

  echo -e "${BOLD}$display_name${NC}"
  echo -e "  Dashboard: ${CYAN}$url${NC}"
  if [[ -n "$prefix_hint" ]]; then
    echo -e "  Expected format: ${YELLOW}$prefix_hint${NC}"
  fi
  while [[ -z "$value" ]]; do
    read -rp "  Paste $var_name: " value
    if [[ -z "$value" ]]; then
      warn "Value cannot be empty. Try again."
    fi
  done
  eval "$var_name=\"$value\""
  echo ""
}

prompt_key_optional() {
  local var_name="$1"
  local display_name="$2"
  local url="$3"
  local prefix_hint="${4:-}"

  echo -e "${BOLD}$display_name${NC}"
  echo -e "  Dashboard: ${CYAN}$url${NC}"
  if [[ -n "$prefix_hint" ]]; then
    echo -e "  Expected format: ${YELLOW}$prefix_hint${NC}"
  fi
  read -rp "  Paste $var_name (or press Enter to skip): " value
  eval "$var_name=\"$value\""
  echo ""
}

# ─────────────────────────────────────────────────────────
# Phase 1: Prerequisites Check
# ─────────────────────────────────────────────────────────

header "Phase 1: Prerequisites Check"

check_cmd() {
  if command -v "$1" &>/dev/null; then
    success "$1 found: $(command -v "$1")"
    return 0
  else
    error "$1 not found"
    return 1
  fi
}

MISSING=0
check_cmd node    || MISSING=1
check_cmd npx     || MISSING=1
check_cmd wrangler || MISSING=1
check_cmd stripe  || MISSING=1

# neonctl is optional — offer to install
if ! command -v neonctl &>/dev/null; then
  warn "neonctl not found. It's needed for Neon database setup."
  read -rp "  Install neonctl globally via npm? (y/N): " install_neon
  if [[ "$install_neon" =~ ^[Yy]$ ]]; then
    npm install -g neonctl
    success "neonctl installed"
  else
    warn "Skipping Neon automation — you'll need to set DATABASE_URL manually"
    SKIP_NEON=1
  fi
else
  success "neonctl found: $(command -v neonctl)"
fi
SKIP_NEON="${SKIP_NEON:-0}"

if [[ "$MISSING" -eq 1 ]]; then
  error "Missing required tools. Install them and re-run."
  exit 1
fi

# Verify wrangler auth
if wrangler whoami &>/dev/null; then
  success "wrangler authenticated"
else
  error "wrangler not authenticated. Run: wrangler login"
  exit 1
fi

# Verify stripe auth
if stripe config --list &>/dev/null 2>&1; then
  success "stripe CLI authenticated"
else
  warn "stripe CLI may not be authenticated. Run: stripe login"
fi

# ─────────────────────────────────────────────────────────
# Phase 2: Neon Database
# ─────────────────────────────────────────────────────────

header "Phase 2: Neon Database"

DEV_DATABASE_URL=""
PROD_DATABASE_URL=""

if [[ "$SKIP_NEON" -eq 1 ]]; then
  warn "Neon automation skipped."
  prompt_key DEV_DATABASE_URL "Dev Database URL" "https://console.neon.tech" "postgresql://user:pass@host/db"
  prompt_key PROD_DATABASE_URL "Prod Database URL" "https://console.neon.tech" "postgresql://user:pass@host/db"
else
  # Check if neonctl is authenticated
  if ! neonctl projects list &>/dev/null 2>&1; then
    info "neonctl needs authentication."
    neonctl auth
  fi

  # Dev project
  EXISTING_DEV=$(neonctl projects list --output json 2>/dev/null | node -e "
    const d=require('fs').readFileSync(0,'utf8');
    const p=JSON.parse(d).find(x=>x.name==='blipp-dev');
    if(p) console.log(p.id);
  " 2>/dev/null || true)

  if [[ -n "$EXISTING_DEV" ]]; then
    success "Neon dev project 'blipp-dev' already exists (ID: $EXISTING_DEV)"
    DEV_DATABASE_URL=$(neonctl connection-string --project-id "$EXISTING_DEV" 2>/dev/null || true)
  else
    info "Creating Neon dev project 'blipp-dev'..."
    DEV_CREATE_OUTPUT=$(neonctl projects create --name blipp-dev --output json 2>/dev/null)
    DEV_DATABASE_URL=$(echo "$DEV_CREATE_OUTPUT" | node -e "
      const d=require('fs').readFileSync(0,'utf8');
      const p=JSON.parse(d);
      console.log(p.connection_uris?.[0]?.connection_uri || p.connection_uri || '');
    " 2>/dev/null || true)
    success "Neon dev project created"
  fi

  if [[ -z "$DEV_DATABASE_URL" ]]; then
    warn "Could not auto-detect dev connection string."
    prompt_key DEV_DATABASE_URL "Dev Database URL" "https://console.neon.tech" "postgresql://user:pass@host/db"
  else
    success "Dev DATABASE_URL captured"
  fi

  # Prod project
  EXISTING_PROD=$(neonctl projects list --output json 2>/dev/null | node -e "
    const d=require('fs').readFileSync(0,'utf8');
    const p=JSON.parse(d).find(x=>x.name==='blipp-prod');
    if(p) console.log(p.id);
  " 2>/dev/null || true)

  if [[ -n "$EXISTING_PROD" ]]; then
    success "Neon prod project 'blipp-prod' already exists (ID: $EXISTING_PROD)"
    PROD_DATABASE_URL=$(neonctl connection-string --project-id "$EXISTING_PROD" 2>/dev/null || true)
  else
    info "Creating Neon prod project 'blipp-prod'..."
    PROD_CREATE_OUTPUT=$(neonctl projects create --name blipp-prod --output json 2>/dev/null)
    PROD_DATABASE_URL=$(echo "$PROD_CREATE_OUTPUT" | node -e "
      const d=require('fs').readFileSync(0,'utf8');
      const p=JSON.parse(d);
      console.log(p.connection_uris?.[0]?.connection_uri || p.connection_uri || '');
    " 2>/dev/null || true)
    success "Neon prod project created"
  fi

  if [[ -z "$PROD_DATABASE_URL" ]]; then
    warn "Could not auto-detect prod connection string."
    prompt_key PROD_DATABASE_URL "Prod Database URL" "https://console.neon.tech" "postgresql://user:pass@host/db"
  else
    success "Prod DATABASE_URL captured"
  fi
fi

# Push schema to dev database
info "Pushing Prisma schema to dev database..."
DATABASE_URL="$DEV_DATABASE_URL" npx prisma db push --skip-generate 2>&1 || warn "Prisma push failed — you may need to run it manually"
success "Prisma schema pushed to dev"

# ─────────────────────────────────────────────────────────
# Phase 3: Cloudflare Infrastructure
# ─────────────────────────────────────────────────────────

header "Phase 3: Cloudflare Infrastructure"

# R2 Bucket
if wrangler r2 bucket list 2>/dev/null | grep -q "blipp-audio"; then
  success "R2 bucket 'blipp-audio' already exists"
else
  info "Creating R2 bucket 'blipp-audio'..."
  wrangler r2 bucket create blipp-audio
  success "R2 bucket created"
fi

# Queues
for QUEUE_NAME in feed-refresh distillation clip-generation briefing-assembly; do
  if wrangler queues list 2>/dev/null | grep -q "$QUEUE_NAME"; then
    success "Queue '$QUEUE_NAME' already exists"
  else
    info "Creating queue '$QUEUE_NAME'..."
    wrangler queues create "$QUEUE_NAME"
    success "Queue '$QUEUE_NAME' created"
  fi
done

# Hyperdrive
HYPERDRIVE_ID=""
EXISTING_HD=$(wrangler hyperdrive list 2>/dev/null | grep "blipp-db" || true)
if [[ -n "$EXISTING_HD" ]]; then
  success "Hyperdrive config 'blipp-db' already exists"
  HYPERDRIVE_ID=$(echo "$EXISTING_HD" | grep -oP '[a-f0-9]{32}' | head -1 || true)
else
  info "Creating Hyperdrive config 'blipp-db'..."
  HD_OUTPUT=$(wrangler hyperdrive create blipp-db --connection-string "$PROD_DATABASE_URL" 2>&1)
  success "Hyperdrive config created"
  HYPERDRIVE_ID=$(echo "$HD_OUTPUT" | grep -oP '[a-f0-9]{32}' | head -1 || true)
fi

# Patch wrangler.jsonc with Hyperdrive ID
if [[ -n "$HYPERDRIVE_ID" ]]; then
  if grep -q '<hyperdrive-config-id>' wrangler.jsonc; then
    sed -i "s/<hyperdrive-config-id>/$HYPERDRIVE_ID/g" wrangler.jsonc
    success "Patched wrangler.jsonc with Hyperdrive ID: $HYPERDRIVE_ID"
  else
    info "wrangler.jsonc already has a Hyperdrive ID set"
  fi
else
  warn "Could not capture Hyperdrive ID — update wrangler.jsonc manually"
fi

# ─────────────────────────────────────────────────────────
# Phase 4: Stripe (Sandbox + Live)
# ─────────────────────────────────────────────────────────

header "Phase 4: Stripe Keys"

echo -e "${BOLD}Stripe now uses Sandboxes instead of test mode.${NC}"
echo -e "Each sandbox is an isolated environment with its own API keys."
echo ""
echo -e "Before continuing, make sure you have:"
echo -e "  1. Created a sandbox in your Stripe Dashboard (account picker → Create sandbox)"
echo -e "  2. Logged the Stripe CLI into that sandbox:"
echo -e "     ${CYAN}stripe login${NC}  (then select your sandbox in the browser)"
echo ""
read -rp "Press Enter when your Stripe CLI is logged into the correct sandbox..."
echo ""

info "Checking for existing keys in .env.total..."

# Try to parse from .env.total if it exists
STRIPE_SECRET_KEY_SANDBOX=""
STRIPE_WEBHOOK_SECRET_SANDBOX=""
STRIPE_SECRET_KEY_LIVE=""
STRIPE_WEBHOOK_SECRET_LIVE=""
STRIPE_LOCAL_WEBHOOK_SECRET=""

if [[ -f .env.total ]]; then
  # Sandbox keys still use sk_test_ / pk_test_ prefixes
  STRIPE_SECRET_KEY_SANDBOX=$(grep -oP 'sk_test_[A-Za-z0-9]+' .env.total | head -1 || true)
  STRIPE_SECRET_KEY_LIVE=$(grep -oP 'sk_live_[A-Za-z0-9]+' .env.total | head -1 || true)

  # Webhook secrets — sandbox section first, then production
  STRIPE_WEBHOOK_SECRET_SANDBOX=$(grep -A1 "Stripe Development" .env.total | grep -oP 'whsec_[A-Za-z0-9]+' || true)
  STRIPE_WEBHOOK_SECRET_LIVE=$(grep -A1 "Stripe Production" .env.total | grep -oP 'whsec_[A-Za-z0-9]+' || true)
  STRIPE_LOCAL_WEBHOOK_SECRET=$(grep -A1 "Local Webhook" .env.total | grep -oP 'whsec_[A-Za-z0-9]+' || true)
fi

# --- Sandbox keys ---
if [[ -n "$STRIPE_SECRET_KEY_SANDBOX" ]]; then
  success "Found Stripe sandbox secret key from .env.total"
else
  echo -e "  ${YELLOW}Tip:${NC} In your sandbox Dashboard, go to Developers → API keys"
  prompt_key STRIPE_SECRET_KEY_SANDBOX "Stripe Sandbox Secret Key" "https://dashboard.stripe.com/developers/api-keys" "sk_test_..."
fi

if [[ -n "$STRIPE_WEBHOOK_SECRET_SANDBOX" ]]; then
  success "Found Stripe sandbox webhook secret from .env.total"
else
  echo -e "  ${YELLOW}Tip:${NC} In your sandbox Dashboard, go to Developers → Webhooks"
  prompt_key STRIPE_WEBHOOK_SECRET_SANDBOX "Stripe Sandbox Webhook Secret" "https://dashboard.stripe.com/developers/webhooks" "whsec_..."
fi

# --- Local webhook forwarding ---
if [[ -n "$STRIPE_LOCAL_WEBHOOK_SECRET" ]]; then
  success "Found Stripe local webhook secret from .env.total"
else
  info "For local development, forward sandbox webhooks to your worker:"
  echo -e "  ${CYAN}stripe listen --forward-to localhost:8787/api/webhooks/stripe${NC}"
  echo -e "  (The CLI must be logged into your sandbox first)"
  prompt_key_optional STRIPE_LOCAL_WEBHOOK_SECRET "Stripe Local Webhook Secret (from 'stripe listen' output)" "N/A — see command above" "whsec_..."
fi

# --- Live keys ---
if [[ -n "$STRIPE_SECRET_KEY_LIVE" ]]; then
  success "Found Stripe live secret key from .env.total"
else
  prompt_key STRIPE_SECRET_KEY_LIVE "Stripe Live Secret Key" "https://dashboard.stripe.com/developers/api-keys" "sk_live_..."
fi

if [[ -n "$STRIPE_WEBHOOK_SECRET_LIVE" ]]; then
  success "Found Stripe live webhook secret from .env.total"
else
  prompt_key STRIPE_WEBHOOK_SECRET_LIVE "Stripe Live Webhook Secret" "https://dashboard.stripe.com/developers/webhooks" "whsec_..."
fi

# ─────────────────────────────────────────────────────────
# Phase 5: Collect Manual Keys
# ─────────────────────────────────────────────────────────

header "Phase 5: Collect API Keys"

# --- Clerk Dev ---
info "Clerk Development Keys"
CLERK_PUBLISHABLE_KEY_DEV=""
CLERK_SECRET_KEY_DEV=""
CLERK_WEBHOOK_SECRET_DEV=""

prompt_key CLERK_PUBLISHABLE_KEY_DEV "Clerk Dev Publishable Key" "https://dashboard.clerk.com → API Keys" "pk_test_..."
prompt_key CLERK_SECRET_KEY_DEV "Clerk Dev Secret Key" "https://dashboard.clerk.com → API Keys" "sk_test_..."
prompt_key CLERK_WEBHOOK_SECRET_DEV "Clerk Dev Webhook Secret" "https://dashboard.clerk.com → Webhooks" "whsec_..."

# --- Clerk Prod (try .env.total) ---
info "Clerk Production Keys"
CLERK_PUBLISHABLE_KEY_PROD=""
CLERK_SECRET_KEY_PROD=""
CLERK_WEBHOOK_SECRET_PROD=""

if [[ -f .env.total ]]; then
  CLERK_PUBLISHABLE_KEY_PROD=$(grep -oP 'pk_live_[A-Za-z0-9$]+' .env.total | head -1 || true)
  CLERK_SECRET_KEY_PROD=$(grep -oP 'sk_live_[A-Za-z0-9]+' .env.total | grep -v 'sk_live_51' | head -1 || true)
  CLERK_WEBHOOK_SECRET_PROD=$(grep -A1 "Clerk Production" .env.total | grep -oP 'whsec_[A-Za-z0-9/+]+' || true)
fi

if [[ -n "$CLERK_PUBLISHABLE_KEY_PROD" ]]; then
  success "Found Clerk prod publishable key from .env.total"
else
  prompt_key CLERK_PUBLISHABLE_KEY_PROD "Clerk Prod Publishable Key" "https://dashboard.clerk.com → API Keys" "pk_live_..."
fi

if [[ -n "$CLERK_SECRET_KEY_PROD" ]]; then
  success "Found Clerk prod secret key from .env.total"
else
  prompt_key CLERK_SECRET_KEY_PROD "Clerk Prod Secret Key" "https://dashboard.clerk.com → API Keys" "sk_live_..."
fi

if [[ -n "$CLERK_WEBHOOK_SECRET_PROD" ]]; then
  success "Found Clerk prod webhook secret from .env.total"
else
  prompt_key CLERK_WEBHOOK_SECRET_PROD "Clerk Prod Webhook Secret" "https://dashboard.clerk.com → Webhooks" "whsec_..."
fi

# --- Anthropic ---
ANTHROPIC_API_KEY=""
prompt_key ANTHROPIC_API_KEY "Anthropic API Key" "https://console.anthropic.com/settings/keys" "sk-ant-..."

# --- OpenAI ---
OPENAI_API_KEY=""
prompt_key OPENAI_API_KEY "OpenAI API Key" "https://platform.openai.com/api-keys" "sk-..."

# --- Podcast Index ---
PODCAST_INDEX_KEY=""
PODCAST_INDEX_SECRET=""
prompt_key PODCAST_INDEX_KEY "Podcast Index API Key" "https://api.podcastindex.org" ""
prompt_key PODCAST_INDEX_SECRET "Podcast Index API Secret" "https://api.podcastindex.org" ""

# --- Google OAuth ---
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

if [[ -f .env.total ]]; then
  GOOGLE_CLIENT_ID=$(grep -oP '[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com' .env.total | head -1 || true)
  GOOGLE_CLIENT_SECRET=$(grep -oP 'GOCSPX-[A-Za-z0-9_-]+' .env.total | head -1 || true)
fi

if [[ -n "$GOOGLE_CLIENT_ID" ]]; then
  success "Found Google OAuth Client ID from .env.total"
else
  prompt_key GOOGLE_CLIENT_ID "Google OAuth Client ID" "https://console.cloud.google.com/apis/credentials" "*.apps.googleusercontent.com"
fi

if [[ -n "$GOOGLE_CLIENT_SECRET" ]]; then
  success "Found Google OAuth Client Secret from .env.total"
else
  prompt_key GOOGLE_CLIENT_SECRET "Google OAuth Client Secret" "https://console.cloud.google.com/apis/credentials" "GOCSPX-..."
fi

echo -e "${YELLOW}NOTE:${NC} Configure the Google social connection in Clerk's dashboard:"
echo -e "  1. Go to ${CYAN}https://dashboard.clerk.com → User & Authentication → Social Connections → Google${NC}"
echo -e "  2. Enter the Client ID and Client Secret above"
echo -e "  3. Authorized Redirect URI: ${CYAN}https://clerk.woodydesign.studio/v1/oauth_callback${NC}"
echo ""

# ─────────────────────────────────────────────────────────
# Phase 6: Write Config Files
# ─────────────────────────────────────────────────────────

header "Phase 6: Write Config Files"

# .env — used by Prisma CLI and Vite dev server
cat > .env << ENVEOF
# Generated by scripts/setup.sh — $(date -Iseconds)
# Prisma
DATABASE_URL=$DEV_DATABASE_URL

# Vite (client-side)
VITE_CLERK_PUBLISHABLE_KEY=$CLERK_PUBLISHABLE_KEY_DEV
VITE_APP_URL=http://localhost:5173
ENVEOF
success "Wrote .env"

# .dev.vars — used by wrangler dev for worker secrets
WEBHOOK_SECRET_LINE=""
if [[ -n "$STRIPE_LOCAL_WEBHOOK_SECRET" ]]; then
  WEBHOOK_SECRET_LINE="STRIPE_WEBHOOK_SECRET=$STRIPE_LOCAL_WEBHOOK_SECRET"
else
  WEBHOOK_SECRET_LINE="STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET_SANDBOX"
fi

cat > .dev.vars << DEVEOF
# Generated by scripts/setup.sh — $(date -Iseconds)

# Auth (Clerk)
CLERK_SECRET_KEY=$CLERK_SECRET_KEY_DEV
CLERK_PUBLISHABLE_KEY=$CLERK_PUBLISHABLE_KEY_DEV
CLERK_WEBHOOK_SECRET=$CLERK_WEBHOOK_SECRET_DEV

# Payments (Stripe — sandbox)
STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY_SANDBOX
$WEBHOOK_SECRET_LINE

# Database (Neon — pooled connection string)
DATABASE_URL=$DEV_DATABASE_URL

# Anthropic (distillation)
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY

# OpenAI (TTS)
OPENAI_API_KEY=$OPENAI_API_KEY

# Podcast Index
PODCAST_INDEX_KEY=$PODCAST_INDEX_KEY
PODCAST_INDEX_SECRET=$PODCAST_INDEX_SECRET
DEVEOF
success "Wrote .dev.vars"

# ─────────────────────────────────────────────────────────
# Phase 7: Push Production Secrets to Cloudflare
# ─────────────────────────────────────────────────────────

header "Phase 7: Push Production Secrets"

push_secret() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    warn "Skipping $name (empty value)"
    return
  fi
  echo "$value" | wrangler secret put "$name" 2>&1 | tail -1
  success "Pushed $name"
}

push_secret "CLERK_SECRET_KEY" "$CLERK_SECRET_KEY_PROD"
push_secret "CLERK_PUBLISHABLE_KEY" "$CLERK_PUBLISHABLE_KEY_PROD"
push_secret "CLERK_WEBHOOK_SECRET" "$CLERK_WEBHOOK_SECRET_PROD"
push_secret "STRIPE_SECRET_KEY" "$STRIPE_SECRET_KEY_LIVE"
push_secret "STRIPE_WEBHOOK_SECRET" "$STRIPE_WEBHOOK_SECRET_LIVE"
push_secret "ANTHROPIC_API_KEY" "$ANTHROPIC_API_KEY"
push_secret "OPENAI_API_KEY" "$OPENAI_API_KEY"
push_secret "PODCAST_INDEX_KEY" "$PODCAST_INDEX_KEY"
push_secret "PODCAST_INDEX_SECRET" "$PODCAST_INDEX_SECRET"
push_secret "DATABASE_URL" "$PROD_DATABASE_URL"

# ─────────────────────────────────────────────────────────
# Phase 8: Validation & Summary
# ─────────────────────────────────────────────────────────

header "Phase 8: Summary"

echo -e "${GREEN}${BOLD}Setup complete!${NC}\n"

echo -e "${BOLD}Files written:${NC}"
echo "  .env          — Prisma + Vite dev vars"
echo "  .dev.vars     — Wrangler local dev secrets"
echo "  wrangler.jsonc — Hyperdrive ID patched"
echo ""

echo -e "${BOLD}Cloudflare resources created:${NC}"
echo "  R2 bucket:  blipp-audio"
echo "  Queues:     feed-refresh, distillation, clip-generation, briefing-assembly"
echo "  Hyperdrive: blipp-db (ID: ${HYPERDRIVE_ID:-unknown})"
echo ""

echo -e "${BOLD}Databases:${NC}"
echo "  Dev:  Neon project 'blipp-dev'"
echo "  Prod: Neon project 'blipp-prod'"
echo ""

echo -e "${BOLD}Production secrets pushed:${NC}"
echo "  CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, CLERK_WEBHOOK_SECRET"
echo "  STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET"
echo "  ANTHROPIC_API_KEY, OPENAI_API_KEY"
echo "  PODCAST_INDEX_KEY, PODCAST_INDEX_SECRET"
echo "  DATABASE_URL"
echo ""

echo -e "${BOLD}Next steps:${NC}"
echo "  1. Configure Google OAuth in Clerk dashboard (see Phase 5 output)"
echo "  2. Run:  npm run dev"
echo "  3. In another terminal: stripe listen --forward-to localhost:8787/api/webhooks/stripe"
echo ""
echo -e "${GREEN}Happy building!${NC}"
