#!/bin/bash

vim package.json

ver=`jq -r '.version' package.json`

echo $ver

vipe | gh release create v$ver -F -d -t $ver

CSC_NAME="Govorun Code Signing Certificate 2" GH_TOKEN=`cat private/GH_TOKEN.txt` npm run release

git commit -am $ver

git push

echo "Waiting 6 minutes for appveyor..."
sleep 360 

gh release list v$ver | grep crmbar-Setup-$ver.exe 

echo "Don't forget to publish release v$ver"
