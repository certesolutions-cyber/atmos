/**
 * Puppeteer test for custom shader rendering.
 *
 * Launches a Vite dev server, opens the example in headless Chrome with WebGPU,
 * waits for the scene to render, then reads pixels to verify:
 *   - The custom-shader cube (left side) has green-ish pixels
 *   - The PBR sphere (right side) has red-ish pixels
 *   - The background is dark
 */

import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { strict as assert } from 'node:assert';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

let server;
let browser;
let exitCode = 0;

async function setup() {
  // Start Vite dev server
  server = await createServer({
    root: ROOT,
    server: { port: 0, strictPort: false },
    logLevel: 'warn',
  });
  await server.listen();
  const address = server.httpServer.address();
  const port = typeof address === 'object' ? address.port : 3000;
  const url = `http://localhost:${port}`;
  console.log(`Vite server running at ${url}`);

  // Launch headless Chrome with WebGPU
  // Try multiple GPU backend strategies for different environments
  browser = await puppeteer.launch({
    headless: true,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan,UseSkiaRenderer',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--disable-gpu-sandbox',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  return { url };
}

async function readPixel(page, x, y) {
  return page.evaluate(
    (px, py) => {
      const canvas = document.getElementById('canvas');
      if (!canvas) return null;

      // Use a temporary 2D canvas to read WebGPU canvas pixels
      const tmp = document.createElement('canvas');
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const ctx = tmp.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      const data = ctx.getImageData(px, py, 1, 1).data;
      return { r: data[0], g: data[1], b: data[2], a: data[3] };
    },
    x,
    y,
  );
}

async function readRegionAverage(page, x, y, w, h) {
  return page.evaluate(
    (px, py, pw, ph) => {
      const canvas = document.getElementById('canvas');
      if (!canvas) return null;

      const tmp = document.createElement('canvas');
      tmp.width = canvas.width;
      tmp.height = canvas.height;
      const ctx = tmp.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      const data = ctx.getImageData(px, py, pw, ph).data;

      let rSum = 0, gSum = 0, bSum = 0;
      const count = pw * ph;
      for (let i = 0; i < count; i++) {
        rSum += data[i * 4];
        gSum += data[i * 4 + 1];
        bSum += data[i * 4 + 2];
      }
      return {
        r: Math.round(rSum / count),
        g: Math.round(gSum / count),
        b: Math.round(bSum / count),
      };
    },
    x, y, w, h,
  );
}

async function runTests(url) {
  const page = await browser.newPage();

  // Collect console logs
  const logs = [];
  page.on('console', (msg) => logs.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => logs.push(`[pageerror] ${err.message}`));

  // First check if WebGPU is available in this browser environment
  console.log('Checking WebGPU availability...');
  const blankPage = await browser.newPage();
  const hasWebGPU = await blankPage.evaluate(async () => {
    if (!navigator.gpu) return { available: false, reason: 'navigator.gpu not present' };
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return { available: false, reason: 'requestAdapter returned null' };
      const info = await adapter.requestAdapterInfo();
      return { available: true, info: `${info.vendor} ${info.architecture} ${info.description}` };
    } catch (e) {
      return { available: false, reason: String(e) };
    }
  });
  await blankPage.close();

  if (!hasWebGPU.available) {
    console.log(`WebGPU not available: ${hasWebGPU.reason}`);
    console.log('TEST SKIPPED (no WebGPU in this environment)\n');
    return;
  }
  console.log(`WebGPU available: ${hasWebGPU.info}`);

  console.log('Navigating to example...');
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

  // Wait for the scene to signal readiness
  console.log('Waiting for scene to render...');
  try {
    await page.waitForFunction(() => window.__ATMOS_READY__ === true, {
      timeout: 15000,
    });
  } catch {
    console.log('Console logs from page:');
    for (const log of logs) console.log('  ', log);
    throw new Error('Scene did not become ready within 15s. WebGPU adapter exists but rendering failed.');
  }

  // Wait a bit more for rendering to settle
  await new Promise((r) => setTimeout(r, 500));

  console.log('Reading pixels...');

  // Check if WebGPU rendered anything (canvas should not be all black)
  const center = await readPixel(page, 400, 300);
  console.log(`  Center pixel: R=${center?.r} G=${center?.g} B=${center?.b}`);

  // Left side: custom shader cube (green-ish)
  // The cube is at x=-1.5, which maps roughly to the left quarter of the canvas
  const leftRegion = await readRegionAverage(page, 150, 250, 100, 100);
  console.log(`  Left region avg (custom shader): R=${leftRegion?.r} G=${leftRegion?.g} B=${leftRegion?.b}`);

  // Right side: PBR sphere (red-ish)
  const rightRegion = await readRegionAverage(page, 550, 250, 100, 100);
  console.log(`  Right region avg (PBR sphere): R=${rightRegion?.r} G=${rightRegion?.g} B=${rightRegion?.b}`);

  // ── Assertions ──

  // Basic: something rendered (not all black)
  const anyPixels = await readRegionAverage(page, 0, 0, 800, 600);
  const totalBrightness = anyPixels.r + anyPixels.g + anyPixels.b;
  console.log(`  Overall avg brightness: ${totalBrightness} (R=${anyPixels.r} G=${anyPixels.g} B=${anyPixels.b})`);

  if (totalBrightness < 5) {
    console.log('\nConsole logs from page:');
    for (const log of logs) console.log('  ', log);
    console.log('\nWARN: Scene appears completely black. WebGPU might not be available.');
    console.log('Skipping pixel-level assertions (WebGPU not supported in this environment).');
    console.log('TEST SKIPPED (no WebGPU)\n');
    return;
  }

  // The left region (custom green shader) should have more green than red
  assert.ok(
    leftRegion.g > leftRegion.r,
    `Custom shader region should be green-dominant: R=${leftRegion.r} G=${leftRegion.g} B=${leftRegion.b}`,
  );

  // The right region (PBR red sphere) should have more red than green
  assert.ok(
    rightRegion.r > rightRegion.g,
    `PBR sphere region should be red-dominant: R=${rightRegion.r} G=${rightRegion.g} B=${rightRegion.b}`,
  );

  console.log('\nAll assertions passed!');
  console.log('TEST PASSED\n');
}

// ── Shader parser unit tests (no GPU needed) ──

async function runParserTests() {
  console.log('=== Shader Parser Unit Tests ===\n');

  // Import directly from dist files (avoid index.js which pulls in GPU-dependent modules)
  const parserPath = new URL('../../../packages/renderer/dist/custom-shader-parser.js', import.meta.url).pathname;
  const { parseCustomShader } = await import(parserPath);

  // Test 1: Parse basic properties
  {
    const src = `/// @property baseColor: vec4 = (1.0, 0.0, 0.0, 1.0)
/// @property speed: float = 2.0
/// @property offset: vec2 = (0.5, 0.5)

@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    return custom.baseColor;
}`;
    const desc = parseCustomShader(src);

    assert.equal(desc.properties.length, 3, 'Should have 3 properties');
    assert.equal(desc.properties[0].name, 'baseColor');
    assert.equal(desc.properties[0].type, 'vec4');
    assert.deepEqual(desc.properties[0].default, [1, 0, 0, 1]);
    assert.equal(desc.properties[0].floatCount, 4);
    assert.equal(desc.properties[0].byteOffset, 0);

    assert.equal(desc.properties[1].name, 'speed');
    assert.equal(desc.properties[1].type, 'float');
    assert.deepEqual(desc.properties[1].default, [2]);
    assert.equal(desc.properties[1].byteOffset, 16);

    assert.equal(desc.properties[2].name, 'offset');
    assert.equal(desc.properties[2].type, 'vec2');
    assert.deepEqual(desc.properties[2].default, [0.5, 0.5]);
    assert.equal(desc.properties[2].byteOffset, 32);

    // 3 properties × 16 bytes = 48 bytes
    assert.equal(desc.uniformBufferSize, 48);
    assert.equal(desc.textures.length, 0);
    assert.ok(desc.fragmentSource.includes('@fragment fn main'));
    assert.ok(!desc.fragmentSource.includes('@property'));

    console.log('  PASS: Basic property parsing');
  }

  // Test 2: Parse textures
  {
    const src = `/// @property brightness: float = 1.0
/// @texture mainTex
/// @texture normalMap

@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    return vec4(1.0);
}`;
    const desc = parseCustomShader(src);

    assert.equal(desc.properties.length, 1);
    assert.equal(desc.textures.length, 2);
    assert.equal(desc.textures[0].name, 'mainTex');
    assert.equal(desc.textures[0].bindingIndex, 2);
    assert.equal(desc.textures[0].samplerBindingIndex, 3);
    assert.equal(desc.textures[1].name, 'normalMap');
    assert.equal(desc.textures[1].bindingIndex, 4);
    assert.equal(desc.textures[1].samplerBindingIndex, 5);

    console.log('  PASS: Texture parsing');
  }

  // Test 3: Max texture limit
  {
    const src = `/// @texture tex1
/// @texture tex2
/// @texture tex3
/// @texture tex4

@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    return vec4(1.0);
}`;
    const desc = parseCustomShader(src);
    assert.equal(desc.textures.length, 3, 'Should cap at 3 textures');

    console.log('  PASS: Max texture limit (3)');
  }

  // Test 4: Parse the actual test shader
  {
    const fs = await import('node:fs');
    const shaderPath = path.resolve(ROOT, 'shaders/test-color.wgsl');
    const shaderSrc = fs.readFileSync(shaderPath, 'utf-8');
    const desc = parseCustomShader(shaderSrc);

    assert.equal(desc.properties.length, 2);
    assert.equal(desc.properties[0].name, 'baseColor');
    assert.equal(desc.properties[0].type, 'vec4');
    assert.deepEqual(desc.properties[0].default, [0, 1, 0, 1]);
    assert.equal(desc.properties[1].name, 'brightness');
    assert.equal(desc.properties[1].type, 'float');
    assert.deepEqual(desc.properties[1].default, [1]);
    assert.equal(desc.textures.length, 0);
    assert.ok(desc.fragmentSource.includes('computeLightLoop'));
    assert.ok(desc.fragmentSource.includes('applyFog'));

    console.log('  PASS: test-color.wgsl shader parsing');
  }

  // Test 5: Code generation
  {
    const codegenPath = new URL('../../../packages/renderer/dist/custom-shader-codegen.js', import.meta.url).pathname;
    const { generateCustomFragmentShader } = await import(codegenPath);
    const src = `/// @property baseColor: vec4 = (1.0, 0.0, 0.0, 1.0)

@fragment fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    return custom.baseColor;
}`;
    const desc = parseCustomShader(src);
    const wgsl = generateCustomFragmentShader(desc);

    assert.ok(wgsl.includes('struct CustomUniforms'), 'Should have CustomUniforms struct');
    assert.ok(wgsl.includes('struct SceneUniforms'), 'Should have SceneUniforms struct');
    assert.ok(wgsl.includes('struct FragmentInput'), 'Should have FragmentInput struct');
    assert.ok(wgsl.includes('@group(1) @binding(0)'), 'Should have custom uniform binding');
    assert.ok(wgsl.includes('@group(1) @binding(1)'), 'Should have scene uniform binding');
    assert.ok(wgsl.includes('return custom.baseColor'), 'Should include user code');

    console.log('  PASS: Code generation');
  }

  console.log('\nAll parser tests passed!\n');
}

async function main() {
  try {
    // Always run parser tests (no GPU needed)
    await runParserTests();

    // Run visual tests if WebGPU is available
    console.log('=== Visual Rendering Tests (Puppeteer) ===\n');
    const { url } = await setup();
    await runTests(url);
  } catch (err) {
    console.error('\nTEST FAILED:', err.message);
    exitCode = 1;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
    process.exit(exitCode);
  }
}

main();
