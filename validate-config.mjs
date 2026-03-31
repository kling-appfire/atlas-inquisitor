#!/usr/bin/env node
/**
 * Validates config/rules.json against config/rules.schema.json
 * Run: npm run validate-config
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Ajv = require('ajv');

const schema = JSON.parse(readFileSync('./config/rules.schema.json', 'utf8'));
const rules = JSON.parse(readFileSync('./config/rules.json', 'utf8'));

const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);
const valid = validate(rules);

if (!valid) {
  console.error('❌ config/rules.json validation FAILED:\n');
  validate.errors?.forEach(err => {
    console.error(`  • ${err.instancePath || '(root)'}: ${err.message}`);
  });
  process.exit(1);
} else {
  console.log('✅ config/rules.json is valid');
}
