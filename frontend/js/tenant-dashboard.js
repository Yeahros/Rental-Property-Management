const API_URL = 'http://localhost:3000/api';

// Helper functions
function formatCurrency(amount) {
    if (!amount) return '0';
    return new Intl.NumberFormat('vi-VN').format(amount);
}

function formatDate(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    return d.toLocaleDateString('vi-VN', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

function formatShortDate(dateString) {
    if (!dateString) return '';
    const d = new Date(dateString);
    return d.toLocaleDateString('vi-VN');
}

function getMonthName(month) {
    const months = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
    return months[month - 1] || '';
}

function getAuthToken() {
    return localStorage.getItem('token');
}

function getAuthHeaders() {
    const token = getAuthToken();
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
}

// Load Overview (Thông tin phòng trọ)
async function loadOverview() {
    try {
        // Nếu đã có currentRoomId (đã chọn phòng), dùng nó để load overview
        const url = window.currentRoomId 
            ? `${API_URL}/tenant/dashboard/overview?room_id=${window.currentRoomId}`
            : `${API_URL}/tenant/dashboard/overview`;
            
        const res = await fetch(url, {
            headers: getAuthHeaders()
        });
        
        if (!res.ok) {
            if (res.status === 401) {
                window.location.href = 'index.html';
                return;
            }
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        
        const data = await res.json();
        
        // Cập nhật thông tin phòng
        const roomNumberEl = document.getElementById('room-number');
        const houseNameEl = document.getElementById('house-name');
        const addressEl = document.getElementById('address');
        const contractEndDateEl = document.getElementById('contract-end-date');
        
        if (roomNumberEl) roomNumberEl.textContent = `Căn hộ ${data.room.room_number}`;
        if (houseNameEl) houseNameEl.textContent = data.house.house_name;
        if (addressEl) addressEl.textContent = data.house.address;
        if (contractEndDateEl) contractEndDateEl.textContent = formatShortDate(data.contract.end_date);
        
        // Chỉ set currentRoomId nếu chưa có (lần đầu load)
        if (!window.currentRoomId) {
            window.currentRoomId = data.room.room_id;
        }
        
    } catch (err) {
        console.error('Load Overview Error:', err);
    }
}

// Load Rooms (Danh sách phòng để chuyển)
async function loadRooms() {
    try {
        const res = await fetch(`${API_URL}/tenant/dashboard/rooms`, {
            headers: getAuthHeaders()
        });
        
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        
        const data = await res.json();
        
        // Nếu có hơn 1 phòng, hiển thị dropdown chọn phòng
        const roomSelector = document.getElementById('room-selector');
        if (data.length > 1 && roomSelector) {
            // Xóa class hidden và thêm flex để hiển thị
            roomSelector.classList.remove('hidden');
            roomSelector.classList.add('flex');
            
            const dropdown = document.getElementById('room-dropdown');
            if (dropdown) {
                dropdown.innerHTML = '';
                data.forEach(room => {
                    const option = document.createElement('div');
                    option.className = 'px-4 py-2 hover:bg-white/20 dark:hover:bg-gray-700 cursor-pointer rounded text-gray-800 dark:text-gray-200';
                    option.textContent = `${room.room_number} - ${room.house_name}`;
                    option.onclick = () => {
                        switchRoom(room.room_id);
                        dropdown.classList.add('hidden');
                    };
                    dropdown.appendChild(option);
                });
            }
        } else {
            // Nếu chỉ có 1 phòng hoặc không có phòng, ẩn selector
            if (roomSelector) {
                roomSelector.classList.add('hidden');
                roomSelector.classList.remove('flex');
            }
        }
        
    } catch (err) {
        console.error('Load Rooms Error:', err);
    }
}

function switchRoom(roomId) {
    // Parse roomId để đảm bảo là số
    const id = parseInt(roomId);
    if (isNaN(id) || id <= 0) {
        console.error('Invalid room ID:', roomId);
        return;
    }
    
    window.currentRoomId = id;
    
    // Load lại tất cả dữ liệu với phòng mới
    loadAllData();
}

// Load Next Payment
async function loadNextPayment() {
    try {
        const url = window.currentRoomId 
            ? `${API_URL}/tenant/dashboard/next-payment?room_id=${window.currentRoomId}`
            : `${API_URL}/tenant/dashboard/next-payment`;
            
        const res = await fetch(url, {
            headers: getAuthHeaders()
        });
        
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        
        const data = await res.json();
        
        const amountEl = document.getElementById('next-payment-amount');
        const dueDateEl = document.getElementById('next-payment-due-date');
        const daysEl = document.getElementById('next-payment-days');
        const statusBadgeEl = document.getElementById('next-payment-status');
        
        if (!data || !data.total_amount) {
            // Không có thanh toán nào - hiển thị thông báo nhưng giữ nguyên cấu trúc
            if (amountEl) amountEl.textContent = '0 đ';
            if (dueDateEl) dueDateEl.textContent = 'Không có thanh toán nào sắp tới';
            if (statusBadgeEl) {
                statusBadgeEl.textContent = 'Không có';
                statusBadgeEl.className = 'bg-gray-100 text-gray-700 dark:bg-gray-900 dark:text-gray-200 text-xs px-3 py-1 rounded-full font-medium';
            }
            return;
        }
        
        // Có dữ liệu - cập nhật thông tin
        if (amountEl) amountEl.textContent = formatCurrency(data.total_amount) + ' đ';
        if (dueDateEl) {
            const dueDate = formatShortDate(data.due_date);
            const days = data.days_until_due || 0;
            dueDateEl.textContent = `Đến hạn vào ${dueDate} (${days} ngày)`;
        }
        
        // Cập nhật status badge
        if (statusBadgeEl) {
            let statusText = 'Đúng Hạn';
            let statusClass = 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200';
            
            if (data.payment_status === 'overdue') {
                statusText = 'Quá Hạn';
                statusClass = 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200';
            } else if (data.payment_status === 'due_soon') {
                statusText = 'Sắp Đến Hạn';
                statusClass = 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-200';
            }
            
            statusBadgeEl.textContent = statusText;
            statusBadgeEl.className = `${statusClass} text-xs px-3 py-1 rounded-full font-medium`;
        }
        
    } catch (err) {
        console.error('Load Next Payment Error:', err);
    }
}

// Load Recent Payments
async function loadRecentPayments() {
    try {
        const url = window.currentRoomId 
            ? `${API_URL}/tenant/dashboard/recent-payments?room_id=${window.currentRoomId}&limit=5`
            : `${API_URL}/tenant/dashboard/recent-payments?limit=5`;
            
        const res = await fetch(url, {
            headers: getAuthHeaders()
        });
        
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        
        const data = await res.json();
        
        const container = document.getElementById('recent-payments-list');
        if (!container) return;
        
        if (data.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-4">Chưa có thanh toán nào</p>';
            return;
        }
        
        container.innerHTML = data.map(payment => `
            <div class="flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg transition-colors group">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400">
                        <span class="material-icons-outlined">check_circle</span>
                    </div>
                    <div>
                        <p class="font-medium text-sm">Tháng ${payment.billing_period}</p>
                        <p class="text-xs text-text-sub-light dark:text-text-sub-dark">${formatShortDate(payment.paid_date)}</p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="font-bold text-secondary dark:text-blue-300">${formatCurrency(payment.total_amount)} đ</p>
                    <p class="text-xs text-primary flex items-center justify-end gap-1 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">
                        <span class="material-icons-outlined text-[10px]">download</span>
                        Biên lai
                    </p>
                </div>
            </div>
        `).join('');
        
    } catch (err) {
        console.error('Load Recent Payments Error:', err);
    }
}

// Load Monthly Expenses
async function loadMonthlyExpenses() {
    try {
        const url = window.currentRoomId 
            ? `${API_URL}/tenant/dashboard/monthly-expenses?room_id=${window.currentRoomId}`
            : `${API_URL}/tenant/dashboard/monthly-expenses`;
            
        const res = await fetch(url, {
            headers: getAuthHeaders()
        });
        
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        
        let data = await res.json();
        if (!Array.isArray(data)) data = [];
        
        const container = document.getElementById('monthly-expenses-chart');
        if (!container) return;

        if (data.length === 0) {
            container.innerHTML = `<p class="text-center text-gray-500 dark:text-gray-400 w-full">Không có dữ liệu chi tiêu.</p>`;
            return;
        }

        // Chuẩn hoá số
        const normalized = data.map(d => ({
            ...d,
            total_expense: parseFloat(d.total_expense) || 0,
        }));

        // Tìm max để tính chiều cao tương đối
        const maxExpense = Math.max(...normalized.map(d => d.total_expense), 0);
        
        container.innerHTML = normalized.map((expense) => {
            const heightPercent = maxExpense > 0 ? (expense.total_expense / maxExpense) * 100 : 0;
            return `
                <div class="flex flex-col items-center gap-2 flex-1 group">
                    <div class="w-full bg-purple-100 dark:bg-purple-900 rounded-t relative overflow-hidden" style="height: 140px;">
                        <div class="absolute bottom-0 w-full bg-purple-600 dark:bg-purple-500 rounded-t transition-all group-hover:opacity-80" style="height: ${heightPercent}%"></div>
                        <div class="absolute top-1 left-1 right-1 text-[11px] text-gray-600 dark:text-gray-200 text-center opacity-0 group-hover:opacity-100 transition-opacity">${formatCurrency(expense.total_expense)} đ</div>
                    </div>
                    <span class="text-xs text-text-sub-light dark:text-text-sub-dark">${getMonthName(expense.month)}</span>
                </div>
            `;
        }).join('');
        
    } catch (err) {
        console.error('Load Monthly Expenses Error:', err);
    }
}

// Load Utility Usage
async function loadUtilityUsage() {
    try {
        const url = window.currentRoomId 
            ? `${API_URL}/tenant/dashboard/utility-usage?room_id=${window.currentRoomId}`
            : `${API_URL}/tenant/dashboard/utility-usage`;
            
        const res = await fetch(url, {
            headers: getAuthHeaders()
        });
        
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        
        const data = await res.json();
        
        // Vẽ biểu đồ điện và nước
        const svgContainer = document.getElementById('utility-usage-chart');
        if (!svgContainer) return;
        
        const electricityData = data.electricity || [];
        const waterData = data.water || [];
        
        // Đọc đúng field từ backend (total_usage hoặc usage)
        const getUsage = (d) => d.total_usage !== undefined ? d.total_usage : (d.usage || 0);
        
        // Tìm max để scale
        const allValues = [
            ...electricityData.map(d => getUsage(d)), 
            ...waterData.map(d => getUsage(d))
        ];
        const maxUsage = allValues.length > 0 ? Math.max(...allValues, 1) : 1;
        
        // Tính điểm cho đường line
        const points = 6;
        const width = 300;
        const height = 150;
        const stepX = width / (points - 1);
        
        const getY = (value) => {
            if (maxUsage === 0) return height;
            return height - (value / maxUsage) * (height - 20);
        };
        
        // Tạo path cho điện (vàng) - chỉ vẽ nếu có dữ liệu
        const elecPoints = electricityData.length > 0 
            ? electricityData.map((d, i) => {
                const x = i * stepX;
                const y = getY(getUsage(d));
                return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
            }).join(' ')
            : '';
        
        // Tạo path cho nước (xanh) - chỉ vẽ nếu có dữ liệu
        const waterPoints = waterData.length > 0
            ? waterData.map((d, i) => {
                const x = i * stepX;
                const y = getY(getUsage(d));
                return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
            }).join(' ')
            : '';
        
        // Lấy tháng từ dữ liệu (ưu tiên electricityData, nếu không có thì dùng waterData)
        const monthData = electricityData.length > 0 ? electricityData : waterData;
        
        svgContainer.innerHTML = `
            <line stroke="#e5e7eb" stroke-dasharray="4" stroke-width="1" x1="0" x2="${width}" y1="${height}" y2="${height}"></line>
            <line stroke="#e5e7eb" stroke-dasharray="4" stroke-width="1" x1="0" x2="${width}" y1="${height * 0.67}" y2="${height * 0.67}"></line>
            <line stroke="#e5e7eb" stroke-dasharray="4" stroke-width="1" x1="0" x2="${width}" y1="${height * 0.33}" y2="${height * 0.33}"></line>
            ${elecPoints ? `<path d="${elecPoints}" fill="none" stroke="#fbbf24" stroke-width="2"></path>` : ''}
            ${waterPoints ? `<path d="${waterPoints}" fill="none" stroke="#3b82f6" stroke-width="2"></path>` : ''}
            ${monthData.map((d, i) => `
                <text fill="#9ca3af" font-size="8" x="${i * stepX}" y="${height + 10}">${getMonthName(d.month)}</text>
            `).join('')}
        `;
        
    } catch (err) {
        console.error('Load Utility Usage Error:', err);
    }
}

// Load Maintenance Requests
async function loadMaintenanceRequests() {
    try {
        const url = window.currentRoomId 
            ? `${API_URL}/tenant/dashboard/maintenance-requests?room_id=${window.currentRoomId}&limit=5`
            : `${API_URL}/tenant/dashboard/maintenance-requests?limit=5`;
            
        const res = await fetch(url, {
            headers: getAuthHeaders()
        });
        
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        
        const data = await res.json();
        
        const container = document.getElementById('maintenance-requests-list');
        if (!container) return;
        
        if (data.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-4">Chưa có yêu cầu bảo trì nào</p>';
            return;
        }
        
        container.innerHTML = data.map(request => {
            let statusClass = 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400';
            let statusText = 'Đang xử lý';
            let iconClass = 'error_outline';
            let bgClass = 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-100 dark:border-yellow-900/30';
            let iconBgClass = 'bg-yellow-200 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-400';
            
            if (request.status === 'Completed') {
                statusClass = 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400';
                statusText = 'Đã giải quyết';
                iconClass = 'check_circle_outline';
                bgClass = 'bg-green-50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30';
                iconBgClass = 'bg-green-200 dark:bg-green-800/50 text-green-700 dark:text-green-400';
            } else if (request.status === 'New') {
                statusText = 'Mới';
                statusClass = 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400';
            } else if (request.status === 'Cancelled') {
                statusText = 'Đã hủy';
                statusClass = 'bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400';
            }
            
            return `
                <div class="${bgClass} border p-5 rounded-xl flex gap-4">
                    <div class="w-10 h-10 rounded-full ${iconBgClass} flex-shrink-0 flex items-center justify-center">
                        <span class="material-icons-outlined">${iconClass}</span>
                    </div>
                    <div class="flex-1">
                        <div class="flex justify-between items-start mb-1">
                            <h4 class="font-semibold text-secondary dark:text-blue-300">${request.title}</h4>
                            <span class="${statusClass} text-xs px-2 py-1 rounded">${statusText}</span>
                        </div>
                        <p class="text-sm text-text-sub-light dark:text-text-sub-dark mb-2 line-clamp-2">${request.description}</p>
                        ${request.status === 'InProgress' ? `
                            <p class="text-xs text-text-sub-light dark:text-text-sub-dark flex items-center gap-1">
                                <span class="material-icons-outlined text-xs">calendar_today</span>
                                Đang được xử lý
                            </p>
                        ` : request.status === 'Completed' && request.resolution_note ? `
                            <p class="text-xs text-green-700 dark:text-green-400 font-medium flex items-center gap-1">
                                Đã sửa: ${request.resolution_note}
                            </p>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (err) {
        console.error('Load Maintenance Requests Error:', err);
    }
}

// Load User Info
async function loadUserInfo() {
    try {
        const token = getAuthToken();
        if (!token) {
            window.location.href = 'index.html';
            return;
        }
        
        // Decode token để lấy thông tin (hoặc gọi API để lấy thông tin user)
        // Tạm thời dùng localStorage hoặc decode JWT
        const userName = localStorage.getItem('userName') || 'Người thuê';
        const userEmail = localStorage.getItem('userEmail') || '';
        
        const userNameEl = document.getElementById('user-name');
        const userEmailEl = document.getElementById('user-email');
        const greetingEl = document.getElementById('greeting-name');
        
        if (userNameEl) userNameEl.textContent = userName;
        if (userEmailEl) userEmailEl.textContent = userEmail;
        if (greetingEl) greetingEl.textContent = userName;
        
    } catch (err) {
        console.error('Load User Info Error:', err);
    }
}

// Load Current Date
function loadCurrentDate() {
    const today = new Date();
    const dateStr = formatDate(today.toISOString());
    const dateEl = document.getElementById('current-date');
    if (dateEl) dateEl.textContent = dateStr;
}

// Load All Data
async function loadAllData() {
    await loadOverview();
    await loadRooms();
    await loadNextPayment();
    await loadRecentPayments();
    await loadMonthlyExpenses();
    await loadUtilityUsage();
    await loadMaintenanceRequests();
    loadUserInfo();
    loadCurrentDate();
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Kiểm tra authentication
    const token = getAuthToken();
    if (!token) {
        window.location.href = 'index.html';
        return;
    }
    
    loadAllData();
    
    // Setup room selector dropdown
    const roomSelectorBtn = document.getElementById('room-selector-btn');
    const roomDropdown = document.getElementById('room-dropdown');
    
    if (roomSelectorBtn && roomDropdown) {
        roomSelectorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            roomDropdown.classList.toggle('hidden');
        });
        
        document.addEventListener('click', () => {
            roomDropdown.classList.add('hidden');
        });
    }
    
    // Setup logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('token');
            localStorage.removeItem('userName');
            localStorage.removeItem('userEmail');
            window.location.href = 'index.html';
        });
    }
});

