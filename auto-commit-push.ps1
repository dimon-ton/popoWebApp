$projectDir = "C:\Users\saich\Documents\popoWebApp"
$logFile = "C:\Users\saich\Documents\popoWebApp\auto-commit-push.log"
$git = "C:\Program Files\Git\cmd\git.exe"

# Ensure git is on PATH for subprocesses
$env:PATH = "C:\Program Files\Git\cmd;C:\Program Files\Git\usr\bin;$env:PATH"

function Log($msg) {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$ts - $msg" | Out-File -Append -FilePath $logFile -Encoding utf8
}

function Git {
    # Run git, capture stdout only; rely on $LASTEXITCODE for error detection
    $result = & $git @args 2>$null
    return $result
}

Log "=== Auto Commit & Push Started ==="

Set-Location -LiteralPath $projectDir

$status = Git status --porcelain
if ($LASTEXITCODE -ne 0) {
    Log "ERROR: git status failed (exit $LASTEXITCODE)"
    exit 1
}

if (-not $status) {
    Log "No changes to commit. Exiting."
    exit 0
}

$diffStat      = Git diff --stat
$diffCachedStat = Git diff --cached --stat
$untracked     = Git ls-files --others --exclude-standard

Log "Changes detected:"
Log "Modified:`n$diffStat"
if ($diffCachedStat) { Log "Staged:`n$diffCachedStat" }
if ($untracked)      { Log "Untracked:`n$untracked" }

$diffForAI       = Git diff
$diffCachedForAI = Git diff --cached

$allChanges = @"
Modified files:
$diffStat

Staged files:
$diffCachedStat

New files:
$untracked

Diff summary:
$diffForAI
$diffCachedForAI
"@

Log "Generating descriptive commit message via opencode..."

$commitMsgFile = Join-Path $projectDir ".commit-msg.tmp"

$prompt = @"
Analyze the following git diff and generate a concise, descriptive commit message in conventional commit format.

Rules:
- Start with type: feat, fix, refactor, docs, chore, or auto
- First line: short summary (max 72 chars)
- If multiple changes, list them as bullet points in the body
- Do NOT wrap in code blocks or quotes
- Output ONLY the commit message text, nothing else

$allChanges
"@

try {
    # Write prompt to a temp file to avoid shell quoting/length issues
    $promptFile = Join-Path $projectDir ".commit-prompt.tmp"
    $prompt | Out-File -FilePath $promptFile -Encoding utf8

    $aiOutput = opencode run --file $promptFile --dir $projectDir --dangerously-skip-permissions 2>&1
    Remove-Item $promptFile -Force -ErrorAction SilentlyContinue

    $aiOutput | Out-File -FilePath $commitMsgFile -Encoding utf8
    $commitMsg = (Get-Content $commitMsgFile -Raw).Trim()
    Remove-Item $commitMsgFile -Force -ErrorAction SilentlyContinue

    if (-not $commitMsg -or $commitMsg.Length -lt 10) {
        throw "AI commit message too short or empty"
    }

    # Reject if it looks like a help/error message
    if ($commitMsg -match "opencode run \[message" -or $commitMsg -match "show help") {
        throw "AI returned help text instead of commit message"
    }

    Log "AI commit message:`n$commitMsg"
} catch {
    Log "WARN: AI message generation failed ($_), using fallback"
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $commitMsg = "auto: ralph-tui session progress $timestamp`n`n$diffStat"
}

Git add -A | ForEach-Object { Log "git add: $_" }
if ($LASTEXITCODE -ne 0) {
    Log "ERROR: git add failed (exit $LASTEXITCODE)"
    exit 1
}

Git commit -m $commitMsg | ForEach-Object { Log "git commit: $_" }
if ($LASTEXITCODE -ne 0) {
    Log "ERROR: git commit failed (exit $LASTEXITCODE)"
    exit 1
}

Log "Commit successful. Pushing to origin..."

Git push origin HEAD | ForEach-Object { Log "git push: $_" }
if ($LASTEXITCODE -ne 0) {
    Log "ERROR: git push failed (exit $LASTEXITCODE)"
    exit 1
}

Log "Push successful!"
Log "=== Auto Commit & Push Complete ==="
