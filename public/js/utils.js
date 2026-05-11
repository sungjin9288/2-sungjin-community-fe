/**
 * Shared utility helpers.
 * All common functions consolidated here to eliminate duplication.
 */

// ===========================
// Theme Management
// ===========================

(function initTheme() {
    if (typeof window === 'undefined') return;
    const savedTheme = localStorage.getItem('theme');
    const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
    const theme = savedTheme || (prefersLight ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
})();

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    
    // Dispatch event so other components (like header) can update icons if needed
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme: next } }));
    return next;
}

// ===========================
// Navigation
// ===========================

function navigateTo(path) {
    window.location.href = path;
}

// ===========================
// Delegated Click Handlers
// ===========================

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        setupPasswordToggles();
        setupScrollToTop();

        // Register Service Worker for PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('ServiceWorker registration successful with scope: ', registration.scope);
                })
                .catch(err => {
                    console.error('ServiceWorker registration failed: ', err);
                });
        }

        document.body.addEventListener('input', (event) => {
            const target = event.target;
            if (target.tagName.toLowerCase() === 'textarea' && target.classList.contains('auto-resize')) {
                // To smoothly recalculate, briefly reset height, then set to scrollHeight
                target.style.height = 'auto';
                target.style.height = target.scrollHeight + 'px';
            }
        });

        document.body.addEventListener('click', (event) => {
            const navigateTarget = event.target.closest('[data-navigate]');
            const logoutTarget = event.target.closest('[data-logout]');
            const backTarget = event.target.closest('[data-history-back]');
            const themeToggleTarget = event.target.closest('[data-theme-toggle]');

            if (navigateTarget) {
                event.preventDefault();
                navigateTo(navigateTarget.dataset.navigate);
            }

            if (themeToggleTarget) {
                event.preventDefault();
                toggleTheme();
            }

            if (logoutTarget) {
                event.preventDefault();
                if (typeof handleLogout === 'function') {
                    handleLogout();
                }
            }

            if (backTarget) {
                event.preventDefault();
                window.history.back();
            }
        });
    });
}

