const test = require('node:test');
const assert = require('node:assert/strict');

const signupUi = require('../public/js/auth/signup.js');

test('signup helpers load without a browser DOM', () => {
    assert.equal(typeof signupUi.validateSignupForm, 'function');
    assert.equal(typeof signupUi.applyEmailHelperState, 'function');
    assert.equal(typeof signupUi.isEmailAlreadyExistsMessage, 'function');
});

test('isEmailAlreadyExistsMessage matches duplicate email validation errors', () => {
    assert.equal(signupUi.isEmailAlreadyExistsMessage('이미 사용 중인 이메일입니다.'), true);
    assert.equal(signupUi.isEmailAlreadyExistsMessage('이미 사용 중인 닉네임입니다.'), false);
    assert.equal(signupUi.isEmailAlreadyExistsMessage(''), false);
});

test('applyEmailHelperState updates helper text and color together', () => {
    const helper = {
        textContent: '',
        classList: {
            classes: new Set(),
            add(c) { this.classes.add(c); },
            remove(...c) { c.forEach(cls => this.classes.delete(cls)); },
            has(c) { return this.classes.has(c); }
        }
    };

    signupUi.applyEmailHelperState(helper, signupUi.EMAIL_HELPER_STATE.available);
    assert.equal(helper.textContent, '사용 가능한 이메일입니다.');
    assert.equal(helper.classList.has('helper-success'), true);

    signupUi.applyEmailHelperState(helper, signupUi.EMAIL_HELPER_STATE.default);
    assert.equal(helper.textContent, '@를 포함한 이메일 형식으로 입력해 주세요.');
    assert.equal(helper.classList.has('helper-default'), true);
});
