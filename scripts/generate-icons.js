/**
 * 產生 PWA 圖示
 * 執行：node scripts/generate-icons.js
 */
const sharp = require('sharp')
const path = require('path')
const fs = require('fs')

const outDir = path.join(__dirname, '../public/icons')
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

// 以 512×512 為基準設計，sharp 會縮放
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- 背景：主藍色圓角正方形 -->
  <rect width="512" height="512" rx="108" fill="#1d4ed8"/>

  <!-- 班表卡片：白底圓角矩形 -->
  <rect x="72" y="88" width="368" height="336" rx="28" fill="#ffffff"/>

  <!-- 卡片頂部色條（深藍，模擬月份標題列） -->
  <rect x="72" y="88" width="368" height="76" rx="28" fill="#1e3a8a"/>
  <rect x="72" y="136" width="368" height="28" fill="#1e3a8a"/>

  <!-- 標題列裝飾：月份文字欄位 -->
  <rect x="148" y="118" width="216" height="14" rx="7" fill="#ffffff" opacity="0.55"/>

  <!-- 左側掛環 -->
  <rect x="168" y="68" width="24" height="48" rx="12" fill="#93c5fd"/>
  <!-- 右側掛環 -->
  <rect x="320" y="68" width="24" height="48" rx="12" fill="#93c5fd"/>

  <!-- 格線：垂直（3 欄） -->
  <line x1="244" y1="164" x2="244" y2="424" stroke="#e2e8f0" stroke-width="3"/>
  <line x1="348" y1="164" x2="348" y2="424" stroke="#e2e8f0" stroke-width="3"/>

  <!-- 格線：水平（3 列） -->
  <line x1="72"  y1="244" x2="440" y2="244" stroke="#e2e8f0" stroke-width="3"/>
  <line x1="72"  y1="324" x2="440" y2="324" stroke="#e2e8f0" stroke-width="3"/>

  <!-- 班別色塊 row1 -->
  <!-- D 日班：亮藍 -->
  <rect x="84"  y="174" width="148" height="62" rx="10" fill="#3b82f6"/>
  <!-- N 夜班：深藍 -->
  <rect x="256" y="174" width="80"  height="62" rx="10" fill="#1e3a8a"/>
  <!-- Off 休假：淡藍 -->
  <rect x="360" y="174" width="68"  height="62" rx="10" fill="#dbeafe"/>

  <!-- 班別色塊 row2 -->
  <!-- Off -->
  <rect x="84"  y="254" width="80"  height="62" rx="10" fill="#dbeafe"/>
  <!-- D -->
  <rect x="192" y="254" width="44"  height="62" rx="10" fill="#3b82f6"/>
  <!-- D -->
  <rect x="256" y="254" width="80"  height="62" rx="10" fill="#3b82f6"/>
  <!-- N -->
  <rect x="360" y="254" width="68"  height="62" rx="10" fill="#1e3a8a"/>

  <!-- 班別色塊 row3 -->
  <!-- N -->
  <rect x="84"  y="334" width="148" height="62" rx="10" fill="#1e3a8a"/>
  <!-- Off -->
  <rect x="256" y="334" width="80"  height="62" rx="10" fill="#dbeafe"/>
  <!-- D -->
  <rect x="360" y="334" width="68"  height="62" rx="10" fill="#3b82f6"/>

  <!-- D / N / Off 標籤文字 (用 SVG text，圖示夠大才看得到) -->
  <text x="152" y="213" text-anchor="middle" font-family="system-ui,sans-serif"
        font-size="32" font-weight="700" fill="#ffffff" opacity="0.9">D</text>
  <text x="296" y="213" text-anchor="middle" font-family="system-ui,sans-serif"
        font-size="32" font-weight="700" fill="#ffffff" opacity="0.9">N</text>
  <text x="394" y="213" text-anchor="middle" font-family="system-ui,sans-serif"
        font-size="28" font-weight="600" fill="#1d4ed8" opacity="0.8">休</text>
</svg>`

async function generate() {
  const sizes = [192, 512]
  for (const size of sizes) {
    const outPath = path.join(outDir, `icon-${size}.png`)
    await sharp(Buffer.from(svg))
      .resize(size, size)
      .png()
      .toFile(outPath)
    console.log(`✓ icon-${size}.png`)
  }
  console.log('圖示產生完成 →', outDir)
}

generate().catch(e => { console.error(e); process.exit(1) })
