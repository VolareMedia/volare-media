#!/usr/bin/env bash
# Deploy volaremedia.net to Hostinger over SSH (rsync).
# This is the REAL deploy path — the hPanel "Connect with GitHub" button is broken
# and is not used. Just run:  ./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

SSH_KEY="$HOME/.ssh/hostinger_volare"
SSH_PORT=65002
REMOTE_HOST="u760252856@195.35.39.109"
REMOTE="$REMOTE_HOST:domains/volaremedia.net/public_html/"

echo "→ Deploying $(pwd) to volaremedia.net ..."

# --dry-run first so you can see what will change; remove --dry-run to go live.
DRY=""
if [[ "${1:-}" == "--dry-run" ]]; then DRY="--dry-run"; echo "   (dry run — nothing will actually change)"; fi

rsync -az --delete $DRY \
  --exclude '.git' \
  --exclude '.DS_Store' \
  --exclude 'deploy.sh' \
  --exclude 'jackie' \
  --exclude 'preview' \
  -e "ssh -i $SSH_KEY -p $SSH_PORT" \
  ./ "$REMOTE"

# NOTE: 'jackie' is Jackie Taylor's site preview living at public_html/jackie/
# (deployed from ../jackie-taylor). 'preview' holds client demo sites such as
# public_html/preview/its-a-doodle/ (deployed from ../its-a-doodle-dist).
# Both excludes protect those folders from --delete.

# Force web-readable permissions after every sync (dirs 755, files 644).
# rsync -a copies local permissions, and files in this folder are sometimes
# 0600/0700 locally. On 2026-09-29 that reached the server and the whole site
# returned 403/404. macOS ships openrsync, which silently ignores --chmod, so
# the fix has to run on the server itself.
if [[ -z "$DRY" ]]; then
  echo "→ Fixing permissions on the server (dirs 755, files 644) ..."
  ssh -i "$SSH_KEY" -p "$SSH_PORT" "$REMOTE_HOST" \
    'cd domains/volaremedia.net && chmod 755 public_html && find public_html -type d -exec chmod 755 {} + && find public_html -type f -exec chmod 644 {} +'
fi

echo "✓ Done. Live at https://www.volaremedia.net/"
echo "  (Tip: also run 'git push' to keep the GitHub backup in sync.)"
