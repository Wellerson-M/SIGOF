# Liga o SIGOF no seu computador, do zero: banco, API e telas.
#
#   Clique duas vezes em scripts\iniciar.cmd
#   (ou, no PowerShell, na pasta do projeto: .\scripts\iniciar.ps1)
#
# Pode rodar quantas vezes quiser: o que já estiver pronto é pulado.

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

function Passo([string]$texto) { Write-Host "`n==> $texto" -ForegroundColor Cyan }
function Falha([string]$texto) { Write-Host "`nERRO: $texto" -ForegroundColor Red; exit 1 }
function PortaEmUso([int]$porta) {
  [bool](Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue)
}
function Esperar([string]$url, [int]$segundos) {
  $limite = (Get-Date).AddSeconds($segundos)
  while ((Get-Date) -lt $limite) {
    try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 $url | Out-Null; return $true } catch { Start-Sleep 2 }
  }
  return $false
}

Passo 'Versão do projeto'
$branch = git branch --show-current
Write-Host "Rodando a branch: $branch"
if ($branch -ne 'main') {
  Write-Host '(é uma versão em teste; a oficial é a main)' -ForegroundColor Yellow
  Write-Host 'Para usar a oficial: git checkout main' -ForegroundColor Yellow
} elseif (git status --porcelain) {
  # Com arquivos alterados, puxar a versão nova poderia misturar as coisas
  Write-Host 'Há arquivos alterados na pasta: a main não foi atualizada.' -ForegroundColor Yellow
} else {
  # Na main, traz o que já foi mesclado no GitHub. Sem internet, segue com o
  # que já está na pasta
  git pull --ff-only --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Host 'main atualizada com o GitHub.'
  } else {
    Write-Host 'Não deu para atualizar a main (sem internet?); seguindo com a versão da pasta.' -ForegroundColor Yellow
  }
}

Passo 'Programas necessários'
foreach ($programa in 'node', 'npm', 'docker', 'git') {
  if (-not (Get-Command $programa -ErrorAction SilentlyContinue)) {
    Falha "$programa não está instalado. Veja a seção 'Como rodar localmente' do README."
  }
}

Passo 'Docker'
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Abrindo o Docker Desktop (pode levar até 2 minutos)...'
  Start-Process 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  $limite = (Get-Date).AddMinutes(2)
  do { Start-Sleep 4; docker info *> $null } while ($LASTEXITCODE -ne 0 -and (Get-Date) -lt $limite)
  if ($LASTEXITCODE -ne 0) { Falha 'O Docker não ligou. Abra o Docker Desktop e rode de novo.' }
}
Write-Host 'Docker ligado.'

Passo 'Configuração (.env)'
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host 'Criado .env a partir do .env.example.'
} else {
  Write-Host '.env já existe.'
}

Passo 'Banco de dados e armazenamento de anexos'
docker compose up -d --wait
if ($LASTEXITCODE -ne 0) { Falha 'O docker compose não subiu o banco.' }

Passo 'Bibliotecas (só baixa o que mudou)'
foreach ($parte in 'backend', 'frontend') {
  Push-Location $parte
  npm install --no-audit --no-fund --loglevel=error
  $resultado = $LASTEXITCODE
  Pop-Location
  if ($resultado -ne 0) { Falha "npm install falhou em $parte." }
}

Passo 'Banco: migrações e dados de demonstração'
Push-Location backend
npm run --silent db:deploy
$migrou = $LASTEXITCODE
if ($migrou -eq 0) { npm run --silent db:seed:se-vazio }
$semeou = $LASTEXITCODE
Pop-Location
if ($migrou -ne 0) { Falha 'As migrações do banco falharam.' }
if ($semeou -ne 0) { Falha 'O seed falhou.' }

Passo 'Ligando a API e as telas (cada uma abre numa janela própria)'
# A porta da API pode ter sido trocada no .env (PORT); o padrão é 3333
$portaApi = 3333
$linhaPorta = Select-String -Path .env -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
if ($linhaPorta) { $portaApi = [int]$linhaPorta.Matches[0].Groups[1].Value }

# A pasta vai como diretório de trabalho, e não dentro do comando: assim um
# nome de pasta com aspas ou símbolos não quebra (nem injeta) nada
if (PortaEmUso $portaApi) {
  Write-Host "A API já está ligada (porta $portaApi)."
} else {
  Start-Process powershell -WorkingDirectory (Join-Path $raiz 'backend') -ArgumentList '-NoExit', '-Command', "`$Host.UI.RawUI.WindowTitle = 'SIGOF - API'; npm run dev"
}
if (PortaEmUso 3000) {
  Write-Host 'As telas já estão ligadas (porta 3000).'
} else {
  Start-Process powershell -WorkingDirectory (Join-Path $raiz 'frontend') -ArgumentList '-NoExit', '-Command', "`$Host.UI.RawUI.WindowTitle = 'SIGOF - Telas'; npm run dev"
}

Write-Host 'Esperando tudo responder...'
if (-not (Esperar "http://localhost:$portaApi/health" 60)) { Falha 'A API não respondeu. Veja a janela "SIGOF - API".' }
if (-not (Esperar 'http://localhost:3000/entrar' 120)) { Falha 'As telas não responderam. Veja a janela "SIGOF - Telas".' }

Start-Process 'http://localhost:3000'

Write-Host "`nSIGOF ligado em http://localhost:3000" -ForegroundColor Green
Write-Host @'

  Empresa:  transportadora-demo
  E-mails:  solicitante@demo.sigof.local  analista@demo.sigof.local
            supervisor@demo.sigof.local   admin@demo.sigof.local
  Senha:    Demo@2026

Para desligar: scripts\parar.cmd (ou feche as janelas "SIGOF - API" e "SIGOF - Telas").
'@
