// Google Sheet CSV 網址
const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTjV26EfSqCY1ztrkCsPVfj3DkKW9Yz_rlYNsjumSrm72yyZGL6eTc-ETFFymI1s-nthf_FVi2OhP2v/pub?gid=218268368&single=true&output=csv';
// 選項分頁
const FILTER_OPTIONS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTjV26EfSqCY1ztrkCsPVfj3DkKW9Yz_rlYNsjumSrm72yyZGL6eTc-ETFFymI1s-nthf_FVi2OhP2v/pub?gid=2069717497&single=true&output=csv';

// 顏色映射
const colorMap = {
    '紅': 'ua-red',
    '紫': 'ua-purple',
    '藍': 'ua-blue',
    '綠': 'ua-green',
    '黃': 'ua-yellow'
};

// 顏色排序順序（分數段內排序用）：黃→紫→藍→綠→紅
const colorOrder = {
    '黃': 0,
    '紫': 1,
    '藍': 2,
    '綠': 3,
    '紅': 4
};

let allCards = []; // 儲存所有牌組資料
let activeTag = ''; // 當前選中的 標籤 按鈕
let imageObserver = null;

function loadDeckImage(img) {
    if (!img || img.dataset.loaded === 'true') return;

    const realSrc = img.dataset.src;
    if (!realSrc) return;

    img.dataset.loaded = 'true';
    img.src = realSrc;
}

function initLazyLoadImages(root) {
    const scope = root || document;
    const images = Array.from(scope.querySelectorAll('img[data-src]'));
    if (images.length === 0) return;

    if ('IntersectionObserver' in window) {
        if (!imageObserver) {
            imageObserver = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    loadDeckImage(entry.target);
                    imageObserver.unobserve(entry.target);
                });
            }, {
                root: null,
                rootMargin: '300px 0px',
                threshold: 0.01
            });
        }

        images.forEach(function (img) {
            if (img.dataset.loaded === 'true') return;
            imageObserver.observe(img);
        });
        return;
    }

    images.forEach(loadDeckImage);
}

function waitForImageLoad(img) {
    return new Promise(function (resolve) {
        if (!img) {
            resolve();
            return;
        }

        const realSrc = img.dataset.src;
        if (!realSrc) {
            resolve();
            return;
        }

        const isAlreadyLoaded = img.dataset.loaded === 'true' && img.complete && img.naturalWidth > 0;
        if (isAlreadyLoaded) {
            resolve();
            return;
        }

        const onDone = function () {
            resolve();
        };

        img.addEventListener('load', onDone, { once: true });
        img.addEventListener('error', onDone, { once: true });
        loadDeckImage(img);
    });
}

async function forceLoadTierImages(root) {
    if (!root) return;

    const images = Array.from(root.querySelectorAll('img[data-src]'));
    await Promise.all(images.map(waitForImageLoad));
}

function buildCardImg(card, isLazyCard) {
    const defaultImg = 'https://placehold.co/100x100';
    const lazyPlaceholderImg = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
    const imageSrc = card.src || defaultImg;
    const commonAttrs = `
        data-tag="${card.tag}"
        data-color="${card.color}"
        data-series="${card.series}"
        crossorigin="anonymous"
        onerror="this.onerror=null; this.src='${defaultImg}';"
      `;

    if (isLazyCard) {
        return `<img${commonAttrs} src="${lazyPlaceholderImg}" data-src="${imageSrc}" loading="lazy" />`;
    }

    return `<img${commonAttrs} src="${imageSrc}" />`;
}

// 依目前選取的系列，計算實際存在的顏色集合；未選系列則回傳 null 代表全部可用
function getAvailableColors(selectedSeries) {
    if (!selectedSeries || selectedSeries.length === 0) return null;
    const matched = allCards.filter(c => selectedSeries.includes(c.series));
    return new Set(matched.map(c => c.color));
}

