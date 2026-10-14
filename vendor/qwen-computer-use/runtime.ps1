param(
    [Parameter(Mandatory = $true)]
    [string]$OperationPath
)

$ErrorActionPreference = "Stop"
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8
Add-Type -Path (Join-Path $PSScriptRoot 'desktop-input.cs')
[OcuDesktop]::PhysicalPixels()

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class OCUWin32 {
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT {
        public int X;
        public int Y;
    }

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll")]
    public static extern bool ScreenToClient(IntPtr hWnd, ref POINT point);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern bool PostMessage(IntPtr hWnd, UInt32 msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessage(IntPtr hWnd, UInt32 msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SendMessage(IntPtr hWnd, UInt32 msg, IntPtr wParam, string lParam);
}
"@

$WM_SETTEXT = 0x000C
$WM_MOUSEMOVE = 0x0200
$WM_LBUTTONDOWN = 0x0201
$WM_LBUTTONUP = 0x0202
$WM_RBUTTONDOWN = 0x0204
$WM_RBUTTONUP = 0x0205
$WM_MBUTTONDOWN = 0x0207
$WM_MBUTTONUP = 0x0208
$WM_MOUSEWHEEL = 0x020A
$WM_MOUSEHWHEEL = 0x020E
$WM_KEYDOWN = 0x0100
$WM_KEYUP = 0x0101
$WM_CHAR = 0x0102
$EM_SETSEL = 0x00B1
$EM_REPLACESEL = 0x00C2

function Test-EnvFlagEnabled([string]$name) {
    $value = [Environment]::GetEnvironmentVariable($name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $false
    }
    $normalized = $value.Trim().ToLowerInvariant()
    return @("1", "true", "yes", "on") -contains $normalized
}

function New-Frame($x, $y, $width, $height) {
    if ($width -lt 0 -or $height -lt 0) {
        return $null
    }
    [pscustomobject]@{
        x = [double]$x
        y = [double]$y
        width = [double]$width
        height = [double]$height
    }
}

function ConvertTo-LParam([int]$x, [int]$y) {
    $packed = (($y -band 0xffff) -shl 16) -bor ($x -band 0xffff)
    [IntPtr]$packed
}

function ConvertTo-WheelWParam([int]$delta) {
    $packed = (($delta -band 0xffff) -shl 16)
    [IntPtr]$packed
}

function Get-WindowRectFrame([IntPtr]$hwnd) {
    $rect = New-Object OCUWin32+RECT
    if ([OCUWin32]::GetWindowRect($hwnd, [ref]$rect)) {
        return New-Frame $rect.Left $rect.Top ($rect.Right - $rect.Left) ($rect.Bottom - $rect.Top)
    }
    return $null
}

function Get-ElementFrame($element, $windowBounds) {
    try {
        $rect = $element.Current.BoundingRectangle
        if ($rect.IsEmpty -or $rect.Width -le 0 -or $rect.Height -le 0) {
            return $null
        }
        if ($null -ne $windowBounds) {
            return New-Frame ($rect.X - $windowBounds.x) ($rect.Y - $windowBounds.y) $rect.Width $rect.Height
        }
        return New-Frame $rect.X $rect.Y $rect.Width $rect.Height
    } catch {
        return $null
    }
}

function Get-ScreenPoint($localFrame, $windowBounds) {
    if ($null -eq $localFrame -or $null -eq $windowBounds) {
        return $null
    }
    [pscustomobject]@{
        x = [int][math]::Round($windowBounds.x + $localFrame.x + ($localFrame.width / 2))
        y = [int][math]::Round($windowBounds.y + $localFrame.y + ($localFrame.height / 2))
    }
}

function Get-ScrollPoint($operation, $windowBounds) {
    if ($null -ne $operation.x -and $null -ne $operation.y) {
        return [pscustomobject]@{x=[int][math]::Round($windowBounds.x + $operation.x);y=[int][math]::Round($windowBounds.y + $operation.y)}
    }
    return Get-ScreenPoint $operation.element.frame $windowBounds
}

function Send-MouseClick([IntPtr]$hwnd, [int]$screenX, [int]$screenY, [string]$button, [int]$count) {
    if (Test-EnvFlagEnabled 'OPEN_COMPUTER_USE_WINDOWS_FOREGROUND_INPUT') {
        [OcuDesktop]::Click($hwnd, $screenX, $screenY, $button, [math]::Max(1,$count)); return
    }
    $point = New-Object OCUWin32+POINT
    $point.X = $screenX
    $point.Y = $screenY
    [void][OCUWin32]::ScreenToClient($hwnd, [ref]$point)
    $lParam = ConvertTo-LParam $point.X $point.Y

    $down = $WM_LBUTTONDOWN
    $up = $WM_LBUTTONUP
    $downFlag = 0x0001
    if ($button -eq "right") {
        $down = $WM_RBUTTONDOWN
        $up = $WM_RBUTTONUP
        $downFlag = 0x0002
    } elseif ($button -eq "middle") {
        $down = $WM_MBUTTONDOWN
        $up = $WM_MBUTTONUP
        $downFlag = 0x0010
    }

    $repeat = [math]::Max(1, $count)
    for ($i = 0; $i -lt $repeat; $i++) {
        [void][OCUWin32]::PostMessage($hwnd, $WM_MOUSEMOVE, [IntPtr]::Zero, $lParam)
        [void][OCUWin32]::PostMessage($hwnd, $down, [IntPtr]$downFlag, $lParam)
        Start-Sleep -Milliseconds 35
        [void][OCUWin32]::PostMessage($hwnd, $up, [IntPtr]::Zero, $lParam)
        Start-Sleep -Milliseconds 50
    }
}

function Send-Drag([IntPtr]$hwnd, [int]$fromX, [int]$fromY, [int]$toX, [int]$toY) {
    if (Test-EnvFlagEnabled 'OPEN_COMPUTER_USE_WINDOWS_FOREGROUND_INPUT') {
        [OcuDesktop]::Drag($hwnd,$fromX,$fromY,$toX,$toY); return
    }
    $start = New-Object OCUWin32+POINT
    $start.X = $fromX
    $start.Y = $fromY
    [void][OCUWin32]::ScreenToClient($hwnd, [ref]$start)
    $end = New-Object OCUWin32+POINT
    $end.X = $toX
    $end.Y = $toY
    [void][OCUWin32]::ScreenToClient($hwnd, [ref]$end)

    $steps = 12
    $startParam = ConvertTo-LParam $start.X $start.Y
    [void][OCUWin32]::PostMessage($hwnd, $WM_MOUSEMOVE, [IntPtr]::Zero, $startParam)
    [void][OCUWin32]::PostMessage($hwnd, $WM_LBUTTONDOWN, [IntPtr]1, $startParam)
    for ($i = 1; $i -le $steps; $i++) {
        $x = [int][math]::Round($start.X + (($end.X - $start.X) * $i / $steps))
        $y = [int][math]::Round($start.Y + (($end.Y - $start.Y) * $i / $steps))
        [void][OCUWin32]::PostMessage($hwnd, $WM_MOUSEMOVE, [IntPtr]1, (ConvertTo-LParam $x $y))
        Start-Sleep -Milliseconds 20
    }
    [void][OCUWin32]::PostMessage($hwnd, $WM_LBUTTONUP, [IntPtr]::Zero, (ConvertTo-LParam $end.X $end.Y))
}

function Send-Scroll([IntPtr]$hwnd, [int]$screenX, [int]$screenY, [string]$direction, [double]$pages) {
    if (Test-EnvFlagEnabled 'OPEN_COMPUTER_USE_WINDOWS_FOREGROUND_INPUT') {
        $delta=[int][math]::Round(120*$pages)
        if ($direction -eq 'down' -or $direction -eq 'left') {$delta=-$delta}
        [OcuDesktop]::Scroll($hwnd,$screenX,$screenY,($direction -eq 'left' -or $direction -eq 'right'),$delta); return
    }
    $point = New-Object OCUWin32+POINT
    $point.X = $screenX
    $point.Y = $screenY
    [void][OCUWin32]::ScreenToClient($hwnd, [ref]$point)
    $lParam = ConvertTo-LParam $point.X $point.Y
    $delta = [int][math]::Round(120 * $pages)
    $message = $WM_MOUSEWHEEL
    if ($direction -eq "down" -or $direction -eq "right") {
        $delta = -1 * $delta
    }
    if ($direction -eq "left" -or $direction -eq "right") {
        $message = $WM_MOUSEHWHEEL
    }
    [void][OCUWin32]::PostMessage($hwnd, $message, (ConvertTo-WheelWParam $delta), $lParam)
}

function Send-Text([IntPtr]$hwnd, [string]$text) {
    foreach ($char in $text.ToCharArray()) {
        [void][OCUWin32]::PostMessage($hwnd, $WM_CHAR, [IntPtr][int][char]$char, [IntPtr]::Zero)
        Start-Sleep -Milliseconds 8
    }
}

function Send-TextToEditHandle([IntPtr]$hwnd, [string]$text, $element) {
    if ($hwnd -eq [IntPtr]::Zero) {
        return $false
    }

    try {
        [void][OCUWin32]::SendMessage($hwnd, $EM_SETSEL, [IntPtr](-1), [IntPtr](-1))
        [void][OCUWin32]::SendMessage($hwnd, $EM_REPLACESEL, [IntPtr]1, $text)
        return $true
    } catch {
    }

    try {
        $current = ""
        if ($null -ne $element) {
            $current = Get-ElementValue $element
        }
        [void][OCUWin32]::SendMessage($hwnd, $WM_SETTEXT, [IntPtr]::Zero, ($current + $text))
        return $true
    } catch {
        return $false
    }
}

function Get-VirtualKey([string]$key) {
    $normalized = $key.ToLowerInvariant()
    $map = @{
        "super" = 0x5B; "win" = 0x5B; "lwin" = 0x5B; "super_l" = 0x5B; "rwin" = 0x5C; "super_r" = 0x5C
        "return" = 0x0D; "enter" = 0x0D; "tab" = 0x09; "escape" = 0x1B; "esc" = 0x1B
        "backspace" = 0x08; "back_space" = 0x08; "delete" = 0x2E; "space" = 0x20
        "left" = 0x25; "up" = 0x26; "right" = 0x27; "down" = 0x28
        "plus" = 0x6B; "add" = 0x6B; "kp_add" = 0x6B
        "minus" = 0x6D; "subtract" = 0x6D; "kp_subtract" = 0x6D
        "asterisk" = 0x6A; "multiply" = 0x6A; "kp_multiply" = 0x6A
        "slash" = 0x6F; "divide" = 0x6F; "kp_divide" = 0x6F
        "decimal" = 0x6E; "kp_decimal" = 0x6E; "kp_enter" = 0x0D
        "period" = 0xBE; "comma" = 0xBC; "equal" = 0xBB
        "home" = 0x24; "end" = 0x23; "page_up" = 0x21; "prior" = 0x21; "page_down" = 0x22; "next" = 0x22
    }
    if ($map.ContainsKey($normalized)) {
        return $map[$normalized]
    }
    if ($normalized -match "^f([1-9]|1[0-2])$") {
        return 0x70 + [int]$Matches[1] - 1
    }
    if ($normalized -match "^kp_([0-9])$") {
        return 0x60 + [int]$Matches[1]
    }
    if ($normalized.Length -eq 1) {
        $code = [int][char]$normalized.ToUpperInvariant()[0]
        if (($code -ge 0x30 -and $code -le 0x39) -or ($code -ge 0x41 -and $code -le 0x5A)) {
            return $code
        }
    }
    throw "Unsupported key: $key"
}

function Send-Key([IntPtr]$hwnd, [string]$key) {
    $parts = $key -split "\+"
    $main = $parts[$parts.Length - 1].Trim()
    $modifiers = @()
    for ($i = 0; $i -lt $parts.Length - 1; $i++) {
        switch ($parts[$i].Trim().ToLowerInvariant()) {
            "ctrl" { $modifiers += 0x11 }
            "control" { $modifiers += 0x11 }
            "control_l" { $modifiers += 0x11 }
            "control_r" { $modifiers += 0x11 }
            "shift" { $modifiers += 0x10 }
            "shift_l" { $modifiers += 0x10 }
            "shift_r" { $modifiers += 0x10 }
            "alt" { $modifiers += 0x12 }
            "alt_l" { $modifiers += 0x12 }
            "alt_r" { $modifiers += 0x12 }
            "super" { $modifiers += 0x5B }
            "win" { $modifiers += 0x5B }
            "cmd" { $modifiers += 0x5B }
            default { throw "Unsupported modifier: $($parts[$i])" }
        }
    }
    # Resolve printable symbols against the target keyboard layout before input.
    $symbols = @{
        exclam=33; quotedbl=34; numbersign=35; dollar=36; percent=37; ampersand=38
        apostrophe=39; parenleft=40; parenright=41; asterisk=42; plus=43; comma=44
        minus=45; period=46; slash=47; colon=58; semicolon=59; less=60; equal=61
        greater=62; question=63; at=64; bracketleft=91; backslash=92; bracketright=93
        asciicircum=94; underscore=95; grave=96; braceleft=123; bar=124; braceright=125; asciitilde=126
    }
    $character = $null
    if ($symbols.ContainsKey($main.ToLowerInvariant())) { $character = [char]$symbols[$main.ToLowerInvariant()] }
    elseif ($main.Length -eq 1 -and $main -notmatch '^[a-zA-Z0-9]$') { $character = [char]$main[0] }
    if ($null -ne $character) {
        $encoded = [OcuDesktop]::CharacterKey($hwnd,$character)
        $vk = $encoded -band 0xff
        if ($encoded -band 0x100) { $modifiers += 0x10 }
        if ($encoded -band 0x200) { $modifiers += 0x11 }
        if ($encoded -band 0x400) { $modifiers += 0x12 }
        $modifiers = @($modifiers | Select-Object -Unique)
    } else { $vk = Get-VirtualKey $main }
    if (Test-EnvFlagEnabled 'OPEN_COMPUTER_USE_WINDOWS_FOREGROUND_INPUT') {
        [OcuDesktop]::Chord($hwnd,[uint16[]]$modifiers,[uint16]$vk); return
    }
    foreach ($modifier in $modifiers) {
        [void][OCUWin32]::PostMessage($hwnd, $WM_KEYDOWN, [IntPtr]$modifier, [IntPtr]::Zero)
    }
    [void][OCUWin32]::PostMessage($hwnd, $WM_KEYDOWN, [IntPtr]$vk, [IntPtr]::Zero)
    Start-Sleep -Milliseconds 25
    [void][OCUWin32]::PostMessage($hwnd, $WM_KEYUP, [IntPtr]$vk, [IntPtr]::Zero)
    [array]::Reverse($modifiers)
    foreach ($modifier in $modifiers) {
        [void][OCUWin32]::PostMessage($hwnd, $WM_KEYUP, [IntPtr]$modifier, [IntPtr]::Zero)
    }
}

function Resolve-App([string]$query) {
    $normalized = $query.Trim()
    if ($normalized -match '^window:(\d+):(\d+)$') {
        $ownerId = [int]$Matches[1]
        $handle = [IntPtr][int64]$Matches[2]
        if (-not [OcuDesktop]::BelongsToProcess($handle,$ownerId)) { throw 'Target window identity changed; run list_apps again' }
        $owner = Get-Process -Id $ownerId -ErrorAction Stop
        return [pscustomobject]@{Id=$owner.Id;ProcessName=$owner.ProcessName;MainWindowHandle=$handle;MainWindowTitle=[OcuDesktop]::Title($handle)}
    }
    if ($normalized -ieq "foreground") {
        $handle = [OcuDesktop]::ForegroundWindow()
        $ownerId = [OcuDesktop]::WindowProcessId($handle)
        if ($handle -eq [IntPtr]::Zero -or $ownerId -eq 0) { throw 'No foreground window is available' }
        $owner = Get-Process -Id $ownerId -ErrorAction Stop
        return [pscustomobject]@{Id=$owner.Id;ProcessName=$owner.ProcessName;MainWindowHandle=$handle;MainWindowTitle=[OcuDesktop]::Title($handle)}
    }
    $processQuery = $normalized
    if ($processQuery.EndsWith(".exe", [System.StringComparison]::OrdinalIgnoreCase)) {
        $processQuery = $processQuery.Substring(0, $processQuery.Length - 4)
    }
    $processes = @(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 })
    $pidValue = 0
    if ([int]::TryParse($normalized, [ref]$pidValue)) {
        $match = $processes | Where-Object { $_.Id -eq $pidValue } | Select-Object -First 1
        if ($null -ne $match) {
            return $match
        }
    }

    $match = $processes | Where-Object {
        $_.ProcessName -ieq $processQuery -or
        "$($_.ProcessName).exe" -ieq $normalized -or
        $_.MainWindowTitle -ieq $normalized -or
        $_.MainWindowTitle -ilike "*$normalized*"
    } | Select-Object -First 1
    if ($null -ne $match) {
        return $match
    }

    if (Test-EnvFlagEnabled "OPEN_COMPUTER_USE_WINDOWS_ALLOW_APP_LAUNCH") {
        try {
            $started = Start-Process -FilePath $normalized -PassThru
            for ($i = 0; $i -lt 20; $i++) {
                Start-Sleep -Milliseconds 250
                $candidate = Get-Process -Id $started.Id -ErrorAction SilentlyContinue
                if ($null -ne $candidate -and $candidate.MainWindowHandle -ne 0) {
                    return $candidate
                }
            }
        } catch {
        }
    }

    throw "appNotFound(`"$query`")"
}

function Resolve-ObservedApp([string]$query, [int64]$expectedWindow=0, [int]$expectedPid=0, [bool]$strict=$false) {
    $handle = [IntPtr]$expectedWindow
    if ($expectedWindow -ne 0 -and $expectedPid -gt 0 -and [OcuDesktop]::BelongsToProcess($handle,$expectedPid)) {
        # Shell flyouts can have no Process.MainWindowHandle. The observed HWND/PID is authoritative.
        $process = Get-Process -Id $expectedPid -ErrorAction Stop
    } elseif ($strict) {
        throw 'Target window identity changed; no input dispatched. Run get_app_state.'
    } else {
        $process = Resolve-App $query
        $handle = if ($query -ieq "foreground" -or $query -match '^window:\d+:\d+$') {[IntPtr]$process.MainWindowHandle} else {[OcuDesktop]::InitialWindow($process.Id,[IntPtr]$process.MainWindowHandle)}
        # Bind the observed top-level HWND to its actual owner, including hosted apps.
        $windowOwner = [OcuDesktop]::WindowProcessId($handle)
        if ($windowOwner -eq 0) { throw 'Target window disappeared during observation' }
        if ($windowOwner -ne $process.Id) { $process = Get-Process -Id $windowOwner -ErrorAction Stop }
    }
    return [pscustomobject]@{Id=$process.Id;ProcessName=$process.ProcessName;MainWindowHandle=$handle;MainWindowTitle=[OcuDesktop]::Title($handle)}
}

function Get-MainElement($process) {
    if ($process.MainWindowHandle -ne 0) {
        return [Windows.Automation.AutomationElement]::FromHandle([IntPtr]$process.MainWindowHandle)
    }
    $condition = New-Object Windows.Automation.PropertyCondition ([Windows.Automation.AutomationElement]::ProcessIdProperty), $process.Id
    $children = [Windows.Automation.AutomationElement]::RootElement.FindAll([Windows.Automation.TreeScope]::Children, $condition)
    if ($children.Count -gt 0) {
        return $children.Item(0)
    }
    throw "No top-level UI Automation window is available for $($process.ProcessName). Run the Windows runtime in the signed-in desktop session."
}

function Get-WindowBounds($process, $element) {
    $hwnd = [IntPtr]$process.MainWindowHandle
    if ($hwnd -ne [IntPtr]::Zero) {
        $fromWin32 = Get-WindowRectFrame $hwnd
        if ($null -ne $fromWin32) {
            return $fromWin32
        }
    }
    try {
        $rect = $element.Current.BoundingRectangle
        if (-not $rect.IsEmpty -and $rect.Width -gt 0 -and $rect.Height -gt 0) {
            return New-Frame $rect.X $rect.Y $rect.Width $rect.Height
        }
    } catch {
    }
    return $null
}

function Get-PatternNames($element) {
    $names = New-Object System.Collections.Generic.List[string]
    foreach ($pattern in $element.GetSupportedPatterns()) {
        $programmatic = $pattern.ProgrammaticName
        if ($programmatic -like "InvokePatternIdentifiers.Pattern") { $names.Add("Invoke") }
        elseif ($programmatic -like "TogglePatternIdentifiers.Pattern") { $names.Add("Toggle") }
        elseif ($programmatic -like "SelectionItemPatternIdentifiers.Pattern") { $names.Add("Select") }
        elseif ($programmatic -like "ExpandCollapsePatternIdentifiers.Pattern") {
            try {
                $state = $element.GetCurrentPattern([Windows.Automation.ExpandCollapsePattern]::Pattern).Current.ExpandCollapseState
                if ($state -eq [Windows.Automation.ExpandCollapseState]::Collapsed) { $names.Add("Expand") }
                elseif ($state -eq [Windows.Automation.ExpandCollapseState]::Expanded) { $names.Add("Collapse") }
            } catch {
                $names.Add("Expand")
                $names.Add("Collapse")
            }
        }
        elseif ($programmatic -like "ScrollItemPatternIdentifiers.Pattern") { $names.Add("ScrollIntoView") }
        elseif ($programmatic -like "ScrollPatternIdentifiers.Pattern") { $names.Add("Scroll") }
        elseif ($programmatic -like "ValuePatternIdentifiers.Pattern") { $names.Add("SetValue") }
    }
    if ($names.Count -gt 0) {
        return @($names | Select-Object -Unique)
    }
    return @()
}

function Get-ElementString($element, [string]$propertyName) {
    try {
        $value = $element.Current.$propertyName
        if ($null -eq $value) {
            return ""
        }
        return [string]$value
    } catch {
        return ""
    }
}

function Get-ElementInt64($element, [string]$propertyName) {
    try {
        return [int64]$element.Current.$propertyName
    } catch {
        return 0
    }
}

function Get-ElementControlTypeName($element) {
    try {
        $controlType = $element.Current.ControlType
        if ($null -eq $controlType) {
            return ""
        }
        return [string]$controlType.ProgrammaticName
    } catch {
        return ""
    }
}

function Get-ElementValue($element) {
    try {
        $valuePattern = $element.GetCurrentPattern([Windows.Automation.ValuePattern]::Pattern)
        $value = $valuePattern.Current.Value
        if ($null -eq $value) {
            return ""
        }
        $text = [string]$value
        if ($text.Length -gt 500) {
            return $text.Substring(0, 500)
        }
        return $text
    } catch {
        return ""
    }
}

function Get-ElementRecord($element, [int]$index, $windowBounds) {
    $frame = Get-ElementFrame $element $windowBounds
    $runtimeId = @()
    try { $runtimeId = @($element.GetRuntimeId()) } catch {}
    [pscustomobject]@{
        index = $index
        runtimeId = $runtimeId
        automationId = Get-ElementString $element "AutomationId"
        name = Get-ElementString $element "Name"
        controlType = Get-ElementControlTypeName $element
        localizedControlType = Get-ElementString $element "LocalizedControlType"
        className = Get-ElementString $element "ClassName"
        value = Get-ElementValue $element
        nativeWindowHandle = Get-ElementInt64 $element "NativeWindowHandle"
        frame = $frame
        actions = @($(if ($index -eq 0) { 'Raise' }); Get-PatternNames $element)
    }
}

function Get-ElementTitle($record) {
    if (-not [string]::IsNullOrWhiteSpace($record.name)) {
        return $record.name
    }
    if (-not [string]::IsNullOrWhiteSpace($record.automationId)) {
        return "ID: $($record.automationId)"
    }
    return ""
}

function Render-Tree($element, $windowBounds) {
    $records = New-Object System.Collections.Generic.List[object]
    $lines = New-Object System.Collections.Generic.List[string]
    $visited = New-Object System.Collections.Generic.HashSet[string]
    $nextIndex = 0

    function Visit($node, [int]$depth) {
        if ($script:nextIndex -ge 500 -or $depth -gt 16) {
            return
        }
        $runtime = ""
        try { $runtime = (@($node.GetRuntimeId()) -join ".") } catch { $runtime = [guid]::NewGuid().ToString() }
        if (-not $script:visited.Add($runtime)) {
            return
        }

        $index = $script:nextIndex
        $script:nextIndex++
        $record = Get-ElementRecord $node $index $script:windowBounds
        $script:records.Add($record)

        $role = $record.localizedControlType
        if ([string]::IsNullOrWhiteSpace($role)) {
            $role = $record.controlType
        }
        $title = Get-ElementTitle $record
        $actionsSegment = ""
        if ($record.actions.Count -gt 0) {
            $actionsSegment = " Secondary Actions: " + ($record.actions -join ", ")
        }
        $valueSegment = ""
        if (-not [string]::IsNullOrWhiteSpace($record.value) -and $record.value -ne $title) {
            $safeValue = (($record.value -replace "`r", "\\r") -replace "`n", "\\n")
            $valueSegment = " Value: $safeValue"
        }
        $frameSegment = ""
        if ($null -ne $record.frame) {
            $frameSegment = " Frame: {{x: {0}, y: {1}, width: {2}, height: {3}}}" -f [int][math]::Round($record.frame.x), [int][math]::Round($record.frame.y), [int][math]::Round($record.frame.width), [int][math]::Round($record.frame.height)
        }
        $script:lines.Add(("`t" * ($depth + 1)) + "$index $role $title$valueSegment$actionsSegment$frameSegment")

        try {
            $children = $node.FindAll([Windows.Automation.TreeScope]::Children, [Windows.Automation.Condition]::TrueCondition)
            for ($i = 0; $i -lt $children.Count; $i++) {
                Visit $children.Item($i) ($depth + 1)
            }
        } catch {
        }
    }

    $script:records = $records
    $script:lines = $lines
    $script:visited = $visited
    $script:nextIndex = $nextIndex
    $script:windowBounds = $windowBounds
    Visit $element 0

    [pscustomobject]@{
        records = $records.ToArray()
        lines = $lines.ToArray()
    }
}

