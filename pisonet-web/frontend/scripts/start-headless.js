const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');

const projectRoot = path.resolve(__dirname, '..');
const port = process.env.PORT || '3000';
const host = process.env.HOST || 'localhost';
const targetUrl = `http://${host}:${port}`;
const reactScriptsPath = path.join(projectRoot, 'node_modules', 'react-scripts', 'bin', 'react-scripts.js');
const buildDir = path.join(projectRoot, 'build');
const browserProfileRootDir = path.join(projectRoot, '.chrome-headless-profile');
const browserProfileDir = path.join(browserProfileRootDir, String(process.pid));
const mode = process.argv[2] || 'start';

const chromeCandidates = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  'google-chrome',
  'chromium',
  'chromium-browser'
].filter(Boolean);

let devServerProcess = null;
let browserProcess = null;
let launchedBrowser = false;
let staticServer = null;

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp'
};

async function resolveChromeBinary() {
  for (const candidate of chromeCandidates) {
    if (candidate.includes(path.sep)) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      continue;
    }

    const resolved = await new Promise((resolve) => {
      const lookup = spawn('sh', ['-lc', `command -v ${candidate}`], {
        stdio: ['ignore', 'pipe', 'ignore']
      });
      let output = '';
      lookup.stdout.on('data', (chunk) => {
        output += chunk.toString();
      });
      lookup.on('close', (code) => {
        resolve(code === 0 ? output.trim() : null);
      });
      lookup.on('error', () => resolve(null));
    });

    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function waitForServer(url, timeoutMs = 120000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const probe = () => {
      const client = url.startsWith('https') ? https : http;
      const request = client.get(url, (response) => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) {
          resolve();
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for dev server at ${url}`));
          return;
        }
        setTimeout(probe, 1000);
      });

      request.on('error', () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for dev server at ${url}`));
          return;
        }
        setTimeout(probe, 1000);
      });
    };

    probe();
  });
}

function launchHeadlessChrome(chromeBinary) {
  if (launchedBrowser) {
    return;
  }

  launchedBrowser = true;
  fs.mkdirSync(browserProfileDir, { recursive: true });

  browserProcess = spawn(chromeBinary, [
    '--headless=new',
    '--disable-gpu',
    '--disable-logging',
    '--log-level=3',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=9222',
    `--user-data-dir=${browserProfileDir}`,
    targetUrl,
  ], {
    cwd: projectRoot,
    stdio: 'ignore'
  });

  browserProcess.on('exit', (code, signal) => {
    if (code !== 0 && signal !== 'SIGTERM') {
      console.error(`Headless Chrome exited with code ${code || 'unknown'}`);
    }
  });

  console.log(`Headless Chrome launched at ${targetUrl}`);
  console.log('Remote debugging available on http://127.0.0.1:9222');
}

function getContentType(filePath) {
  return mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function resolveBuildFile(requestUrl) {
  const parsedUrl = new URL(requestUrl, targetUrl);
  let pathname = decodeURIComponent(parsedUrl.pathname);

  if (pathname === '/') {
    pathname = '/index.html';
  }

  const requestedPath = path.normalize(path.join(buildDir, pathname));
  if (!requestedPath.startsWith(buildDir)) {
    return null;
  }

  if (fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
    return requestedPath;
  }

  return path.join(buildDir, 'index.html');
}

function startStaticServer() {
  if (!fs.existsSync(buildDir)) {
    console.error('Production build not found. Run "npm run build" before "npm run serve".');
    process.exit(1);
  }

  staticServer = http.createServer((req, res) => {
    const filePath = resolveBuildFile(req.url || '/');

    if (!filePath || !fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const stream = fs.createReadStream(filePath);
    res.writeHead(200, { 'Content-Type': getContentType(filePath) });
    stream.pipe(res);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Failed to read file');
    });
  });

  staticServer.listen(Number(port), host, () => {
    console.log(`Static server listening at ${targetUrl}`);
  });

  staticServer.on('error', (error) => {
    console.error(error.message || 'Failed to start static server');
    shutdown(1);
  });
}

function shutdown(exitCode = 0) {
  if (browserProcess && !browserProcess.killed) {
    browserProcess.kill('SIGTERM');
  }
  if (devServerProcess && !devServerProcess.killed) {
    devServerProcess.kill('SIGTERM');
  }
  if (staticServer) {
    staticServer.close();
  }
  fs.rmSync(browserProfileDir, { recursive: true, force: true });
  process.exit(exitCode);
}

async function main() {
  const chromeBinary = await resolveChromeBinary();
  if (!chromeBinary) {
    console.error('No Chrome/Chromium binary found. Set CHROME_BIN or install Chrome.');
    process.exit(1);
  }

  if (mode === 'serve') {
    startStaticServer();
  } else {
    devServerProcess = spawn(process.execPath, [reactScriptsPath, 'start'], {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        BROWSER: 'none'
      }
    });

    devServerProcess.on('exit', (code, signal) => {
      if (signal === 'SIGTERM') {
        process.exit(0);
        return;
      }
      process.exit(code || 0);
    });
  }

  try {
    await waitForServer(targetUrl);
    launchHeadlessChrome(chromeBinary);
  } catch (error) {
    console.error(error.message);
    shutdown(1);
  }
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

main();
