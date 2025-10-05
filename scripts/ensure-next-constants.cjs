#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const target = path.join(projectRoot, 'node_modules', 'next', 'dist', 'esm', 'lib', 'constants.js');
const targetMap = `${target}.map`;
const source = path.join(projectRoot, 'node_modules', 'next', 'dist', 'esm', 'shared', 'lib', 'constants.js');
const sourceMap = `${source}.map`;

try {
  if (fs.existsSync(target)) {
    return;
  }
  if (!fs.existsSync(source)) {
    console.warn('[ensure-next-constants] Missing source file:', path.relative(projectRoot, source));
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  if (fs.existsSync(sourceMap)) {
    fs.copyFileSync(sourceMap, targetMap);
  }
  console.log('[ensure-next-constants] Restored', path.relative(projectRoot, target));
} catch (error) {
  console.warn('[ensure-next-constants] Failed:', error.message);
}