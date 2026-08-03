$ErrorActionPreference = "Stop"
$ExpectedBranch = "feature/1.12.27-compact-dashboard"
$Version = "1.12.27"

$currentBranch = (git branch --show-current).Trim()
if ($currentBranch -ne $ExpectedBranch) {
    throw "Expected branch '$ExpectedBranch', but current branch is '$currentBranch'."
}

pnpm install --frozen-lockfile
pnpm build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }

git status
git add -A
git commit -m "fix(frontend): restore compact visual scale"
git push -u origin $ExpectedBranch
Write-Host "Frontend v$Version published from $ExpectedBranch"
