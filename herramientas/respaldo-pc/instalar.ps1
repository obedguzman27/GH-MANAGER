# GH Manager - Instalar el respaldo diario (se corre UNA vez)
$ErrorActionPreference = 'Stop'
$Carpeta = $PSScriptRoot
$Script  = Join-Path $Carpeta 'respaldo.ps1'
$Config  = Join-Path $Carpeta 'config.dat'
$Tarea   = 'GH Manager - Respaldo diario'

Write-Host ''
Write-Host '  GH Manager - Respaldo diario a esta computadora' -ForegroundColor Cyan
Write-Host '  ------------------------------------------------'
Write-Host '  Escribe el usuario y la contrasena con los que entras a GH Manager.'
Write-Host '  (Usa un usuario ADMIN para que se respalden todas las bases de datos.)'
Write-Host '  La contrasena se guarda cifrada en esta computadora; solo tu usuario'
Write-Host '  de Windows la puede leer.'
Write-Host ''

try {
  # Se escribe aqui mismo en esta ventana negra (antes salia una ventanita
  # aparte que a veces se quedaba escondida o no dejaba escribir).
  $usuario = ''
  while (-not $usuario) { $usuario = (Read-Host '  Usuario de GH Manager').Trim() }
  Write-Host '  (Al escribir la contrasena salen asteriscos * ; es normal)'
  $clave = $null
  while (-not $clave -or $clave.Length -eq 0) { $clave = Read-Host '  Contrasena' -AsSecureString }
  @($usuario, ($clave | ConvertFrom-SecureString)) | Set-Content -Path $Config -Encoding UTF8

  $hora = Read-Host '  A que hora quieres el respaldo cada dia? (Enter = 8:00 PM, o escribe por ejemplo 21:30)'
  if (-not $hora) { $hora = '20:00' }
  $h = $hora.Trim().ToUpper() -replace '\.', '' -replace '\s+', ' '
  $formatos = [string[]]@('H:mm', 'h:mm tt', 'h:mmtt', 'h tt', 'htt', 'H')
  $cuando = [datetime]::ParseExact($h, $formatos, [Globalization.CultureInfo]::InvariantCulture, 'None')

  Write-Host ''
  Write-Host '  Haciendo un respaldo de prueba...' -ForegroundColor Yellow
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Script
  $ultima = (Get-Content (Join-Path $Carpeta 'registro.txt') -Encoding UTF8)[-1]
  Write-Host ('  ' + $ultima)
  if ($ultima -notmatch '  OK  ') { throw 'El respaldo de prueba fallo. Revisa usuario y contrasena e intentalo otra vez.' }

  $accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $Script + '"') -WorkingDirectory $Carpeta
  $disparo = New-ScheduledTaskTrigger -Daily -At $cuando
  $ajustes = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RunOnlyIfNetworkAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 15)
  Register-ScheduledTask -TaskName $Tarea -Action $accion -Trigger $disparo -Settings $ajustes -Description 'Baja una copia de todos los datos de GH Manager a Documentos\GH Manager Respaldos\Respaldos' -Force | Out-Null

  Write-Host ''
  Write-Host ('  LISTO. Cada dia a las ' + $cuando.ToString('h:mm tt') + ' se guarda un respaldo en:') -ForegroundColor Green
  Write-Host ('  ' + (Join-Path $Carpeta 'Respaldos'))
  Write-Host '  Si la computadora esta apagada a esa hora, se hace al prenderla.'
}
catch {
  Write-Host ''
  Write-Host ('  ERROR: ' + $_.Exception.Message) -ForegroundColor Red
}
Write-Host ''
Read-Host '  Presiona Enter para cerrar'