// ===========================
// Formatting
// ===========================

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '방금 전';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}분 전`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}시간 전`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}일 전`;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function truncateText(text, maxLength = 100) {
    const safeText = String(text || '');
    if (safeText.length <= maxLength) return safeText;
    return `${safeText.slice(0, maxLength)}...`;
}

function formatNumber(num) {
    return Number(num || 0).toLocaleString('ko-KR');
}

function formatStatCount(value) {
    const count = Number(value || 0);
    if (count >= 1000000) return `${(count / 1000000).toFixed(1).replace('.0', '')}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1).replace('.0', '')}K`;
    return String(count);
}

// ===========================
// Safe Wrappers (for use in HTML builders)
// ===========================

function safeEscape(value) {
    if (typeof escapeHtml === 'function' && safeEscape !== escapeHtml) {
        return escapeHtml(value);
    }
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function safeTruncate(value, maxLength) {
    return truncateText(value, maxLength);
}

function safeFormatDate(value) {
    return formatDate(value);
}

// ===========================
// Validation
// ===========================

function validateEmail(email) {
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return regex.test(String(email || ''));
}

function validatePassword(password) {
    const pw = String(password || '');
    if (pw.length < 8 || pw.length > 20) return false;
    return /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*#?&])/.test(pw);
}

function validatePasswordComplex(password) {
    const value = String(password || '');
    const isLengthValid = value.length >= 8 && value.length <= 20;
    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumber = /[0-9]/.test(value);
    const hasSpecial = /[!@#$%^&*(),.?"':{}|<>]/.test(value);

    return {
        valid: isLengthValid && hasUpperCase && hasLowerCase && hasNumber && hasSpecial
    };
}

function validateNickname(nickname) {
    const safeNickname = String(nickname || '').trim();
    return safeNickname.length >= 1 && safeNickname.length <= 10 && !safeNickname.includes(' ');
}

function validateImageFile(file, options = {}) {
    const maxSize = options.maxSize || 5 * 1024 * 1024;
    const maxSizeLabel = options.maxSizeLabel || '5MB';

    if (!file) {
        return { valid: false, message: '파일을 선택해 주세요.' };
    }

    if (file.size > maxSize) {
        return { valid: false, message: `이미지 크기는 ${maxSizeLabel} 이하여야 합니다.` };
    }

    if (!file.type.startsWith('image/')) {
        return { valid: false, message: '이미지 파일만 업로드 가능합니다.' };
    }

    return { valid: true, message: '' };
}

// ===========================
// Tag Helpers
// ===========================

function parseTagsInput(value) {
    if (!value) return [];
    const tags = value
        .split(',')
        .map((tag) => tag.trim().replace(/^#/, ''))
        .filter(Boolean);
    return [...new Set(tags)].slice(0, 5);
}

function normalizePostTags(tags) {
    if (!Array.isArray(tags)) return [];
    return [...new Set(tags
        .map((tag) => {
            if (typeof tag === 'string') return tag.trim().replace(/^#/, '');
            if (tag && typeof tag.name === 'string') return tag.name.trim().replace(/^#/, '');
            return '';
        })
        .filter(Boolean)
    )];
}

// ===========================
// DOM Helpers
// ===========================

function createElement(tag, className, textContent = '') {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (textContent) element.textContent = textContent;
    return element;
}

function escapeHtml(text) {
    if (typeof document !== 'undefined') {
        const div = document.createElement('div');
        div.textContent = String(text || '');
        return div.innerHTML;
    }
    return String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderMarkdownContent(text) {
    const source = String(text || '').replace(/\r\n/g, '\n');
    const lines = source.split('\n');
    const output = [];
    let inList = false;

    function closeList() {
        if (inList) {
            output.push('</ul>');
            inList = false;
        }
    }

    function renderInline(value) {
        return escapeHtml(value)
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
            .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    }

    lines.forEach((rawLine) => {
        const trimmed = rawLine.trim();
        if (!trimmed) {
            closeList();
            output.push('<br>');
            return;
        }

        const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
        if (heading) {
            closeList();
            const level = heading[1].length + 1;
            output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
            return;
        }

        const listItem = /^[-*]\s+(.+)$/.exec(trimmed);
        if (listItem) {
            if (!inList) {
                output.push('<ul>');
                inList = true;
            }
            output.push(`<li>${renderInline(listItem[1])}</li>`);
            return;
        }

        closeList();
        output.push(`<p>${renderInline(rawLine)}</p>`);
    });

    closeList();
    return output.join('');
}

function setupPasswordToggles() {
    if (typeof document === 'undefined') return;
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    
    passwordInputs.forEach(input => {
        // Prevent double-wrapping if called multiple times or dynamically added
        if (input.parentElement && input.parentElement.classList.contains('password-input-wrapper')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'password-input-wrapper';
        
        input.parentNode.insertBefore(wrapper, input);
        wrapper.appendChild(input);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'password-toggle-btn';
        btn.tabIndex = -1;
        btn.setAttribute('aria-label', '비밀번호 표시 토글');
        
        btn.innerHTML = `
            <svg class="icon-eye-off" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
            <svg class="icon-eye" style="display: none;" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
            </svg>
        `;

        wrapper.appendChild(btn);

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.querySelector('.icon-eye-off').style.display = isPassword ? 'none' : 'block';
            btn.querySelector('.icon-eye').style.display = isPassword ? 'block' : 'none';
        });
    });
}

// ===========================
// Error / Success / Loading / Empty UI
// ===========================

function buildEmptyStateHtml(message, iconType = 'default') {
    const icons = {
        default: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`,
        doc: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`,
        message: `<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`
    };
    
    const svg = icons[iconType] || icons.default;
    
    return `
        <div class="empty-state">
            <div class="empty-state-icon">${svg}</div>
            <div class="empty-state-text">${message}</div>
        </div>
    `;
}

function showError(message, containerId = 'errorContainer') {
    const container = document.getElementById(containerId);
    if (!container) {
        alert(message);
        return;
    }

    container.innerHTML = `<div class="error">${message}</div>`;
    setTimeout(() => {
        container.innerHTML = '';
    }, 5000);
}

function showSuccess(message, containerId = 'successContainer') {
    const container = document.getElementById(containerId);
    if (!container) {
        alert(message);
        return;
    }

    container.innerHTML = `<div class="success">${message}</div>`;
    setTimeout(() => {
        container.innerHTML = '';
    }, 3000);
}

function showLoading(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<div class="loading">로딩 중...</div>';
}

function hideLoading(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
}

function appendLoadingIndicator(container, id, message) {
    removeLoadingIndicator(id);
    const loading = document.createElement('div');
    loading.className = 'loading loading-more';
    loading.id = id;
    loading.textContent = message;
    container.appendChild(loading);
}

function removeLoadingIndicator(id) {
    const loading = document.getElementById(id);
    if (loading) loading.remove();
}

// ===========================
// Field Error Helpers (unified signature)
// ===========================

/**
 * Show a field error by element ID or reference.
 * @param {string|HTMLElement} target - error element ID or the element itself
 * @param {string} message - error message to display
 */
function showFieldError(target, message) {
    const element = typeof target === 'string' ? document.getElementById(target) : target;
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
}

/**
 * Hide/clear a field error by element ID or reference.
 * @param {string|HTMLElement} target - error element ID or the element itself
 */
function hideFieldError(target) {
    const element = typeof target === 'string' ? document.getElementById(target) : target;
    if (!element) return;
    element.textContent = '';
    element.classList.remove('show');
}

// ===========================
// Toast
// ===========================

function showToast(message, options = {}) {
    // Backward compatibility for old calls: showToast("msg", 3000)
    let duration = 3000;
    let type = 'success';
    
    if (typeof options === 'number') {
        duration = options;
    } else if (typeof options === 'object' && options !== null) {
        duration = options.duration || 3000;
        type = options.type || 'success';
    }

    const currentToast = document.querySelector('.toast');
    if (currentToast) {
        currentToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = String(message || '');
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('show');
    }, 10);

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, duration);
}

function showConfirmDialog(message) {
    return window.confirm(message);
}

// ===========================
// API Error Helpers
// ===========================

function resolveApiError(error, fallbackMessage = '요청 처리 중 오류가 발생했습니다.') {
    if (!error) {
        return {
            message: fallbackMessage,
            category: 'unknown'
        };
    }

    const status = Number(error.status || 0);
    const category = error.category || (
        status === 401 ? 'auth'
            : status === 403 ? 'forbidden'
                : (status === 400 || status === 422) ? 'validation'
                    : status === 0 ? 'network'
                        : status >= 500 ? 'server'
                            : 'unknown'
    );

    return {
        message: error.message || fallbackMessage,
        category
    };
}

function handleApiError(error, options = {}) {
    const {
        fallbackMessage = '요청 처리 중 오류가 발생했습니다.',
        containerId = null,
        redirectOnAuth = true,
        silent = false
    } = options;

    const resolved = resolveApiError(error, fallbackMessage);

    if (!silent) {
        if (containerId) {
            showError(resolved.message, containerId);
        } else {
            showToast(resolved.message, { type: 'error' });
        }
    }

    if (resolved.category === 'auth' && redirectOnAuth && window.location.pathname !== '/login') {
        setTimeout(() => {
            navigateTo('/login');
        }, 200);
    }

    return resolved;
}

function showAuthNotice(containerId = 'errorContainer') {
    if (typeof popAuthNotice !== 'function') return;
    const notice = popAuthNotice();
    if (!notice) return;

    const container = document.getElementById(containerId);
    if (container) {
        showError(notice, containerId);
    } else {
        showToast(notice, { type: 'info', duration: 5000 });
    }
}

// ===========================
// API Response Extraction
// ===========================

function extractData(response, fallback = null) {
    if (!response) return fallback;
    return response.data !== undefined ? response.data : response;
}

// ===========================
// URL Helpers
// ===========================

function resolveImageUrl(imageUrl, fallback = '') {
    if (!imageUrl) return fallback || '/images/default-profile.png';
    if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
    return typeof toApiUrl === 'function' ? toApiUrl(imageUrl) : imageUrl;
}

// ===========================
// Storage
// ===========================

const storage = {
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Storage set error:', error);
            return false;
        }
    },

    get(key, defaultValue = null) {
        try {
            const value = localStorage.getItem(key);
            return value ? JSON.parse(value) : defaultValue;
        } catch (error) {
            console.error('Storage get error:', error);
            return defaultValue;
        }
    },

    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Storage remove error:', error);
            return false;
        }
    },

    clear() {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('Storage clear error:', error);
            return false;
        }
    }
};

// ===========================
// Misc Helpers
// ===========================

function debounce(func, wait = 300) {
    let timeoutId = null;
    return function debounced(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func(...args), wait);
    };
}

function getQueryParam(param) {
    const params = new URLSearchParams(window.location.search);
    return params.get(param);
}

// ===========================
// Common UI Components
// ===========================

function bindDropdownMenu(btnId, menuId) {
    const btnMenu = document.getElementById(btnId || 'btnMenu');
    const dropdownMenu = document.getElementById(menuId || 'dropdownMenu');
    if (!btnMenu || !dropdownMenu) return;

    btnMenu.addEventListener('click', (event) => {
        event.stopPropagation();
        dropdownMenu.classList.toggle('show');
    });

    document.addEventListener('click', () => {
        dropdownMenu.classList.remove('show');
    });
}

async function loadHeaderProfile() {
    try {
        const response = await getMe();
        const user = extractData(response);
        if (typeof setCurrentUser === 'function') {
            setCurrentUser(user);
        }

        const headerImage = document.getElementById('headerProfileImage');
        if (!headerImage) return user;

        headerImage.src = resolveImageUrl(user && user.profile_image_url, '/images/default-profile.png');
        headerImage.onerror = function onHeaderImageError() {
            this.src = '/images/default-profile.png';
        };
        await refreshHeaderIndicators();
        return user;
    } catch (error) {
        console.debug('Failed to load header profile:', error.message);
        return null;
    }
}

async function refreshHeaderIndicators() {
    const notificationBadge = document.getElementById('headerNotificationBadge');
    const messageBadge = document.getElementById('headerMessageCount');

    if (!notificationBadge && !messageBadge) return;

    const [notificationResult, messageResult] = await Promise.allSettled([
        typeof getUnreadNotificationCount === 'function' ? getUnreadNotificationCount() : null,
        typeof getUnreadMessageCount === 'function' ? getUnreadMessageCount() : null
    ]);

    const notificationCount = notificationResult.status === 'fulfilled'
        ? Number(extractData(notificationResult.value, {}).unread_count || 0)
        : 0;
    const messageCount = messageResult.status === 'fulfilled'
        ? Number(extractData(messageResult.value, {}).unread_count || 0)
        : 0;

    if (notificationBadge) {
        notificationBadge.hidden = notificationCount <= 0;
        notificationBadge.textContent = String(notificationCount);
    }

    if (messageBadge) {
        messageBadge.hidden = messageCount <= 0;
        messageBadge.textContent = String(messageCount);
    }
}

// ===========================
// Button State
// ===========================

function setSubmitButtonState(button, isReady) {
    if (!button) return;
    button.classList.toggle('btn-submit-ready', isReady);
    button.classList.toggle('btn-submit-disabled', !isReady);
}

// ===========================
// Auth
// ===========================

async function handleLogout() {
    try {
        await logout();
        navigateTo('/login');
    } catch (error) {
        console.error('Logout failed:', error);
        showToast('로그아웃 중 문제가 발생했습니다.', { type: 'error' });
    }
}

// ===========================
// Draft Storage
// ===========================

function saveDraft(key, data) {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(`draft_${key}`, JSON.stringify(data));
    }
}

function loadDraft(key) {
    if (typeof sessionStorage !== 'undefined') {
        const item = sessionStorage.getItem(`draft_${key}`);
        if (item) {
            try {
                return JSON.parse(item);
            } catch (e) {
                console.error('Draft parse error', e);
            }
        }
    }
    return null;
}

function clearDraft(key) {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(`draft_${key}`);
    }
}

// ===========================
// Scroll to Top FAB
// ===========================

function setupScrollToTop() {
    if (typeof document === 'undefined') return;

    const btn = document.createElement('button');
    btn.className = 'scroll-to-top-btn';
    btn.setAttribute('aria-label', '최상단으로 가기');
    btn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7" />
        </svg>
    `;

    document.body.appendChild(btn);

    const onScroll = debounce(() => {
        if (window.scrollY > 300) {
            btn.classList.add('visible');
        } else {
            btn.classList.remove('visible');
        }
    }, 100);

    window.addEventListener('scroll', onScroll);

    btn.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// ===========================
