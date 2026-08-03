$ErrorActionPreference = "Stop"

$ExpectedBranch = "feature/1.12.23-dark-icon-favicon"
$CommitMessage = "feat(frontend): add dark app icon and favicon"

$currentBranch = (git branch --show-current).Trim()
if ($currentBranch -ne $ExpectedBranch) {
    throw "Current branch is '$currentBranch'. Switch to '$ExpectedBranch' before publishing."
}

git fetch origin --prune

$unmerged = git diff --name-only --diff-filter=U
if ($unmerged) {
    throw "There are unresolved merge conflicts. Resolve them before publishing."
}

git add index.html public src/features/backtest/components/WorkspaceHeader.jsx src/styles.css src/config/env.js package.json VERSION README.md

$staged = git diff --cached --name-only
if (-not $staged) {
    throw "No frontend changes are staged. Copy the release files into the repository first."
}

Write-Host "Files to publish:"
git diff --cached --name-status

git commit -m $CommitMessage
git push -u origin $ExpectedBranch

Write-Host "Published branch $ExpectedBranch successfully."
