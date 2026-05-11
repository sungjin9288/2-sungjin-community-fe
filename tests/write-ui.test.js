const test = require('node:test');
const assert = require('node:assert/strict');

global.document = {
    addEventListener: () => {},
    getElementById: () => ({ addEventListener: () => {}, style: {} })
};

test('write helpers load without a browser DOM', () => {
    // write.js doesn't export any pure functions because they were moved to utils.js
    // This test ensures the file loads without encountering ReferenceErrors
    assert.doesNotThrow(() => {
        require('../public/js/posts/write.js');
    });
});