// Drag & Drop / Paste
// ===========================

function setupImageDragAndDrop(inputElement) {
    if (!inputElement || typeof document === 'undefined') return;

    function assignFileToInput(file) {
        if (!file.type.startsWith('image/')) return;
        try {
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(file);
            inputElement.files = dataTransfer.files;
            inputElement.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (e) {
            console.warn('DataTransfer not supported', e);
        }
    }

    document.addEventListener('paste', (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                assignFileToInput(items[i].getAsFile());
                break;
            }
        }
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        const files = e.dataTransfer && e.dataTransfer.files;
        if (files && files.length > 0) {
            assignFileToInput(files[0]);
        }
    });
}

// ===========================
// Page Scroll & State Restoration
// ===========================

function savePageScrollState(key, stateData) {
    if (typeof sessionStorage !== 'undefined') {
        const payload = {
            state: stateData,
            scrollY: window.scrollY || document.documentElement.scrollTop
        };
        sessionStorage.setItem(`scroll_state_${key}`, JSON.stringify(payload));
    }
}

function loadPageScrollState(key) {
    if (typeof sessionStorage !== 'undefined') {
        const item = sessionStorage.getItem(`scroll_state_${key}`);
        if (item) {
            try {
                return JSON.parse(item);
            } catch (e) {
                console.error(e);
            }
        }
    }
    return null;
}

function clearPageScrollState(key) {
    if (typeof sessionStorage !== 'undefined') {
        sessionStorage.removeItem(`scroll_state_${key}`);
    }
}

// ===========================
// Exports
// ===========================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        toggleTheme,
        formatDate,
        truncateText,
        validateEmail,
        validatePassword,
        validatePasswordComplex,
        validateNickname,
        validateImageFile,
        formatNumber,
        formatStatCount,
        escapeHtml,
        renderMarkdownContent,
        safeEscape,
        safeTruncate,
        safeFormatDate,
        resolveApiError,
        resolveImageUrl,
        buildEmptyStateHtml,
        extractData,
        parseTagsInput,
        normalizePostTags,
        setupImageDragAndDrop,
        savePageScrollState,
        loadPageScrollState,
        clearPageScrollState,
        showFieldError,
        hideFieldError,
        setSubmitButtonState,
        debounce,
        refreshHeaderIndicators
    };
}
