#!/bin/bash
set -e

# Install ttyd from GitHub release (not in Debian Trixie repos)
TTYD_VERSION="1.7.7"
sudo curl -fsSL "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.x86_64" -o /usr/local/bin/ttyd
sudo chmod +x /usr/local/bin/ttyd

# Install project dependencies
npm install --legacy-peer-deps

# Generate Prisma client + barrel export
npx prisma generate
mkdir -p src/generated/prisma
echo 'export { PrismaClient } from "./client";' > src/generated/prisma/index.ts
echo 'export * from "./enums";' >> src/generated/prisma/index.ts

# Install Claude Code CLI
npm install -g @anthropic-ai/claude-code
