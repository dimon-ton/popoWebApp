$ErrorActionPreference = "Stop"
$projectDir = "C:\Users\saich\Documents\popoWebApp"
$logFile = "C:\Users\saich\Documents\popoWebApp\auto-commit-push.log"

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$ts - $msg" | Out-File -Append -FilePath $logFile
}

Log "=== Auto Commit & Push Started ==="

Set-Location -LiteralPath $projectDir

$status = git status --porcelain 2>&1
if ($LASTEXITCODE -ne 0) {
    Log "ERROR: git status failed - $status"
    exit 1
}

if (-not $status) {
    Log "No changes to commit. Exiting."
    exit 0
}

Log "Changes detected:`n$status"

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$descriptiveMsg = "auto: ralph-tui session progress $timestamp`n`nChanges include updated session metadata and PRD task state."

git add -A 2>&1 | ForEach-Object { Log "git add: $_" }
if ($LASTEXITCODE -ne 0) {
    Log "ERROR: git add failed"
    exit 1
}

git commit -m $descriptiveMsg 2>&1 | ForEach-Object { Log "git commit: $_" }
if ($LASTEXITCODE -ne 0) {
    Log "ERROR: git commit failed"
    exit 1
}

Log "Commit successful. Pushing to origin..."

git push origin HEAD 2>&1 | ForEach-Object { Log "git push: $_" }
if ($LASTEXITCODE -ne 0) {
    Log "ERROR: git push failed"
    exit 1
}

Log "Push successful!"
Log "=== Auto Commit & Push Complete ==="
