const path = require('path');
const Mocha = require('mocha');

function run() {
  const mocha = new Mocha({
    ui: 'tdd',
    color: true
  });

  const testsRoot = path.resolve(__dirname);
  mocha.addFile(path.resolve(testsRoot, 'commands.test.js'));
  mocha.addFile(path.resolve(testsRoot, 'tag-match.test.js'));
  mocha.addFile(path.resolve(testsRoot, 'asterisk-mode-functional.test.js'));

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} tests failed.`));
      } else {
        resolve();
      }
    });
  });
}

module.exports = { run };