// 依可用顏色集合，停用/恢復顏色 checkbox；已勾選但變不可用時自動取消勾選
function updateColorAvailability(selectedSeries) {
    const availableColors = getAvailableColors(selectedSeries);
    document.querySelectorAll('#color-checkboxes input[type="checkbox"]').forEach(cb => {
        const isAvailable = !availableColors || availableColors.has(cb.value);
        if (!isAvailable) {
            cb.checked = false;
            cb.disabled = true;
        } else {
            cb.disabled = false;
        }
    });
}

$(document).ready(function () {
    $('#series-filter').select2({
        placeholder: "請選擇系列...",
        allowClear: true,
        minimumResultsForSearch: Infinity,
        closeOnSelect: false
    });

    // 「清除選取」按鈕：只取消顏色 checkbox 勾選，不影響系列篩選與 tag 選取
    const clearColorBtn = document.getElementById('clear-color-filter');
    if (clearColorBtn) {
        clearColorBtn.addEventListener('click', function () {
            document.querySelectorAll('#color-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
            const selectedSeries = $('#series-filter').val();
            updateColorAvailability(selectedSeries);
            filterCards(selectedSeries, []);
        });
    }

    // 「匯出圖片」按鈕：將目前畫面的天梯表（含篩選結果）匯出成 PNG 圖片
    const exportImageBtn = document.getElementById('export-image-btn');
    if (exportImageBtn) {
        exportImageBtn.addEventListener('click', exportTierListImage);
    }

    // 同時載入選項與卡片資料
    Promise.all([
        loadSeriesFilterOptions(),
        loadCardsFromSheet()
    ])
        .then(function () {
            // 統一的篩選觸發函式：分類篩選與顏色篩選共用
            function triggerFilter() {
                const selectedSeries = $('#series-filter').val();
                updateColorAvailability(selectedSeries);
                const selectedColors = Array.from(document.querySelectorAll('#color-checkboxes input[type="checkbox"]:checked')).map(i => i.value);
                filterCards(selectedSeries, selectedColors);
            }

            // 初次載入時，依當下系列選取狀態同步一次顏色可用性
            updateColorAvailability($('#series-filter').val());

            $('#series-filter').on('change', triggerFilter);
            // 監聽 checkbox 容器的變更（事件代理）
            const colorContainer = document.getElementById('color-checkboxes');
            if (colorContainer) colorContainer.addEventListener('change', triggerFilter);
        })
        .catch(function (err) {
            $('#card-loading').html('❌ 資料載入失敗，請重新整理頁面。');
            console.error('Google Sheet 讀取錯誤：', err);
        });
});

// ★ 從選項分頁動態載入 <option>
async function loadSeriesFilterOptions() {
    const response = await fetch(FILTER_OPTIONS_URL);
    if (!response.ok) throw new Error('HTTP ' + response.status);

    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    const select = document.getElementById('series-filter');
    const groupMap = {};

    for (let i = 1; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i].trim());  // ← 更新呼叫名稱
        if (!fields || fields.length < 2) continue;

        const value = fields[0].trim();
        const label = fields[1].trim();
        const group = fields[2] ? fields[2].trim() : '';
        const count = fields[3] ? fields[3].trim() : '';
        if (!value || !label) continue;

        const option = document.createElement('option');
        option.value = value;
        option.textContent = label + ' (數量:' + count + ')';

        if (group) {
            // 若該 group 的 optgroup 還沒建立，先建立它
            if (!groupMap[group]) {
                const optgroup = document.createElement('optgroup');
                optgroup.label = group;
                select.appendChild(optgroup);
                groupMap[group] = optgroup;
            }
            groupMap[group].appendChild(option);
        } else {
            select.appendChild(option); // 沒有 group 就直接塞
        }
    }

    $('#series-filter').trigger('change.select2');
}



