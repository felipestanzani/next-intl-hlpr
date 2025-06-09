const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const {execSync} = require('child_process');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd((result) => {
      result.errors.forEach(({text, location}) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`
        );
      });
      console.log('[watch] build finished');
    });
  }
};

/**
 * @type {import('esbuild').Plugin}
 */
const bundleJsoncParserPlugin = {
  name: 'bundle-jsonc-parser-plugin',

  setup(build) {
    build.onEnd(async () => {
      // Create necessary directories
      const outDir = path.join(__dirname, 'out');
      const nodeModulesDir = path.join(outDir, 'node_modules');
      const jsoncParserDir = path.join(nodeModulesDir, 'jsonc-parser');

      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, {recursive: true});
      }

      if (!fs.existsSync(nodeModulesDir)) {
        fs.mkdirSync(nodeModulesDir, {recursive: true});
      }

      if (!fs.existsSync(jsoncParserDir)) {
        fs.mkdirSync(jsoncParserDir, {recursive: true});
      }

      // Copy the entire jsonc-parser package
      const sourceDir = path.join(__dirname, 'node_modules', 'jsonc-parser');

      if (fs.existsSync(sourceDir)) {
        console.log(`Copying jsonc-parser package to ${jsoncParserDir}`);

        // We'll use a recursive copy with exec for simplicity
        try {
          // Copy only the lib directory which contains the compiled files
          execSync(
            `cp -R "${path.join(sourceDir, 'lib')}" "${jsoncParserDir}/"`
          );

          // Copy package.json for proper module resolution
          fs.copyFileSync(
            path.join(sourceDir, 'package.json'),
            path.join(jsoncParserDir, 'package.json')
          );

          console.log(`Successfully copied jsonc-parser package`);
        } catch (error) {
          console.error(`Error copying jsonc-parser package: ${error.message}`);
        }
      } else {
        console.error(`Source directory not found: ${sourceDir}`);
      }
    });
  }
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/extension.js',
    external: [
      'vscode',
      'jsonc-parser' // Mark jsonc-parser as external since we'll bundle it separately
    ],
    logLevel: 'info',
    plugins: [esbuildProblemMatcherPlugin, bundleJsoncParserPlugin]
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