function Capture-WindowPngBase64([IntPtr]$hwnd, $bounds) {
    if (-not [OcuDesktop]::WindowVisible($hwnd) -or [OcuDesktop]::IsIconic($hwnd) -or $null -eq $bounds -or $bounds.width -le 0 -or $bounds.height -le 0) {
        return $null
    }
    try {
        $bitmap = New-Object System.Drawing.Bitmap ([int][math]::Round($bounds.width)), ([int][math]::Round($bounds.height))
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        if ([OcuDesktop]::IsForeground($hwnd)) {
            # Include transient search/dropdown surfaces that WM_PRINT omits.
            $graphics.CopyFromScreen([int]$bounds.x,[int]$bounds.y,0,0,$bitmap.Size)
            $captured=$true
        } else {
            $dc = $graphics.GetHdc()
            try { $captured = [OcuDesktop]::PrintWindow($hwnd,$dc,2) }
            finally { $graphics.ReleaseHdc($dc) }
        }
        if (-not $captured) { $graphics.Dispose(); $bitmap.Dispose(); return $null }
        $stream = New-Object System.IO.MemoryStream
        $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $graphics.Dispose()
        $bitmap.Dispose()
        $bytes = $stream.ToArray()
        $stream.Dispose()
        return [Convert]::ToBase64String($bytes)
    } catch {
        return $null
    }
}

