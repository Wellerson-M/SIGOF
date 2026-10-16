# Desliga o SIGOF no seu computador: telas, API e banco.
# Os dados do banco continuam guardados para a próxima vez.
#
#   Clique duas vezes em scripts\parar.cmd

$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

foreach ($porta in 3000, 3333) {
  $conexao = Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conexao) {
    # Encerra o processo da porta e a janela que o abriu
    Stop-Process -Id $conexao.OwningProcess -Force -ErrorAction SilentlyContinue
    Write-Host "Desligado o que estava na porta $porta."
  }
}
Get-Process powershell -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -like 'SIGOF - *' } |
  Stop-Process -Force -ErrorAction SilentlyContinue

docker compose stop
Write-Host "`nSIGOF desligado." -ForegroundColor Green
