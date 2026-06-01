#!/usr/bin/env bash
# Emit a 32-byte base64 key for convex-api-tokens (AES-256-GCM).
set -euo pipefail
key="$(openssl rand -base64 32)"
echo "API_TOKENS_ENCRYPTION_KEY=$key"
echo ""
echo "Set on the Convex deployment:"
echo "  bunx convex env set API_TOKENS_ENCRYPTION_KEY \"$key\""