function Get-FocusedSummary($processId) {
    try {
        $focused = [Windows.Automation.AutomationElement]::FocusedElement
        if ($null -ne $focused -and $focused.Current.ProcessId -eq $processId) {
            $role = $focused.Current.LocalizedControlType
            $name = $focused.Current.Name
            if ([string]::IsNullOrWhiteSpace($name)) {
                return $role
            }
            return "$role $name"
        }
    } catch {
    }
    return $null
}

function Get-SelectedText($processId) {
    try {
        $focused = [Windows.Automation.AutomationElement]::FocusedElement
        if ($null -eq $focused -or $focused.Current.ProcessId -ne $processId) {
            return $null
        }
        $textPattern = $focused.GetCurrentPattern([Windows.Automation.TextPattern]::Pattern)
        $selection = $textPattern.GetSelection()
        if ($selection.Count -gt 0) {
            return $selection.Item(0).GetText(2048)
        }
    } catch {
    }
    return $null
}

function Build-Snapshot([string]$query, [int64]$expectedWindow=0, [int]$expectedPid=0, [bool]$strict=$false) {
    $process = Resolve-ObservedApp $query $expectedWindow $expectedPid $strict
    $element = Get-MainElement $process
    $bounds = Get-WindowBounds $process $element
    $rendered = Render-Tree $element $bounds
    $foreground = $null
    try {
        $active = Resolve-App 'foreground'
        $foreground = [pscustomobject]@{name=$active.ProcessName;pid=$active.Id;windowHandle=[int64]$active.MainWindowHandle;title=$active.MainWindowTitle}
    } catch {}
    [pscustomobject]@{
        foreground = $foreground
        app = [pscustomobject]@{
            name = $process.ProcessName
            bundleIdentifier = $process.ProcessName
            pid = [int]$process.Id
        }
        windowTitle = $process.MainWindowTitle
        windowHandle = [int64]$process.MainWindowHandle
        windowBounds = $bounds
        screenshotPngBase64 = Capture-WindowPngBase64 ([IntPtr]$process.MainWindowHandle) $bounds
        treeLines = @($rendered.lines)
        focusedSummary = Get-FocusedSummary $process.Id
        selectedText = Get-SelectedText $process.Id
        elements = @($rendered.records)
    }
}

