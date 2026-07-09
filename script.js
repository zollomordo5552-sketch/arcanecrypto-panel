const API_URL = '/api';
let token = localStorage.getItem('crypto_token');
let currentData = null;
let mainChart = null;
let currentChartCurrency = 'COC';
let chartUpdateInterval = null;

// Konfiguracja wykresów
Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = 'Inter';

document.addEventListener('DOMContentLoaded', () => {
    if (token) {
        showApp();
        fetchData();
        setInterval(fetchData, 5000);
    } else {
        showLogin();
    }
});

function showLogin() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
}

function showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
}

async function doLogin() {
    const code = document.getElementById('login-code-input').value;
    const btn = document.getElementById('login-btn');
    const err = document.getElementById('login-error');

    if (!code || code.length < 4) {
        err.innerText = "Podaj poprawny kod z serwera";
        err.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = 'Łączenie...';
    err.classList.add('hidden');

    try {
        const res = await fetch(`${API_URL}?action=login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `code=${code}`
        });
        const data = await res.json();
        if (data.success) {
            token = data.token;
            localStorage.setItem('crypto_token', token);
            showApp();
            fetchData();
            setInterval(fetchData, 5000);
        } else {
            err.innerText = data.error || "Błąd logowania";
            err.classList.remove('hidden');
        }
    } catch (e) {
        err.innerText = "Błąd połączenia z API";
        err.classList.remove('hidden');
    }
    
    btn.disabled = false;
    btn.innerHTML = `<span>Zaloguj się</span><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
}

function doLogout() {
    localStorage.removeItem('crypto_token');
    token = null;
    location.reload();
}

async function fetchData() {
    if (!token) return;
    try {
        const res = await fetch(`${API_URL}?action=dashboard`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (data.error) {
            if (data.error === "Invalid token") doLogout();
            return;
        }

        currentData = data;
        updateUI();
    } catch (e) {
        console.error("Fetch data error:", e);
    }
}

function updateUI() {
    if (!currentData) return;
    const { player, economy, market, history } = currentData;

    // Sidebar
    document.getElementById('sidebar-name').innerText = player.name;
    document.querySelector('.player-avatar').innerHTML = `<img src="https://crafatar.com/avatars/${player.uuid}?size=40&overlay" alt="avatar" style="border-radius:8px;">`;

    // Balances
    const vpln = parseFloat(economy.vpln).toLocaleString('pl-PL', {minimumFractionDigits: 2, maximumFractionDigits:2});
    
    const vplnEl = document.getElementById('vpln-balance');
    if (!vplnEl.classList.contains('hidden-balance')) {
        vplnEl.innerText = `${vpln} VPLN`;
    }
    
    document.getElementById('w-vpln').innerText = vpln;
    document.getElementById('w-coc').innerText = economy.coc.toFixed(6);
    document.getElementById('w-pxc').innerText = economy.pxc.toFixed(6);
    document.getElementById('w-vxc').innerText = economy.vxc.toFixed(6);

    document.getElementById('w-coc-val').innerText = `≈ ${(economy.coc * market.COC.price).toLocaleString('pl-PL')} VPLN`;
    document.getElementById('w-pxc-val').innerText = `≈ ${(economy.pxc * market.PXC.price).toLocaleString('pl-PL')} VPLN`;
    document.getElementById('w-vxc-val').innerText = `≈ ${(economy.vxc * market.VXC.price).toLocaleString('pl-PL')} VPLN`;

    // Sidebar small list
    document.getElementById('coc-amount').innerText = economy.coc.toFixed(6);
    document.getElementById('pxc-amount').innerText = economy.pxc.toFixed(6);
    document.getElementById('vxc-amount').innerText = economy.vxc.toFixed(6);
    document.getElementById('coc-value').innerText = `≈ ${(economy.coc * market.COC.price).toLocaleString('pl-PL', {maximumFractionDigits:0})} VPLN`;
    document.getElementById('pxc-value').innerText = `≈ ${(economy.pxc * market.PXC.price).toLocaleString('pl-PL', {maximumFractionDigits:0})} VPLN`;
    document.getElementById('vxc-value').innerText = `≈ ${(economy.vxc * market.VXC.price).toLocaleString('pl-PL', {maximumFractionDigits:0})} VPLN`;

    // Total Value Calculation
    let totalCrypto = (economy.coc * market.COC.price) + (economy.pxc * market.PXC.price) + (economy.vxc * market.VXC.price);
    document.getElementById('total-crypto-value').innerText = `${totalCrypto.toLocaleString('pl-PL', {minimumFractionDigits: 2, maximumFractionDigits:2})} VPLN`;
    
    // Market Prices
    updateMarketCard('coc', 'COC', market.COC);
    updateMarketCard('pxc', 'PXC', market.PXC);
    updateMarketCard('vxc', 'VXC', market.VXC);

    // Recent Transactions
    updateHistoryTable(history);

    // Chart update
    if (mainChart) {
        // Just checking status dot
        const trend = market[currentChartCurrency].trend;
        const dot = document.querySelector('#chart-status .status-dot');
        const txt = document.getElementById('chart-status-text');
        
        if (trend >= 0) {
            dot.className = 'status-dot green';
            txt.innerText = 'WZRASTA';
            txt.style.color = 'var(--positive)';
        } else {
            dot.className = 'status-dot red';
            txt.innerText = 'SPADA';
            txt.style.color = 'var(--negative)';
        }
    } else {
        initChart(market[currentChartCurrency].history);
    }
}

function updateMarketCard(idPrefix, symbol, data) {
    document.getElementById(`${idPrefix}-price`).innerText = `${data.price.toLocaleString('pl-PL')} VPLN`;
    const changeEl = document.getElementById(`${idPrefix}-change`);
    if (data.trend >= 0) {
        changeEl.innerText = `+${data.trend.toFixed(2)}%`;
        changeEl.className = 'market-change positive';
    } else {
        changeEl.innerText = `${data.trend.toFixed(2)}%`;
        changeEl.className = 'market-change negative';
    }
}

function updateHistoryTable(history) {
    const recentTbody = document.getElementById('recent-transactions');
    const allTbody = document.getElementById('all-transactions');
    
    if (!history || history.length === 0) {
        const empty = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Brak transakcji</td></tr>`;
        recentTbody.innerHTML = empty;
        allTbody.innerHTML = empty;
        return;
    }

    let html = '';
    history.forEach(tx => {
        const typeClass = tx.type === 'BUY' ? 'type-buy' : 'type-sell';
        const typeLabel = tx.type === 'BUY' ? 'KUPNO' : 'SPRZEDAŻ';
        const date = new Date(tx.timestamp).toLocaleString('pl-PL');
        
        html += `
            <tr>
                <td><strong>${tx.currency}</strong></td>
                <td><span class="type-badge ${typeClass}">${typeLabel}</span></td>
                <td>${parseFloat(tx.crypto_amount).toFixed(6)}</td>
                <td>${parseFloat(tx.vpln_amount).toLocaleString('pl-PL', {minimumFractionDigits:2})} VPLN</td>
                <td style="color:var(--text-muted); font-size:0.8rem;">${date}</td>
                <td style="color:var(--positive);">Ukończono</td>
            </tr>
        `;
    });

    allTbody.innerHTML = html;
    
    // Tylko 5 dla recent
    let recentHtml = '';
    history.slice(0, 5).forEach(tx => {
        const typeClass = tx.type === 'BUY' ? 'type-buy' : 'type-sell';
        const typeLabel = tx.type === 'BUY' ? 'KUPNO' : 'SPRZEDAŻ';
        const date = new Date(tx.timestamp).toLocaleString('pl-PL');
        recentHtml += `
            <tr>
                <td><strong>${tx.currency}</strong></td>
                <td><span class="type-badge ${typeClass}">${typeLabel}</span></td>
                <td>${parseFloat(tx.crypto_amount).toFixed(6)}</td>
                <td>${parseFloat(tx.vpln_amount).toLocaleString('pl-PL', {minimumFractionDigits:2})}</td>
                <td style="color:var(--text-muted); font-size:0.8rem;">${date}</td>
                <td style="color:var(--positive);">Ukończono</td>
            </tr>
        `;
    });
    recentTbody.innerHTML = recentHtml;
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(`page-${pageId}`).classList.remove('hidden');
    
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.getElementById(`nav-${pageId}`).classList.add('active');
}

function toggleBalance() {
    const el = document.getElementById('vpln-balance');
    if (el.classList.contains('hidden-balance')) {
        el.classList.remove('hidden-balance');
        el.innerText = `${parseFloat(currentData.economy.vpln).toLocaleString('pl-PL', {minimumFractionDigits: 2, maximumFractionDigits:2})} VPLN`;
    } else {
        el.classList.add('hidden-balance');
        el.innerText = '••••••• VPLN';
    }
}

// ─── WYKRES ──────────────────────────────────────────────────────────────

function initChart(historyData) {
    const ctx = document.getElementById('main-chart').getContext('2d');
    
    // Gradient
    let gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(59, 130, 246, 0.5)');
    gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

    const labels = historyData.map((_, i) => `T-${historyData.length - i}`);
    const dataPoints = historyData;

    mainChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Cena VPLN',
                data: dataPoints,
                borderColor: '#3b82f6',
                backgroundColor: gradient,
                borderWidth: 3,
                pointRadius: 0,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index',
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(15, 17, 26, 0.9)',
                    titleColor: '#94a3b8',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            return context.parsed.y.toLocaleString('pl-PL') + ' VPLN';
                        }
                    }
                }
            },
            scales: {
                x: {
                    display: false,
                    grid: { display: false }
                },
                y: {
                    border: { display: false },
                    grid: {
                        color: 'rgba(255,255,255,0.05)',
                        drawTicks: false
                    },
                    ticks: {
                        callback: function(value) {
                            return value.toLocaleString('pl-PL');
                        },
                        padding: 10
                    }
                }
            }
        }
    });
}

function switchChartCurrency(currency) {
    document.querySelectorAll('.cur-tab').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    
    currentChartCurrency = currency;
    if (mainChart && currentData) {
        const historyData = currentData.market[currency].history;
        mainChart.data.labels = historyData.map((_, i) => `T-${historyData.length - i}`);
        mainChart.data.datasets[0].data = historyData;
        
        // Zmień kolory w zależności od waluty
        let color = '#3b82f6';
        if (currency === 'COC') color = '#eab308';
        if (currency === 'PXC') color = '#06b6d4';
        if (currency === 'VXC') color = '#a855f7';
        
        mainChart.data.datasets[0].borderColor = color;
        
        let gradient = mainChart.ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, color + '80'); // 50% opacity
        gradient.addColorStop(1, color + '00'); // 0% opacity
        mainChart.data.datasets[0].backgroundColor = gradient;
        
        mainChart.update();
        updateUI();
    }
}

function setTimeRange(range) {
    document.querySelectorAll('.tr-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    // W prawdziwym API tu byśmy pobierali więcej danych historycznych
    showToast(`Zmieniono zakres na ${range}`);
}


// ─── TRANSAKCJE ───────────────────────────────────────────────────────────

let currentTradeConfig = null;

function openTrade(currency, type) {
    currentTradeConfig = { currency, type };
    const modal = document.getElementById('trade-modal');
    const price = currentData.market[currency].price;
    const balanceVpln = currentData.economy.vpln;
    const balanceCrypto = currentData.economy[currency.toLowerCase()];

    document.getElementById('modal-title').innerText = type === 'buy' ? `Kup ${currency}` : `Sprzedaj ${currency}`;
    document.getElementById('modal-price').innerText = `${price.toLocaleString('pl-PL')} VPLN`;
    
    if (type === 'buy') {
        document.getElementById('modal-input-label').innerText = 'Kwota (VPLN):';
        document.getElementById('modal-receive-label').innerText = 'Otrzymasz krypto:';
        document.getElementById('modal-balance').innerText = `${balanceVpln.toLocaleString('pl-PL')} VPLN`;
        document.getElementById('modal-amount').placeholder = '1000';
    } else {
        document.getElementById('modal-input-label').innerText = `Ilość (${currency}):`;
        document.getElementById('modal-receive-label').innerText = 'Otrzymasz VPLN:';
        document.getElementById('modal-balance').innerText = `${balanceCrypto.toFixed(6)} ${currency}`;
        document.getElementById('modal-amount').placeholder = '0.01';
    }

    document.getElementById('modal-amount').value = '';
    document.getElementById('modal-receive').innerText = '0';
    document.getElementById('modal-error').classList.add('hidden');
    
    modal.classList.remove('hidden');

    document.getElementById('modal-amount').oninput = function() {
        const val = parseFloat(this.value);
        if (isNaN(val) || val <= 0) {
            document.getElementById('modal-receive').innerText = '0';
            return;
        }
        if (type === 'buy') {
            document.getElementById('modal-receive').innerText = (val / price).toFixed(6) + ' ' + currency;
        } else {
            document.getElementById('modal-receive').innerText = (val * price).toLocaleString('pl-PL') + ' VPLN';
        }
    };
}

function closeModal() {
    document.getElementById('trade-modal').classList.add('hidden');
    currentTradeConfig = null;
}

function closeTradeIfOutside(event) {
    if (event.target === document.getElementById('trade-modal')) {
        closeModal();
    }
}

async function confirmTrade() {
    const err = document.getElementById('modal-error');
    const btn = document.getElementById('modal-confirm-btn');
    const amountStr = document.getElementById('modal-amount').value;
    const amount = parseFloat(amountStr);

    if (isNaN(amount) || amount <= 0) {
        err.innerText = "Podaj poprawną wartość";
        err.classList.remove('hidden');
        return;
    }

    if (currentTradeConfig.type === 'buy' && amount < 1000) {
        err.innerText = "Minimalna kwota inwestycji to 1 000 VPLN";
        err.classList.remove('hidden');
        return;
    }

    btn.disabled = true;
    btn.innerText = "Przetwarzanie...";
    
    try {
        const action = currentTradeConfig.type === 'buy' ? 'invest' : 'sell';
        const res = await fetch(`${API_URL}?action=${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Authorization': `Bearer ${token}` },
            body: `currency=${currentTradeConfig.currency}&amount=${amount}`
        });
        const data = await res.json();
        
        if (data.success) {
            showToast("Transakcja zakończona sukcesem!");
            closeModal();
            fetchData(); // Odśwież UI
        } else {
            err.innerText = data.error || "Błąd transakcji";
            err.classList.remove('hidden');
        }
    } catch (e) {
        err.innerText = "Błąd połączenia";
        err.classList.remove('hidden');
    }

    btn.disabled = false;
    btn.innerText = "Potwierdź";
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}
