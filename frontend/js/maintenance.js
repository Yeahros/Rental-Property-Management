const API_URL = 'http://localhost:3000/api';

// --- UTILS ---
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('vi-VN') + ' • ' + date.toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'});
}

function timeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " năm trước";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " tháng trước";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " ngày trước";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " giờ trước";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " phút trước";
    return "Vừa xong";
}

// --- 1. LOAD THỐNG KÊ ---
async function loadStats() {
    try {
        const res = await fetch(`${API_URL}/maintenance/stats`);
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();
        
        // Tìm các thẻ p hiển thị số liệu dựa trên cấu trúc HTML hiện tại
        // Lưu ý: Cần đảm bảo thứ tự các box thống kê trong HTML không đổi
        const statsNumbers = document.querySelectorAll('.text-3xl.font-semibold');
        if(statsNumbers.length >= 4) {
            statsNumbers[0].innerText = data.new_requests || 0; // Mới
            statsNumbers[1].innerText = data.in_progress || 0;  // Đang xử lý
            statsNumbers[2].innerText = data.completed || 0;    // Hoàn thành
            statsNumbers[3].innerText = data.cancelled || 0;    // Đã hủy
        }
    } catch (e) { 
        console.error("Lỗi stats:", e);
        // Hiển thị 0 nếu có lỗi
        const statsNumbers = document.querySelectorAll('.text-3xl.font-semibold');
        if(statsNumbers.length >= 4) {
            statsNumbers[0].innerText = '0';
            statsNumbers[1].innerText = '0';
            statsNumbers[2].innerText = '0';
            statsNumbers[3].innerText = '0';
        }
    }
}

