# Starts the ShareTexts dev server detached on port 3010.
# Some shells export PORT=0 globally, which npm children inherit — the server
# would then bind a random port, so the port is set explicitly here.
$env:PORT = '3010'
Set-Location (Join-Path $PSScriptRoot '..')
npm.cmd run dev *> dev-server.log
