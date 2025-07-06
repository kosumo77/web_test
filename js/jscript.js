document.addEventListener('DOMContentLoaded', () => {
    // Element selections
    const itemListEl = document.getElementById('item-list');
    const itemSearchEl = document.getElementById('item-search');
    const categoryFilterEl = document.getElementById('category-filter');
    const rarityFilterEl = document.getElementById('rarity-filter');
    const resultTableNameEl = document.getElementById('result-item-name');
    const statusMessageEl = document.getElementById('status-message');
    const resultTableBodyEl = document.querySelector('#result-table tbody');
    const displayFlipsBtn = document.getElementById('display-flips-btn');

    // Constants
    const API_BASE_URL = 'https://api.hypixel.net/skyblock';
    const HYPIXEL_API_KEY = 'd2a69c60-079c-44a4-bac1-f61bb3411ed9'; // <--- ここにAPIキーを設定

    // State
    let allItems = [];

    // --- DATA FETCHING ---
    async function fetchAllItems() {
        try {
            const response = await fetch(`https://api.hypixel.net/resources/skyblock/items`, {
                 headers: {
                    'API-Key': HYPIXEL_API_KEY
                }
            });
            if (!response.ok) {
                throw new Error(`APIの応答が不正です。ステータス: ${response.status} ${response.statusText}`);
            }
            const itemsData = await response.json();
            if (!itemsData.success) {
                 throw new Error('Item API call was not successful.');
            }
            allItems = itemsData.items.map(item => ({
                id: item.id,
                name: item.name,
                category: item.category || 'MISC',
                tier: item.tier || 'COMMON'
            }));
            populateFilters();
            applyFilters();
        } catch (error) {
            console.error("Failed to fetch item list:", error);
            statusMessageEl.textContent = `アイテムリストの取得に失敗しました: ${error.message}`;
        }
    }

    async function getAuctions() {
        statusMessageEl.textContent = 'APIから全オークションを取得中... (数分かかる場合があります)';
        try {
            const allAuctions = await fetchAllAuctionPages();
            return allAuctions;
        } catch (error) {
            console.error('Failed to fetch all auctions:', error);
            statusMessageEl.textContent = `オークションデータの取得に失敗しました: ${error.message}`;
            return null;
        }
    }

    async function fetchAllAuctionPages() {
        let allAuctions = [];
        let page = 0;
        let totalPages = 1;
        while (page < totalPages) {
            const response = await fetch(`${API_BASE_URL}/auctions?page=${page}`, {
                headers: {
                    'API-Key': HYPIXEL_API_KEY
                }
            });
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

    async function fetchBazaarData() {
        try {
            const response = await fetch(`${API_BASE_URL}/bazaar`, {
                headers: {
                    'API-Key': HYPIXEL_API_KEY
                }
            });
            if (!response.ok) {
                throw new Error(`Bazaar APIの応答が不正です。ステータス: ${response.status} ${response.statusText}`);
            }
            const data = await response.json();
            if (!data.success) {
                throw new Error('Bazaar API call was not successful.');
            }
            return data.products;
        } catch (error) {
            console.error("Failed to fetch Bazaar data:", error);
            return null;
        }
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
        if (searchTerm === '') {
            displayItems(allItems);
            return;
        }
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
        statusMessageEl.textContent = 'オークションデータとBazaarデータを検索中...';
        resultTableBodyEl.innerHTML = '';

        document.querySelectorAll('#item-list li').forEach(li => li.classList.remove('active'));
        const selectedLi = document.querySelector(`[data-item-id='${item.id}']`);
        if(selectedLi) selectedLi.classList.add('active');

        const [auctions, bazaarData] = await Promise.all([
            getAuctions(),
            fetchBazaarData()
        ]);

        if (!auctions || !bazaarData) {
            statusMessageEl.textContent = 'データ取得に失敗しました。';
            return;
        }

        const itemAuctions = auctions.filter(auc => auc.item_name === item.name && auc.bin);
        const bazaarProduct = bazaarData[item.id];
        
        const prices = [];
        itemAuctions.forEach(auc => prices.push({ type: 'BIN', price: auc.starting_bid }));
        if (bazaarProduct) {
            if (bazaarProduct.buy_summary && bazaarProduct.buy_summary.length > 0) {
                prices.push({ type: 'Bazaar Buy', price: bazaarProduct.buy_summary[0].pricePerUnit });
            }
            if (bazaarProduct.sell_summary && bazaarProduct.sell_summary.length > 0) {
                prices.push({ type: 'Bazaar Sell', price: bazaarProduct.sell_summary[0].pricePerUnit });
            }
        }

        if (prices.length < 2) {
            statusMessageEl.textContent = 'フリップ可能な価格が見つかりませんでした。';
            resultTableBodyEl.innerHTML = '<tr><td colspan="6">-</td></tr>';
            return;
        }

        prices.sort((a, b) => a.price - b.price);
        const lowest = prices[0];
        const secondLowest = prices[1];
        const profit = secondLowest.price - lowest.price;

        statusMessageEl.textContent = `分析完了。`;
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.name}</td>
            <td>${lowest.price.toLocaleString()}</td>
            <td>${secondLowest.price.toLocaleString()}</td>
            <td>${profit.toLocaleString()}</td>
            <td>${lowest.type}</td>
            <td>${secondLowest.type}</td>
        `;
        resultTableBodyEl.appendChild(row);
    }

    async function handleDisplayAllFlips() {
        displayFlipsBtn.disabled = true;
        displayFlipsBtn.textContent = '処理中...';
        statusMessageEl.textContent = '全フリップ情報を検索しています...';
        resultTableBodyEl.innerHTML = '';
        resultTableNameEl.textContent = "全フリップ情報";

        const [auctions, bazaarData] = await Promise.all([
            getAuctions(),
            fetchBazaarData()
        ]);

        if (!auctions || !bazaarData) {
            statusMessageEl.textContent = 'データ取得に失敗しました。';
            displayFlipsBtn.disabled = false;
            displayFlipsBtn.textContent = '全フリップを表示';
            return;
        }

        statusMessageEl.textContent = '利益の出るフリップを計算中...';
        const allFlips = await findAllFlips(auctions, bazaarData);

        if (allFlips.length > 0) {
            statusMessageEl.textContent = `${allFlips.length}件のフリップが見つかりました。`;
            displayFlipsInTable(allFlips);
        } else {
            statusMessageEl.textContent = '利益の出るフリップは見つかりませんでした。';
            resultTableBodyEl.innerHTML = '<tr><td colspan="6">-</td></tr>';
        }

        displayFlipsBtn.disabled = false;
        displayFlipsBtn.textContent = '全フリップを表示';
    }

    async function findAllFlips(auctions, bazaarData) {
        const profitableFlips = [];
        const itemPrices = new Map();

        // Collect all prices from auctions and bazaar
        auctions.filter(a => a.bin).forEach(a => {
            if (!itemPrices.has(a.item_name)) itemPrices.set(a.item_name, []);
            itemPrices.get(a.item_name).push({ type: 'BIN', price: a.starting_bid });
        });

        for (const productId in bazaarData) {
            const product = bazaarData[productId];
            const itemName = allItems.find(item => item.id === productId)?.name;
            if (itemName) {
                if (!itemPrices.has(itemName)) itemPrices.set(itemName, []);
                 if (product.buy_summary && product.buy_summary.length > 0) {
                    itemPrices.get(itemName).push({ type: 'Bazaar Buy', price: product.buy_summary[0].pricePerUnit });
                }
                if (product.sell_summary && product.sell_summary.length > 0) {
                    itemPrices.get(itemName).push({ type: 'Bazaar Sell', price: product.sell_summary[0].pricePerUnit });
                }
            }
        }

        // Find flips for each item
        for (const [itemName, prices] of itemPrices.entries()) {
            if (prices.length >= 2) {
                prices.sort((a, b) => a.price - b.price);
                const lowest = prices[0];
                const secondLowest = prices[1];
                const profit = secondLowest.price - lowest.price;

                if (profit > 0) {
                    profitableFlips.push({
                        itemName,
                        lowestPrice: lowest.price,
                        secondLowestPrice: secondLowest.price,
                        profit,
                        source1: lowest.type,
                        source2: secondLowest.type
                    });
                }
            }
        }

        return profitableFlips.sort((a, b) => b.profit - a.profit);
    }

    function displayFlipsInTable(flips) {
        resultTableBodyEl.innerHTML = '';
        flips.forEach(flip => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${flip.itemName}</td>
                <td>${flip.lowestPrice.toLocaleString()}</td>
                <td>${flip.secondLowestPrice.toLocaleString()}</td>
                <td>${flip.profit.toLocaleString()}</td>
                <td>${flip.source1}</td>
                <td>${flip.source2}</td>
            `;
            resultTableBodyEl.appendChild(row);
        });
    }

    // --- EVENT LISTENERS ---
    itemSearchEl.addEventListener('input', applyFilters);
    categoryFilterEl.addEventListener('change', applyFilters);
    rarityFilterEl.addEventListener('change', applyFilters);
    displayFlipsBtn.addEventListener('click', handleDisplayAllFlips);

    // --- INITIAL LOAD ---
    fetchAllItems();
});
