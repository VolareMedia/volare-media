#!/usr/bin/env bash
# Deploy volaremedia.net to Hostinger over SSH (rsync).
# This is the REAL deploy path — the hPanel "Connect with GitHub" button is broken
# and is not used. Just run:  ./deploy.sh
set -euo pipefail

cd "$(dirname "$0")"

SSH_KEY="$HOME/.ssh/hostinger_volare"
SSH_PORT=65002
REMOTE="u760252856@195.35.39.109:domains/volaremedia.net/public_html/"

echo "→ Deploying $(pwd) to volaremedia.net ..."

# --dry-run first so you can see what will change; remove --dry-run to go live.
DRY=""
if [[ "${1:-}" == "--dry-run" ]]; then DRY="--dry-run"; echo "   (dry run — nothing will actually change)"; fi

rsync -az --delete $DRY \
  --exclude '.git' \
  --exclude '.DS_Store' \
  --exclude 'deploy.sh' \
  -e "ssh -i $SSH_KEY -p $SSH_PORT" \
  ./ "$REMOTE"

echo "✓ Done. Live at https://www.volaremedia.net/"
echo "  (Tip: also run 'git push' to keep the GitHub backup in sync.)"
