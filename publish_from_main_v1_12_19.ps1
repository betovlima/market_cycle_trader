$ErrorActionPreference = "Stop"

Write-Host "Publishing Market Cycle Trader frontend v1.12.19 from main..."

git checkout main
git pull origin main

if (-not (Test-Path "pnpm-lock.yaml")) {
    throw "pnpm-lock.yaml was not found. Do not deploy until the repository lockfile is restored."
}

$package = Get-Content "package.json" -Raw | ConvertFrom-Json
if ($package.dependencies.recharts -ne "3.10.1") {
    throw "package.json must contain recharts 3.10.1 to match the committed pnpm-lock.yaml."
}

$lockContent = Get-Content "pnpm-lock.yaml" -Raw
if ($lockContent -notmatch "recharts") {
    throw "The committed pnpm-lock.yaml does not contain recharts. Regenerate the lockfile before publishing."
}

corepack enable
pnpm install --frozen-lockfile
pnpm run build

git status
git add package.json pnpm-lock.yaml railway.toml VERSION src/config/env.js
git commit -m "fix: frontend v1.12.19 restore Railway deployment contract"
git push origin main

git tag -a v1.12.19 -m "Frontend v1.12.19 - Railway deployment hotfix"
git push origin v1.12.19

git status
git log --oneline --decorate -10
