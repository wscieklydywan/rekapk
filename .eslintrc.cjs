// Legacy ESLint config (uses shareable configs with "extends")
const expoConfig = require('eslint-config-expo');

module.exports = Object.assign({}, expoConfig, {
  ignores: ['dist/*'],
});
