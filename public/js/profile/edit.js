/**
 * Profile edit page script
 */
(function initProfileEditPage() {
    'use strict';

    let profileImageFile = null;
    let profileImageUrl = null;

    document.addEventListener('DOMContentLoaded', async () => {
        const isReady = await ensureAuthenticated();
        if (!isReady) return;

        await loadUserProfile();

        const form = document.getElementById('profileEditForm');
        const profileInput = document.getElementById('profileImage');
        const previewImage = document.getElementById('previewImage');
        const btnSelectImage = document.getElementById('btnSelectImage');
        const nicknameInput = document.getElementById('nickname');
        const submitButton = document.getElementById('btnSubmit');

        bindDropdownMenu();
        bindWithdrawModal();

        if (btnSelectImage) {
            btnSelectImage.addEventListener('click', () => {
                profileInput.click();
            });
        }

        if (profileInput) {
            setupImageDragAndDrop(profileInput);
            profileInput.addEventListener('change', (event) => {
                const file = event.target.files && event.target.files[0];
                if (!file) return;

                const validation = validateImageFile(file);
                if (!validation.valid) {
                    showToast(validation.message, { type: 'error' });
                    profileInput.value = '';
                    return;
                }

                profileImageFile = file;

                const reader = new FileReader();
                reader.onload = (readEvent) => {
                    previewImage.src = readEvent.target.result;
                };
                reader.readAsDataURL(file);
            });
        }

        nicknameInput.addEventListener('input', () => {
            const nickname = nicknameInput.value.trim();
            setSubmitButtonState(submitButton, validateNickname(nickname));
        });

        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const nicknameError = document.getElementById('nicknameError');
            nicknameError.textContent = '';
            nicknameError.style.display = 'none';

            const nickname = nicknameInput.value.trim();
            if (!validateNickname(nickname)) {
                nicknameError.textContent = '닉네임은 1~10자 사이여야 합니다.';
                nicknameError.style.display = 'block';
                return;
            }

            submitButton.disabled = true;

            try {
                if (profileImageFile) {
                    const uploadResult = await uploadImage(profileImageFile, 'profile');
                    profileImageUrl = uploadResult && uploadResult.data
                        ? uploadResult.data.image_url
                        : uploadResult.image_url;
                }

                const response = await updateProfile(nickname, profileImageUrl);
                const updatedUser = extractData(response);
                if (updatedUser) {
                    setCurrentUser(updatedUser);
                }

                showToast('회원정보가 수정되었습니다.', { type: 'success' });
                navigateTo('/posts');
            } catch (error) {
                handleApiError(error, {
                    fallbackMessage: '회원정보 수정에 실패했습니다.'
                });
            } finally {
                submitButton.disabled = false;
            }
        });
    });

    function bindWithdrawModal() {
        const btnWithdraw = document.getElementById('btnWithdraw');
        const withdrawModal = document.getElementById('withdrawModal');
        const btnCancelWithdraw = document.getElementById('btnCancelWithdraw');
        const btnConfirmWithdraw = document.getElementById('btnConfirmWithdraw');

        if (btnWithdraw && withdrawModal) {
            btnWithdraw.addEventListener('click', () => {
                withdrawModal.style.display = 'flex';
            });
        }

        if (btnCancelWithdraw && withdrawModal) {
            btnCancelWithdraw.addEventListener('click', () => {
                withdrawModal.style.display = 'none';
            });
        }

        if (btnConfirmWithdraw && withdrawModal) {
            btnConfirmWithdraw.addEventListener('click', async () => {
                try {
                    await withdrawUser();
                    showToast('회원 탈퇴가 완료되었습니다.', { type: 'success' });
                    navigateTo('/login');
                } catch (error) {
                    handleApiError(error, {
                        fallbackMessage: '회원 탈퇴 처리에 실패했습니다.'
                    });
                } finally {
                    withdrawModal.style.display = 'none';
                }
            });
        }
    }

    async function loadUserProfile() {
        try {
            const response = await getMe();
            const user = extractData(response);
            setCurrentUser(user);

            const emailInput = document.getElementById('email');
            const nicknameInput = document.getElementById('nickname');
            const previewImage = document.getElementById('previewImage');
            const headerProfileImage = document.getElementById('headerProfileImage');

            if (emailInput) emailInput.value = user.email || '';
            if (nicknameInput) nicknameInput.value = user.nickname || '';

            const resolvedUrl = resolveImageUrl(user.profile_image_url);
            if (resolvedUrl && previewImage) previewImage.src = resolvedUrl;
            if (resolvedUrl && headerProfileImage) headerProfileImage.src = resolvedUrl;
        } catch (error) {
            handleApiError(error, {
                fallbackMessage: '사용자 정보를 불러오지 못했습니다.'
            });
        }
    }
})();
