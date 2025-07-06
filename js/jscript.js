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
    const HYPIXEL_API_KEY = 'd2a69c60-079c-44a4-bac1-f61bb3411ed9'; // <--- ここにAPIキーを設定

    // State
    let allItems = [];

    // --- DATA FETCHING ---
    async function fetchAllItems() {
        try {
            const response = await fetch('https://api.slothpixel.me/api/skyblock/items');
            if (!response.ok) {
                throw new Error(`APIの応答が不正です。ステータス: ${response.status} ${response.statusText}`);
            }
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
                    'API-Key': HYPIXEL_API_KEY // APIキーをヘッダーに追加
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
                    'API-Key': HYPIXEL_API_KEY // APIキーをヘッダーに追加
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
        statusMessageEl.textContent = 'オークションデータとBazaarデータを検索中...';
        resultTableBodyEl.innerHTML = '';

        document.querySelectorAll('#item-list li').forEach(li => li.classList.remove('active'));
        const selectedLi = document.querySelector(`[data-item-id='${item.id}']`);
        if(selectedLi) selectedLi.classList.add('active');

        const [auctions, bazaarData] = await Promise.all([
            getAuctions(),
            fetchBazaarData()
        ]);

        if (!auctions) {
            statusMessageEl.textContent = 'オークションデータの取得に失敗しました。';
            return;
        }
        if (!bazaarData) {
            statusMessageEl.textContent = 'Bazaarデータの取得に失敗しました。';
            return;
        }

        const itemAuctions = auctions.filter(auc => auc.item_name === item.name && auc.bin);
        findAndDisplayFlip(itemAuctions, bazaarData[item.id]);
    }

    function findAndDisplayFlip(auctions, bazaarProduct) {
        const prices = [];

        // Add BIN auction prices
        auctions.forEach(auc => prices.push({ type: 'BIN', price: auc.starting_bid, uuid: auc.uuid }));

        // Add Bazaar prices
        if (bazaarProduct) {
            // Buy price (what you pay to buy from Bazaar)
            if (bazaarProduct.buy_summary && bazaarProduct.buy_summary.length > 0) {
                prices.push({ type: 'Bazaar Buy', price: bazaarProduct.buy_summary[0].pricePerUnit });
            }
            // Sell price (what you get when selling to Bazaar)
            if (bazaarProduct.sell_summary && bazaarProduct.sell_summary.length > 0) {
                prices.push({ type: 'Bazaar Sell', price: bazaarProduct.sell_summary[0].pricePerUnit });
            }
        }

        if (prices.length < 2) {
            statusMessageEl.textContent = 'フリップ可能な価格が見つかりませんでした (価格データが2つ未満)。';
            resultTableBodyEl.innerHTML = '<tr><td colspan="4">-</td></tr>';
            return;
        }

        prices.sort((a, b) => a.price - b.price);

        const lowest = prices[0];
        const secondLowest = prices[1];
        const profit = secondLowest.price - lowest.price;

        statusMessageEl.textContent = `分析完了。価格データ数: ${prices.length}件`;
        resultTableBodyEl.innerHTML = '';
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${lowest.price.toLocaleString()} (${lowest.type})</td>
            <td>${secondLowest.price.toLocaleString()} (${secondLowest.type})</td>
            <td>${profit.toLocaleString()}</td>
            <td>${lowest.uuid || '-'}</td>
        `;
        resultTableBodyEl.appendChild(row);
    }

    // --- CSV EXPORT ---
    async function findAllFlips(auctions, bazaarData) {
        const profitableFlips = [];
        const processedItems = new Set(); // To avoid duplicate processing for items

        // Process BIN auctions
        const binAuctions = auctions.filter(auction => auction.bin);
        const itemAuctionPrices = new Map(); // Map: item_name -> array of BIN prices

        for (const auction of binAuctions) {
            if (!itemAuctionPrices.has(auction.item_name)) {
                itemAuctionPrices.set(auction.item_name, []);
            }
            itemAuctionPrices.get(auction.item_name).push(auction.starting_bid);
        }

        for (const [itemName, prices] of itemAuctionPrices.entries()) {
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
                        profit,
                        source1: 'BIN',
                        source2: 'BIN'
                    });
                }
            }
            processedItems.add(itemName);
        }

        // Process Bazaar items and compare with BIN if applicable
        for (const productId in bazaarData) {
            const bazaarProduct = bazaarData[productId];
            const itemName = allItems.find(item => item.id === productId)?.name;

            if (!itemName || processedItems.has(itemName)) continue; // Skip if already processed via BIN or item name not found

            const prices = [];
            if (bazaarProduct.buy_summary && bazaarProduct.buy_summary.length > 0) {
                prices.push({ type: 'Bazaar Buy', price: bazaarProduct.buy_summary[0].pricePerUnit });
            }
            if (bazaarProduct.sell_summary && bazaarProduct.sell_summary.length > 0) {
                prices.push({ type: 'Bazaar Sell', price: bazaarProduct.sell_summary[0].pricePerUnit });
            }

            // Also include BIN prices if available for this item
            if (itemAuctionPrices.has(itemName)) {
                itemAuctionPrices.get(itemName).forEach(price => prices.push({ type: 'BIN', price: price }));
            }

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

    function exportToCsv(flips) {
        const headers = ['Item Name', 'Lowest Price', 'Second Lowest Price', 'Profit', 'Source 1', 'Source 2'];
        const csvRows = [headers.join(',')];

        for (const flip of flips) {
            const values = [
                `"${flip.itemName.replace(/"/g, '""')}"`,
                flip.lowestPrice,
                flip.secondLowestPrice,
                flip.profit,
                flip.source1,
                flip.source2
            ];
            csvRows.push(values.join(','));
        }

        const csvString = csvRows.join('\r\n');
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

        const [auctions, bazaarData] = await Promise.all([
            getAuctions(),
            fetchBazaarData()
        ]);

        if (!auctions) {
            statusMessageEl.textContent = 'オークションデータの取得に失敗しました。';
            downloadCsvBtn.disabled = false;
            downloadCsvBtn.textContent = '全フリップをCSVでダウンロード';
            return;
        }
        if (!bazaarData) {
            statusMessageEl.textContent = 'Bazaarデータの取得に失敗しました。';
            downloadCsvBtn.disabled = false;
            downloadCsvBtn.textContent = '全フリップをCSVでダウンロード';
            return;
        }

        statusMessageEl.textContent = '利益の出るフリップを計算中...';
        const allFlips = await findAllFlips(auctions, bazaarData);

        if (allFlips.length > 0) {
            statusMessageEl.textContent = `${allFlips.length}件のフリップが見つかりました。CSVを生成しています...`;
            exportToCsv(allFlips);
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