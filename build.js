#!/usr/bin/env node
/*
 * Składa wszystkie pliki z src/ w jeden userscript: dist/laddonz.user.js
 * Użycie:  node build.js
 * Nie wymaga żadnych paczek npm.
 *
 * Ustaw swoją nazwę użytkownika i repozytorium GitHub w pliku build.config.json
 * (linki do automatycznych aktualizacji w Tampermonkey).
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const cfgFile = path.join(root, 'build.config.json');
const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8'));

const ORDER = [
  'src/core/util.js',
  'src/core/storage.js',
  'src/core/game.js',
  'src/core/keys.js',
  'src/core/net.js',
  'src/core/icons.js',
  'src/core/styles.js',
  'src/core/addons.js',
  'src/core/menus.js',
  'src/core/ui.js',
  'src/core/quickbar.js',
  'src/addons/_shared.js',
  'src/addons/napad.js',
  'src/addons/wakeup_bratan_minichat.js',
  'src/addons/ktotu_ktozlapie_cook.js',
  'src/addons/items_overlay.js',
  'src/addons/auto_items.js',
  'src/addons/wrogowie.js',
  'src/main.js',
];

const header = fs.readFileSync(path.join(root, 'src/header.js'), 'utf8')
  .replace(/__GITHUB_USER__/g, cfg.githubUser)
  .replace(/__GITHUB_REPO__/g, cfg.githubRepo)
  .replace(/__VERSION__/g, cfg.version);

const body = ORDER.map((f) => `// ═══ ${f} ═══\n` + fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
const out = `${header}\n(function () {\n'use strict';\n${body}\nMP.version = ${JSON.stringify(cfg.version)};\n})();\n`;

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/laddonz.user.js'), out);
console.log(`OK → dist/laddonz.user.js (${(out.length / 1024).toFixed(1)} KB, v${cfg.version}, ${cfg.githubUser}/${cfg.githubRepo})`);