function List-Apps {
    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($handle in [OcuDesktop]::VisibleWindows()) {
        $ownerId = [OcuDesktop]::WindowProcessId($handle)
        $process = Get-Process -Id $ownerId -ErrorAction SilentlyContinue
        if ($null -eq $process) { continue }
        $title = [OcuDesktop]::Title($handle)
        $lines.Add(("{0} -- {1} [running, pid={2}, window={3}, app=window:{2}:{4}]" -f $process.ProcessName, $process.ProcessName, $ownerId, $title, $handle.ToInt64()))
    }
    return ($lines -join "`n")
}

function Same-RuntimeId($left, $right) {
    if ($null -eq $left -or $null -eq $right -or $left.Count -ne $right.Count) {
        return $false
    }
    for ($i = 0; $i -lt $left.Count; $i++) {
        if ([int]$left[$i] -ne [int]$right[$i]) {
            return $false
        }
    }
    return $true
}

function Get-AllElements($root) {
    $items = New-Object System.Collections.Generic.List[object]
    $items.Add($root)
    try {
        $descendants = $root.FindAll([Windows.Automation.TreeScope]::Descendants, [Windows.Automation.Condition]::TrueCondition)
        for ($i = 0; $i -lt $descendants.Count; $i++) {
            $items.Add($descendants.Item($i))
        }
    } catch {
    }
    return $items.ToArray()
}

