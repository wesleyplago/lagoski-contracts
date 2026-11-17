#!/usr/bin/env node
// Valida o repositório de contratos:
// 1. todo schema compila (JSON Schema 2020-12);
// 2. todo exemplo em examples/ passa no envelope e no schema do seu tipo;
// 3. todo tipo tem exemplo, e todo $ref dos AsyncAPI aponta para um arquivo existente;
// 4. nenhum schema publicado mudou de forma incompatível (campo obrigatório novo ou removido)
//    sem ganhar uma versão nova: compara com a tag anterior, se houver.
import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { parse } from 'yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const errors = [];
const ajv = new Ajv2020.default({ allErrors: true, strict: true });
addFormats.default(ajv);

const schemaFiles = walk(join(root, 'schemas')).filter((f) => f.endsWith('.json'));
const validators = new Map();
for (const file of schemaFiles) {
  const rel = relative(join(root, 'schemas'), file);
  try {
    validators.set(rel, ajv.compile(JSON.parse(readFileSync(file, 'utf8'))));
  } catch (err) {
    errors.push(`${rel}: não compila (${err.message})`);
  }
}

const envelope = validators.get('cloudevent.json');
const typeToFile = (type) => {
  const [, context, ...rest] = type.split('.');
  const version = rest.pop();
  return `${context}/${rest.join('.')}.${version}.json`;
};

const examples = walk(join(root, 'examples')).filter((f) => f.endsWith('.json'));
const covered = new Set();
for (const file of examples) {
  const event = JSON.parse(readFileSync(file, 'utf8'));
  const schema = typeToFile(event.type);
  covered.add(schema);
  if (!envelope(event)) errors.push(`${relative(root, file)}: envelope ${ajv.errorsText(envelope.errors)}`);
  const validate = validators.get(schema);
  if (!validate) errors.push(`${relative(root, file)}: sem schema ${schema}`);
  else if (!validate(event.data)) errors.push(`${relative(root, file)}: ${ajv.errorsText(validate.errors)}`);
}
for (const rel of validators.keys()) {
  if (rel !== 'cloudevent.json' && !covered.has(rel)) errors.push(`${rel}: sem exemplo em examples/`);
}

for (const file of walk(join(root, 'asyncapi')).filter((f) => f.endsWith('.yaml'))) {
  const text = readFileSync(file, 'utf8');
  parse(text);
  for (const [, ref] of text.matchAll(/\$ref: '(\.\.\/[^']+)'/g)) {
    if (!existsSync(join(dirname(file), ref))) errors.push(`${relative(root, file)}: $ref inexistente ${ref}`);
  }
}

// Compatibilidade com a última tag publicada.
let previousTag = null;
try {
  previousTag = execSync('git describe --tags --abbrev=0 HEAD^', { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {
  // primeira versão
}
if (previousTag) {
  for (const file of schemaFiles) {
    const rel = relative(root, file);
    let before;
    try {
      before = JSON.parse(execSync(`git show ${previousTag}:${rel}`, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString());
    } catch {
      continue; // schema novo
    }
    const after = JSON.parse(readFileSync(file, 'utf8'));
    const req = (s) => new Set(s.required ?? []);
    const added = [...req(after)].filter((r) => !req(before).has(r));
    const removed = Object.keys(before.properties ?? {}).filter((p) => !(p in (after.properties ?? {})));
    if (added.length || removed.length) {
      errors.push(`${rel}: mudança incompatível desde ${previousTag} (obrigatório novo: ${added.join(', ') || '-'}; removido: ${removed.join(', ') || '-'}). Publique um .v2 em paralelo.`);
    }
  }
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${validators.size} schemas, ${examples.length} exemplos, ${previousTag ? `compatível com ${previousTag}` : 'primeira versão'}`);
