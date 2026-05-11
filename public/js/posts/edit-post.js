/**
 * Post edit page script
 */
(function initEditPostPage() {
    'use strict';

    let currentPostId = null;
    let uploadedImageFile = null;
    let existingImageUrl = null;

    document.addEventListener('DOMContentLoaded', async () => {
        const isReady = await ensureAuthenticated();
        if (!isReady) return;

        const pathParts = window.location.pathname.split('/');
        currentPostId = pathParts[2]; // /posts/:id/edit

        if (!currentPostId) {
            showToast('게시글 ID를 확인할 수 없습니다.', { type: 'error' });
            navigateTo('/posts');
            return;
        }

        const form = document.getElementById('editForm');
        const imageInput = document.getElementById('image');
        const imagePreview = document.getElementById('imagePreview');
        const previewImg = document.getElementById('previewImg');
        const imageLabel = document.getElementById('imageLabel');
        const currentImageName = document.getElementById('currentImageName');
        const btnRemoveImage = document.getElementById('btnRemoveImage');
        const confirmModal = document.getElementById('confirmModal');
        const btnConfirmModal = document.getElementById('btnConfirmModal');
        const titleInput = document.getElementById('title');
        const contentInput = document.getElementById('content');
        const tagsInput = document.getElementById('tags');
        const submitButton = document.getElementById('btnSubmit');

        bindDropdownMenu();
        bindHeaderEvents();
        await loadPostData();

        const DRAFT_KEY = `post_edit_${currentPostId}`;
        const draft = loadDraft(DRAFT_KEY);
        if (draft && (draft.title || draft.content || draft.tags)) {
            if (showConfirmDialog('작성 중이던 임시 저장된 수정본이 있습니다. 불러오시겠습니까?')) {
                if (titleInput && typeof draft.title === 'string') titleInput.value = draft.title;
                if (contentInput && typeof draft.content === 'string') {
                    contentInput.value = draft.content;
                    contentInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (tagsInput && typeof draft.tags === 'string') tagsInput.value = draft.tags;
            }
        }

        checkFormValid();

        function bindHeaderEvents() {
            titleInput.addEventListener('input', checkFormValid);
            contentInput.addEventListener('input', checkFormValid);
            if (tagsInput) {
                tagsInput.addEventListener('input', checkFormValid);
            }
        }

        function checkFormValid() {
            const title = titleInput.value.trim();
            const content = contentInput.value.trim();
            const tags = tagsInput ? tagsInput.value : '';
            setSubmitButtonState(submitButton, Boolean(title && content));

            saveDraft(`post_edit_${currentPostId}`, {
                title: titleInput.value,
                content: contentInput.value,
                tags
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
                existingImageUrl = null;

                const reader = new FileReader();
                reader.onload = (readEvent) => {
                    if (previewImg) previewImg.src = readEvent.target.result;
                    if (imagePreview) imagePreview.style.display = 'block';
                    if (imageLabel) imageLabel.textContent = '파일 선택';
                    if (currentImageName) currentImageName.textContent = file.name;
                };
                reader.readAsDataURL(file);
            });
        }

        if (btnRemoveImage) {
            btnRemoveImage.addEventListener('click', removeImage);
        }

        if (btnConfirmModal) {
            btnConfirmModal.addEventListener('click', () => {
                navigateTo(`/posts/${currentPostId}`);
            });
        }

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
                let nextImageUrl = existingImageUrl;

                if (uploadedImageFile) {
                    const uploadResult = await uploadImage(uploadedImageFile, 'post');
                    nextImageUrl = uploadResult && uploadResult.data
                        ? uploadResult.data.image_url
                        : uploadResult.image_url;
                }

                await updatePost(currentPostId, title, content, nextImageUrl, tags);
                clearDraft(`post_edit_${currentPostId}`);

                if (confirmModal) {
                    confirmModal.style.display = 'flex';
                }
            } catch (error) {
                handleApiError(error, {
                    fallbackMessage: '게시글 수정에 실패했습니다.'
                });
            } finally {
                submitButton.disabled = false;
            }
        });
    });

    async function loadPostData() {
        const titleInput = document.getElementById('title');
        const contentInput = document.getElementById('content');
        const tagsInput = document.getElementById('tags');
        const imagePreview = document.getElementById('imagePreview');
        const previewImg = document.getElementById('previewImg');
        const currentImageName = document.getElementById('currentImageName');

        try {
            const response = await getPost(currentPostId);
            const post = extractData(response);

            titleInput.value = post.title;
            contentInput.value = post.content;
            contentInput.dispatchEvent(new Event('input', { bubbles: true }));
            if (tagsInput) tagsInput.value = normalizePostTags(post.tags).join(', ');

            if (post.image_url) {
                existingImageUrl = post.image_url;
                if (previewImg) previewImg.src = resolveImageUrl(post.image_url);
                if (imagePreview) imagePreview.style.display = 'block';
                if (currentImageName) currentImageName.textContent = '기존 이미지';
            }
        } catch (error) {
            handleApiError(error, {
                fallbackMessage: '게시글을 불러오지 못했습니다.'
            });
            navigateTo('/posts');
        }
    }

    function removeImage() {
        uploadedImageFile = null;
        existingImageUrl = null;

        const imageInput = document.getElementById('image');
        const imagePreview = document.getElementById('imagePreview');
        const imageLabel = document.getElementById('imageLabel');
        const currentImageName = document.getElementById('currentImageName');

        if (imageInput) imageInput.value = '';
        if (imagePreview) imagePreview.style.display = 'none';
        if (imageLabel) imageLabel.textContent = '파일 선택';
        if (currentImageName) currentImageName.textContent = '';
    }

})();
