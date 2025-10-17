# Script para desplegar ambos proyectos
# Bot en Koyeb y Página Web en Vercel

Write-Host "🚀 Deploy de Bot y Página Web" -ForegroundColor Blue
Write-Host "=================================" -ForegroundColor Blue

# Función para imprimir mensajes
function Write-Status {
    param($Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param($Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param($Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-Error {
    param($Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Verificar que estamos en el directorio correcto
if (-not (Test-Path "bot.js")) {
    Write-Error "No se encontró bot.js. Asegúrate de estar en el directorio raíz del proyecto."
    exit 1
}

Write-Status "Verificando archivos necesarios..."

# Verificar archivos del bot
$botFiles = @("bot.js", "database.js", "deploy-commands.js", "package.json", "Dockerfile", "koyeb.yaml")
foreach ($file in $botFiles) {
    if (-not (Test-Path $file)) {
        Write-Warning "Archivo del bot no encontrado: $file"
    }
}

# Verificar archivos de la página web
$webFiles = @("public", "server.js", "vercel.json")
foreach ($file in $webFiles) {
    if (-not (Test-Path $file)) {
        Write-Warning "Archivo de la página web no encontrado: $file"
    }
}

Write-Success "Archivos verificados"

# Hacer commit de todos los cambios
Write-Status "Haciendo commit de todos los cambios..."
try {
    git add .
    git commit -m "Deploy: Actualización completa para Koyeb y Vercel"
    Write-Success "Cambios commiteados"
} catch {
    Write-Warning "No hay cambios para commitear o error en el commit"
}

# Push a ambos repositorios
Write-Status "Enviando cambios a GitHub..."

# Push al repositorio del bot (Heavens-Pounds)
Write-Status "Enviando al repositorio del bot (Heavens-Pounds)..."
try {
    git remote set-url origin https://github.com/dcuadra10/Heavens-Pounds.git
    git push origin main
    Write-Success "Bot enviado a GitHub exitosamente"
} catch {
    Write-Error "Error al enviar el bot a GitHub"
}

# Push al repositorio de la página web (Heavens-Of-Glory)
Write-Status "Enviando al repositorio de la página web (Heavens-Of-Glory)..."
try {
    git remote set-url origin https://github.com/dcuadra10/Heavens-Of-Glory.git
    git push origin main
    Write-Success "Página web enviada a GitHub exitosamente"
} catch {
    Write-Error "Error al enviar la página web a GitHub"
}

Write-Host ""
Write-Host "🎉 ¡Deploy completado!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Próximos pasos:" -ForegroundColor Cyan
Write-Host ""
Write-Host "🤖 BOT EN KOYEB:" -ForegroundColor Yellow
Write-Host "1. Ve a https://koyeb.com"
Write-Host "2. Tu bot se redesplegará automáticamente"
Write-Host "3. Verifica que esté online en: https://overseas-mimi-heavens-295a972c.koyeb.app"
Write-Host ""
Write-Host "🌐 PÁGINA WEB EN VERCEL:" -ForegroundColor Yellow
Write-Host "1. Ve a https://vercel.com"
Write-Host "2. Tu página web se redesplegará automáticamente"
Write-Host "3. Configura las variables de entorno si no las has configurado:"
Write-Host "   - DISCORD_TOKEN=tu_token_del_bot"
Write-Host "   - GUILD_ID=tu_server_id_de_discord"
Write-Host "   - BOT_API_URL=https://overseas-mimi-heavens-295a972c.koyeb.app/api/guild-info"
Write-Host ""
Write-Host "🧪 PRUEBA:" -ForegroundColor Yellow
Write-Host "1. Bot API: https://overseas-mimi-heavens-295a972c.koyeb.app/api/guild-info"
Write-Host "2. Página web: https://heavens-of-glory.vercel.app"
Write-Host ""
Write-Success "¡Ambos proyectos desplegados exitosamente!"
