const API_URL = '/api';
let authToken = localStorage.getItem('arcanecrypto_token');
let networkChartInstance = null;

// Elementy DOM
const loginScreen = document.getElementById('login-screen');
const dashboardScreen = document.getElementById('dashboard-screen');
const loginForm = document.getElementById('login-form');
const loginCodeInput = document.getElementById('login-code');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');

// Elementy Dashboardu
const userNameEl = document.getElementById('user-name');
const userAvatarEl = document.getElementById('user-avatar');
const walletBalanceEl = document.getElementById('wallet-balance');
const statPowerEl = document.getElementById('stat-power');
const statActiveCardsEl = document.getElementById('stat-active-cards');
const statNetworkPowerEl = document.getElementById('stat-network-power');
const topMinersList = document.getElementById('top-miners-list');

// Inicjalizacja
document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        showDashboard();
    } else {
        showLogin();
    }
});

// Logowanie
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = loginCodeInput.value.trim();
    
    if (code.length !== 6) {
        loginError.textContent = 'Kod musi mieć 6 cyfr.';
        return;
    }

    try {
        const btn = loginForm.querySelector('button');
        btn.textContent = 'Logowanie...';
        btn.disabled = true;

        const response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });

        const data = await response.json();

        if (response.ok) {
            authToken = data.token;
            localStorage.setItem('arcanecrypto_token', authToken);
            showDashboard();
        } else {
            loginError.textContent = data.error || 'Błąd logowania.';
        }
    } catch (err) {
        loginError.textContent = 'Błąd połączenia z serwerem.';
        console.error(err);
    } finally {
        const btn = loginForm.querySelector('button');
        btn.textContent = 'Zaloguj się';
        btn.disabled = false;
    }
});

// Wylogowanie
logoutBtn.addEventListener('click', () => {
    authToken = null;
    localStorage.removeItem('arcanecrypto_token');
    showLogin();
});

function showLogin() {
    loginScreen.classList.add('active');
    dashboardScreen.classList.remove('active');
    loginCodeInput.value = '';
    loginError.textContent = '';
}

function showDashboard() {
    loginScreen.classList.remove('active');
    dashboardScreen.classList.add('active');
    loadDashboardData();
    
    // Odświeżaj dane co 30 sekund
    setInterval(loadDashboardData, 30000);
}

// Pobieranie i renderowanie danych
async function loadDashboardData() {
    try {
        // 1. Dane gracza (zabezpieczone)
        const meResponse = await fetch(`${API_URL}/me/data`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });
        
        if (meResponse.status === 401 || meResponse.status === 403) {
            // Token wygasł lub jest nieprawidłowy
            logoutBtn.click();
            return;
        }
        
        const meData = await meResponse.json();

        // 2. Dane publiczne sieci
        const publicResponse = await fetch(`${API_URL}/public/stats`);
        const publicData = await publicResponse.json();

        renderDashboard(meData, publicData);
    } catch (err) {
        console.error('Błąd ładowania danych dashboardu:', err);
    }
}

function renderDashboard(meData, publicData) {
    // Profil gracza
    userNameEl.textContent = meData.player.name;
    // Avatar używający UUID z formatowaniem bez myślników
    const uuidClean = meData.player.uuid.replace(/-/g, '');
    userAvatarEl.style.backgroundImage = `url('https://crafatar.com/avatars/${uuidClean}?overlay=true')`;

    // Portfel
    walletBalanceEl.textContent = Number(meData.wallet.balance).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    
    // Statystyki
    statPowerEl.innerHTML = `${meData.stats.totalPower.toFixed(2)} <small>Monet/min</small>`;
    statActiveCardsEl.innerHTML = `${meData.stats.activeCards} <small>/ ${meData.stats.totalCards}</small>`;
    
    statNetworkPowerEl.innerHTML = `${publicData.network.totalPower.toFixed(2)} <small>M/min</small>`;

    // Top Górnicy
    topMinersList.innerHTML = '';
    publicData.topMiners.forEach((miner, idx) => {
        const li = document.createElement('li');
        li.className = 'miner-item';
        
        let medal = '';
        if (idx === 0) medal = '🥇 ';
        if (idx === 1) medal = '🥈 ';
        if (idx === 2) medal = '🥉 ';

        li.innerHTML = `
            <span class="miner-name">${medal}${miner.player_name}</span>
            <span class="miner-bal">${Number(miner.balance).toLocaleString('pl-PL', { maximumFractionDigits: 0 })}</span>
        `;
        topMinersList.appendChild(li);
    });

    // Wykres
    renderChart(publicData.chart);
}

function renderChart(chartData) {
    const ctx = document.getElementById('networkChart').getContext('2d');
    
    if (networkChartInstance) {
        networkChartInstance.destroy();
    }

    // Gradient do wykresu
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(245, 158, 11, 0.5)'); // primary-accent
    gradient.addColorStop(1, 'rgba(245, 158, 11, 0.0)');

    networkChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'Moc Sieci (Monety/min)',
                data: chartData.data,
                borderColor: '#f59e0b',
                backgroundColor: gradient,
                borderWidth: 3,
                pointBackgroundColor: '#fff',
                pointBorderColor: '#f59e0b',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.4 // Zakrzywienie linii
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: 'rgba(11, 13, 23, 0.9)',
                    titleColor: '#94a3b8',
                    bodyColor: '#fff',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#94a3b8' }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#94a3b8' },
                    beginAtZero: true
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });
}