function Find-Element($process, $record) {
    if ($null -eq $record) {
        return $null
    }
    $root = Get-MainElement $process
    foreach ($element in (Get-AllElements $root)) {
        try {
            if (Same-RuntimeId @($element.GetRuntimeId()) @($record.runtimeId)) {
                return $element
            }
        } catch {
        }
    }
    foreach ($element in (Get-AllElements $root)) {
        try {
            $sameAutomationId = -not [string]::IsNullOrWhiteSpace($record.automationId) -and $element.Current.AutomationId -eq $record.automationId
            $sameName = -not [string]::IsNullOrWhiteSpace($record.name) -and $element.Current.Name -eq $record.name
            $sameType = $element.Current.ControlType.ProgrammaticName -eq $record.controlType
            if (($sameAutomationId -or $sameName) -and $sameType) {
                return $element
            }
        } catch {
        }
    }
    return $null
}

function Get-CurrentPatternOrNull($element, $pattern) {
    try {
        return $element.GetCurrentPattern($pattern)
    } catch {
        return $null
    }
}

function Invoke-PreferredClick($element) {
    $invoke = Get-CurrentPatternOrNull $element ([Windows.Automation.InvokePattern]::Pattern)
    if ($null -ne $invoke) {
        $invoke.Invoke()
        return $true
    }
    $selection = Get-CurrentPatternOrNull $element ([Windows.Automation.SelectionItemPattern]::Pattern)
    if ($null -ne $selection) {
        $selection.Select()
        return $true
    }
    $toggle = Get-CurrentPatternOrNull $element ([Windows.Automation.TogglePattern]::Pattern)
    if ($null -ne $toggle) {
        $toggle.Toggle()
        return $true
    }
    return $false
}

