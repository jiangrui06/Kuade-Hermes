param([Parameter(Mandatory=$true)][string]$ResultPath, [Parameter(Mandatory=$true)][string]$WindowTitle, [Parameter(Mandatory=$true)][string]$ReadyPath)
Add-Type -AssemblyName PresentationFramework
$form = New-Object System.Windows.Window
$form.Title = $WindowTitle
$form.Width = 640
$form.Height = 360
$form.WindowStartupLocation = 'CenterScreen'
$panel = New-Object System.Windows.Controls.StackPanel
$panel.Margin = '24'
$label = New-Object System.Windows.Controls.Label
$label.Content = 'Kuade controlled desktop acceptance'
$inputBox = New-Object System.Windows.Controls.TextBox
$inputBox.Name = 'AcceptanceInput'
[System.Windows.Automation.AutomationProperties]::SetName($inputBox, 'Acceptance input')
$inputBox.Height = 35
$inputBox.Margin = '0,16,0,16'
$button = New-Object System.Windows.Controls.Button
$button.Content = 'Verify input'
$button.Height = 40
$result = New-Object System.Windows.Controls.Label
$result.Content = 'Waiting for desktop input'
$result.Margin = '0,20,0,0'
$button.Add_Click({
  $result.Content = 'Accepted: ' + $inputBox.Text
  [System.IO.File]::WriteAllText($ResultPath, $inputBox.Text, [System.Text.UTF8Encoding]::new($false))
})
$panel.Children.Add($label) | Out-Null
$panel.Children.Add($inputBox) | Out-Null
$panel.Children.Add($button) | Out-Null
$panel.Children.Add($result) | Out-Null
$form.Content = $panel
$form.Add_ContentRendered({ $form.Show(); $form.Activate(); $inputBox.Focus(); [System.IO.File]::WriteAllText($ReadyPath, [string]$PID) })
[void]$form.ShowDialog()
