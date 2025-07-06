document.addEventListener('DOMContentLoaded', () => {
    // Element selections
    const itemListEl = document.getElementById('item-list');
    const itemSearchEl = document.getElementById('item-search');
    const categoryFilterEl = document.getElementById('category-filter');
    const rarityFilterEl = document.getElementById('rarity-filter');
    const resultTableNameEl = document.getElementById('result-item-name');
    const statusMessageEl = document.getElementById('status-message');
    const resultTableBodyEl = document.querySelector('#result-table tbody');
    const downloadCsvBtn = document.getElementById('download-csv-btn');

    // Constants
    const API_BASE_URL = 'https://api.hypixel.net/skyblock';
    const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

    // State
    let allItems = [];

    // --- DATA FETCHING & CACHING ---
    async function fetchAllItems() {
        try {
            const response = await fetch('https://api.slothpixel.me/api/skyblock/items');
            if (!response.ok) throw new Error('Failed to fetch item list');
            const itemsData = await response.json();
            allItems = Object.entries(itemsData).map(([id, data]) => ({
                id,
                name: data.name,
                category: data.category || 'MISC',
                tier: data.tier || 'COMMON'
            }));
            populateFilters();
            applyFilters();
        } catch (error) {
            console.error("Failed to fetch item list:", error);
            statusMessageEl.textContent = 'アイテムリストの取得に失敗しました。';
        }
    }

    async function getAuctionsWithCache() {
        const cachedData = JSON.parse(localStorage.getItem('auctionCache'));
        const now = new Date().getTime();

        if (cachedData && (now - cachedData.timestamp < CACHE_DURATION)) {
            statusMessageEl.textContent = 'キャッシュからデータを読み込みました。';
            return cachedData.auctions;
        }

        statusMessageEl.textContent = 'APIから全オークションを取得中... (数分かかる場合があります)';
        try {
            const allAuctions = await fetchAllAuctionPages();
            localStorage.setItem('auctionCache', JSON.stringify({ timestamp: new Date().getTime(), auctions: allAuctions }));
            return allAuctions;
        } catch (error) {
            console.error('Failed to fetch all auctions:', error);
            return null;
        }
    }

    async function fetchAllAuctionPages() {
        let allAuctions = [];
        let page = 0;
        let totalPages = 1;
        while (page < totalPages) {
            const response = await fetch(`${API_BASE_URL}/auctions?page=${page}`);
            if (!response.ok) throw new Error(`API request failed on page ${page}`);
            const data = await response.json();
            if (!data.success) throw new Error('API call was not successful.');
            allAuctions = allAuctions.concat(data.auctions);
            totalPages = data.totalPages;
            page++;
            await new Promise(res => setTimeout(res, 100));
        }
        return allAuctions;
    }

    // --- UI & FILTERING ---
    function populateFilters() {
        const categories = [...new Set(allItems.map(item => item.category))].sort();
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category;
            option.textContent = category;
            categoryFilterEl.appendChild(option);
        });

        const rarities = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY', 'MYTHIC', 'DIVINE', 'SPECIAL', 'VERY_SPECIAL'];
        rarities.forEach(rarity => {
            const option = document.createElement('option');
            option.value = rarity;
            option.textContent = rarity;
            rarityFilterEl.appendChild(option);
        });
    }

    function applyFilters() {
        const searchTerm = itemSearchEl.value.toLowerCase();

        // If search term is empty, show all items, ignoring other filters.
        if (searchTerm === '') {
            displayItems(allItems);
            return;
        }

        // If search term is present, filter by all criteria.
        const selectedCategory = categoryFilterEl.value;
        const selectedRarity = rarityFilterEl.value;

        const filteredItems = allItems.filter(item => {
            const matchesSearch = item.name.toLowerCase().includes(searchTerm);
            const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
            const matchesRarity = selectedRarity === 'all' || item.tier === selectedRarity;
            return matchesSearch && matchesCategory && matchesRarity;
        });

        displayItems(filteredItems);
    }

    function displayItems(items) {
        itemListEl.innerHTML = '';
        items.forEach(item => {
            const li = document.createElement('li');
            li.textContent = item.name;
            li.dataset.itemId = item.id;
            li.addEventListener('click', () => handleItemClick(item));
            itemListEl.appendChild(li);
        });
    }

    // --- FLIP ANALYSIS & DISPLAY ---
    async function handleItemClick(item) {
        resultTableNameEl.textContent = `${item.name} のフリップ情報`;
        statusMessageEl.textContent = 'オークションデータを検索中...';
        resultTableBodyEl.innerHTML = '';

        document.querySelectorAll('#item-list li').forEach(li => li.classList.remove('active'));
        const selectedLi = document.querySelector(`[data-item-id='${item.id}']`);
        if(selectedLi) selectedLi.classList.add('active');

        const auctions = await getAuctionsWithCache();
        if (!auctions) {
            statusMessageEl.textContent = 'オークションデータの取得に失敗しました。';
            return;
        }

        const itemAuctions = auctions.filter(auc => auc.item_name === item.name && auc.bin);
        findAndDisplaySingleFlip(itemAuctions);
    }

    function findAndDisplaySingleFlip(auctions) {
        if (auctions.length < 2) {
            statusMessageEl.textContent = 'フリップ可能なオークションが見つかりませんでした (出品が2つ未満)。';
            resultTableBodyEl.innerHTML = '<tr><td colspan="4">-</td></tr>';
            return;
        }

        const sortedAuctions = auctions.sort((a, b) => a.starting_bid - b.starting_bid);
        const lowestPrice = sortedAuctions[0].starting_bid;
        const secondLowestPrice = sortedAuctions[1].starting_bid;
        const profit = secondLowestPrice - lowestPrice;

        statusMessageEl.textContent = `分析完了。出品数: ${auctions.length}件`;
        resultTableBodyEl.innerHTML = '';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${lowestPrice.toLocaleString()}</td>
            <td>${secondLowestPrice.toLocaleString()}</td>
            <td>${profit.toLocaleString()}</td>
            <td>${sortedAuctions[0].uuid}</td>
        `;
        resultTableBodyEl.appendChild(row);
    }

    // --- CSV EXPORT ---
    function findAllFlips(auctions) {
        const binAuctions = auctions.filter(auction => auction.bin);
        const itemMap = new Map();

        for (const auction of binAuctions) {
            if (!itemMap.has(auction.item_name)) {
                itemMap.set(auction.item_name, []);
            }
            itemMap.get(auction.item_name).push(auction.starting_bid);
        }

        const profitableFlips = [];
        for (const [itemName, prices] of itemMap.entries()) {
            if (prices.length >= 2) {
                prices.sort((a, b) => a - b);
                const lowestPrice = prices[0];
                const secondLowestPrice = prices[1];
                const profit = secondLowestPrice - lowestPrice;

                if (profit > 0) {
                    profitableFlips.push({
                        itemName,
                        lowestPrice,
                        secondLowestPrice,
                        profit
                    });
                }
            }
        }
        return profitableFlips.sort((a, b) => b.profit - a.profit);
    }

    function exportToCsv(flips) {
        const headers = ['Item Name', 'Lowest Price', 'Second Lowest Price', 'Profit'];
        const csvRows = [headers.join(',')];

        for (const flip of flips) {
            const values = [
                `"${flip.itemName.replace(/"/g, '""')}"`,
                flip.lowestPrice,
                flip.secondLowestPrice,
                flip.profit
            ];
            csvRows.push(values.join(','));
        }

        const csvString = csvRows.join('\n');
        const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', 'hypixel_flips.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    async function handleCsvDownload() {
        downloadCsvBtn.disabled = true;
        downloadCsvBtn.textContent = '処理中...';
        statusMessageEl.textContent = '全フリップ情報を検索しています...';

        const auctions = await getAuctionsWithCache();
        if (!auctions) {
            statusMessageEl.textContent = 'オークションデータの取得に失敗しました。';
            downloadCsvBtn.disabled = false;
            downloadCsvBtn.textContent = '全フリップをCSVでダウンロード';
            return;
        }

        statusMessageEl.textContent = '利益の出るフリップを計算中...';
        const allFlips = findAllFlips(auctions);

        if (allFlips.length > 0) {
            statusMessageEl.textContent = `${allFlips.length}件のフリップが見つかりました。CSVを生成しています...`;
            exportToCsv(allFlips);
            statusMessageEl.textContent = 'CSVファイルのダウンロードが開始されました。';
        } else {
            statusMessageEl.textContent = '利益の出るフリップは見つかりませんでした。';
        }

        downloadCsvBtn.disabled = false;
        downloadCsvBtn.textContent = '全フリップをCSVでダウンロード';
    }

    // --- EVENT LISTENERS ---
    itemSearchEl.addEventListener('input', applyFilters);
    categoryFilterEl.addEventListener('change', applyFilters);
    rarityFilterEl.addEventListener('change', applyFilters);
    downloadCsvBtn.addEventListener('click', handleCsvDownload);

    // --- INITIAL LOAD ---
    fetchAllItems();
});