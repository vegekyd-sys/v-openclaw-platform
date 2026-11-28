'use strict';

const path = require('node:path');

module.exports = path.resolve(
  process.env.OPENCLAW_WORKSPACE_DIR
    || process.env.MAKARON_WORKSPACE_ROOT
    || path.join(__dirname, '..', '..'),
);
