
# PowerShell script to add robots meta tag to 110 GF HTML files
# Final production version

$workspaceRoot = "c:\wholebodyreset"
$robotsTag = '  <meta name="robots" content="noindex, nofollow">'

# List of 110 files that need the robots tag
$filesToUpdate = @(
    "gf/binders/bd-4a8e2.html",
    "gf/ebv/eb-gate-3f9a1.html",
    "gf/foundations-check/fc-main-r9a3.html",
    "gf/gut/bt/gt-bt-4k2m.html",
    "gf/gut/bt/gt-bt-5r7x.html",
    "gf/gut/bt/gt-bt-6q8v.html",
    "gf/gut/gt-0e6a1.html",
    "gf/gut/nc/gt-nc-1a7c.html",
    "gf/gut/nc/gt-nc-2f8b.html",
    "gf/gut/nc/gt-nc-3d9e.html",
    "gf/gut/nc/gt-nc-p0z9.html",
    "gf/gut/os/gt-os-7m2p.html",
    "gf/gut/os/gt-os-8t4c.html",
    "gf/gut/os/gt-os-9y6a.html",
    "gf/gut/os/gt-os-p0z9.html",
    "gf/load/metals/mt-2c7e8.html",
    "gf/load/nc/mt-nc-1a7c.html",
    "gf/load/nc/mt-nc-2f8b.html",
    "gf/load/nc/mt-nc-3d9e.html",
    "gf/load/os/mt-os-7m2p.html",
    "gf/load/os/mt-os-8t4c.html",
    "gf/load/os/mt-os-p029.html",
    "gf/load/parasites/bt/pr-bt-4k2m.html",
    "gf/load/parasites/bt/pr-bt-5r7x.html",
    "gf/load/parasites/bt/pr-bt-6q8v.html",
    "gf/load/parasites/nc/pr-nc-1a7c.html",
    "gf/load/parasites/nc/pr-nc-2f8b.html",
    "gf/load/parasites/nc/pr-nc-p0z9.html",
    "gf/load/parasites/os/pr-os-7m2p.html",
    "gf/load/parasites/os/pr-os-8t4c.html",
    "gf/load/parasites/os/pr-os-9y6a.html",
    "gf/load/parasites/os/pr-os-p0z9.html",
    "gf/load/parasites/pr-4b8d1.html",
    "gf/load/parasites/pr-nc-3d9e.html",
    "gf/load/patterns/ld-pt-7e2c4.html",
    "gf/load/support/ld-sp-8d1b6.html",
    "gf/minerals/bt/mr-bt-6h2c.html",
    "gf/minerals/bt/mr-bt-9r5e.html",
    "gf/minerals/bt/mr-bt-k8z4.html",
    "gf/minerals/mr-main-q8f2.html",
    "gf/minerals/nc/mr-nc-1a7k.html",
    "gf/minerals/nc/mr-nc-2f9m.html",
    "gf/minerals/nc/mr-nc-3p4d.html",
    "gf/minerals/nc/mr-nc-t0x2.html",
    "gf/minerals/os/mr-os-4k8n.html",
    "gf/minerals/os/mr-os-7m3s.html",
    "gf/minerals/os/mr-os-p5d9.html",
    "gf/minerals/os/mr-os-q0x7.html",
    "gf/nervous-system/bt/ns-bt-4k2m.html",
    "gf/nervous-system/bt/ns-bt-5r7x.html",
    "gf/nervous-system/bt/ns-bt-6q8v.html",
    "gf/nervous-system/nc/ns-nc-1a7c.html",
    "gf/nervous-system/nc/ns-nc-2f8b.html",
    "gf/nervous-system/nc/ns-nc-3d9e.html",
    "gf/nervous-system/nc/ns-nc-p0z9.html",
    "gf/nervous-system/ns-4b82d.html",
    "gf/nervous-system/os/ns-os-7m2p.html",
    "gf/nervous-system/os/ns-os-8t4c.html",
    "gf/nervous-system/os/ns-os-9y6a.html",
    "gf/nervous-system/os/ns-os-p0z9.html",
    "gf/ns-4b82d.html",
    "gf/parasites/pr-br-6e2d.html",
    "gf/parasites/pr-do-4c8m.html",
    "gf/parasites/pr-gate-9f2c.html",
    "gf/parasites/pr-nc-3d9e.html",
    "gf/parasites/pr-pt-7m2p.html",
    "gf/recipes/binders/rc-bd-cilantro-smoothie.html",
    "gf/recipes/binders/rc-bd-clay-water.html",
    "gf/recipes/binders/rc-bd-zeolite.html",
    "gf/recipes/ebv/rc-ebv-cats-claw.html",
    "gf/recipes/ebv/rc-ebv-lemon-balm.html",
    "gf/recipes/ebv/rc-ebv-licorice-broth.html",
    "gf/recipes/hydration/hd-electrolyte.html",
    "gf/recipes/hydration/rc-hd-sole.html",
    "gf/recipes/liver-lymph/rc-gb-shot.html",
    "gf/recipes/liver-lymph/rc-lv-dandelion.html",
    "gf/recipes/liver-lymph/rc-lymph-cleavers.html",
    "gf/recipes/metals/rc-mt-cilantro-chlorella.html",
    "gf/recipes/metals/rc-mt-detox-soup.html",
    "gf/recipes/metals/rc-mt-ginger-turmeric-tea.html",
    "gf/recipes/minerals/rc-mr-coconut-quencher.html",
    "gf/recipes/minerals/rc-mr-mineral-tea.html",
    "gf/recipes/nervous-system/rc-gb-shot.html",
    "gf/recipes/nervous-system/rc-ns-calming-blend.html",
    "gf/recipes/parasites/rc-pr-bwmc-tincture.html",
    "gf/recipes/parasites/rc-pr-gentle-tea.html",
    "gf/recipes/parasites/rc-pr-morning-shot.html",
    "gf/recipes/thyroid/rc-thyroid-calm.html",
    "gf/recipes/thyroid/rc-thyroid-selenium.html",
    "gf/recipes/thyroid/rc-thyroid-warm.html",
    "gf/resources/sourcing/src-bentonite-clay.html",
    "gf/resources/sourcing/src-black-walnut.html",
    "gf/resources/sourcing/src-chlorella.html",
    "gf/resources/sourcing/src-clove.html",
    "gf/resources/sourcing/src-olive-leaf.html",
    "gf/resources/sourcing/src-wormwood.html",
    "gf/resources/sourcing/src-zeolite.html",
    "gf/terrain/tr-main-a3f7.html"
)

