/**
 * Password change page script
 */
(function initPasswordChangePage() {
    'use strict';

    document.addEventListener('DOMContentLoaded', async () => {
        const isReady = await ensureAuthenticated();
        if (!isReady) return;

        await loadHeaderProfile();
        bindDropdownMenu();

        const form = document.getElementById('passwordChangeForm');
        const currentPasswordInput = document.getElementById('currentPassword');
        const newPasswordInput = document.getElementById('newPassword');
        const confirmPasswordInput = document.getElementById('confirmPassword');
        const submitButton = document.getElementById('btnSubmit');
        const passwordHelper = document.getElementById('passwordHelper');
        const confirmHelper = document.getElementById('confirmHelper');

        if (passwordHelper) passwordHelper.textContent = '';
        if (confirmHelper) confirmHelper.textContent = '';

        function setHelperState(element, text, className) {
            if (!element) return;
            element.textContent = text;
            element.classList.remove('helper-success', 'helper-error', 'helper-default');
            if (className) element.classList.add(className);
        }

        function updateValidationState() {
            const currentPassword = currentPasswordInput.value;
            const newPassword = newPasswordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            const passwordResult = validatePasswordComplex(newPassword);
            const isConfirmMatched = confirmPassword.length > 0 && newPassword === confirmPassword;
            const isCurrentProvided = currentPassword.length > 0;

            if (passwordHelper) {
                if (!newPassword) {
                    setHelperState(passwordHelper, '*새 비밀번호를 입력해 주세요.', 'helper-default');
                } else if (!passwordResult.valid) {
                    setHelperState(passwordHelper, '*8~20자, 대문자/소문자/숫자/특수문자를 각각 1개 이상 포함해 주세요.', 'helper-error');
                } else {
                    setHelperState(passwordHelper, '사용 가능한 비밀번호입니다.', 'helper-success');
                }
            }

            if (confirmHelper) {
                if (!confirmPassword) {
                    setHelperState(confirmHelper, '*새 비밀번호를 한 번 더 입력해 주세요.', 'helper-default');
                } else if (!isConfirmMatched) {
                    setHelperState(confirmHelper, '*비밀번호가 일치하지 않습니다.', 'helper-error');
                } else {
                    setHelperState(confirmHelper, '비밀번호가 일치합니다.', 'helper-success');
                }
            }

            const canSubmit = isCurrentProvided && passwordResult.valid && isConfirmMatched;
            setSubmitButtonState(submitButton, canSubmit);
            return canSubmit;
        }

        currentPasswordInput.addEventListener('input', updateValidationState);
        newPasswordInput.addEventListener('input', updateValidationState);
        confirmPasswordInput.addEventListener('input', updateValidationState);

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            hideFieldError('currentPasswordError');
            hideFieldError('newPasswordError');
            hideFieldError('confirmPasswordError');

            const currentPassword = currentPasswordInput.value;
            const newPassword = newPasswordInput.value;
            const confirmPassword = confirmPasswordInput.value;

            let hasError = false;

            if (!currentPassword) {
                showFieldError('currentPasswordError', '현재 비밀번호를 입력해 주세요.');
                hasError = true;
            }

            const passwordResult = validatePasswordComplex(newPassword);
            if (!newPassword) {
                showFieldError('newPasswordError', '새 비밀번호를 입력해 주세요.');
                hasError = true;
            } else if (!passwordResult.valid) {
                showFieldError('newPasswordError', '8~20자, 대문자/소문자/숫자/특수문자를 각각 1개 이상 포함해 주세요.');
                hasError = true;
            }

            if (!confirmPassword) {
                showFieldError('confirmPasswordError', '새 비밀번호 확인을 입력해 주세요.');
                hasError = true;
            } else if (newPassword !== confirmPassword) {
                showFieldError('confirmPasswordError', '비밀번호가 일치하지 않습니다.');
                hasError = true;
            }

            if (hasError) return;

            submitButton.disabled = true;

            try {
                await changePassword(currentPassword, newPassword);
                showToast('비밀번호가 변경되었습니다. 다시 로그인해 주세요.');

                setTimeout(async () => {
                    await logout();
                    navigateTo('/login');
                }, 1000);
            } catch (error) {
                const resolved = resolveApiError(error, '비밀번호 변경에 실패했습니다.');
                if (resolved.category === 'validation') {
                    showFieldError('currentPasswordError', resolved.message);
                } else {
                    handleApiError(error, {
                        fallbackMessage: '비밀번호 변경에 실패했습니다.'
                    });
                }
            } finally {
                submitButton.disabled = false;
            }
        });
    });
})();
