# ==========================================================================
#  GH Manager - Respaldo diario a esta computadora
#  Baja TODOS los datos de la nube (todas las bases de datos) y los guarda
#  en la carpeta "Respaldos" junto a este archivo, uno por dia (.zip).
#  Borra los respaldos de mas de 60 dias.
#  Lo corre solo el Programador de tareas de Windows (ver INSTALAR).
# ==========================================================================
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Carpeta   = $PSScriptRoot
$Destino   = Join-Path $Carpeta 'Respaldos'
$Config    = Join-Path $Carpeta 'config.dat'
$Registro  = Join-Path $Carpeta 'registro.txt'
$DiasGuardar = 60

$SupabaseUrl = 'https://cubhmlclqovvmsdskooc.supabase.co'
$ApiKey      = 'sb_publishable_drw-q0SBYKj0I3fV0BKvmA_0nmV1DkW'

function Anotar($texto) {
  $linea = (Get-Date -Format 'yyyy-MM-dd HH:mm') + '  ' + $texto
  Add-Content -Path $Registro -Value $linea -Encoding UTF8
  # El registro no crece para siempre: se quedan las ultimas 300 lineas
  try { $l = Get-Content $Registro -Encoding UTF8; if ($l.Count -gt 300) { $l[-300..-1] | Set-Content $Registro -Encoding UTF8 } } catch {}
}

function UsuarioAEmail($usuario) {
  $limpio = ($usuario.Trim().ToLower() -split '@')[0] -replace '[^a-z0-9._-]+', '.'
  return $limpio + '@guzmanhvac.app'
}

try {
  if (-not (Test-Path $Config)) { throw 'Falta configurar el usuario. Abre "INSTALAR respaldo diario.cmd".' }
  $partes = Get-Content $Config -Encoding UTF8
  $usuario = $partes[0]
  $clave = (New-Object System.Management.Automation.PSCredential($usuario, ($partes[1] | ConvertTo-SecureString))).GetNetworkCredential().Password

  # 1) Entrar
  $cuerpo = @{ email = (UsuarioAEmail $usuario); password = $clave } | ConvertTo-Json
  $sesion = Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/auth/v1/token?grant_type=password" `
    -Headers @{ apikey = $ApiKey } -ContentType 'application/json' -Body $cuerpo -TimeoutSec 60
  $token = $sesion.access_token
  if (-not $token) { throw 'No se pudo entrar (revisa usuario y contrasena).' }
  $cab = @{ apikey = $ApiKey; Authorization = "Bearer $token" }

  # 2) Bajar todo, de 200 en 200
  $paginas = New-Object System.Collections.Generic.List[string]
  $total = 0; $desde = 0; $tam = 200
  while ($true) {
    $url = "$SupabaseUrl/rest/v1/datos_app?select=clave,valor,actualizado_en&order=clave.asc&limit=$tam&offset=$desde"
    $r = Invoke-WebRequest -Uri $url -Headers $cab -UseBasicParsing -TimeoutSec 120
    $bytes = $r.RawContentStream.ToArray()
    $texto = [Text.Encoding]::UTF8.GetString($bytes).Trim()
    $n = @($texto | ConvertFrom-Json).Count
    if ($texto.Length -gt 2) { $paginas.Add($texto.Substring(1, $texto.Length - 2)) }
    $total += $n; $desde += $tam
    if ($n -lt $tam) { break }
  }
  if ($total -eq 0) { throw 'La nube no devolvio datos (el usuario no tiene permiso para verlos).' }

  # 3) Guardar
  if (-not (Test-Path $Destino)) { New-Item -ItemType Directory -Path $Destino | Out-Null }
  $hoy = Get-Date -Format 'yyyy-MM-dd'
  $json = '{"app":"GH Manager","respaldoDel":"' + (Get-Date -Format 's') + '","usuario":"' + $usuario + '","filas":[' + ($paginas -join ',') + ']}'
  $archivoJson = Join-Path $Destino "respaldo-$hoy.json"
  [IO.File]::WriteAllText($archivoJson, $json, (New-Object Text.UTF8Encoding($false)))
  $archivoZip = Join-Path $Destino "respaldo-$hoy.zip"
  if (Test-Path $archivoZip) { Remove-Item $archivoZip -Force }
  Compress-Archive -Path $archivoJson -DestinationPath $archivoZip -CompressionLevel Optimal
  Remove-Item $archivoJson -Force
  $kb = [math]::Round((Get-Item $archivoZip).Length / 1KB)

  # 4) Borrar los viejos
  $limite = (Get-Date).AddDays(-$DiasGuardar)
  Get-ChildItem $Destino -Filter 'respaldo-*.zip' | Where-Object { $_.LastWriteTime -lt $limite } | Remove-Item -Force

  Anotar "OK  $total datos guardados en respaldo-$hoy.zip ($kb KB)"
  exit 0
}
catch {
  $msg = $_.Exception.Message
  try { if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $msg += ' ' + $_.ErrorDetails.Message } } catch {}
  Anotar "ERROR  $msg"
  exit 1
}
