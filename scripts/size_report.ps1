<#
.SYNOPSIS
    Read-only repository size, file count, and git history audit script for MediSync (Phase 1).
.DESCRIPTION
    Measures top-level and second-level directory totals (size, file count, last modified),
    summarizes scratch/ subfolder patterns, lists top 30 largest files (overall and excluding
    scratch/node_modules), and reports git object database size without reading file contents.
    Compatible with Windows PowerShell 5.1 and PowerShell 7+.
#>
param(
    [string]$RootPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path,
    [int]$TopFilesCount = 30,
    [switch]$FastSummary
)

$ErrorActionPreference = 'SilentlyContinue'

function Format-Size([long]$Bytes) {
    if ($Bytes -ge 1GB) { return "{0:N2} GB" -f ($Bytes / 1GB) }
    if ($Bytes -ge 1MB) { return "{0:N2} MB" -f ($Bytes / 1MB) }
    if ($Bytes -ge 1KB) { return "{0:N2} KB" -f ($Bytes / 1KB) }
    return "$Bytes B"
}

Write-Host "=== MediSync Read-Only Size Report ==="
Write-Host "Root: $RootPath"
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK')"
Write-Host "Mode: $(if ($FastSummary) { 'FastSummary (skips deep walk of scratch/ and node_modules/)' } else { 'FullWalk' })"
Write-Host ""

$rootDir = New-Object System.IO.DirectoryInfo($RootPath)
$topItems = $rootDir.GetFileSystemInfos()

$topSummaries = New-Object System.Collections.Generic.List[object]
$secondLevelSummaries = New-Object System.Collections.Generic.List[object]
$topFiles = New-Object System.Collections.Generic.List[object]
$topFilesClean = New-Object System.Collections.Generic.List[object]