function Invoke-SecondaryAction($element, [string]$action) {
    switch ($action.ToLowerInvariant()) {
        "invoke" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.InvokePattern]::Pattern)
            if ($null -ne $pattern) { $pattern.Invoke(); return }
        }
        "toggle" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.TogglePattern]::Pattern)
            if ($null -ne $pattern) { $pattern.Toggle(); return }
        }
        "select" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.SelectionItemPattern]::Pattern)
            if ($null -ne $pattern) { $pattern.Select(); return }
        }
        "expand" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ExpandCollapsePattern]::Pattern)
            if ($null -ne $pattern) { $pattern.Expand(); return }
        }
        "collapse" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ExpandCollapsePattern]::Pattern)
            if ($null -ne $pattern) { $pattern.Collapse(); return }
        }
        "scrollintoview" {
            $pattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ScrollItemPattern]::Pattern)
            if ($null -ne $pattern) { $pattern.ScrollIntoView(); return }
        }
        "setfocus" {
            if (-not (Test-EnvFlagEnabled "OPEN_COMPUTER_USE_WINDOWS_ALLOW_FOCUS_ACTIONS")) {
                throw "SetFocus is disabled by default to avoid stealing user focus; set OPEN_COMPUTER_USE_WINDOWS_ALLOW_FOCUS_ACTIONS=1 to enable it."
            }
            $element.SetFocus()
            return
        }
    }
    throw "$action is not a valid secondary action for $($operation.element.index)"
}

