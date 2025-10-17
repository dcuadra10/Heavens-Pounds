# Script para preparar archivos para deploy en Vercel
# Crea un directorio con solo los archivos necesarios para la página web

Write-Host "🚀 Preparando archivos para deploy en Vercel..." -ForegroundColor Blue

# Crear directorio para la página web
$webDir = "heavens-of-glory-web"
if (Test-Path $webDir) {
    Remove-Item $webDir -Recurse -Force
}
New-Item -ItemType Directory -Name $webDir | Out-Null

Write-Host "📁 Creando directorio: $webDir" -ForegroundColor Green

# Copiar archivos necesarios
$filesToCopy = @(
    "public",
    "server.js", 
    "vercel.json"
)

foreach ($file in $filesToCopy) {
    if (Test-Path $file) {
        if ((Get-Item $file) -is [System.IO.DirectoryInfo]) {
            Copy-Item $file -Destination $webDir -Recurse
            Write-Host "✅ Copiado directorio: $file" -ForegroundColor Green
        } else {
            Copy-Item $file -Destination $webDir
            Write-Host "✅ Copiado archivo: $file" -ForegroundColor Green
        }
    } else {
        Write-Host "⚠️  Archivo no encontrado: $file" -ForegroundColor Yellow
    }
}

# Crear package.json específico para la página web
$packageJson = @{
    name = "heavens-of-glory-web"
    version = "1.0.0"
    private = $true
    scripts = @{
        build = "echo 'No build step required'"
    }
    dependencies = @{
        express = "^4.19.2"
        "discord.js" = "^14.15.3"
        dotenv = "16.3.1"
    }
} | ConvertTo-Json -Depth 3

$packageJson | Out-File -FilePath "$webDir/package.json" -Encoding UTF8
Write-Host "✅ Creado package.json para la página web" -ForegroundColor Green

# Crear README para el repositorio
$readme = @"
# Heavens of Glory - Web Page

Página web para mostrar estadísticas en tiempo real del servidor Discord.

## Deploy en Vercel

1. Conecta este repositorio a Vercel
2. Configura las variables de entorno:
   - \`DISCORD_TOKEN\`: Tu token del bot de Discord
   - \`GUILD_ID\`: ID de tu servidor de Discord  
   - \`BOT_API_URL\`: https://overseas-mimi-heavens-295a972c.koyeb.app/api/guild-info

3. Deploy automático

## Variables de Entorno

| Variable | Valor |
|----------|-------|
| \`DISCORD_TOKEN\` | \`tu_token_del_bot\` |
| \`GUILD_ID\` | \`tu_server_id_de_discord\` |
| \`BOT_API_URL\` | \`https://overseas-mimi-heavens-295a972c.koyeb.app/api/guild-info\` |
"@

$readme | Out-File -FilePath "$webDir/README.md" -Encoding UTF8
Write-Host "✅ Creado README.md" -ForegroundColor Green

Write-Host ""
Write-Host "🎉 ¡Archivos preparados para Vercel!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Próximos pasos:" -ForegroundColor Cyan
Write-Host "1. Crea un repositorio en GitHub llamado: heavens-of-glory-web"
Write-Host "2. Sube el contenido de la carpeta '$webDir' al repositorio"
Write-Host "3. Conecta el repositorio a Vercel"
Write-Host "4. Configura las variables de entorno en Vercel"
Write-Host "5. Deploy!"
Write-Host ""
Write-Host "📁 Archivos listos en: $webDir" -ForegroundColor Yellow
