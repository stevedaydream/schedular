@echo off

:menu
cls
echo ==========================================
echo       Vercel Deployment Tool
echo ==========================================
echo.
echo Current Directory: %CD%
echo.
echo Select deployment action:
echo [1] Deploy to Vercel Preview (Beta)
echo [2] Deploy to Vercel Production
echo [3] Exit
echo.
set /p choice="Enter choice [1-3]: "

if "%choice%"=="1" goto deploy_preview
if "%choice%"=="2" goto deploy_prod
if "%choice%"=="3" goto end
goto invalid_choice

:deploy_preview
echo.
echo Preparing deployment to [Preview]...
echo Tip: If this is the first run, Vercel CLI will guide you to login and link the project.
echo.
pause
echo Running vercel...
call vercel
if %errorlevel% neq 0 goto error
echo.
echo Preview deployment completed!
pause
goto menu

:deploy_prod
echo.
echo Preparing deployment to [Production]...
echo Tip: If this is the first run, Vercel CLI will guide you to login and link the project.
echo.
pause
echo Running vercel --prod...
call vercel --prod
if %errorlevel% neq 0 goto error
echo.
echo Production deployment completed!
pause
goto menu

:invalid_choice
echo.
echo Invalid choice. Please try again.
pause
goto menu

:error
echo.
echo An error occurred. Please ensure Vercel CLI is logged in and configured correctly.
pause
goto menu

:end
echo.
echo Thank you for using! Goodbye.
pause
