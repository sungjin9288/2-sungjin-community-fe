/**
 * Post detail page script
 */
(function initPostDetailPage() {
    'use strict';

    let currentPostId = null;
    let currentCommentId = null;
    let currentPost = null;
    let replyingToCommentId = null;

    document.addEventListener('DOMContentLoaded', async () => {
        const isReady = await ensureAuthenticated();
        if (!isReady) return;

        const pathParts = window.location.pathname.split('/');
        currentPostId = pathParts[pathParts.length - 1];

        bindDropdownMenu();
        bindActionButtons();
        bindModalEvents();
        bindCommentDelegation();

        await Promise.all([
            loadHeaderProfile(),
            loadPostDetail(),
            loadComments()
        ]);
    });

    function bindActionButtons() {
        const btnEditPost = document.getElementById('btnEditPost');
        const btnDeletePost = document.getElementById('btnDeletePost');
        const likeButton = document.getElementById('likeButton');
        const btnSubmitComment = document.getElementById('btnSubmitComment');
        const btnBookmarkToggle = document.getElementById('btnBookmarkToggle');
        const btnReportPost = document.getElementById('btnReportPost');
        const btnBlockAuthor = document.getElementById('btnBlockAuthor');
        const btnCancelReply = document.getElementById('btnCancelReply');

        if (btnEditPost) btnEditPost.addEventListener('click', () => navigateTo(`/posts/${currentPostId}/edit`));
        if (btnDeletePost) btnDeletePost.addEventListener('click', showDeleteModal);
        if (likeButton) likeButton.addEventListener('click', toggleLike);
        if (btnSubmitComment) btnSubmitComment.addEventListener('click', submitComment);
        if (btnBookmarkToggle) btnBookmarkToggle.addEventListener('click', toggleBookmark);
        if (btnReportPost) btnReportPost.addEventListener('click', () => reportTarget('post', Number(currentPostId)));
        if (btnBlockAuthor) btnBlockAuthor.addEventListener('click', handleBlockAuthor);
        if (btnCancelReply) btnCancelReply.addEventListener('click', clearReplyTarget);
    }

    function bindModalEvents() {
        const btnConfirmDelete = document.getElementById('btnConfirmDelete');
        const btnCancelDelete = document.getElementById('btnCancelDelete');
        const btnConfirmCommentModal = document.getElementById('btnConfirmCommentModal');
        const btnCancelCommentModal = document.getElementById('btnCancelCommentModal');

        if (btnConfirmDelete) btnConfirmDelete.addEventListener('click', confirmDeletePost);
        if (btnCancelDelete) btnCancelDelete.addEventListener('click', closeDeleteModal);
        if (btnConfirmCommentModal) btnConfirmCommentModal.addEventListener('click', confirmDeleteComment);
        if (btnCancelCommentModal) btnCancelCommentModal.addEventListener('click', closeCommentModal);

        ['deleteModal', 'commentModal'].forEach((modalId) => {
            const modal = document.getElementById(modalId);
            if (!modal) return;

            modal.addEventListener('click', (event) => {
                if (event.target === modal) {
                    modal.style.display = 'none';
                }
            });
        });
    }

    function bindCommentDelegation() {
        const commentsList = document.getElementById('commentsList');
        if (!commentsList) return;

        commentsList.addEventListener('click', async (event) => {
            const editButton = event.target.closest('.btn-comment-edit');
            const deleteButton = event.target.closest('.btn-comment-delete');
            const replyButton = event.target.closest('.btn-comment-reply');
            const reportButton = event.target.closest('.btn-comment-report');

            if (editButton) {
                editComment(editButton.dataset.id);
            }

            if (deleteButton) {
                showDeleteCommentModal(deleteButton.dataset.id);
            }

            if (replyButton) {
                setReplyTarget({
                    id: Number(replyButton.dataset.id),
                    author: replyButton.dataset.author || '사용자',
                });
            }

            if (reportButton) {
                await reportTarget('comment', Number(reportButton.dataset.id));
            }
        });
    }

    async function loadPostDetail() {
        try {
            const response = await getPost(currentPostId);
            const post = extractData(response);

            if (!post || !post.title) {
                throw new Error('게시글을 찾을 수 없습니다.');
            }

            currentPost = post;

            document.title = `${post.title} - 아무 말 대잔치`;
            updateMetaTag('og:title', document.title);
            updateMetaTag('og:description', typeof safeTruncate === 'function' ? safeTruncate(post.content || '', 120) : (post.content || '').substring(0, 120));
            if (post.image_url) {
                updateMetaTag('og:image', resolveImageUrl(post.image_url));
            }

            document.getElementById('postTitle').textContent = post.title;
            const postBodyContent = post.content || '';
            const postBodyContainer = document.getElementById('postBody');
            if (typeof renderMarkdownContent === 'function') {
                postBodyContainer.innerHTML = renderMarkdownContent(postBodyContent);
                postBodyContainer.classList.add('markdown-body');
            } else {
                postBodyContainer.textContent = postBodyContent;
            }
            document.getElementById('authorName').textContent = post.author_nickname || '익명';
            document.getElementById('postDate').textContent = formatDate(post.created_at || new Date().toISOString());

            const authorImage = document.getElementById('authorImage');
            if (authorImage) {
                authorImage.src = resolveImageUrl(post.author_profile_image, '/images/default-profile.png');
                authorImage.onerror = function onAuthorImageError() {
                    this.src = '/images/default-profile.png';
                };
            }

            const postImage = document.getElementById('postImage');
            if (postImage && post.image_url) {
                postImage.innerHTML = `<img src="${escapeHtml(resolveImageUrl(post.image_url))}" alt="게시글 이미지" loading="lazy">`;
                postImage.style.display = 'block';
            }

            document.getElementById('viewCount').textContent = formatStatCount(post.view_count || post.views || 0);
            document.getElementById('likeCount').textContent = formatStatCount(post.likes_count || 0);
            document.getElementById('commentCount').textContent = formatStatCount(post.comments_count || 0);

            const likeButton = document.getElementById('likeButton');
            const likeText = document.getElementById('likeText');
            if (likeButton && likeText) {
                likeButton.classList.toggle('active', Boolean(post.is_liked));
                likeText.textContent = post.is_liked ? '좋아요 취소' : '좋아요';
            }

            const bookmarkButton = document.getElementById('btnBookmarkToggle');
            if (bookmarkButton) {
                bookmarkButton.dataset.bookmarked = post.is_bookmarked ? 'true' : 'false';
                bookmarkButton.textContent = post.is_bookmarked ? '북마크 해제' : '북마크';
            }

            const postActions = document.getElementById('postActions');
            const btnMessageAuthor = document.getElementById('btnMessageAuthor');
            const btnReportPost = document.getElementById('btnReportPost');
            const btnBlockAuthor = document.getElementById('btnBlockAuthor');
            const currentUser = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
            const isAuthor = Boolean(post.is_author);

            if (postActions) {
                postActions.style.display = isAuthor ? 'flex' : 'none';
            }

            if (!isAuthor && post.user_id) {
                if (btnMessageAuthor) {
                    btnMessageAuthor.style.display = 'inline-flex';
                    btnMessageAuthor.onclick = () => navigateTo(`/messages?userId=${post.user_id}`);
                }
                if (btnReportPost) {
                    btnReportPost.style.display = 'inline-flex';
                }
                if (btnBlockAuthor && (!currentUser || Number(currentUser.id) !== Number(post.user_id))) {
                    btnBlockAuthor.style.display = 'inline-flex';
                }
            }
        } catch (error) {
            handleApiError(error, {
                fallbackMessage: '게시글을 불러오지 못했습니다.'
            });
            navigateTo('/posts');
        }
    }

    async function loadComments() {
        const container = document.getElementById('commentsList');
        if (!container) return;

        try {
            const response = await getComments(currentPostId);
            const comments = extractComments(response);
            renderComments(comments, container);
            document.getElementById('commentCount').textContent = formatStatCount(countComments(comments));
        } catch (error) {
            container.innerHTML = buildEmptyStateHtml('댓글을 불러오지 못했습니다.', 'message');
            handleApiError(error, {
                fallbackMessage: '댓글을 불러오는 중 오류가 발생했습니다.'
            });
        }
    }

    function extractComments(response) {
        if (!response) return [];
        if (Array.isArray(response.data)) return response.data;
        if (Array.isArray(response)) return response;
        return [];
    }

    function countComments(comments) {
        return comments.reduce((acc, comment) => acc + 1 + countComments(comment.replies || []), 0);
    }

    function buildCommentHtml(comment, depth = 0) {
        const isMyComment = Boolean(comment.is_author);
        const repliesHtml = Array.isArray(comment.replies) && comment.replies.length
            ? `<div class="comment-replies">${comment.replies.map((reply) => buildCommentHtml(reply, depth + 1)).join('')}</div>`
            : '';

        return `
            <div class="comment-item${depth > 0 ? ' is-reply' : ''}">
                <div class="comment-header">
                    <div class="comment-author">
                        <img
                            src="${escapeHtml(resolveImageUrl(comment.author_profile_image, '/images/default-profile.png'))}"
                            alt="프로필"
                            class="comment-avatar"
                            loading="lazy"
                            onerror="this.src='/images/default-profile.png'"
                        >
                        <div>
                            <div class="comment-name">${escapeHtml(comment.author_nickname || '익명')}</div>
                            <div class="comment-time">${escapeHtml(formatDate(comment.created_at || new Date().toISOString()))}</div>
                        </div>
                    </div>
                    <div class="comment-actions">
                        <button class="btn-comment-reply" data-id="${comment.id}" data-author="${escapeHtml(comment.author_nickname || '익명')}">답글</button>
                        ${isMyComment ? `
                            <button class="btn-comment-edit" data-id="${comment.id}">수정</button>
                            <button class="btn-comment-delete" data-id="${comment.id}">삭제</button>
                        ` : `
                            <button class="btn-comment-report" data-id="${comment.id}">신고</button>
                        `}
                    </div>
                </div>
                <div class="comment-content">${escapeHtml(comment.content || '')}</div>
                ${repliesHtml}
            </div>
        `;
    }

    function renderComments(comments, container) {
        if (!comments.length) {
            container.innerHTML = buildEmptyStateHtml('첫 댓글을 남겨보세요.', 'message');
            return;
        }

        container.innerHTML = comments.map((comment) => buildCommentHtml(comment)).join('');
    }

    function setReplyTarget(comment) {
        replyingToCommentId = Number(comment.id);
        const bar = document.getElementById('replyTargetBar');
        const text = document.getElementById('replyTargetText');
        if (bar) bar.style.display = 'flex';
        if (text) text.textContent = `${comment.author}님에게 답글 작성 중`;
        const input = document.getElementById('commentInput');
        if (input) {
            input.focus();
            input.placeholder = `${comment.author}님에게 답글을 입력해 주세요`;
        }
    }

    function clearReplyTarget() {
        replyingToCommentId = null;
        const bar = document.getElementById('replyTargetBar');
        const text = document.getElementById('replyTargetText');
        if (bar) bar.style.display = 'none';
        if (text) text.textContent = '답글 작성 중';
        const input = document.getElementById('commentInput');
        if (input) {
            input.placeholder = '댓글을 입력해 주세요';
        }
    }

    async function submitComment() {
        const input = document.getElementById('commentInput');
        const content = input.value.trim();

        if (!content) {
            showToast('댓글 내용을 입력해 주세요.', { type: 'warning' });
            return;
        }

        try {
            await createComment(currentPostId, content, replyingToCommentId);
            input.value = '';
            clearReplyTarget();
            await loadComments();
        } catch (error) {
            handleApiError(error, {
                fallbackMessage: '댓글 작성에 실패했습니다.'
            });
        }
    }

    async function editComment(commentId) {
        const newContent = window.prompt('댓글 내용을 수정해 주세요.');
        if (!newContent || !newContent.trim()) return;

        try {
            await updateComment(currentPostId, commentId, newContent.trim());
            await loadComments();
        } catch (error) {
            handleApiError(error, {
                fallbackMessage: '댓글 수정에 실패했습니다.'
            });
        }
    }

    async function reportTarget(targetType, targetId) {
        const description = window.prompt('신고 사유를 간단히 입력해 주세요.');
        if (description === null) return;

        try {
            await createReport(targetType, targetId, 'etc', description || '사용자 신고');
            showToast('신고가 접수되었습니다.');
        } catch (error) {
            handleApiError(error, {
                fallbackMessage: '신고 접수에 실패했습니다.'
            });
        }
    }

    async function handleBlockAuthor() {
        if (!currentPost || !currentPost.user_id) return;
        const confirmed = showConfirmDialog(`${currentPost.author_nickname}님을 차단하시겠습니까? 이후 해당 사용자의 글과 메시지를 숨깁니다.`);
        if (!confirmed) return;

        try {
            await blockUser(currentPost.user_id);
            showToast('작성자를 차단했습니다.');
            navigateTo('/posts');
        } catch (error) {
            handleApiError(error, {
                fallbackMessage: '작성자 차단에 실패했습니다.'
            });
        }
    }

    async function toggleBookmark() {
        const button = document.getElementById('btnBookmarkToggle');
        if (!button) return;
        const isBookmarked = button.dataset.bookmarked === 'true';

        try {
            if (isBookmarked) {
                await unbookmarkPost(currentPostId);
                button.dataset.bookmarked = 'false';
                button.textContent = '북마크';
            } else {
                await bookmarkPost(currentPostId);
                button.dataset.bookmarked = 'true';
                button.textContent = '북마크 해제';
            }
        } catch (error) {
            handleApiError(error, {
                fallbackMessage: '북마크 처리에 실패했습니다.'
            });
        }
    }

    function showDeleteCommentModal(commentId) {
        currentCommentId = commentId;
        const modal = document.getElementById('commentModal');
        if (modal) modal.style.display = 'flex';
    }

    async function confirmDeleteComment() {
        if (!currentCommentId) return;

        try {
            await deleteComment(currentPostId, currentCommentId);
            closeCommentModal();
            await loadComments();
        } catch (error) {
            handleApiError(error, {
                fallbackMessage: '댓글 삭제에 실패했습니다.'
            });
        }
    }

    function closeCommentModal() {
        const modal = document.getElementById('commentModal');
        if (modal) modal.style.display = 'none';
        currentCommentId = null;
    }

    function showDeleteModal() {
        const modal = document.getElementById('deleteModal');
        if (modal) modal.style.display = 'flex';
    }

    function closeDeleteModal() {
        const modal = document.getElementById('deleteModal');
        if (modal) modal.style.display = 'none';
    }

    async function confirmDeletePost() {
        try {
            await deletePost(currentPostId);
            showToast('게시글이 삭제되었습니다.', { type: 'success' });
            navigateTo('/posts');
        } catch (error) {
            closeDeleteModal();
            handleApiError(error, {
                fallbackMessage: '게시글 삭제에 실패했습니다.'
            });
        }
    }

    async function toggleLike() {
        const button = document.getElementById('likeButton');
        const text = document.getElementById('likeText');
        const count = document.getElementById('likeCount');

        const isLiked = button.classList.contains('active');

        try {
            if (isLiked) {
                await unlikePost(currentPostId);
                button.classList.remove('active');
                text.textContent = '좋아요';
                count.textContent = String(Math.max(0, Number(count.textContent || 0) - 1));
            } else {
                await likePost(currentPostId);
                button.classList.add('active');
                text.textContent = '좋아요 취소';
                count.textContent = String(Number(count.textContent || 0) + 1);
            }
        } catch (error) {
            handleApiError(error, {
                fallbackMessage: '좋아요 처리에 실패했습니다.'
            });
        }
    }

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { extractComments, countComments, buildCommentHtml };
    }
})();
