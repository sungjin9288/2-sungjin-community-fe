/**
 * Login page script
 */
(function initLoginPage() {
    'use strict';

    document.addEventListener('DOMContentLoaded', async () => {
        const form = document.getElementById('loginForm');
        const emailInput = document.getElementById('email');
        const passwordInput = document.getElementById('password');
        const submitButton = form.querySelector('button[type="submit"]');

        const bootstrapped = await ensureAuthenticated({ redirect: false });
        if (bootstrapped) {
            navigateTo('/posts');
            return;
        }

        const authNotice = typeof popAuthNotice === 'function' ? popAuthNotice() : null;
        if (authNotice) {
            showFieldError('passwordError', authNotice);
            passwordInput.classList.add('error');
        }

        emailInput.addEventListener('input', () => {
            hideFieldError('emailError');
            emailInput.classList.remove('error');
            validateAndUpdateButton();
        });

        passwordInput.addEventListener('input', () => {
            hideFieldError('passwordError');
            passwordInput.classList.remove('error');
            validateAndUpdateButton();
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            hideFieldError('emailError');
            hideFieldError('passwordError');
            emailInput.classList.remove('error');
            passwordInput.classList.remove('error');

            const email = emailInput.value.trim();
            const password = passwordInput.value;

            let isValid = true;

            if (!email) {
                showFieldError('emailError', '이메일을 입력해 주세요.');
                emailInput.classList.add('error');
                isValid = false;
            } else if (!validateEmail(email)) {
                showFieldError('emailError', '올바른 이메일 형식으로 입력해 주세요.');
                emailInput.classList.add('error');
                isValid = false;
            }

            if (!password) {
                showFieldError('passwordError', '비밀번호를 입력해 주세요.');
                passwordInput.classList.add('error');
                isValid = false;
            }

            if (!isValid) return;

            submitButton.disabled = true;

            try {
                await login(email, password);
                navigateTo('/posts');
            } catch (error) {
                const resolved = resolveApiError(error, '로그인에 실패했습니다.');

                if (resolved.category === 'validation' || resolved.category === 'unknown') {
                    showFieldError('passwordError', resolved.message);
                    passwordInput.classList.add('error');
                } else {
                    handleApiError(error, { redirectOnAuth: false });
                }
            } finally {
                submitButton.disabled = false;
            }
        });

        function validateAndUpdateButton() {
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            const isReady = validateEmail(email) && password.length > 0;
            setSubmitButtonState(submitButton, isReady);
        }
    });
})();