function Invoke-Scroll($element, [string]$direction, [double]$pages) {
    $scroll = Get-CurrentPatternOrNull $element ([Windows.Automation.ScrollPattern]::Pattern)
    if ($null -eq $scroll) {
        return $false
    }
    $horizontal = [Windows.Automation.ScrollAmount]::NoAmount
    $vertical = [Windows.Automation.ScrollAmount]::NoAmount
    if ($direction -eq "up") { $vertical = [Windows.Automation.ScrollAmount]::LargeDecrement }
    elseif ($direction -eq "down") { $vertical = [Windows.Automation.ScrollAmount]::LargeIncrement }
    elseif ($direction -eq "left") { $horizontal = [Windows.Automation.ScrollAmount]::LargeDecrement }
    elseif ($direction -eq "right") { $horizontal = [Windows.Automation.ScrollAmount]::LargeIncrement }
    $repeat = [math]::Max(1, [int][math]::Ceiling($pages))
    for ($i = 0; $i -lt $repeat; $i++) {
        $scroll.Scroll($horizontal, $vertical)
        Start-Sleep -Milliseconds 40
    }
    return $true
}

function Find-TextEntryElement($process) {
    try {
        $focused = [Windows.Automation.AutomationElement]::FocusedElement
        if ($null -ne $focused -and $focused.Current.ProcessId -eq $process.Id) {
            $focusedValue = Get-CurrentPatternOrNull $focused ([Windows.Automation.ValuePattern]::Pattern)
            if ($null -ne $focusedValue -and -not $focusedValue.Current.IsReadOnly) {
                return $focused
            }
        }
    } catch {
    }

    $root = Get-MainElement $process
    foreach ($element in (Get-AllElements $root)) {
        $valuePattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ValuePattern]::Pattern)
        if ($null -eq $valuePattern -or $valuePattern.Current.IsReadOnly) {
            continue
        }
        $controlType = Get-ElementControlTypeName $element
        if ($controlType -like "*Edit*" -or $controlType -like "*Document*") {
            return $element
        }
    }

    foreach ($element in (Get-AllElements $root)) {
        $valuePattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ValuePattern]::Pattern)
        if ($null -ne $valuePattern -and -not $valuePattern.Current.IsReadOnly) {
            return $element
        }
    }

    return $null
}

function Get-NativeWindowHandle($element) {
    $handle = Get-ElementInt64 $element "NativeWindowHandle"
    if ($handle -le 0) {
        return [IntPtr]::Zero
    }
    return [IntPtr]$handle
}

function Test-TextWindowHandleCandidate($process, $element) {
    if ($null -eq $element) {
        return $false
    }
    $handle = Get-NativeWindowHandle $element
    if ($handle -eq [IntPtr]::Zero -or $handle -eq [IntPtr]$process.MainWindowHandle) {
        return $false
    }
    $controlType = Get-ElementControlTypeName $element
    $className = Get-ElementString $element "ClassName"
    return (
        $controlType -like "*Edit*" -or
        $controlType -like "*Document*" -or
        $className -like "*Edit*" -or
        $className -like "*Rich*" -or
        $className -like "*Text*"
    )
}

function Find-TextEntryWindowHandle($process, $preferredElement) {
    if (Test-TextWindowHandleCandidate $process $preferredElement) {
        return Get-NativeWindowHandle $preferredElement
    }

    $root = Get-MainElement $process
    foreach ($element in (Get-AllElements $root)) {
        if (-not (Test-TextWindowHandleCandidate $process $element)) {
            continue
        }
        $valuePattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ValuePattern]::Pattern)
        if ($null -ne $valuePattern -and -not $valuePattern.Current.IsReadOnly) {
            return Get-NativeWindowHandle $element
        }
    }

    foreach ($element in (Get-AllElements $root)) {
        if (Test-TextWindowHandleCandidate $process $element) {
            return Get-NativeWindowHandle $element
        }
    }

    return [IntPtr]::Zero
}

function Invoke-TypeText($process, [string]$text) {
    $element = Find-TextEntryElement $process
    $targetHwnd = Find-TextEntryWindowHandle $process $element
    if ($targetHwnd -ne [IntPtr]::Zero -and (Send-TextToEditHandle $targetHwnd $text $element)) {
        return $true
    }

    if ($null -ne $element) {
        $valuePattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ValuePattern]::Pattern)
        if ($null -ne $valuePattern -and -not $valuePattern.Current.IsReadOnly) {
            if (-not (Test-EnvFlagEnabled "OPEN_COMPUTER_USE_WINDOWS_ALLOW_UIA_TEXT_FALLBACK")) {
                throw "UIA ValuePattern text fallback is disabled by default because it may bring the target app to the foreground; set OPEN_COMPUTER_USE_WINDOWS_ALLOW_UIA_TEXT_FALLBACK=1 to enable it."
            }
            $current = ""
            try { $current = [string]$valuePattern.Current.Value } catch {}
            $valuePattern.SetValue($current + $text)
            return $true
        }
    }
    return $false
}

