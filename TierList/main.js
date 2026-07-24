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

let seriesFilterEl = null;
let bootstrapDone = false;

function setLoadingText(text) {
    const displayValue = !!(text && text.trim()) ? '' : 'none';
    const loadingEl = document.getElementById('card-loading');
    const loadingRowEl = document.querySelector('.loading-row');

    loadingRowEl.style.display = displayValue;
    loadingEl.textContent = text;
}

function getSeriesFilterValues() {
    if (!seriesFilterEl) return [];
    const currentValue = seriesFilterEl.value;
    if (Array.isArray(currentValue)) return currentValue;
    if (!currentValue) return [];
    return [currentValue];
}

function initSeriesFilter(filterOptions) {
    VirtualSelect.init({
        ele: '#series-filter',
        options: filterOptions || [],
        multiple: true,
        placeholder: '請選擇系列...',
        search: false,
        disableSelectAll: true,
        showValueAsTags: true,
        hasOptionDescription: true,
        popupDropboxBreakpoint: '3000px',

        // 自訂選中後 Tag 顯示的內容，若有別名就顯示別名，沒有就退回顯示 label
        selectedLabelRenderer: function (option) { return option.alias || option.label; }
    });

    // Virtual Select 會把原生 select 換成同 id 的容器，初始化後重新抓一次。
    seriesFilterEl = document.getElementById('series-filter');
}

function bootstrapTierList() {
    if (bootstrapDone) return;
    bootstrapDone = true;

    seriesFilterEl = document.getElementById('series-filter');

    // 「清除選取」按鈕：只取消顏色 checkbox 勾選，不影響系列篩選
    const clearColorBtn = document.getElementById('clear-color-filter');
    if (clearColorBtn) {
        clearColorBtn.addEventListener('click', function () {
            document.querySelectorAll('#color-checkboxes input[type="checkbox"]').forEach(cb => cb.checked = false);
            const selectedSeries = getSeriesFilterValues();
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
    setLoadingText('⏳ 正在連線取得資料...');
    Promise.all([
        loadSeriesFilterOptions().then(function (opts) {
            setLoadingText('✅ 系列選項載入完成，等待卡片資料...');
            return opts;
        }),
        loadCardsFromSheet().then(function (cards) {
            setLoadingText('✅ 卡片資料載入完成（共 ' + cards.length + ' 張），正在繪製天梯表...');
            return cards;
        })
    ])
        .then(function ([filterOptions, cards]) {
            allCards = cards;
            setLoadingText('🖌️ 正在繪製天梯表...');
            renderCards(allCards);
            setLoadingText('⚙️ 正在初始化篩選器...');
            initSeriesFilter(filterOptions);
            setLoadingText('');

            // 統一的篩選觸發函式：分類篩選與顏色篩選共用
            function triggerFilter() {
                const selectedSeries = getSeriesFilterValues();
                updateColorAvailability(selectedSeries);
                const selectedColors = Array.from(document.querySelectorAll('#color-checkboxes input[type="checkbox"]:checked')).map(i => i.value);
                filterCards(selectedSeries, selectedColors);
            }

            // 初次載入時，依當下系列選取狀態同步一次顏色可用性
            updateColorAvailability(getSeriesFilterValues());

            if (seriesFilterEl) seriesFilterEl.addEventListener('change', triggerFilter);
            // 監聽 checkbox 容器的變更（事件代理）
            const colorContainer = document.getElementById('color-checkboxes');
            if (colorContainer) colorContainer.addEventListener('change', triggerFilter);

            // 讓初始畫面和目前篩選狀態一致。
            triggerFilter();
        })
        .catch(function (err) {
            setLoadingText('❌ 資料載入失敗，請重新整理頁面。');
            console.error('[ERROR] 完整錯誤訊息：', err.message);
            console.error('[ERROR] 完整堆疊：', err.stack);
            console.error('Google Sheet 讀取錯誤：', err);
        });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapTierList);
} else {
    // main.js 可能在 DOMContentLoaded 之後才載入，這時要直接啟動。
    bootstrapTierList();
}

// 從選項分頁動態載入選項陣列
async function loadSeriesFilterOptions() {
    const response = await fetch(FILTER_OPTIONS_URL);
    if (!response.ok) throw new Error('HTTP ' + response.status);

    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    const groupMap = {}; // { groupName: [...options] }
    const ungroupedOptions = [];

    for (let i = 1; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i].trim());
        //跳過表頭
        if (!fields || fields.length < 2) continue;

        const value = fields[0].trim();
        const label = fields[1].trim();

        if (!value || !label) continue;

        const alias = fields[2] ? fields[2].trim() : '';
        const group = fields[3] ? fields[3].trim() : '';
        const count = fields[4] ? fields[4].trim() : '—';
        const average = fields[5] ? fields[5].trim() : '—';
        const highest = fields[6] ? fields[6].trim() : '—';
        const lowest = fields[7] ? fields[7].trim() : '—';
        const description = `${alias} 數量: ${count}個 · 平均分數: ${average} · 最高分數: ${highest} · 最低分數: ${lowest}`;
        const option = { value: value, label: label, description: description, alias: alias };

        if (group) {
            if (!groupMap[group]) groupMap[group] = [];
            groupMap[group].push(option);
        } else {
            ungroupedOptions.push(option);
        }
    }

    // 組合成 Virtual Select 格式
    const result = [];

    // 先加 grouped options（倒序）
    Object.entries(groupMap).reverse().forEach(([groupName, options]) => {
        result.push({ label: `發售年度: ${groupName}`, options: options });
    });

    // 再加 ungrouped options
    result.push(...ungroupedOptions);

    return result; // ★ 返回選項陣列
}

