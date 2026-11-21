param([Parameter(Mandatory=$true)][string]$OutputDir)
$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$taskOutput = [System.IO.Path]::GetFullPath($OutputDir)
New-Item -ItemType Directory -Force -Path $taskOutput | Out-Null
foreach ($taskPort in @(13000,18000)) {
  if (Get-NetTCPConnection -LocalPort $taskPort -State Listen -ErrorAction SilentlyContinue) { throw "Puerto $taskPort ocupado; no se detiene ningun proceso ajeno." }
}
if (-not (Test-Path -LiteralPath (Join-Path $taskOutput 'G7-Compras-CRUD.postman_collection.json'))) { throw 'Copiar primero la coleccion y el entorno final a OutputDir.' }
Push-Location $taskRoot
$taskDbProcess=$null; $taskApiProcess=$null
$taskPriorEnv=@{}
foreach ($taskEnvKey in @('PORT','DYNAMODB_ENDPOINT','DYNAMODB_TABLE')) { $taskPriorEnv[$taskEnvKey]=[Environment]::GetEnvironmentVariable($taskEnvKey,'Process') }
try {
  npm ci --prefix backend --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar dependencias backend.' }
  npm ci --prefix tools --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo instalar Newman.' }
  $taskDbRoot=Join-Path $taskRoot 'dynamodb'
  New-Item -ItemType Directory -Force -Path $taskDbRoot | Out-Null
  $taskArchive=Join-Path $taskDbRoot 'dynamodb-local.tar.gz'
  if (-not (Test-Path -LiteralPath (Join-Path $taskDbRoot 'DynamoDBLocal.jar'))) {
    Invoke-WebRequest 'https://d1ni2b6xgvw0s0.cloudfront.net/v2.x/dynamodb_local_latest.tar.gz' -OutFile $taskArchive
    $taskExpectedHash='7A94EB65F81AEE270738751A4E5E3E6A7AD02A5D25194F55B83E08EC2BA6342B'
    if ((Get-FileHash -LiteralPath $taskArchive -Algorithm SHA256).Hash -ne $taskExpectedHash) { throw 'La descarga oficial cambio: revisar la version y hash antes de ejecutar.' }
    tar -xzf $taskArchive -C $taskDbRoot
    if ($LASTEXITCODE -ne 0) { throw 'No se pudo extraer DynamoDB Local.' }
  }
  # Oracle's javapath launcher may spawn another JVM; resolve java.home first
  # so the process handle below belongs to the actual JVM that must be stopped.
  $taskJavaLauncher=(Get-Command java -ErrorAction Stop).Source
  $taskJavaSettings=(& $taskJavaLauncher -XshowSettings:properties -version 2>&1 | Out-String)
  $taskJavaHomeMatch=[regex]::Match($taskJavaSettings,'(?m)^\s*java\.home\s*=\s*(.+)\r?$')
  if (-not $taskJavaHomeMatch.Success) {throw 'No se pudo resolver java.home.'}
  $taskJava=Join-Path $taskJavaHomeMatch.Groups[1].Value.Trim() 'bin/java.exe'
  if (-not (Test-Path -LiteralPath $taskJava)) {throw 'No se encontro el ejecutable real de Java.'}
  $taskDbProcess=Start-Process -FilePath $taskJava -ArgumentList '-Djava.library.path=./DynamoDBLocal_lib','-jar','DynamoDBLocal.jar','-inMemory','-sharedDb','-port','18000' -WorkingDirectory $taskDbRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskOutput 'dynamodb-local.log') -RedirectStandardError (Join-Path $taskOutput 'dynamodb-local-error.log')
  $env:PORT='13000'; $env:DYNAMODB_ENDPOINT='http://127.0.0.1:18000'; $env:DYNAMODB_TABLE='G7-TEST-CRUD-solicitudes'
  $taskApiProcess=Start-Process -FilePath (Get-Command node).Source -ArgumentList 'src/server.js' -WorkingDirectory (Join-Path $taskRoot 'backend') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskOutput 'express-local.log') -RedirectStandardError (Join-Path $taskOutput 'express-local-error.log')
  $taskReady=$false
  for ($taskTry=0; $taskTry -lt 30; $taskTry++) {
    try { $taskHealth=Invoke-RestMethod 'http://127.0.0.1:13000/health' -TimeoutSec 2; if ($taskHealth.modo -eq 'QA_LOCAL' -and (Get-NetTCPConnection -LocalPort 18000 -State Listen -ErrorAction SilentlyContinue)) {$taskReady=$true;break} } catch {}
    Start-Sleep -Seconds 1
  }
  if (-not $taskReady) {throw 'Servidor local no disponible; revisar logs.'}
  New-Item -ItemType Directory -Force -Path (Join-Path $taskOutput 'evidencia') | Out-Null
  node --test config-checks.cjs | Tee-Object -FilePath (Join-Path $taskOutput 'evidencia/protecciones-configuracion.tap')
  if ($LASTEXITCODE -ne 0) {throw 'Fallaron protecciones de configuracion.'}
  node run.cjs $taskOutput
  if ($LASTEXITCODE -ne 0) {throw 'La suite CRUD fallo: revisar JSON, no declarar exito.'}
  node report.cjs $taskOutput
  if ($LASTEXITCODE -ne 0) {throw 'No se pudo generar el reporte.'}
} finally {
  if ($taskApiProcess) {$taskApiProcess.Refresh();if (-not $taskApiProcess.HasExited) {Stop-Process -Id $taskApiProcess.Id; $taskApiProcess.WaitForExit()}}
  if ($taskDbProcess) {$taskDbProcess.Refresh();if (-not $taskDbProcess.HasExited) {Stop-Process -Id $taskDbProcess.Id; $taskDbProcess.WaitForExit()}}
  foreach ($taskEnvKey in @('PORT','DYNAMODB_ENDPOINT','DYNAMODB_TABLE')) { [Environment]::SetEnvironmentVariable($taskEnvKey,$taskPriorEnv[$taskEnvKey],'Process') }
  Pop-Location
}
