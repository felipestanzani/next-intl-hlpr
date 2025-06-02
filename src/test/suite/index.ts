import * as path from 'path';
import * as Mocha from 'mocha';
import {glob} from 'glob';

export function run(): Promise<void> {
  // Create the mocha test
  const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 20000
  });

  const testsRoot = path.resolve(__dirname, '..');

  return new Promise((resolve, reject) => {
    // Only include extension tests that use suite(), exclude unit tests that use describe()
    const patterns = ['**/extension.test.js', '**/services/*.test.js'];

    const globPromises = patterns.map((pattern) =>
      glob(pattern, {cwd: testsRoot})
    );

    Promise.all(globPromises)
      .then((results: string[][]) => {
        const files = results.flat();

        // Add files to the test suite
        files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

        try {
          // Run the mocha test
          mocha.run((failures: number) => {
            if (failures > 0) {
              reject(new Error(`${failures} tests failed.`));
            } else {
              resolve();
            }
          });
        } catch (err) {
          console.error(err);
          reject(err);
        }
      })
      .catch((err: any) => {
        reject(err);
      });
  });
}