function Build-AfterActionResponse($operation) {
    try {
        return [pscustomobject]@{ok=$true;actionDispatched=$true;snapshot=(Build-Snapshot $operation.app $operation.expectedWindow $operation.expectedPid $true)}
    } catch {
        # The input already ran; a closing dialog is a normal cross-window transition.
        # Do not propagate a pre-action rejection string or suggest replaying this action.
        return [pscustomobject]@{ok=$true;actionDispatched=$true;text='Action dispatched, but the original target after-state is unavailable. It may have closed or changed during the action. Observe get_app_state(app=foreground) and verify the result before any retry. Do not blindly repeat a send or submission.'}
    }
}

$operation = Get-Content -Raw -Encoding UTF8 -LiteralPath $OperationPath | ConvertFrom-Json

try {
    if ($operation.tool -eq "list_apps") {
        $response = [pscustomobject]@{ ok = $true; text = (List-Apps) }
    } elseif ($operation.tool -eq "get_app_state") {
        $response = [pscustomobject]@{ ok = $true; snapshot = (Build-Snapshot $operation.app $operation.expectedWindow $operation.expectedPid) }
    } else {
        $process = Resolve-ObservedApp $operation.app $operation.expectedWindow $operation.expectedPid $true
        $hwnd = [IntPtr]$process.MainWindowHandle
        $windowBounds = $operation.windowBounds
        if ([int64]$operation.expectedWindow -ne [int64]$hwnd -or [int]$operation.expectedPid -ne $process.Id) {
            throw 'Target window identity changed; no input dispatched. Run get_app_state.'
        }
        $foreground = Test-EnvFlagEnabled 'OPEN_COMPUTER_USE_WINDOWS_FOREGROUND_INPUT'
        $raiseOnly = $operation.tool -eq 'perform_secondary_action' -and $operation.action -eq 'Raise'
        if ($foreground) { [OcuDesktop]::Raise($hwnd) }
        $currentBounds = Get-WindowRectFrame $hwnd
        if (-not $raiseOnly) {
            foreach ($axis in @('x','y','width','height')) {
                if ($null -eq $windowBounds -or $null -eq $currentBounds -or [math]::Abs($windowBounds.$axis - $currentBounds.$axis) -gt 1) {
                    throw 'Target window geometry changed; no input dispatched. Run get_app_state.'
                }
            }
        }
        $element = Find-Element $process $operation.element
        if ($null -ne $operation.element -and $null -eq $element) { throw 'Target element disappeared; re-observe before acting.' }

        switch ($operation.tool) {
            "click" {
                $handled = $false
                if (-not $foreground -and $null -ne $element -and $operation.mouse_button -ne "right" -and $operation.mouse_button -ne "middle") {
                    $handled = Invoke-PreferredClick $element
                }
                if (-not $handled) {
                    if ($null -ne $operation.element -and $null -ne $operation.element.frame) {
                        $point = Get-ScreenPoint $operation.element.frame $windowBounds
                    } else {
                        $point = [pscustomobject]@{
                            x = [int][math]::Round($windowBounds.x + [double]$operation.x)
                            y = [int][math]::Round($windowBounds.y + [double]$operation.y)
                        }
                    }
                    Send-MouseClick $hwnd $point.x $point.y $operation.mouse_button ([int]$operation.click_count)
                }
            }
            "perform_secondary_action" {
                if ($null -eq $element) { throw "unknown element_index '$($operation.element.index)'" }
                if ($raiseOnly) {
                    if (-not $foreground) { throw 'Raise requires --foreground-input opt-in.' }
                    [OcuDesktop]::Raise($hwnd)
                } else { Invoke-SecondaryAction $element $operation.action }
            }
            "scroll" {
                $handled = $false
                if ($null -ne $element) {
                    $handled = Invoke-Scroll $element $operation.direction ([double]$operation.pages)
                }
                if (-not $handled) {
                    $point = Get-ScrollPoint $operation $windowBounds
                    if ($null -eq $point) { throw "Scroll target has no observed coordinates" }
                    Send-Scroll $hwnd $point.x $point.y $operation.direction ([double]$operation.pages)
                }
            }
            "drag" {
                Send-Drag $hwnd ([int][math]::Round($windowBounds.x + [double]$operation.from_x)) ([int][math]::Round($windowBounds.y + [double]$operation.from_y)) ([int][math]::Round($windowBounds.x + [double]$operation.to_x)) ([int][math]::Round($windowBounds.y + [double]$operation.to_y))
            }
            "type_text" {
                if ($foreground) {
                    [OcuDesktop]::Type($hwnd,$operation.text)
                } elseif (-not (Invoke-TypeText $process $operation.text)) {
                    Send-Text $hwnd $operation.text
                }
            }
            "press_key" {
                Send-Key $hwnd $operation.key
            }
            "set_value" {
                if ($null -eq $element) { throw "unknown element_index '$($operation.element.index)'" }
                $valuePattern = Get-CurrentPatternOrNull $element ([Windows.Automation.ValuePattern]::Pattern)
                if ($null -eq $valuePattern) {
                    throw "Cannot set a value for an element that is not settable"
                }
                $valuePattern.SetValue($operation.value)
            }
            default {
                throw "unsupportedTool(`"$($operation.tool)`")"
            }
        }

        Start-Sleep -Milliseconds 120
        $response = Build-AfterActionResponse $operation
    }
} catch {
    $message = $_.Exception.Message
    if (-not [string]::IsNullOrWhiteSpace($_.ScriptStackTrace)) {
        $message = "$message at $($_.ScriptStackTrace)"
    }
    $response = [pscustomobject]@{ ok = $false; error = $message }
}

$response | ConvertTo-Json -Depth 50 -Compress
