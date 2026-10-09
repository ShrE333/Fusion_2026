$ErrorActionPreference = "Stop"

$repo = "D:\fusion_2026_starter"
Set-Location $repo

Write-Host "== Fetching branches =="
git fetch origin --prune

Write-Host "== Switch to retract =="
git switch retract
git reset --hard origin/retract

Write-Host "== Merge backend/VLM branch into retract =="
git merge --no-ff origin/member-1-whatsapp-vlm -m "merge: WhatsApp and SkyCLIP backend into retract"

Write-Host "== Import latest frontend tree at repository root =="
git checkout origin/frontend -- .

Write-Host "== Preserve backend root README and gitignore =="
git checkout origin/member-1-whatsapp-vlm -- README.md .gitignore

Write-Host "== Restore SkyCLIP proxy route from extracted patch if needed =="
if (-not (Test-Path "src\app\api\skyclip\search\route.ts")) {
    throw "Missing src\app\api\skyclip\search\route.ts. Extract the patch ZIP into the repo root before running this script."
}

Write-Host "== Commit combined frontend + backend =="
git add -A
$changes = git diff --cached --name-only
if ($changes) {
    git commit -m "feat: integrate latest frontend with WhatsApp and SkyCLIP backend"
}

Write-Host "== Record unrelated frontend history as merged =="
git merge -s ours --allow-unrelated-histories origin/frontend -m "merge: record frontend history"

Write-Host "== Push retract =="
git push origin retract

Write-Host "== Promote retract to main =="
git switch main
git reset --hard origin/main
git merge --ff-only retract
git push origin main

Write-Host ""
Write-Host "DONE: retract and main now contain latest frontend + WhatsApp + SkyCLIP."
Write-Host "Vercel env required:"
Write-Host "  NEXT_PUBLIC_API_BASE_URL=/api/skyclip"
Write-Host "  NEXT_PUBLIC_DISCOVERY_MODE=api"
Write-Host "  SKYCLIP_BASE_URL=https://YOUR-SKYCLIP-DOMAIN"
Write-Host "  SKYCLIP_SERVICE_TOKEN=<server-only token>"
