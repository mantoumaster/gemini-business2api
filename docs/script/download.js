// ==UserScript==
// @name         Gemini Business Import JSON Helper
// @version      2.1.0
// @description  Copy import-ready gemini-business2api account JSON. Shift+Click downloads a file.
// @match        https://business.gemini.google/*
// @grant        GM_addStyle
// @grant        GM_cookie
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  'use strict';

  const BUTTON_ID = 'gb-btn';
  const DEFAULT_LABEL = 'Copy JSON';
  const COPY_LABEL = 'Copied';
  const DOWNLOAD_LABEL = 'Saved';
  const ERROR_LABEL = 'Error';
  const DEFAULT_TITLE = 'Click to copy import-ready JSON. Shift+Click downloads a file.';

  GM_addStyle(`
    #${BUTTON_ID} {
      position: fixed;
      right: 32px;
      bottom: 32px;
      min-width: 86px;
      height: 44px;
      padding: 0 14px;
      border: none;
      border-radius: 999px;
      background: linear-gradient(135deg, #1a73e8, #1557b0);
      box-shadow: 0 10px 26px rgba(26, 115, 232, 0.28);
      cursor: pointer;
      z-index: 9999;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.02em;
      transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
      user-select: none;
    }

    #${BUTTON_ID}:hover {
      transform: translateY(-1px);
      box-shadow: 0 12px 30px rgba(26, 115, 232, 0.32);
    }

    #${BUTTON_ID}:active {
      transform: translateY(0);
    }
  `);

  const button = document.createElement('button');
  button.id = BUTTON_ID;
  button.type = 'button';
  button.textContent = DEFAULT_LABEL;
  button.title = DEFAULT_TITLE;
  document.body.appendChild(button);

  let resetTimer = null;

  const setButtonState = (label, background, title = DEFAULT_TITLE) => {
    button.textContent = label;
    button.title = title;
    button.style.background = background;
  };

  const flashButtonState = (label, background, title = DEFAULT_TITLE) => {
    if (resetTimer) {
      clearTimeout(resetTimer);
      resetTimer = null;
    }

    setButtonState(label, background, title);
    resetTimer = window.setTimeout(() => {
      setButtonState(DEFAULT_LABEL, 'linear-gradient(135deg, #1a73e8, #1557b0)', DEFAULT_TITLE);
      resetTimer = null;
    }, 1600);
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date((timestamp - 43200) * 1000);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  };

  const sanitizeFileName = (value) => {
    const safe = String(value || 'account').trim().replace(/[\\/:*?"<>|]+/g, '_');
    return safe || 'account';
  };

  const buildImportRecord = ({ email, csesidx, configId, secureCSes, hostCOses, expiresAt }) => ({
    id: email,
    secure_c_ses: secureCSes,
    csesidx,
    config_id: configId,
    host_c_oses: hostCOses || '',
    expires_at: expiresAt || '',
  });

  const buildImportJson = (record) => JSON.stringify([record], null, 2);

  const download = (content, filename) => {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = async (text) => {
    if (typeof GM_setClipboard === 'function') {
      GM_setClipboard(text, 'text');
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  };

  const getEmail = () => {
    let email = localStorage.getItem('gemini_user_email');
    if (!email) {
      email = window.prompt('Enter the account email to build import JSON:', '') || '';
      email = email.trim();
      if (email) {
        localStorage.setItem('gemini_user_email', email);
      }
    }
    return email?.trim() || '';
  };

  button.addEventListener('click', (event) => {
    const pathParts = window.location.pathname.split('/');
    const cidIndex = pathParts.indexOf('cid');
    const configId = (cidIndex !== -1 && pathParts[cidIndex + 1]) || '';
    const csesidx = new URLSearchParams(window.location.search).get('csesidx') || '';
    const email = getEmail();
    const shouldDownload = event.shiftKey === true;

    GM_cookie('list', {}, async (cookies, error) => {
      try {
        if (error || !configId || !csesidx || !email) {
          throw new Error('Missing config_id / csesidx / email.');
        }

        const hostCOses = (cookies.find((cookie) => cookie.name === '__Host-C_OSES') || {}).value || '';
        const sesCookie = cookies.find((cookie) => cookie.name === '__Secure-C_SES') || {};
        const secureCSes = sesCookie.value || '';

        if (!secureCSes) {
          throw new Error('Unable to read __Secure-C_SES cookie.');
        }

        const payload = buildImportJson(
          buildImportRecord({
            email,
            csesidx,
            configId,
            secureCSes,
            hostCOses,
            expiresAt: formatTime(sesCookie.expirationDate),
          }),
        );

        if (shouldDownload) {
          download(payload, `${sanitizeFileName(email)}.json`);
          flashButtonState(DOWNLOAD_LABEL, '#1e8e3e', 'Import JSON downloaded');
          return;
        }

        await copyToClipboard(payload);
        flashButtonState(COPY_LABEL, '#1e8e3e', 'Import JSON copied');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Build failed.';
        flashButtonState(ERROR_LABEL, '#d93025', message);
        window.alert(`Error: ${message}`);
      }
    });
  });
})();
