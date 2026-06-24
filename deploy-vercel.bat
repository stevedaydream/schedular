@echo off
chcp 65001 >nul

:menu
cls
echo ==========================================
echo       Vercel 部署工具
echo ==========================================
echo.
echo 目前工作目錄: %CD%
echo.
echo 請選擇部署動作：
echo [1] 部署至預覽版 / 測試版 (Vercel Preview)
echo [2] 部署至正式生產環境 (Vercel Production)
echo [3] 結束離開
echo.
set /p choice="請輸入選項 [1-3]: "

if "%choice%"=="1" goto deploy_preview
if "%choice%"=="2" goto deploy_prod
if "%choice%"=="3" goto end
goto invalid_choice

:deploy_preview
echo.
echo 正在準備部署至【預覽版】...
echo 提示: 如果是第一次執行，Vercel CLI 會引導您進行登入與專案連結設定。
echo.
pause
echo 正在執行 vercel deploy...
call vercel
if %errorlevel% neq 0 goto error
echo.
echo 預覽版部署完成！
pause
goto menu

:deploy_prod
echo.
echo 正在準備部署至【正式生產環境】...
echo 提示: 如果是第一次執行，Vercel CLI 會引導您進行登入與專案連結設定。
echo.
pause
echo 正在執行 vercel --prod...
call vercel --prod
if %errorlevel% neq 0 goto error
echo.
echo 正式版部署完成！
pause
goto menu

:invalid_choice
echo.
echo 無效的選項，請重新選擇。
pause
goto menu

:error
echo.
echo 部署過程中出錯，請確認 Vercel CLI 是否已登入且設定正確。
pause
goto menu

:end
echo.
echo 感謝使用，再見！
pause
