// 创建简单图标的脚本
const fs = require('fs');
const path = require('path');

// 简单的1x1像素透明PNG的Base64编码
// 这只是一个最小的有效PNG文件，用于临时替代
const minimalPngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// 创建图标目录（如果不存在）
const iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 生成不同尺寸的图标
const sizes = [16, 48, 128];
sizes.forEach(size => {
  const iconPath = path.join(iconsDir, `icon${size}.png`);
  const buffer = Buffer.from(minimalPngBase64, 'base64');
  fs.writeFileSync(iconPath, buffer);
  console.log(`Created ${iconPath}`);
});

console.log('图标文件创建完成！'); 