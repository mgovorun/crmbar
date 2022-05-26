#!/bin/bash

vim package.json

ver=`jq -r '.version' package.json`

echo $ver

vipe > /tmp/desc ; gh release create v$ver -F /tmp/desc -t $ver -d
rm /tmp/desc

CSC_NAME="Govorun Code Signing Certificate 2" GH_TOKEN=`cat private/GH_TOKEN.txt` npm run release

git commit -am $ver

git push

echo "Waiting 6 minutes for appveyor..."
sleep 360 

gh release list -L 3 

gh release edit $ver --draft=false
