#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const DEFAULT_CHANNEL = process.env.BIRDCLAUDE_PREVIEW_CHANNEL || 'birdclaude-20260425a';
const DEFAULT_PROJECT = process.env.BIRDCLAUDE_FIREBASE_PROJECT || 'viewmymodel';
const DEFAULT_HOME = process.env.BIRDCLAUDE_FIREBASE_HOME || '/data/codex-home';
const DEFAULT_XDG_CONFIG_HOME = process.env.BIRDCLAUDE_FIREBASE_XDG_CONFIG_HOME || `${DEFAULT_HOME}/.config`;
const DEFAULT_RETRIES = Number.parseInt(process.env.BIRDCLAUDE_DEPLOY_RETRIES || '3', 10);

function parseArgs(argv) {
  const options = {
    channel: DEFAULT_CHANNEL,
    project: DEFAULT_PROJECT,
    json: false,
    retries: Number.isFinite(DEFAULT_RETRIES) ? DEFAULT_RETRIES : 3,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--channel') {
      options.channel = argv[++i];
    } else if (arg === '--project') {
      options.project = argv[++i];
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--retries') {
      options.retries = Number.parseInt(argv[++i], 10);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/deploy-preview-links.mjs [options]

Builds the app, deploys the Firebase Hosting preview channel, verifies the live
HTML bundles, and prints the 4 cache-busted links.

Options:
  --channel <name>   Preview channel name (default: ${DEFAULT_CHANNEL})
  --project <name>   Firebase project id (default: ${DEFAULT_PROJECT})
  --retries <n>      Firebase deploy retries on transient failure (default: ${DEFAULT_RETRIES})
  --json             Print machine-readable JSON instead of text
  -h, --help         Show this help
`);
}

function run(command, args, { env = {}, stdio = 'pipe', allowFailure = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio,
  });

  if (!allowFailure && result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    const stdout = (result.stdout || '').trim();
    throw new Error([
      `Command failed: ${command} ${args.join(' ')}`,
      stdout && `stdout:\n${stdout}`,
      stderr && `stderr:\n${stderr}`,
    ].filter(Boolean).join('\n\n'));
  }

  return result;
}

function buildApp() {
  console.error('Building app...');
  run('npm', ['run', 'build'], { stdio: 'inherit' });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deployPreview(channel, project, retries) {
  console.error(`Deploying preview channel ${channel} on project ${project}...`);
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const result = run(
      'npx',
      ['firebase-tools', 'hosting:channel:deploy', channel, '--project', project, '--json'],
      {
        env: {
          HOME: DEFAULT_HOME,
          XDG_CONFIG_HOME: DEFAULT_XDG_CONFIG_HOME,
        },
        allowFailure: true,
      },
    );

    if (result.status === 0) {
      try {
        const payload = JSON.parse(result.stdout);
        const projectResult = payload?.result?.[project];
        if (!projectResult?.url) {
          throw new Error(`Firebase deploy response did not contain result.${project}.url`);
        }
        return projectResult;
      } catch (error) {
        lastError = error;
      }
    } else {
      lastError = new Error([
        `firebase deploy attempt ${attempt}/${retries} failed`,
        result.stdout?.trim(),
        result.stderr?.trim(),
      ].filter(Boolean).join('\n\n'));
    }

    if (attempt < retries) {
      console.error(`Deploy attempt ${attempt} failed, retrying...`);
      await sleep(1000 * attempt);
    }
  }

  throw lastError;
}

async function verifyLive(url) {
  const response = await fetch(`${url.replace(/\/$/, '')}/`, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Live preview verification failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const jsMatches = [...html.matchAll(/\/assets\/[^"]+\.js/g)].map((match) => match[0]);
  const cssMatches = [...html.matchAll(/\/assets\/[^"]+\.css/g)].map((match) => match[0]);

  if (jsMatches.length === 0) {
    throw new Error('Could not find JS bundle in live HTML');
  }
  if (cssMatches.length === 0) {
    throw new Error('Could not find CSS bundle in live HTML');
  }

  return {
    js: jsMatches[0],
    css: cssMatches[0],
  };
}

function withParams(baseUrl, params, hash = '') {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }
  url.hash = hash;
  return url.toString();
}

function printText(result) {
  console.log(`Preview: ${result.links.preview}`);
  console.log(`Editor: ${result.links.editor}`);
  console.log(`Reset: ${result.links.reset}`);
  console.log(`Reset+Editor: ${result.links.resetEditor}`);
  console.log(`JS: ${result.js}`);
  console.log(`CSS: ${result.css}`);
  console.log(`Expires: ${result.expireTime}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  buildApp();
  const deployed = await deployPreview(options.channel, options.project, options.retries);
  const live = await verifyLive(deployed.url);
  const cb = Math.floor(Date.now() / 1000);

  const result = {
    previewUrl: deployed.url,
    expireTime: deployed.expireTime,
    js: live.js,
    css: live.css,
    cb,
    links: {
      preview: withParams(deployed.url, { cb }),
      editor: withParams(deployed.url, { cb, hexEditor: 1 }, 'hex'),
      reset: withParams(deployed.url, { cb, birdReset: 1 }),
      resetEditor: withParams(deployed.url, { cb, birdReset: 1, hexEditor: 1 }, 'hex'),
    },
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printText(result);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
