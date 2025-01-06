#!/bin/sh
tempdir=$(mktemp -d)
cp -r dist/* $tempdir/
echo '{ "type": "module" }' > $tempdir/package.json
cd $tempdir
node --input-type=module -e 'import "./index.esm.js";'
