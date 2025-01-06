// Typescript and vscode don't yet support named exports.
// For now we "fake" them by having this top level js file
// https://nodejs.org/api/packages.html#packages_conditional_exports

const { default: BlobReader } = require("./dist/cjs/web/BlobReader");

module.exports = {
  BlobReader,
};