$successCount = 0
$failureCount = 0
$skippedCount = 0
$failures = @()

foreach ($file in $filesToUpdate) {
    $filePath = Join-Path $workspaceRoot $file
    
    # Check if file exists
    if (-not (Test-Path $filePath)) {
        Write-Host "SKIP: File not found: $file" -ForegroundColor Yellow
        $failureCount++
        $failures += "Not found: $file"
        continue
    }
    
    # Read entire file as text
    $content = Get-Content $filePath -Raw -Encoding UTF8
    
    # Check if robots tag already exists
    if ($content.Contains('<meta name="robots"')) {
        Write-Host "SKIP: Already has robots tag: $file" -ForegroundColor Cyan
        $skippedCount++
        continue
    }
    
    $updated = $false
    $newContent = $content
    
    # Strategy 1: Look for CSS link and insert robots tag after it
    $cssLinkPattern = '<link rel="stylesheet" href="/css/site.css">'
    $cssLinkIndex = $content.IndexOf($cssLinkPattern)
    
    if ($cssLinkIndex -ge 0) {
        # Find the end of the CSS link tag
        $cssLinkEnd = $cssLinkIndex + $cssLinkPattern.Length
        
        # Find the first newline after CSS link
        $nextNewline = $content.IndexOf("`n", $cssLinkEnd)
        if ($nextNewline -ge 0) {
            # Insert robots tag: CSS link + newline + blank line + robots tag + rest
            $beforeNewline = $content.Substring(0, $nextNewline + 1)
            $afterNewline = $content.Substring($nextNewline + 1)
            $newContent = $beforeNewline + "  `n  " + $robotsTag + "`n" + $afterNewline
            $updated = $true
        }
    }
    
    # Strategy 2: If no CSS link, look for style tag
    if (-not $updated) {
        $stylePattern = '<style>'
        $styleIndex = $content.IndexOf($stylePattern)
        
        if ($styleIndex -gt 0) {
            # Find the start of the line with style tag
            $lineStart = $content.LastIndexOf("`n", $styleIndex)
            if ($lineStart -lt 0) { $lineStart = 0 } else { $lineStart++ }
            
            # Get the indentation of the style tag
            $styleLine = $content.Substring($lineStart, $styleIndex + 1 - $lineStart)
            $indent = ""
            foreach ($char in $styleLine.ToCharArray()) {
                if ($char -eq ' ' -or $char -eq "`t") {
                    $indent += $char
                } else {
                    break
                }
            }
            
            # Build replacement: indent + robots tag + newline + newline + indent + style tag
            $before = $content.Substring(0, $lineStart)
            $after = $content.Substring($lineStart)
            $newContent = $before + $indent + $robotsTag + "`n`n" + $indent + $after
            $updated = $true
        }
    }
    
    if ($updated) {
        # Write updated content back to file
        Set-Content $filePath $newContent -Encoding UTF8 -NoNewline
        Write-Host "UPDATED: $file" -ForegroundColor Green
        $successCount++
    } else {
        Write-Host "FAIL: Could not find insertion point in $file" -ForegroundColor Red
        $failureCount++
        $failures += "No insertion point: $file"
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Successfully updated: $successCount" -ForegroundColor Green
Write-Host "Skipped (already have tag): $skippedCount" -ForegroundColor Cyan
Write-Host "Failed: $failureCount" -ForegroundColor Yellow
if ($failures.Count -gt 0) {
    Write-Host ""
    Write-Host "Failures:" -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host "  - $failure" -ForegroundColor Red
    }
}