// --- 從 Google Sheet 讀取並渲染 ---
async function loadCardsFromSheet() {
    const response = await fetch(SHEET_CSV_URL);
    if (!response.ok) throw new Error('HTTP ' + response.status);

    const csvText = await response.text();
    allCards = parseDeckCSV(csvText);
    renderCards(allCards);

    document.getElementById('card-loading').style.display = 'none';
}

// --- 解析牌組 CSV（支援含逗號的欄位，有引號包覆的情況）---
function parseDeckCSV(csvText) {  // ← parseCSV 改為 parseDeckCSV
    const lines = csvText.trim().split('\n');
    const cards = [];

    for (let i = 1; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i].trim());  // ← 更新呼叫名稱
        if (!fields || fields.length < 3) continue;

        const imgurl = 'https://res.cloudinary.com/c9t2zuha/image/upload/';
        const score = parseInt(fields[0]);
        const series = fields[1] ? fields[1].trim() : '';
        const releaseDate = fields[2] ? fields[2].trim() : '';
        const tag = fields[3] ? fields[3].trim() : '';
        const color = fields[4] ? fields[4].trim() : '';
        const iconName = fields[5] ? fields[5].trim() : '';
        const href = fields[6] ? fields[6].trim() : null;
        const src = iconName ? imgurl + iconName : '';

        if (!isNaN(score) && src) {
            cards.push({ score, tag, color, series, src, href: href || null, releaseDate });
        }
    }
    return cards;
}

// --- 解析出售日期字串為 Date 物件（空白回傳 null） ---
function parseReleaseDate(str) {
    if (!str) return null;
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
}

// --- 分數段內排序：1. 顏色（黃→紫→藍→綠→紅） 2. 出售日期倒序（新到舊，空白排最前） ---
function compareCardsForSort(a, b) {
    const colorDiff = (colorOrder[a.color] ?? 999) - (colorOrder[b.color] ?? 999);
    if (colorDiff !== 0) return colorDiff;

    const aDate = parseReleaseDate(a.releaseDate);
    const bDate = parseReleaseDate(b.releaseDate);
    if (!aDate && !bDate) return 0;
    if (!aDate) return -1;
    if (!bDate) return 1;
    return bDate - aDate;
}

// --- CSV 單行欄位解析（正確處理引號） ---
function parseCSVLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"'; i++; // 跳脫的 ""
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            fields.push(current); current = '';
        } else {
            current += ch;
        }
    }
    fields.push(current);
    return fields;
}

// --- 動態產生天梯表 HTML ---
function renderCards(cards) {
    const scores = [...new Set(cards.map(c => c.score))].sort((a, b) => b - a);
    const container = document.getElementById('tier-rows-container');
    let html = '';

    scores.forEach((score, scoreIndex) => {
        html += `<div class="tier-row rank-${score}">`;
        html += `  <div class="tier-label">${score}分</div>`;
        html += `  <div class="tier-content">`;

        cards.filter(c => c.score === score).sort(compareCardsForSort).forEach(card => {
            const colorClass = colorMap[card.color] || '';
            const isActive = !activeTag || card.tag === activeTag;
            const isLazyCard = scoreIndex >= 4;
            const img = buildCardImg(card, isLazyCard);

            const inner = card.href
                ? `<a href="${card.href}" target="_blank" rel="noopener noreferrer">${img}</a>`
                : img;
            const linkBadge = card.href ? `<span class="link-badge">🔗</span>` : '';

            const activeClass = isActive ? 'is-active' : 'is-dimmed';
            html += `<div class="deck-card-wrapper">`;
            html += `  <div class="deck-card ${colorClass} ${activeClass}">`;
            html += `    ${inner}`;
            html += `    ${linkBadge}`;
            html += `  </div>`;

            if (card.tag) {
                html += `  <button type="button" class="tag-chip" onclick="toggleTag('${card.tag}')">${card.tag}</button>`;
            }

            html += `</div>`;
        });

        html += `  </div>`;
        html += `</div>`;
    });

    container.innerHTML = html;
    initLazyLoadImages(container);
}

