import {defineConfig} from '@vscode/test-cli';

export default defineConfig({
  tests: [
    {
      extensionDevelopmentPath: '.',
      extensionTestsPath: './out/test/suite/index'
    }
  ]
});
