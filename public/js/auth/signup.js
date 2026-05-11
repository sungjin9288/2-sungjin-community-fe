/**
 * Signup page script
 */
(function initSignupPage() {
    'use strict';

    const EMAIL_HELPER_STATE = Object.freeze({
        default: {
            text: '@를 포함한 이메일 형식으로 입력해 주세요.',
            className: 'helper-default'
        },
        available: {
            text: '사용 가능한 이메일입니다.',
            className: 'helper-success'
        }
    });
    const PROFILE_SYNC_FAILURE_MESSAGE = '회원가입은 완료되었지만 프로필 반영에 실패했습니다. 로그인 후 프로필을 다시 확인해 주세요.';

    let profileImageFile = null;
    let checkedEmail = '';

    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', async () => {
        const alreadySignedIn = await ensureAuthenticated({ redirect: false });
        if (alreadySignedIn) {
            navigateTo('/posts');
            return;
        }

        const form = document.getElementById('signupForm');
        const profileInput = document.getElementById('profileImage');
        const profilePreview = document.getElementById('profilePreview');
        const btnRemoveProfileImage = document.getElementById('btnRemoveProfileImage');
        const profileError = document.getElementById('profileError');
        const confirmModal = document.getElementById('confirmModal');
        const btnCloseModal = document.getElementById('btnCloseModal');
        const emailInput = document.getElementById('email');
        const btnCheckEmail = document.getElementById('btnCheckEmail');
        const emailHelper = document.getElementById('emailHelper');
        const emailError = document.getElementById('emailError');
        const passwordInput = document.getElementById('password');
        const passwordError = document.getElementById('passwordError');
        const passwordConfirmInput = document.getElementById('passwordConfirm');
        const passwordConfirmError = document.getElementById('passwordConfirmError');
        const nicknameInput = document.getElementById('nickname');
        const nicknameError = document.getElementById('nicknameError');
        const submitButton = form.querySelector('button[type="submit"]');

        setSubmitButtonState(submitButton, false);
        applyEmailHelperState(emailHelper, EMAIL_HELPER_STATE.default);

        if (profilePreview && profileInput) {
            profilePreview.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                profileInput.click();
            });
        }

        if (btnRemoveProfileImage) {
            btnRemoveProfileImage.addEventListener('click', () => {
                clearProfileImage(profileInput, profilePreview, btnRemoveProfileImage);
                validateAndUpdateButton();
            });
        }

        if (profileInput) {
            setupImageDragAndDrop(profileInput);
            profileInput.addEventListener('change', (event) => {
                const file = event.target.files && event.target.files[0];
                if (!file) return;

                const validation = validateImageFile(file);
                if (!validation.valid) {
                    showFieldError(profileError, validation.message);
                    profileInput.value = '';
                    return;
                }

                profileImageFile = file;
                hideFieldError(profileError);

                const reader = new FileReader();
                reader.onload = (readEvent) => {
                    renderProfilePreview(profilePreview, btnRemoveProfileImage, readEvent.target.result);
                };
                reader.readAsDataURL(file);
                validateAndUpdateButton();
            });
        }

        if (btnCheckEmail) {
            btnCheckEmail.addEventListener('click', async () => {
                const email = emailInput.value.trim();
                hideFieldError(emailError);

                if (!email) {
                    showFieldError(emailError, '이메일을 입력해 주세요.');
                    return;
                }

                if (!validateEmail(email)) {
                    showFieldError(emailError, '올바른 이메일 형식으로 입력해 주세요. (예: example@example.com)');
                    return;
                }

                btnCheckEmail.disabled = true;

                try {
                    await checkEmail(email);
                    checkedEmail = email;
                    hideFieldError(emailError);
                    applyEmailHelperState(emailHelper, EMAIL_HELPER_STATE.available);
                } catch (error) {
                    if (Number(error.status) === 404) {
                        checkedEmail = email;
                        hideFieldError(emailError);
                        applyEmailHelperState(emailHelper, {
                            text: '이메일 중복 확인 API를 지원하지 않아 가입 시 검증됩니다.',
                            className: 'helper-warning'
                        });
                    } else {
                        checkedEmail = '';
                        applyEmailHelperState(emailHelper, EMAIL_HELPER_STATE.default);
                        const resolved = resolveApiError(error, '중복된 이메일이거나 확인에 실패했습니다.');
                        showFieldError(emailError, resolved.message);
                    }
                } finally {
                    btnCheckEmail.disabled = false;
                    validateAndUpdateButton();
                }
            });
        }

        emailInput.addEventListener('input', () => {
            if (checkedEmail !== emailInput.value.trim()) {
                checkedEmail = '';
                applyEmailHelperState(emailHelper, EMAIL_HELPER_STATE.default);
            }
            hideFieldError(emailError);
            validateAndUpdateButton();
        });

        passwordInput.addEventListener('input', () => {
            hideFieldError(passwordError);
            validateAndUpdateButton();
        });

        passwordConfirmInput.addEventListener('input', () => {
            hideFieldError(passwordConfirmError);
            validateAndUpdateButton();
        });

        nicknameInput.addEventListener('input', () => {
            hideFieldError(nicknameError);
            validateAndUpdateButton();
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const email = emailInput.value.trim();
            const password = passwordInput.value;
            const passwordConfirm = passwordConfirmInput.value;
            const nickname = nicknameInput.value.trim();

            const errors = validateSignupForm({
                profileImageFile,
                email,
                checkedEmail,
                password,
                passwordConfirm,
                nickname
            });

            hideFieldError(profileError);
            hideFieldError(emailError);
            hideFieldError(passwordError);
            hideFieldError(passwordConfirmError);
            hideFieldError(nicknameError);

            if (errors.profile) showFieldError(profileError, errors.profile);
            if (errors.email) showFieldError(emailError, errors.email);
            if (errors.password) showFieldError(passwordError, errors.password);
            if (errors.passwordConfirm) showFieldError(passwordConfirmError, errors.passwordConfirm);
            if (errors.nickname) showFieldError(nicknameError, errors.nickname);

            if (Object.keys(errors).length > 0) return;

            submitButton.disabled = true;
            submitButton.textContent = '가입 중...';

            try {
                await signup(email, password, nickname);

                let profileSyncFailed = false;
                try {
                    await login(email, password);
                    if (profileImageFile) {
                        const uploadResult = await uploadImage(profileImageFile, 'profile');
                        const imageUrl = uploadResult && uploadResult.data
                            ? uploadResult.data.image_url
                            : uploadResult.image_url;
                        await updateProfile(nickname, imageUrl || null);
                    }
                } catch (profileSyncError) {
                    profileSyncFailed = true;
                } finally {
                    await logout();
                }

                if (profileSyncFailed) {
                    showToast(PROFILE_SYNC_FAILURE_MESSAGE, { type: 'error', duration: 5000 });
                }
                confirmModal.style.display = 'flex';
            } catch (error) {
                const resolved = resolveApiError(error, '회원가입에 실패했습니다.');
                if (resolved.message.includes('이메일')) {
                    if (isEmailAlreadyExistsMessage(resolved.message)) {
                        checkedEmail = '';
                        applyEmailHelperState(emailHelper, EMAIL_HELPER_STATE.default);
                    }
                    showFieldError(emailError, resolved.message);
                } else if (resolved.message.includes('닉네임')) {
                    showFieldError(nicknameError, resolved.message);
                } else {
                    showToast(resolved.message, { type: 'error' });
                }
            } finally {
                submitButton.disabled = false;
                submitButton.textContent = '회원가입';
            }
        });

        if (btnCloseModal) {
            btnCloseModal.addEventListener('click', () => {
                confirmModal.style.display = 'none';
                navigateTo('/login');
            });
        }

        function validateAndUpdateButton() {
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            const passwordConfirm = passwordConfirmInput.value;
            const nickname = nicknameInput.value.trim();

            const isProfileValid = profileImageFile !== null;
            const isEmailValid = validateEmail(email) && checkedEmail === email;
            const isPasswordValid = validatePasswordComplex(password).valid;
            const isPasswordConfirmValid = password === passwordConfirm && passwordConfirm.length > 0;
            const isNicknameValid = nickname.length >= 1 && nickname.length <= 10 && !nickname.includes(' ');

            setSubmitButtonState(submitButton,
                isProfileValid &&
                isEmailValid &&
                isPasswordValid &&
                isPasswordConfirmValid &&
                isNicknameValid
            );
        }
        });
    }

    function validateSignupForm(payload) {
        const errors = {};

        if (!payload.profileImageFile) {
            errors.profile = '프로필 사진을 추가해 주세요.';
        }

        if (!payload.email) {
            errors.email = '이메일을 입력해 주세요.';
        } else if (!validateEmail(payload.email)) {
            errors.email = '올바른 이메일 형식으로 입력해 주세요. (예: example@example.com)';
        } else if (payload.checkedEmail !== payload.email) {
            errors.email = '이메일 중복 확인을 진행해 주세요.';
        }

        if (!payload.password) {
            errors.password = '비밀번호를 입력해 주세요.';
        } else if (!validatePasswordComplex(payload.password).valid) {
            errors.password = '8~20자, 대문자/소문자/숫자/특수문자를 각각 1개 이상 포함해 주세요.';
        }

        if (!payload.passwordConfirm) {
            errors.passwordConfirm = '비밀번호를 한 번 더 입력해 주세요.';
        } else if (payload.password !== payload.passwordConfirm) {
            errors.passwordConfirm = '비밀번호가 일치하지 않습니다.';
        }

        if (!payload.nickname) {
            errors.nickname = '닉네임을 입력해 주세요.';
        } else if (payload.nickname.includes(' ')) {
            errors.nickname = '닉네임에는 공백을 사용할 수 없습니다.';
        } else if (payload.nickname.length < 1 || payload.nickname.length > 10) {
            errors.nickname = '닉네임은 1~10자 사이여야 합니다.';
        }

        return errors;
    }

    function applyEmailHelperState(element, state) {
        if (!element || !state) return;
        element.textContent = state.text;
        // Remove all helper state classes before applying new one
        element.classList.remove('helper-success', 'helper-error', 'helper-default', 'helper-warning');
        if (state.className) {
            element.classList.add(state.className);
        }
    }

    function isEmailAlreadyExistsMessage(message) {
        return String(message || '').includes('이미 사용 중인 이메일');
    }

    function renderProfilePreview(profilePreview, removeButton, imageSrc) {
        if (!profilePreview) return;
        profilePreview.classList.add('has-image');
        profilePreview.setAttribute('aria-label', '프로필 사진 변경');
        profilePreview.innerHTML = `
            <img
                src="${imageSrc}"
                alt="프로필 미리보기"
                loading="lazy"
            >
            <span class="profile-overlay">변경</span>
        `;
        if (removeButton) removeButton.hidden = false;
    }

    function clearProfileImage(profileInput, profilePreview, removeButton) {
        profileImageFile = null;
        if (profileInput) profileInput.value = '';
        if (profilePreview) {
            profilePreview.classList.remove('has-image');
            profilePreview.setAttribute('aria-label', '프로필 사진 선택');
            profilePreview.innerHTML = '<div class="profile-placeholder">+</div>';
        }
        if (removeButton) removeButton.hidden = true;
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            validateSignupForm,
            applyEmailHelperState,
            isEmailAlreadyExistsMessage,
            EMAIL_HELPER_STATE,
            PROFILE_SYNC_FAILURE_MESSAGE
        };
    }
})();
