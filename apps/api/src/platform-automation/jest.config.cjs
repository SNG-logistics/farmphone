const path = require('path');

module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.automation-test\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: path.join(__dirname, '../../tsconfig.json') }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
};
