# Script para desplegar solo la página web en Vercel

Write-Host "🌐 Deploy de la Página Web en Vercel" -ForegroundColor Blue
Write-Host "====================================" -ForegroundColor Blue

# Verificar archivos de la página web
$webFiles = @("public", "server.js", "vercel.json")
foreach ($file in $webFiles) {
    if (-not (Test-Path $file)) {
        Write-Host "[ERROR] Archivo de la página web no encontrado: $file" -ForegroundColor Red
        exit 1
    }
}

Write-Host "[SUCCESS] Todos los archivos de la página web encontrados" -ForegroundColor Green

# Commit y push
Write-Host "[INFO] Haciendo commit de los cambios de la página web..." -ForegroundColor Blue
git add .
git commit -m "Deploy: Actualización de la página web para Vercel"

Write-Host "[INFO] Enviando al repositorio de la página web..." -ForegroundColor Blue
git remote set-url origin https://github.com/dcuadra10/Heavens-Of-Glory.git
git push origin main

Write-Host ""
Write-Host "🎉 ¡Página web desplegada en Vercel!" -ForegroundColor Green
Write-Host "URL de la página: https://heavens-of-glory.vercel.app" -ForegroundColor Yellow
Write-Host ""
Write-Host "📋 Recuerda configurar las variables de entorno en Vercel:" -ForegroundColor Cyan
Write-Host "   - DISCORD_TOKEN=tu_token_del_bot"
Write-Host "   - GUILD_ID=tu_server_id_de_discord"
Write-Host "   - BOT_API_URL=https://overseas-mimi-heavens-295a972c.koyeb.app/api/guild-info"
