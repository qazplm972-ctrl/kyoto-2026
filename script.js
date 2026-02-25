// 1. 初始化 Supabase (請填入你之前找到的 URL 和 Key)
const SUPABASE_URL = 'https://oqhrmduoffcdnrclizhq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_viqnMXMbtPUFmEB6UC_E7A_BT6LYqSy';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const JPY_RATE = 0.21; // 2026 京都行預估匯率

// 2. 全域狀態
let selectedCategory = '育維'; // 預設類別
let selectedPayer = '育維';    // 預設付款人
let selectedCurrency = 'jpy';  // 預設幣別
let currentTab = '全部';      // 預設分頁
let expensesData = [];        // 快取抓到的資料

// 3. 初始化讀取
async function fetchRecords() {
    const { data, error } = await supabaseClient
        .from('expenses')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('讀取失敗:', error.message);
        return;
    }
    expensesData = data;
    // make sure tabs reflect current selection
    selectTab(currentTab);
}

// 4. 渲染 UI
function render(data) {
    const list = document.getElementById('expense-list');
    // decide which data to use for statistics (based on currentTab)
    const statsBase = currentTab === '全部' ? data : data.filter(r => r.category === currentTab);
    const headerStats = {
        jpy: { '育維': 0, '惠芳': 0, sharedTotal: 0, sharedPaid: { '育維': 0, '惠芳': 0 } },
        twd: { '育維': 0, '惠芳': 0, sharedTotal: 0, sharedPaid: { '育維': 0, '惠芳': 0 } }
    };
    statsBase.forEach(r => {
        if (!r.amount_twd && !r.amount_jpy) return;
        if (r.category === '共用') {
            if (r.amount_jpy) headerStats.jpy.sharedTotal += r.amount_jpy;
            if (r.amount_twd) headerStats.twd.sharedTotal += r.amount_twd;
            if (r.paid_by && headerStats.jpy.sharedPaid[r.paid_by] !== undefined && r.amount_jpy) {
                headerStats.jpy.sharedPaid[r.paid_by] += r.amount_jpy;
            }
            if (r.paid_by && headerStats.twd.sharedPaid[r.paid_by] !== undefined && r.amount_twd) {
                headerStats.twd.sharedPaid[r.paid_by] += r.amount_twd;
            }
        } else {
            if (headerStats.jpy[r.category] !== undefined && r.amount_jpy) {
                headerStats.jpy[r.category] += r.amount_jpy;
            }
            if (headerStats.twd[r.category] !== undefined && r.amount_twd) {
                headerStats.twd[r.category] += r.amount_twd;
            }
        }
    });

    // 顯示所有資料，但依分頁篩選
    const visible = currentTab === '全部' ? data : data.filter(r => {
        if (currentTab === '育維') return r.paid_by === '育維';
        if (currentTab === '惠芳') return r.paid_by === '惠芳';
        if (currentTab === '共用') return r.category === '共用';
        return true;
    });

    // 計算統計資訊（由 visible 資料決定）
    const personal = { '育維': 0, '惠芳': 0 };
    let sharedTotal = 0;
    const sharedPaid = { '育維': 0, '惠芳': 0 };

    // 分組資料 (依日期)
    const groups = {};
    visible.forEach(r => {
        if (r.amount_twd) {
            if (r.category === '共用') {
                sharedTotal += r.amount_twd;
                if (r.paid_by && sharedPaid[r.paid_by] !== undefined) {
                    sharedPaid[r.paid_by] += r.amount_twd;
                }
            } else if (personal[r.category] !== undefined) {
                personal[r.category] += r.amount_twd;
            }
        }
        const dateKey = new Date(r.created_at).toLocaleDateString();
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(r);
    });

    // 建立 HTML：依日期排序（最新在前）
    const groupHtml = Object.keys(groups)
        .sort((a, b) => new Date(b) - new Date(a))
        .map(date => {
            const itemsHtml = groups[date].map(r => {
                const showPayer = currentTab === '全部' || currentTab === '共用';
                const amountDisplay = r.amount_jpy > 0 ? `¥${r.amount_jpy}` : `NT$${r.amount_twd}`;
                return `
                <div class="bg-white p-4 rounded-2xl shadow-sm flex justify-between items-center border border-slate-100">
                    <div class="flex-1">
                        <div class="font-bold text-slate-700">${r.item}</div>
                        ${showPayer ? `
                        <div class="text-[10px] mt-1">
                            <span class="bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-medium">
                                付：${r.paid_by || '未註記'}
                            </span>
                        </div>
                        ` : ''}
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="text-right">
                            <div class="text-lg font-bold text-slate-900">${amountDisplay}</div>
                        </div>
                        <button onclick="deleteRecord(${r.id})" class="p-2 text-slate-300 hover:text-red-500">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                        </button>
                    </div>
                </div>
            `;
            }).join('');
            return `<div class="mb-6">
                        <div class="text-sm text-slate-400 font-semibold mb-2">${date}</div>
                        <div class="space-y-3">
                            ${itemsHtml}
                        </div>
                    </div>`;
        }).join('');

    list.innerHTML = groupHtml || '<div class="text-center py-10 text-slate-300">目前沒有帳目</div>';

    // update header values with separate lines
    const setVal = (idJpySpan, idTwdSpan, jpy, twd) => {
        document.getElementById(idJpySpan).innerText = `¥${jpy}`;
        document.getElementById(idTwdSpan).innerText = `NT$${twd}`;
        document.getElementById(idTwdSpan).classList.remove('hidden');
    };
    setVal('total-mine-jpy', 'total-mine-twd', headerStats.jpy['育維'], headerStats.twd['育維']);
    setVal('total-wife-jpy', 'total-wife-twd', headerStats.jpy['惠芳'], headerStats.twd['惠芳']);
    setVal('total-shared-jpy', 'total-shared-twd', headerStats.jpy.sharedTotal, headerStats.twd.sharedTotal);
    setVal('total-shared-mine-jpy', 'total-shared-mine-twd', headerStats.jpy.sharedPaid['育維'], headerStats.twd.sharedPaid['育維']);
    setVal('total-shared-wife-jpy', 'total-shared-wife-twd', headerStats.jpy.sharedPaid['惠芳'], headerStats.twd.sharedPaid['惠芳']);

    // show/hide cards according to currentTab
    const mineCard = document.getElementById('stat-mine-card');
    const wifeCard = document.getElementById('stat-wife-card');
    const sharedCard = document.getElementById('stat-shared-card');
    const sharedMineCard = document.getElementById('stat-shared-mine-card');
    const sharedWifeCard = document.getElementById('stat-shared-wife-card');

    // reset visibility
    [mineCard, wifeCard, sharedCard, sharedMineCard, sharedWifeCard].forEach(el => el.classList.add('hidden'));
    if (currentTab === '育維') {
        mineCard.classList.remove('hidden');
    } else if (currentTab === '惠芳') {
        wifeCard.classList.remove('hidden');
    } else if (currentTab === '共用') {
        sharedCard.classList.remove('hidden');
        sharedMineCard.classList.remove('hidden');
        sharedWifeCard.classList.remove('hidden');
    } else {
        // 全部
        mineCard.classList.remove('hidden');
        wifeCard.classList.remove('hidden');
        sharedCard.classList.remove('hidden');
        sharedMineCard.classList.remove('hidden');
        sharedWifeCard.classList.remove('hidden');
    }
}