function Measure-DirectoryTree([System.IO.DirectoryInfo]$StartDir, [long]$LargeFileThresholdBytes, [bool]$IsCleanTree) {
    $totalBytes = 0L
    $totalFiles = 0L
    $latest = $StartDir.LastWriteTime
    $stack = New-Object System.Collections.Generic.Stack[System.IO.DirectoryInfo]
    $stack.Push($StartDir)

    while ($stack.Count -gt 0) {
        $current = $stack.Pop()
        try {
            foreach ($f in $current.GetFiles()) {
                $len = $f.Length
                $totalBytes += $len
                $totalFiles++
                if ($f.LastWriteTime -gt $latest) { $latest = $f.LastWriteTime }
                if ($len -ge $LargeFileThresholdBytes) {
                    $rel = $f.FullName.Substring($RootPath.Length + 1).Replace('\', '/')
                    $entry = [PSCustomObject]@{
                        RelativePath = $rel
                        Bytes        = $len
                        Size         = Format-Size $len
                        Extension    = $f.Extension
                        LastModified = $f.LastWriteTime.ToString('yyyy-MM-dd HH:mm')
                    }
                    $script:topFiles.Add($entry)
                }
                if ($IsCleanTree -and $len -ge 100KB) {
                    $rel = $f.FullName.Substring($RootPath.Length + 1).Replace('\', '/')
                    $script:topFilesClean.Add([PSCustomObject]@{
                        RelativePath = $rel
                        Bytes        = $len
                        Size         = Format-Size $len
                        Extension    = $f.Extension
                        LastModified = $f.LastWriteTime.ToString('yyyy-MM-dd HH:mm')
                    })
                }
            }
        } catch {}
        try {
            foreach ($d in $current.GetDirectories()) {
                $stack.Push($d)
            }
        } catch {}
    }

    return [PSCustomObject]@{
        Bytes        = $totalBytes
        Files        = $totalFiles
        LastModified = $latest
    }
}

foreach ($item in $topItems) {
    if ($item -is [System.IO.FileInfo]) {
        $topSummaries.Add([PSCustomObject]@{
            Name         = $item.Name
            Type         = 'File'
            Bytes        = $item.Length
            Size         = Format-Size $item.Length
            Files        = 1
            Subfolders   = 0
            LastModified = $item.LastWriteTime.ToString('yyyy-MM-dd HH:mm')
        })
        if ($item.Length -ge 10KB) {
            $entry = [PSCustomObject]@{
                RelativePath = $item.Name
                Bytes        = $item.Length
                Size         = Format-Size $item.Length
                Extension    = $item.Extension
                LastModified = $item.LastWriteTime.ToString('yyyy-MM-dd HH:mm')
            }
            $topFiles.Add($entry)
            $topFilesClean.Add($entry)
        }
    } elseif ($item -is [System.IO.DirectoryInfo]) {
        $dirBytes = 0L
        $dirFiles = 0L
        $latestWrite = $item.LastWriteTime
        $isScratchOrNm = $item.Name -in @('scratch', 'node_modules', '.git', '.venv', 'Python')

        # Direct files in top-level directory
        try {
            foreach ($f in $item.GetFiles()) {
                $len = $f.Length
                $dirBytes += $len
                $dirFiles++
                if ($f.LastWriteTime -gt $latestWrite) { $latestWrite = $f.LastWriteTime }
                if ($len -ge 100KB) {
                    $entry = [PSCustomObject]@{
                        RelativePath = "$($item.Name)/$($f.Name)"
                        Bytes        = $len
                        Size         = Format-Size $len
                        Extension    = $f.Extension
                        LastModified = $f.LastWriteTime.ToString('yyyy-MM-dd HH:mm')
                    }
                    $topFiles.Add($entry)
                    if (-not $isScratchOrNm) { $topFilesClean.Add($entry) }
                }
            }
        } catch {}

        $subDirs = @()
        try { $subDirs = $item.GetDirectories() } catch {}

        if ($FastSummary -and $item.Name -eq 'scratch') {
            $topSummaries.Add([PSCustomObject]@{
                Name         = $item.Name
                Type         = 'Directory (Skipped in FastSummary)'
                Bytes        = 0L
                Size         = '(Skipped)'
                Files        = $dirFiles
                Subfolders   = $subDirs.Count
                LastModified = $latestWrite.ToString('yyyy-MM-dd HH:mm')
            })
            continue
        }

        foreach ($sub in $subDirs) {
            if ($FastSummary -and $sub.Name -eq 'node_modules') {
                $secondLevelSummaries.Add([PSCustomObject]@{
                    Parent       = $item.Name
                    Path         = "$($item.Name)/$($sub.Name)"
                    Bytes        = 0L
                    Size         = '(Skipped)'
                    Files        = 0
                    LastModified = $sub.LastWriteTime.ToString('yyyy-MM-dd HH:mm')
                })
                continue
            }
            $isSubClean = (-not $isScratchOrNm) -and ($sub.Name -notin @('node_modules', '.venv', 'scratch'))
            $stats = Measure-DirectoryTree -StartDir $sub -LargeFileThresholdBytes 5MB -IsCleanTree $isSubClean
            $dirBytes += $stats.Bytes
            $dirFiles += $stats.Files
            if ($stats.LastModified -gt $latestWrite) { $latestWrite = $stats.LastModified }

            if ($item.Name -ne 'scratch' -or $stats.Bytes -ge 50MB) {
                $secondLevelSummaries.Add([PSCustomObject]@{
                    Parent       = $item.Name
                    Path         = "$($item.Name)/$($sub.Name)"
                    Bytes        = $stats.Bytes
                    Size         = Format-Size $stats.Bytes
                    Files        = $stats.Files
                    LastModified = $stats.LastModified.ToString('yyyy-MM-dd HH:mm')
                })
            }
        }

        $topSummaries.Add([PSCustomObject]@{
            Name         = $item.Name
            Type         = 'Directory'
            Bytes        = $dirBytes
            Size         = Format-Size $dirBytes
            Files        = $dirFiles
            Subfolders   = $subDirs.Count
            LastModified = $latestWrite.ToString('yyyy-MM-dd HH:mm')
        })
    }
}

$totalBytes = ($topSummaries | Measure-Object -Property Bytes -Sum).Sum
$rootNmBytes = ($topSummaries | Where-Object { $_.Name -eq 'node_modules' } | Measure-Object -Property Bytes -Sum).Sum
$subNmBytes = ($secondLevelSummaries | Where-Object { $_.Path -match '/node_modules$' } | Measure-Object -Property Bytes -Sum).Sum
$nodeModulesBytes = [long]$rootNmBytes + [long]$subNmBytes
$nonNodeModulesBytes = [long]$totalBytes - [long]$nodeModulesBytes

Write-Host ("Total Measured Size:               {0} ({1:N0} bytes)" -f (Format-Size $totalBytes), $totalBytes)
Write-Host ("Measured node_modules Size:        {0} ({1:N0} bytes)" -f (Format-Size $nodeModulesBytes), $nodeModulesBytes)
Write-Host ("Measured Excl. node_modules:       {0} ({1:N0} bytes)" -f (Format-Size $nonNodeModulesBytes), $nonNodeModulesBytes)
Write-Host ""

Write-Host "=== 1. Top-Level Items (Sorted by Size Descending) ==="
$topSummaries | Sort-Object Bytes -Descending | Select-Object Name, Type, Size, Files, Subfolders, LastModified | Format-Table -AutoSize

Write-Host "=== 2A. Non-Scratch Second-Level Subfolders (Sorted by Size Descending) ==="
$secondLevelSummaries | Where-Object { $_.Parent -notin @('scratch', 'node_modules') } | Sort-Object Bytes -Descending | Select-Object -First 45 Path, Size, Files, LastModified | Format-Table -AutoSize

$scratchDir = New-Object System.IO.DirectoryInfo((Join-Path $RootPath 'scratch'))
if ($scratchDir.Exists) {
    Write-Host "=== 2B. scratch/ Subfolder Prefix Breakdown ==="
    $groups = @{}
    foreach ($si in $scratchDir.GetFileSystemInfos()) {
        $n = $si.Name
        if ($n -match '^([a-zA-Z0-9]+-[a-zA-Z0-9]+)-') { $k = "$($Matches[1])-*" }
        elseif ($n -match '^(CODEX_[A-Za-z0-9_]+)_') { $k = 'CODEX_*' }
        elseif ($n -match '^([a-zA-Z0-9_]+)-') { $k = "$($Matches[1])-*" }
        else { $k = $n }
        $groups[$k] = [int]$groups[$k] + 1
    }
    $groups.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 20 @{N='Pattern';E={$_.Name}}, @{N='Count';E={$_.Value}} | Format-Table -AutoSize
}

if (-not $FastSummary) {
    Write-Host "=== 3A. Top $TopFilesCount Largest Files (Overall) ==="
    $topFiles | Sort-Object Bytes -Descending | Select-Object -First $TopFilesCount RelativePath, Size, Extension, LastModified | Format-Table -AutoSize
}

Write-Host "=== 3B. Top $TopFilesCount Largest Files (Excl. scratch, node_modules, .venv, Python, .git) ==="
$topFilesClean | Sort-Object Bytes -Descending | Select-Object -First $TopFilesCount RelativePath, Size, Extension, LastModified | Format-Table -AutoSize
