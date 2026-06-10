#!/usr/bin/env node
/** CI: set semver patch from GitHub run number so each build is newer than the last. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const run = Number(process.env.GITHUB_RUN_NUMBER || 0);
const majorMinor = (process.env.ORBIT_DESKTOP_MAJOR_MINOR || '1.0').trim();
pkg.version = run > 0 ? `${majorMinor}.${run}` : pkg.version;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('Desktop version →', pkg.version);
