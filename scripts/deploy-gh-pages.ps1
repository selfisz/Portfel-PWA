# Publikuje statyczną kopię aplikacji na branch gh-pages (bez scope workflow).
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$deployDir = Join-Path $env:TEMP "portfel-pwa-gh-pages-$(Get-Random)"

Write-Host "Przygotowanie plików w $deployDir ..."
New-Item -ItemType Directory -Path $deployDir -Force | Out-Null

$excludeDirs = @('node_modules', '.git', 'tests', 'coverage', 'functions', '.github', 'scripts')
Get-ChildItem -Path $repoRoot -Force | Where-Object {
    $_.Name -notin $excludeDirs
} | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination (Join-Path $deployDir $_.Name) -Recurse -Force
}

Push-Location $deployDir
try {
    git init | Out-Null
    git config user.email "deploy@portfel-pwa.local"
    git config user.name "Portfel PWA Deploy"
    git checkout -b gh-pages | Out-Null
    git add -A
    git commit -m "Deploy $(Get-Date -Format 'yyyy-MM-dd HH:mm')" | Out-Null

    $origin = git -C $repoRoot remote get-url origin
    if ($origin -notmatch 'github\.com[:/](.+)/(.+?)(?:\.git)?$') {
        throw "Nie rozpoznano URL repozytorium: $origin"
    }
    git remote add origin $origin
    Write-Host "Wypychanie na origin/gh-pages ..."
    git push -f origin gh-pages
    Write-Host "OK: gh-pages zaktualizowany."
} finally {
    Pop-Location
    Remove-Item -Recurse -Force $deployDir -ErrorAction SilentlyContinue
}
