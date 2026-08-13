#!/usr/bin/env bash
set -euo pipefail

rm -rf dist
mkdir -p dist/icones

cp \
  index.html \
  estilo.css \
  app.js \
  config.js \
  acessos.js \
  evo.js \
  sw.js \
  manifest.webmanifest \
  dist/

cp icones/*.png dist/icones/

