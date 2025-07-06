const fetchBtn = document.getElementById('fetch-btn');
const resultTableBody = document.querySelector('#result-table tbody');

const API_URL = 'https://api.hypixel.net/skyblock/auctions';

async function fetchAllAuctions() {
    let allAuctions = [];
    let page = 0;
    let totalPages = 1;

    try {
        while (page < totalPages) {
            const response = await fetch(`${API_URL}?page=${page}`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            if (!data.success) {
                throw new Error('API call was not successful.');
            }
            allAuctions = allAuctions.concat(data.auctions);
            totalPages = data.totalPages;
            page++;
            // To avoid hitting rate limits, maybe add a small delay
            await new Promise(res => setTimeout(res, 100)); 
        }
        return allAuctions;
    } catch (error) {
        console.error("Failed to fetch auctions:", error);
        alert('オークションデータの取得に失敗しました。コンソールを確認してください。');
        return [];
    }
}

function findFlips(auctions) {
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

function displayResults(flips) {
    resultTableBody.innerHTML = ''; // Clear previous results

    if (flips.length === 0) {
        resultTableBody.innerHTML = '<tr><td colspan="4">利益の出るフリップは見つかりませんでした。</td></tr>';
        return;
    }

    for (const flip of flips) {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${flip.itemName}</td>
            <td>${flip.lowestPrice.toLocaleString()}</td>
            <td>${flip.secondLowestPrice.toLocaleString()}</td>
            <td>${flip.profit.toLocaleString()}</td>
        `;
        resultTableBody.appendChild(row);
    }
}

fetchBtn.addEventListener('click', async () => {
    fetchBtn.disabled = true;
    fetchBtn.textContent = '検索中...';
    resultTableBody.innerHTML = '<tr><td colspan="4">APIからデータを取得しています... (これには数分かかる場合があります)</td></tr>';

    const allAuctions = await fetchAllAuctions();
    if (allAuctions.length > 0) {
        const flips = findFlips(allAuctions);
        displayResults(flips);
    }

    fetchBtn.disabled = false;
    fetchBtn.textContent = 'フリップ対象を検索';
});