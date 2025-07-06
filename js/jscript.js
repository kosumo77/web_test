document.addEventListener('DOMContentLoaded', () => {
    const itemListEl = document.getElementById('item-list');
    const itemSearchEl = document.getElementById('item-search');
    const categoryFilterEl = document.getElementById('category-filter');
    const rarityFilterEl = document.getElementById('rarity-filter');
    const resultTableNameEl = document.getElementById('result-item-name');
    const statusMessageEl = document.getElementById('status-message');
    const resultTableBodyEl = document.querySelector('#result-table tbody');

    const API_BASE_URL = 'https://api.hypixel.net/skyblock';
    const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

    let allItems = [];

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
        findAndDisplayFlips(itemAuctions);
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

    function findAndDisplayFlips(auctions) {
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

    itemSearchEl.addEventListener('input', applyFilters);
    categoryFilterEl.addEventListener('change', applyFilters);
    rarityFilterEl.addEventListener('change', applyFilters);

    fetchAllItems();
});