// --- 2. LOAD DANH SÁCH YÊU CẦU ---
async function loadRequests() {
    const searchInput = document.querySelector('input[type="text"]');
    const searchTerm = searchInput ? searchInput.value : '';

    try {
        const res = await fetch(`${API_URL}/maintenance?search=${searchTerm}`);
        const requests = await res.json();
        
        const container = document.querySelector('.space-y-4'); // Container chứa các card
        container.innerHTML = ''; // Xóa dữ liệu mẫu

        if (requests.length === 0) {
            container.innerHTML = '<p class="text-center text-gray-500 py-10">Không có yêu cầu bảo trì nào.</p>';
            return;
        }

        requests.forEach(req => {
            // Xác định màu sắc và icon dựa trên trạng thái
            let statusConfig = {
                'New': { color: 'red', text: 'Mới', icon: 'error', bg: 'bg-red-500', lightBg: 'bg-red-50', textCol: 'text-red-500' },
                'InProgress': { color: 'yellow', text: 'Đang xử lý', icon: 'schedule', bg: 'bg-yellow-400', lightBg: 'bg-yellow-50', textCol: 'text-yellow-500' },
                'Completed': { color: 'green', text: 'Hoàn thành', icon: 'check_circle', bg: 'bg-green-500', lightBg: 'bg-green-50', textCol: 'text-green-500' },
                'Cancelled': { color: 'slate', text: 'Đã hủy', icon: 'cancel', bg: 'bg-slate-400', lightBg: 'bg-slate-100', textCol: 'text-slate-500' }
            };
            const conf = statusConfig[req.status];

            // Tạo nút hành động
            let actionButtons = '';
            if (req.status === 'New') {
                actionButtons = `
                    <div class="flex flex-wrap gap-3">
                        <button onclick="updateStatus(${req.request_id}, 'InProgress')" class="bg-primary hover:bg-blue-800 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                            Tiếp nhận xử lý
                        </button>
                        <button onclick="updateStatus(${req.request_id}, 'Cancelled')" class="bg-slate-100 hover:bg-slate-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-slate-700 dark:text-slate-200 px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                            Hủy yêu cầu
                        </button>
                    </div>
                `;
            } else if (req.status === 'InProgress') {
                actionButtons = `
                    <button onclick="updateStatus(${req.request_id}, 'Completed')" class="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors">
                        Đánh dấu Hoàn thành
                    </button>
                `;
            } else if (req.status === 'Completed' || req.status === 'Cancelled') {
                actionButtons = `
                    <div class="bg-${conf.color}-50 dark:bg-${conf.color}-900/20 border border-${conf.color}-100 dark:border-${conf.color}-800 rounded-lg p-3 text-sm text-${conf.color}-800 dark:text-${conf.color}-200">
                        <span class="font-semibold">${req.status === 'Completed' ? 'Giải pháp:' : 'Lý do hủy:'}</span> ${req.resolution_note || 'Không có ghi chú'}
                    </div>
                `;
            }

            // Render HTML Card
            const html = `
            <div class="bg-white dark:bg-gray-800 rounded-xl shadow-card border border-slate-100 dark:border-gray-700 overflow-hidden flex flex-col md:flex-row">
                <div class="h-2 md:h-auto md:w-2 ${conf.bg} shrink-0"></div>
                <div class="p-6 flex-grow">
                    <div class="flex items-start gap-4">
                        <div class="w-12 h-12 rounded-full ${conf.lightBg} dark:bg-${conf.color}-900/20 flex items-center justify-center ${conf.textCol} shrink-0">
                            <span class="material-symbols-rounded">${conf.icon}</span>
                        </div>
                        <div class="flex-grow">
                            <div class="flex flex-wrap items-center gap-2 mb-1">
                                <h3 class="text-lg font-semibold text-slate-800 dark:text-white">${req.title}</h3>
                                <span class="px-2 py-0.5 rounded text-xs font-medium bg-${conf.color}-100 text-${conf.color}-700 dark:bg-${conf.color}-900/50 dark:text-${conf.color}-200">${conf.text}</span>
                            </div>
                            <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">Gửi ${timeAgo(req.request_date)} • Yêu cầu #${req.request_id}</p>
                            <p class="text-slate-700 dark:text-slate-300 mb-6">${req.description}</p>
                            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div class="flex items-center gap-2">
                                    <span class="material-symbols-rounded text-slate-400 text-lg">location_on</span>
                                    <div>
                                        <p class="text-xs text-slate-500 dark:text-slate-400">Vị trí</p>
                                        <p class="text-sm font-medium text-primary dark:text-blue-400">P.${req.room_number} - ${req.house_name}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="material-symbols-rounded text-slate-400 text-lg">person</span>
                                    <div>
                                        <p class="text-xs text-slate-500 dark:text-slate-400">Người thuê</p>
                                        <p class="text-sm font-medium text-primary dark:text-blue-400">${req.tenant_name}</p>
                                    </div>
                                </div>
                                <div class="flex items-center gap-2">
                                    <span class="material-symbols-rounded text-slate-400 text-lg">calendar_today</span>
                                    <div>
                                        <p class="text-xs text-slate-500 dark:text-slate-400">Ngày tạo</p>
                                        <p class="text-sm font-medium text-primary dark:text-blue-400">${new Date(req.request_date).toLocaleDateString('vi-VN')}</p>
                                    </div>
                                </div>
                            </div>
                            ${actionButtons}
                        </div>
                    </div>
                </div>
            </div>`;
            
            container.insertAdjacentHTML('beforeend', html);
        });

    } catch (e) { console.error(e); }
}

// --- 3. XỬ LÝ ACTION ---
async function updateStatus(id, status) {
    let note = '';
    if (status === 'Cancelled' || status === 'Completed') {
        note = prompt(status === 'Completed' ? "Nhập giải pháp xử lý:" : "Nhập lý do hủy:");
        if (note === null) return; // Người dùng ấn Cancel prompt
    }

    try {
        const res = await fetch(`${API_URL}/maintenance/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, note })
        });

        if (res.ok) {
            alert("Cập nhật thành công!");
            loadStats();
            loadRequests();
        } else {
            alert("Có lỗi xảy ra");
        }
    } catch (e) { console.error(e); }
}

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadRequests();

    // Gắn sự kiện tìm kiếm
    const searchInput = document.querySelector('input[type="text"]');
    if(searchInput) {
        searchInput.addEventListener('keyup', (e) => {
            if(e.key === 'Enter') loadRequests();
        });
    }
});