// 5. 儲存功能 (包含付款人欄位)
async function saveRecord() {
    const item = document.getElementById('item').value;
    const amount = parseFloat(document.getElementById('amount').value) || 0;
    const btn = document.getElementById('save-btn');

    if (!item || amount === 0) return alert('請輸入完整資訊');

    btn.disabled = true;
    const recordData = {
        item,
        category: selectedCategory,
        paid_by: selectedPayer
    };

    // 根據幣別設置金額
    if (selectedCurrency === 'jpy') {
        recordData.amount_jpy = amount;
        recordData.amount_twd = 0;
    } else {
        recordData.amount_jpy = 0;
        recordData.amount_twd = amount;
    }
    
    const { error } = await supabaseClient
        .from('expenses')
        .insert([recordData]);

    btn.disabled = false;
    if (error) {
        alert('儲存失敗:' + error.message);
    } else {
        closeModal();
        fetchRecords(); // refresh immediately
    }
}

// 6. UI 切換邏輯
function selectCurrency(currency) {
    selectedCurrency = currency;
    const label = document.getElementById('amount-label');
    const input = document.getElementById('amount');
    
    document.querySelectorAll('.currency-btn').forEach(b => {
        const isMatch = b.dataset.val === currency;
        b.className = `currency-btn py-3 border-2 rounded-xl text-sm ${isMatch ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-100'}`;
    });

    if (currency === 'jpy') {
        label.innerText = '金額 (日幣)';
        input.placeholder = '¥ 0';
    } else {
        label.innerText = '金額 (台幣)';
        input.placeholder = 'NT$ 0';
    }
}

