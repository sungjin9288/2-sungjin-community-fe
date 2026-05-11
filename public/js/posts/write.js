/**
 * Post write page script
 */
(function initWritePage() {
    'use strict';

    let uploadedImageFile = null;
    const DRAFT_KEY = 'post_write';

    document.addEventListener('DOMContentLoaded', async () => {
        const isReady = await ensureAuthenticated();
        if (!isReady) return;

        const form = document.getElementById('writeForm');
        const imageInput = document.getElementById('image');
        const imagePreview = document.getElementById('imagePreview');
        const previewImg = document.getElementById('previewImg');
        const imageLabel = document.getElementById('imageLabel');
        const btnRemoveImage = document.getElementById('btnRemoveImage');
        const confirmModal = document.getElementById('confirmModal');
        const btnConfirmModal = document.getElementById('btnConfirmModal');
        const titleInput = document.getElementById('title');
        const contentInput = document.getElementById('content');
        const tagsInput = document.getElementById('tags');
        const submitButton = form.querySelector('button[type="submit"]');
        const helperText = document.getElementById('formHelper');

        setSubmitButtonState(submitButton, false);

        if (titleInput) {
            titleInput.maxLength = 26;
            titleInput.addEventListener('input', () => {
                if (titleInput.value.length > 26) {
                    titleInput.value = titleInput.value.slice(0, 26);
                }
                validateAndUpdateButton();
            });
        }

        if (contentInput) {
            contentInput.addEventListener('input', validateAndUpdateButton);
        }

        if (tagsInput) {
            tagsInput.addEventListener('input', validateAndUpdateButton);
        }

        // Restore draft if exists
        const draft = loadDraft(DRAFT_KEY);
        if (draft && (draft.title || draft.content || draft.tags)) {
            if (showConfirmDialog('작성 중이던 임시 저장된 글이 있습니다. 불러오시겠습니까?')) {
                if (titleInput && draft.title) titleInput.value = draft.title;
                if (contentInput && draft.content) {
                    contentInput.value = draft.content;
                    contentInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (tagsInput && draft.tags) tagsInput.value = draft.tags;
                validateAndUpdateButton();
            }
        }

        function validateAndUpdateButton() {
            const title = titleInput ? titleInput.value.trim() : '';
            const content = contentInput ? contentInput.value.trim() : '';
            const isReady = Boolean(title && content);

            setSubmitButtonState(submitButton, isReady);
            if (helperText) helperText.style.display = isReady ? 'none' : 'block';

            // Auto-save
            saveDraft(DRAFT_KEY, {
                title: titleInput ? titleInput.value : '',
                content: contentInput ? contentInput.value : '',
                tags: tagsInput ? tagsInput.value : ''
            });
        }

        if (imageInput) {
            setupImageDragAndDrop(imageInput);
            imageInput.addEventListener('change', (event) => {
                const file = event.target.files && event.target.files[0];
                if (!file) return;

                const validation = validateImageFile(file);
                if (!validation.valid) {
                    showToast(validation.message, { type: 'error' });
                    imageInput.value = '';
                    return;
                }

                uploadedImageFile = file;
                const reader = new FileReader();
                reader.onload = (readEvent) => {
                    if (previewImg) previewImg.src = readEvent.target.result;
                    if (imagePreview) imagePreview.style.display = 'block';
                    if (imageLabel) imageLabel.textContent = file.name;
                };
                reader.readAsDataURL(file);
            });
        }

        if (btnRemoveImage) {
            btnRemoveImage.addEventListener('click', removeImage);
        }

        if (btnConfirmModal) {
            btnConfirmModal.addEventListener('click', () => {
                window.location.href = '/posts';
            });
        }

        if (form) {
            form.addEventListener('submit', async (event) => {
                event.preventDefault();

                const title = titleInput.value.trim();
                const content = contentInput.value.trim();
                const tags = parseTagsInput(tagsInput ? tagsInput.value : '');

                if (!title) {
                    showToast('제목을 입력해 주세요.', { type: 'warning' });
                    return;
                }

                if (!content) {
                    showToast('내용을 입력해 주세요.', { type: 'warning' });
                    return;
                }

                submitButton.disabled = true;

                try {
                    let imageUrl = null;

                    if (uploadedImageFile) {
                        const uploadResult = await uploadImage(uploadedImageFile, 'post');
                        imageUrl = uploadResult && uploadResult.data
                            ? uploadResult.data.image_url
                            : uploadResult.image_url;
                    }

                    await createPost(title, content, imageUrl, tags);
                    clearDraft(DRAFT_KEY);

                    if (confirmModal) {
                        confirmModal.style.display = 'flex';
                    }
                } catch (error) {
                    handleApiError(error, {
                        fallbackMessage: '게시글 작성에 실패했습니다.'
                    });
                } finally {
                    submitButton.disabled = false;
                }
            });
        }
    });

    function removeImage() {
        uploadedImageFile = null;

        const imageInput = document.getElementById('image');
        const imagePreview = document.getElementById('imagePreview');
        const imageLabel = document.getElementById('imageLabel');

        if (imageInput) imageInput.value = '';
        if (imagePreview) imagePreview.style.display = 'none';
        if (imageLabel) imageLabel.textContent = '파일을 선택해 주세요';
    }

})();
