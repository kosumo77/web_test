document.addEventListener('DOMContentLoaded', () => {
    // --- Element Selections ---
    const itemListEl = document.getElementById('item-list');
    const itemSearchEl = document.getElementById('item-search');
    const categoryFilterEl = document.getElementById('category-filter');
    const rarityFilterEl = document.getElementById('rarity-filter');
    const statusMessageEl = document.getElementById('status-message');
    const analyzeFlipsBtn = document.getElementById('analyze-flips-btn');
    const auctionTableBodyEl = document.querySelector('#auction-table tbody');
    const flipTableBodyEl = document.querySelector('#flip-table tbody');
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    const loadMoreAuctionsBtn = document.getElementById('load-more-auctions-btn');
    const downloadAuctionsBtn = document.getElementById('download-auctions-btn');

    // --- Constants ---
    const API_BASE_URL = 'https://api.hypixel.net/skyblock';
    const HYPIXEL_API_KEY = 'd2a69c60-079c-44a4-bac1-f61bb3411ed9';
    const FLIPS_STORAGE_KEY = 'profitableFlips';

    // --- State ---
    let allItems = [];
    let tradeableAuctions = []; // Currently loaded auctions for browsing
    let currentAuctionPage = 0;
    let totalAuctionPages = 1;

    // --- DATA FETCHING ---
    async function fetchAllItems() {
        try {
            const response = await fetch(`https://api.hypixel.net/resources/skyblock/items`, { headers: { 'API-Key': HYPIXEL_API_KEY } });
            if (!response.ok) throw new Error(`Item API Error: ${response.status}`);
            const itemsData = await response.json();
            if (!itemsData.success) throw new Error('Item API call was not successful.');
            allItems = itemsData.items.map(item => ({ id: item.id, name: item.name, category: item.category || 'MISC', tier: item.tier || 'COMMON' }));
        } catch (error) {
            console.error("Failed to fetch item list:", error);
            statusMessageEl.textContent = `アイテムリストの取得に失敗しました: ${error.message}`;
            throw error;
        }
    }

    async function fetchAuctionPage(page) {
        const response = await fetch(`${API_BASE_URL}/auctions?page=${page}`, { headers: { 'API-Key': HYPIXEL_API_KEY } });
        if (!response.ok) throw new Error(`Auction API Error on page ${page}: ${response.status}`);
        const data = await response.json();
        if (!data.success) throw new Error('Auction API call was not successful.');
        return data;
    }

    async function fetchAllAuctionData() {
        let allData = [];
        let page = 0;
        let total = 1;
        statusMessageEl.textContent = '全オークションデータを取得中... (0%)';
        while (page < total) {
            const data = await fetchAuctionPage(page);
            allData = allData.concat(data.auctions);
            total = data.totalPages;
            page++;
            statusMessageEl.textContent = `全オークションデータを取得中... (${Math.round((page / total) * 100)}%)`;
            await new Promise(res => setTimeout(res, 100));
        }
        return allData.filter(auc => !auc.item_lore.includes('Soulbound'));
    }

    async function fetchBazaarData() {
        try {
            const response = await fetch(`${API_BASE_URL}/bazaar`, { headers: { 'API-Key': HYPIXEL_API_KEY } });
            if (!response.ok) throw new Error(`Bazaar API Error: ${response.status}`);
            const data = await response.json();
            if (!data.success) throw new Error('Bazaar API call was not successful.');
            return data.products;
        } catch (error) {
            console.error("Failed to fetch Bazaar data:", error);
            return null;
        }
    }

    // --- UI & FILTERING ---
    function setupTabs() {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                tabContents.forEach(c => c.classList.remove('active'));
                document.getElementById(btn.dataset.tab).classList.add('active');
            });
        });
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

    // --- ANALYSIS & DISPLAY ---
    async function handleItemClick(item) {
        // This function can be used to show a summary for a single item if needed in the future.
        // For now, we focus on the main tabs.
        statusMessageEl.textContent = `アイテム「${item.name}」の情報を表示しています。`;
    }

    async function handleAnalyzeFlips() {
        analyzeFlipsBtn.disabled = true;
        analyzeFlipsBtn.textContent = '分析中...';
        statusMessageEl.textContent = '全オークションデータを取得中... (数分かかる場合があります)';
        flipTableBodyEl.innerHTML = '';

        const allAuctions = await fetchAllAuctionData();
        if (!allAuctions) {
            statusMessageEl.textContent = 'オークションデータの取得に失敗しました。';
            analyzeFlipsBtn.disabled = false;
            analyzeFlipsBtn.textContent = 'フリップを分析';
            return;
        }

        statusMessageEl.textContent = 'Bazaarデータを取得中...';
        const bazaarData = await fetchBazaarData();
        if (!bazaarData) {
            statusMessageEl.textContent = 'Bazaarデータの取得に失敗しました。';
            analyzeFlipsBtn.disabled = false;
            analyzeFlipsBtn.textContent = 'フリップを分析';
            return;
        }

        statusMessageEl.textContent = '利益の出るフリップを計算中...';
        const allFlips = await findAllFlips(allAuctions, bazaarData);

        if (allFlips.length > 0) {
            statusMessageEl.textContent = `${allFlips.length}件のフリップが見つかりました。`;
            localStorage.setItem(FLIPS_STORAGE_KEY, JSON.stringify(allFlips));
            displayFlipsInTable(allFlips);
        } else {
            statusMessageEl.textContent = '利益の出るフリップは見つかりませんでした。';
            localStorage.removeItem(FLIPS_STORAGE_KEY);
            flipTableBodyEl.innerHTML = '<tr><td colspan="7">-</td></tr>';
        }
        
        document.querySelector('[data-tab="flip-analyzer"]').click();

        analyzeFlipsBtn.disabled = false;
        analyzeFlipsBtn.textContent = 'フリップを分析';
    }

    async function findAllFlips(auctions, bazaarData) {
        const profitableFlips = [];
        const itemPrices = new Map();

        auctions.filter(a => a.bin).forEach(a => {
            if (!itemPrices.has(a.item_name)) itemPrices.set(a.item_name, []);
            itemPrices.get(a.item_name).push({ type: 'BIN', price: a.starting_bid, lore: a.item_lore });
        });

        for (const productId in bazaarData) {
            const product = bazaarData[productId];
            const itemName = allItems.find(item => item.id === productId)?.name;
            if (itemName) {
                if (!itemPrices.has(itemName)) itemPrices.set(itemName, []);
                if (product.buy_summary && product.buy_summary.length > 0) {
                    itemPrices.get(itemName).push({ type: 'Bazaar Buy', price: product.buy_summary[0].pricePerUnit, lore: '' });
                }
                if (product.sell_summary && product.sell_summary.length > 0) {
                    itemPrices.get(itemName).push({ type: 'Bazaar Sell', price: product.sell_summary[0].pricePerUnit, lore: '' });
                }
            }
        }

        for (const [itemName, prices] of itemPrices.entries()) {
            if (prices.length >= 2) {
                prices.sort((a, b) => a.price - b.price);
                const lowest = prices[0];
                const secondLowest = prices[1];
                const profit = secondLowest.price - lowest.price;
                const enchants = parseEnchants(lowest.lore);

                if (profit > 0) {
                    profitableFlips.push({ itemName, lowestPrice: lowest.price, secondLowestPrice: secondLowest.price, profit, source1: lowest.type, source2: lowest.type, enchants });
                }
            }
        }
        return profitableFlips.sort((a, b) => b.profit - a.profit);
    }

    function displayAuctionsInTable(auctions) {
        auctionTableBodyEl.innerHTML = ''; // Clear existing content
        auctions.forEach(auc => {
            const row = document.createElement('tr');
            const enchants = parseEnchants(auc.item_lore);
            const timeLeft = formatTimeLeft(auc.end - Date.now());
            row.innerHTML = `
                <td>${auc.item_name}</td>
                <td>${auc.starting_bid.toLocaleString()}</td>
                <td>${enchants}</td>
                <td>${timeLeft}</td>
                <td>${auc.auctioneer}</td>
            `;
            auctionTableBodyEl.appendChild(row);
        });
    }

    function displayFlipsInTable(flips) {
        flipTableBodyEl.innerHTML = '';
        flips.forEach(flip => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${flip.itemName}</td>
                <td>${flip.lowestPrice.toLocaleString()}</td>
                <td>${flip.secondLowestPrice.toLocaleString()}</td>
                <td>${flip.profit.toLocaleString()}</td>
                <td>${flip.source1}</td>
                <td>${flip.source2}</td>
                <td>${flip.enchants}</td>
            `;
            flipTableBodyEl.appendChild(row);
        });
    }

    function parseEnchants(lore) {
        if (!lore) return '';
        const enchantLines = lore.split('\n').filter(line => line.includes('§9'));
        return enchantLines.map(line => line.replace(/§[a-f0-9]/g, '').trim()).join(', ');
    }
    
    function formatTimeLeft(ms) {
        if (ms <= 0) return "Ended";
        const d = Math.floor(ms / (1000 * 60 * 60 * 24));
        const h = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        let str = '';
        if (d > 0) str += `${d}d `;
        if (h > 0) str += `${h}h `;
        if (m > 0) str += `${m}m `;
        return str.trim() || "< 1m";
    }

    function loadSavedFlips() {
        const savedFlips = localStorage.getItem(FLIPS_STORAGE_KEY);
        if (savedFlips) {
            statusMessageEl.textContent = `前回保存した ${JSON.parse(savedFlips).length} 件のフリップ情報を表示しています。`;
            displayFlipsInTable(JSON.parse(savedFlips));
            document.querySelector('[data-tab="flip-analyzer"]').click();
        }
    }

    async function loadMoreAuctions() {
        loadMoreAuctionsBtn.disabled = true;
        loadMoreAuctionsBtn.textContent = '読み込み中...';
        statusMessageEl.textContent = `オークションデータを読み込み中... (ページ ${currentAuctionPage + 1}/${totalAuctionPages})`;

        try {
            const data = await fetchAuctionPage(currentAuctionPage);
            totalAuctionPages = data.totalPages;
            const newAuctions = data.auctions.filter(auc => !auc.item_lore.includes('Soulbound'));
            tradeableAuctions = tradeableAuctions.concat(newAuctions);
            
            // Append to table, don't clear
            newAuctions.forEach(auc => {
                const row = document.createElement('tr');
                const enchants = parseEnchants(auc.item_lore);
                const timeLeft = formatTimeLeft(auc.end - Date.now());
                row.innerHTML = `
                    <td>${auc.item_name}</td>
                    <td>${auc.starting_bid.toLocaleString()}</td>
                    <td>${enchants}</td>
                    <td>${timeLeft}</td>
                    <td>${auc.auctioneer}</td>
                `;
                auctionTableBodyEl.appendChild(row);
            });

            currentAuctionPage++;
            if (currentAuctionPage >= totalAuctionPages) {
                loadMoreAuctionsBtn.disabled = true;
                loadMoreAuctionsBtn.textContent = 'すべてのオークションを読み込みました';
                statusMessageEl.textContent = `すべてのオークション (${tradeableAuctions.length}件) を読み込みました。`;
            } else {
                loadMoreAuctionsBtn.disabled = false;
                loadMoreAuctionsBtn.textContent = 'もっと読み込む';
                statusMessageEl.textContent = `オークションデータを読み込みました。次へ: ページ ${currentAuctionPage + 1}/${totalAuctionPages}`; 
            }
        } catch (error) {
            statusMessageEl.textContent = 'オークションデータの読み込みに失敗しました。';
            console.error("Load more auctions failed:", error);
            loadMoreAuctionsBtn.disabled = false;
            loadMoreAuctionsBtn.textContent = '読み込み失敗 - 再試行';
        }
    }

    function downloadAuctions() {
        if (tradeableAuctions.length === 0) {
            statusMessageEl.textContent = 'ダウンロードするオークションデータがありません。';
            return;
        }
        const dataStr = JSON.stringify(tradeableAuctions, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'hypixel_auctions.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        statusMessageEl.textContent = `${tradeableAuctions.length}件のオークションデータをダウンロードしました。`;
    }

    async function init() {
        statusMessageEl.textContent = 'アプリケーションを初期化中...';
        setupTabs();
        try {
            await fetchAllItems();
            populateFilters();
            applyFilters();
            loadSavedFlips();

            // Initial load for auction browser
            await loadMoreAuctions(); // Load the first page

            statusMessageEl.textContent = `初期化完了。`;

        } catch (error) {
            statusMessageEl.textContent = '初期化に失敗しました。APIキーを確認してページを再読み込みしてください。';
            console.error("Initialization failed:", error);
        }
    }

    // --- EVENT LISTENERS ---
    itemSearchEl.addEventListener('input', applyFilters);
    categoryFilterEl.addEventListener('change', applyFilters);
    rarityFilterEl.addEventListener('change', applyFilters);
    
    if (analyzeFlipsBtn) {
        analyzeFlipsBtn.addEventListener('click', handleAnalyzeFlips);
    }
    if (loadMoreAuctionsBtn) {
        loadMoreAuctionsBtn.addEventListener('click', loadMoreAuctions);
    }
    if (downloadAuctionsBtn) {
        downloadAuctionsBtn.addEventListener('click', downloadAuctions);
    }

    // --- INITIAL LOAD ---
    init();
});