function selectCategory(cat) {
    selectedCategory = cat;
    document.querySelectorAll('.cat-btn').forEach(b => {
        const isMatch = b.dataset.val === cat;
        b.className = `cat-btn py-3 border-2 rounded-xl text-sm ${isMatch ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-100'}`;
    });

    // 只有共用類別才顯示付款人選項
    const payerSection = document.getElementById('payer-section');
    if (cat === '共用') {
        payerSection.classList.remove('hidden');
    } else {
        payerSection.classList.add('hidden');
        // 個人帳戶時，付款人應該等於類別
        selectedPayer = cat;
    }
}

function selectPayer(payer) {
    selectedPayer = payer;
    document.querySelectorAll('.payer-btn').forEach(b => {
        const isMatch = b.dataset.val === payer;
        b.className = `payer-btn py-3 border-2 rounded-xl text-sm ${isMatch ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-100'}`;
    });
}

function openModal() {
    document.getElementById('modal').classList.replace('hidden', 'flex');
    selectCategory('育維'); // default to 育維
    selectPayer('育維');
    selectCurrency('jpy'); // default to jpy
}

// 分頁切換
function selectTab(tab) {
    currentTab = tab;
    document.querySelectorAll('#tabs .tab-btn').forEach(b => {
        const isActive = b.textContent === tab;
        if (isActive) {
            b.className = `tab-btn flex-1 text-center py-2 text-sm font-medium text-white rounded-full bg-indigo-600 border border-transparent`;
        } else {
            b.className = `tab-btn flex-1 text-center py-2 text-sm font-medium text-slate-600 rounded-full bg-slate-100 border border-transparent`;
        }
    });

    // show/hide headers based on tab
    const hideHeaders = tab === '育維' || tab === '惠芳' || tab === '共用';
    document.getElementById('personal-header').classList.toggle('hidden', hideHeaders);
    document.getElementById('shared-header').classList.toggle('hidden', hideHeaders);
    // remove mb-4 margin when headers are hidden
    document.getElementById('personal-section').classList.toggle('mb-4', !hideHeaders);

    // adjust personal grid columns
    const personalGrid = document.getElementById('personal-grid');
    if (hideHeaders) {
        personalGrid.classList.remove('grid-cols-2');
        personalGrid.classList.add('grid-cols-1');
    } else {
        personalGrid.classList.remove('grid-cols-1');
        personalGrid.classList.add('grid-cols-2');
    }

    render(expensesData);
}

// 點擊遮罩空白處也能關閉 modal
const modalOverlay = document.getElementById('modal');
modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) {
        closeModal();
    }
});

function closeModal() {
    document.getElementById('modal').classList.replace('flex', 'hidden');
    document.getElementById('item').value = '';
    document.getElementById('amount').value = '';
}

async function deleteRecord(id) {
    if (!confirm('要刪除這筆開銷嗎？')) return;
    await supabaseClient.from('expenses').delete().eq('id', id);
    fetchRecords(); // refresh after deletion
}

// 7. 啟動即時監聽與初始化
const setupRealtime = () => {
    supabaseClient
        .channel('db-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, () => fetchRecords())
        .subscribe();
};

fetchRecords();
setupRealtime();