// --- 從 Google Sheet 讀取卡片資料 ---
async function loadCardsFromSheet() {
    const response = await fetch(SHEET_CSV_URL);
    if (!response.ok) throw new Error('HTTP ' + response.status);

    const csvText = await response.text();
    const lines = csvText.trim().split('\n');
    const cards = [];

    for (let i = 1; i < lines.length; i++) {
        const fields = parseCSVLine(lines[i].trim());
        if (!fields || fields.length < 3) continue;

        const imgurl = 'https://res.cloudinary.com/c9t2zuha/image/upload/';
        const score = parseInt(fields[0]);
        const series = fields[1] ? fields[1].trim() : '';
        const releaseDate = fields[2] ? fields[2].trim() : '';
        const color = fields[4] ? fields[4].trim() : '';
        const iconName = fields[5] ? fields[5].trim() : '';
        const href = fields[6] ? fields[6].trim() : null;
        const src = iconName ? imgurl + iconName : '';

        if (!isNaN(score) && src) {
            cards.push({ score, color, series, src, href: href || null, releaseDate });
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
            const isLazyCard = scoreIndex >= 3;
            const img = buildCardImg(card, isLazyCard);

            const inner = card.href
                ? `<a href="${card.href}" target="_blank" rel="noopener noreferrer">${img}</a>`
                : img;
            const linkBadge = card.href ? `<span class="link-badge">🔗</span>` : '';

            html += `<div class="deck-card-wrapper">`;
            html += `  <div class="deck-card ${colorClass} is-active">`;
            html += `    ${inner}`;
            html += `    ${linkBadge}`;
            html += `  </div>`;

            html += `</div>`;
        });

        html += `  </div>`;
        html += `</div>`;
    });

    container.innerHTML = html;
    initLazyLoadImages(container);
}

// --- 篩選邏輯（支援系列篩選 + 顏色篩選） ---
function filterCards(selectedSeries, selectedColors) {
    const hasSeries = selectedSeries && selectedSeries.length > 0;
    const hasColor = selectedColors && selectedColors.length > 0;

    // 遍歷所有卡片 wrapper，先重置 display
    document.querySelectorAll('.deck-card-wrapper').forEach(wrapper => {
        const cardEl = wrapper.querySelector('.deck-card');
        const img = cardEl.querySelector('img');
        if (!img) return;

        const color = img.dataset.color || '';
        const series = img.dataset.series || '';

        // 系列篩選元件條件
        const seriesMatch = !hasSeries || selectedSeries.includes(series);
        const colorMatch = !hasColor || selectedColors.includes(color);
        const seriesFilterPass = seriesMatch && colorMatch;

        // 根據系列篩選條件決定 wrapper 是否顯示
        wrapper.style.display = seriesFilterPass ? '' : 'none';
    });

    // 隱藏空的級距行
    document.querySelectorAll('.tier-row').forEach(row => {
        const visibleWrappers = row.querySelectorAll('.deck-card-wrapper:not([style*="display: none"])').length;
        row.style.display = visibleWrappers > 0 ? '' : 'none';
    });
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