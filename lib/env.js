'use strict';
/* Charge le fichier .env de l'application (sans dépendance). */
const fs = require('fs');
const path = require('path');
const f = path.join(__dirname, '..', '.env');
if (fs.existsSync(f)) for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
