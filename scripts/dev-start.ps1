# Starts the ShareTexts dev server detached on port 3010
# (Freebuff shells export PORT=0 globally, which npm children inherit).
$env:PORT = '3010'
Set-Location (Join-Path $PSScriptRoot '..')
npm.cmd run dev *> dev-server.log
