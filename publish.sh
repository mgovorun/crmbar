#!/bin/bash

vim package.json

ver=`jq -r '.version' package.json`

echo $ver

sleep 3

vipe > /tmp/desc ; gh release create v$ver -F /tmp/desc -t $ver -d
rm /tmp/desc

CSC_NAME="Govorun Code Signing Certificate 2" GH_TOKEN=`cat private/GH_TOKEN.txt` npm run release

git commit -am $ver

git push

echo "Press any key after Appveyor finished build..."
while [ true ] ; do
read -t 3 -n 1
if [ $? = 0 ] ; then
exit ;
else
fi
done

gh release list -L 2 

gh release edit v$ver --draft=false
