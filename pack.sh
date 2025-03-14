#!/bin/bash

# 财联社电报实时助手打包脚本

echo "===== 财联社电报实时助手打包工具 ====="
echo "此脚本将帮助您打包Chrome插件"

# 检查必要文件
echo "正在检查必要文件..."
REQUIRED_FILES=("manifest.json" "background.js" "popup.html" "popup.css" "popup.js" "icon16.png" "icon48.png" "icon128.png")
MISSING_FILES=()

for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$file" ]; then
    MISSING_FILES+=("$file")
  fi
done

if [ ${#MISSING_FILES[@]} -ne 0 ]; then
  echo "错误: 以下必要文件缺失:"
  for missing in "${MISSING_FILES[@]}"; do
    echo "  - $missing"
  done
  echo "请确保所有必要文件存在后再运行此脚本"
  exit 1
fi

echo "所有必要文件已找到"

# 设置版本号
VERSION="1.0.0"
PACKAGE_NAME="cls_telegraph_v${VERSION}"

# 创建临时目录
echo "创建临时目录..."
TMP_DIR="tmp_package"
rm -rf $TMP_DIR
mkdir $TMP_DIR

# 复制必要文件
echo "复制文件..."
cp manifest.json $TMP_DIR/
cp background.js $TMP_DIR/
cp popup.html $TMP_DIR/
cp popup.js $TMP_DIR/
cp popup.css $TMP_DIR/
cp README.md $TMP_DIR/
cp icon16.png $TMP_DIR/
cp icon48.png $TMP_DIR/
cp icon128.png $TMP_DIR/

# 创建 zip 包
echo "创建 zip 包..."
cd $TMP_DIR
zip -r "../${PACKAGE_NAME}.zip" *
cd ..

# 清理临时目录
echo "清理临时文件..."
rm -rf $TMP_DIR

echo "打包完成：${PACKAGE_NAME}.zip"
echo ""
echo "您可以:"
echo "1. 上传此ZIP文件到Chrome网上应用店"
echo "2. 解压此ZIP文件，然后通过Chrome的开发者模式加载"
echo ""
echo "感谢使用财联社电报实时助手!" 