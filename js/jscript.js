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
    const clearAuctionsBtn = document.getElementById('clear-auctions-btn'); // New element selection

    // --- Constants ---
    const API_BASE_URL = 'https://api.hypixel.net/skyblock';
    const HYPIXEL_API_KEY = '547b72b2-3434-4404-a33f-a0ac22835c90';
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

    async function fetchMinimalAuctionDataForFlips() {
        let allData = [];
        let page = 0;
        let total = 1;
        statusMessageEl.textContent = 'フリップ分析用オークションデータを取得中... (0%)';
        while (page < total) {
            const data = await fetchAuctionPage(page);
            // Extract only necessary fields to reduce memory footprint
            const minimalAuctions = data.auctions.map(auc => ({
                item_name: auc.item_name,
                starting_bid: auc.starting_bid,
                item_lore: auc.item_lore,
                bin: auc.bin
            })).filter(auc => !auc.item_lore.includes('Soulbound'));
            allData = allData.concat(minimalAuctions);
            total = data.totalPages;
            page++;
            statusMessageEl.textContent = `フリップ分析用オークションデータを取得中... (${Math.round((page / total) * 100)}%)`;
            await new Promise(res => setTimeout(res, 100));
        }
        return allData;
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
        statusMessageEl.textContent = `アイテム「${item.name}」の情報を表示しています。`;
        // Filter tradeableAuctions by item.name and display in auctionTableBodyEl
        const filteredAuctions = tradeableAuctions.filter(auc => auc.item_name === item.name);
        displayAuctionsInTable(filteredAuctions);
        document.querySelector('[data-tab="auction-browser"]').click();
        statusMessageEl.textContent = `${item.name} のオークション情報を表示しました。`;
        // Disable load more and download buttons when filtered
        if (loadMoreAuctionsBtn) loadMoreAuctionsBtn.disabled = true;
        if (downloadAuctionsBtn) downloadAuctionsBtn.disabled = true;
        if (clearAuctionsBtn) clearAuctionsBtn.disabled = true; // Disable clear button as well
    }

    async function handleAnalyzeFlips() {
        analyzeFlipsBtn.disabled = true;
        analyzeFlipsBtn.textContent = '分析中...';
        statusMessageEl.textContent = 'フリップ分析用オークションデータを取得中... (数分かかる場合があります)';
        flipTableBodyEl.innerHTML = '';

        const minimalAuctions = await fetchMinimalAuctionDataForFlips();
        if (!minimalAuctions) {
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
        const allFlips = await findAllFlips(minimalAuctions, bazaarData);

        if (allFlips.length > 0) {
            statusMessageEl.textContent = `${allFlips.length}件のフリップが見つかりました。`;
            localStorage.setItem(FLIPS_STORAGE_KEY, JSON.stringify(allFlips));
            displayFlipsInTable(allFlips);
        } else {
            statusMessageEl.textContent = '利益の出るフリップは見つかりませんでした。';
            localStorage.removeItem(FLIPS_STORAGE_KEY);
            flipTableBodyEl.innerHTML = '<tr><td colspan="8">-</td></tr>';
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
                const enchantmentValue = calculateEnchantmentValue(enchants, bazaarData);

                if (profit > 0) {
                    profitableFlips.push({ itemName, lowestPrice: lowest.price, secondLowestPrice: secondLowest.price, profit, source1: lowest.type, source2: lowest.type, enchants: enchants.map(e => `${e.name} ${e.level}`).join(', '), enchantmentValue });
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
                <td>${enchants.map(e => `${e.name} ${e.level}`).join(', ')}</td>
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
                <td>${flip.enchantmentValue.toLocaleString()}</td>
            `;
            flipTableBodyEl.appendChild(row);
        });
    }

    function parseEnchants(lore) {
        if (!lore) return [];
        const enchantLines = lore.split('\n').filter(line => line.includes('§9'));
        const enchants = [];
        const romanToNumber = { 'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10 };

        enchantLines.forEach(line => {
            const cleanLine = line.replace(/§[a-f0-9]/g, '').trim();
            const parts = cleanLine.split(' ');
            const levelRoman = parts.pop();
            const name = parts.join(' ');
            const level = romanToNumber[levelRoman] || 0;
            if (name && level > 0) {
                enchants.push({ name, level });
            }
        });
        return enchants;
    }

    function getEnchantmentBookPrice(enchantment, bazaarData) {
        const productId = `ENCHANTED_BOOK:${enchantment.name.toUpperCase().replace(/ /g, '_')}_${enchantment.level}`;
        if (bazaarData[productId] && bazaarData[productId].buy_summary && bazaarData[productId].buy_summary.length > 0) {
            return bazaarData[productId].buy_summary[0].pricePerUnit;
        }
        // Fallback: Try to find in auctions if not in bazaar (simplified for now)
        // This would require iterating through all auctions for enchanted books, which is very slow.
        // For now, we'll only use Bazaar for enchantment book prices.
        return 0;
    }

    function calculateEnchantmentValue(enchants, bazaarData) {
        let totalValue = 0;
        enchants.forEach(enchant => {
            totalValue += getEnchantmentBookPrice(enchant, bazaarData);
        });
        return totalValue;
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

    function clearAuctions() {
        tradeableAuctions = [];
        auctionTableBodyEl.innerHTML = '';
        currentAuctionPage = 0;
        totalAuctionPages = 1;
        if (loadMoreAuctionsBtn) {
            loadMoreAuctionsBtn.disabled = false;
            loadMoreAuctionsBtn.textContent = 'もっと読み込む';
        }
        statusMessageEl.textContent = '読み込み済みオークションデータをクリアしました。';
        // Re-enable other buttons if they were disabled by item click
        if (downloadAuctionsBtn) downloadAuctionsBtn.disabled = false;
        if (clearAuctionsBtn) clearAuctionsBtn.disabled = false;
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
    if (clearAuctionsBtn) { // New event listener for clear button
        clearAuctionsBtn.addEventListener('click', clearAuctions);
    }

    // --- INITIAL LOAD ---
    init();
});