// --- 篩選邏輯（支援 Select2 系列篩選 + 標籤按鈕過濾） ---
function filterCards(selectedSeries, selectedColors) {
    const hasSeries = selectedSeries && selectedSeries.length > 0;
    const hasColor = selectedColors && selectedColors.length > 0;

    // 遍歷所有卡片 wrapper，先重置 display
    document.querySelectorAll('.deck-card-wrapper').forEach(wrapper => {
        const cardEl = wrapper.querySelector('.deck-card');
        const btnEl = wrapper.querySelector('.tag-chip');
        const img = cardEl.querySelector('img');
        if (!img) return;

        const tag = img.dataset.tag || '';
        const color = img.dataset.color || '';
        const series = img.dataset.series || '';

        // Select2 篩選條件
        const seriesMatch = !hasSeries || selectedSeries.includes(series);
        const colorMatch = !hasColor || selectedColors.includes(color);
        const select2Pass = seriesMatch && colorMatch;

        // Tag 按鈕篩選條件
        const buttonPass = !activeTag || tag === activeTag;

        // 根據 Select2 過濾條件決定 wrapper 是否顯示
        if (!select2Pass) {
            // Select2 過濾掉了，隱藏整個 wrapper（卡片 + 按鈕）
            wrapper.style.display = 'none';
            cardEl.classList.remove('is-active', 'is-dimmed');
            if (btnEl) btnEl.classList.remove('is-dimmed');
        } else {
            // Select2 通過，顯示 wrapper
            wrapper.style.display = '';

            // 再根據按鈕過濾應用樣式
            if (buttonPass) {
                cardEl.classList.remove('is-dimmed');
                cardEl.classList.add('is-active');
                if (btnEl) btnEl.classList.remove('is-dimmed');
            } else {
                cardEl.classList.remove('is-active');
                cardEl.classList.add('is-dimmed');
                if (btnEl) btnEl.classList.add('is-dimmed');
            }
        }
    });

    // 隱藏空的級距行
    document.querySelectorAll('.tier-row').forEach(row => {
        const visibleWrappers = row.querySelectorAll('.deck-card-wrapper:not([style*="display: none"])').length;
        row.style.display = visibleWrappers > 0 ? '' : 'none';
    });
}

// --- Tag 按鈕點擊處理 ---
function toggleTag(tag) {
    activeTag = activeTag === tag ? '' : tag;
    const selectedSeries = $('#series-filter').val();
    const selectedColors = Array.from(document.querySelectorAll('#color-checkboxes input[type="checkbox"]:checked')).map(i => i.value);
    filterCards(selectedSeries, selectedColors);
}

// --- 匯出目前畫面的天梯表為 PNG 圖片 ---
async function exportTierListImage() {
    const target = document.getElementById('tier-rows-container');
    const btn = document.getElementById('export-image-btn');
    if (!target || !btn) return;

    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '匯出中...';

    try {
        await forceLoadTierImages(target);

        const canvas = await html2canvas(target, {
            useCORS: true,
            backgroundColor: '#faf6f0',
            scale: 2
        });

        const link = document.createElement('a');
        const pad = n => String(n).padStart(2, '0');
        const now = new Date();
        const timestamp = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + '_' + pad(now.getHours()) + pad(now.getMinutes());
        link.download = `UA天梯表_${timestamp}.png`;
        link.href = canvas.toDataURL('image/png');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        console.error('匯出圖片失敗：', err);
        alert('匯出圖片失敗，請稍後再試。');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}

function sendHeight() {
    const height = document.documentElement.scrollHeight || document.body.scrollHeight;
    window.parent.postMessage({ frameHeight: height }, '*');
}

// 網頁載入、視窗縮放或內容改變時重新計算高度
window.addEventListener('load', sendHeight);
window.addEventListener('resize', sendHeight);

// 如果你有篩選器或動態展開功能，內容變動時也可觸發 sendHeight()
const observer = new ResizeObserver(sendHeight);
observer.observe(document.body);
