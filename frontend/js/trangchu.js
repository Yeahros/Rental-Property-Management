const API_URL = 'http://localhost:3000/api';

// Helper format tiền
const formatMoney = (amount) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);

// Helper tính thời gian (ví dụ: 2 giờ trước)
function timeAgo(dateString) {
    const seconds = Math.floor((new Date() - new Date(dateString)) / 1000);
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

async function loadDashboard() {
    // 1. Load Stats Cards
    try {
        const res = await fetch(`${API_URL}/dashboard/stats`);
        const data = await res.json();
        
        const statValues = document.querySelectorAll('.stat-value');
        const statNotes = document.querySelectorAll('.stat-note');

        if(statValues.length >= 3) {
            // Card 1: Tổng Bất động sản
            statValues[0].innerText = data.total_houses;
            
            // Card 2: Doanh thu hàng tháng
            const revenueText = formatMoney(data.revenue_month);
            statValues[1].innerText = revenueText;
            if(statNotes.length > 0) {
                statNotes[0].innerText = 'Doanh thu thực tế tháng này';
            }

            // Card 3: Bảo trì
            statValues[2].innerText = data.maintenance_active;
            if(statNotes.length > 1) {
                statNotes[1].innerText = `${data.maintenance_processing} đang xử lý, ${data.maintenance_active - data.maintenance_processing} đang mở`;
            }
        }
    } catch(e) { console.error("Stats Error", e); }

    // 2. Load Chart (Biểu đồ doanh thu năm - 12 tháng, hiển thị số tiền trên đầu cột)
    try {
        const res = await fetch(`${API_URL}/dashboard/chart`);
        const chartData = await res.json(); // [{ month: 1..12, total }, ...]

        const barGroups = document.querySelectorAll('.revenue-bar-group');
        if (!barGroups.length) {
            // Không có layout mới, bỏ qua phần chart
            throw new Error('Không tìm thấy phần tử .revenue-bar-group trong DOM');
        }

        // Tạo map tháng -> tổng
        const monthTotals = {};
        chartData.forEach(item => {
            monthTotals[item.month] = Number(item.total) || 0;
        });

        // Tìm max để tính chiều cao tương đối
        const allTotals = Object.values(monthTotals);
        const maxVal = allTotals.length ? Math.max(...allTotals, 0) : 0;

        barGroups.forEach((group, idx) => {
            const month = idx + 1; // theo thứ tự T1..T12
            const total = monthTotals[month] || 0;

            const bar = group.querySelector('.revenue-bar');
            const amountSpan = group.querySelector('.revenue-bar-amount');

            if (bar) {
                let heightPercent = 0;
                if (maxVal > 0) {
                    heightPercent = (total / maxVal) * 80; // max ~80% chiều cao
                }
                bar.style.height = `${heightPercent}%`;
            }

            if (amountSpan) {
                if (total > 0) {
                    // Hiển thị dạng "45.2tr"
                    amountSpan.textContent = (total / 1000000).toFixed(1) + 'tr';
                } else {
                    amountSpan.textContent = '';
                }
            }
        });

    } catch(e) { console.error("Chart Error", e); }

    // 3. Load Upcoming Payments
    try {
        const res = await fetch(`${API_URL}/dashboard/upcoming-payments`);
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const payments = await res.json();
        const list = document.querySelector('.payment-list');
        if (!list) {
            console.warn('Không tìm thấy .payment-list');
            return;
        }
        list.innerHTML = '';

        if (!payments || payments.length === 0) {
            list.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Không có khoản thanh toán nào sắp tới hạn</p>';
            return;
        }

        payments.forEach(p => {
            const date = new Date(p.due_date);
            const dayMonth = `${date.getDate()}/${date.getMonth()+1}`;
            
            const colors = ['blue', 'indigo', 'sky', 'purple'];
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            const today = new Date();
            const dueDate = new Date(p.due_date);
            const daysDiff = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
            let statusText = 'Sắp tới hạn';
            let statusClass = 'text-orange-500';
            if (daysDiff < 0) {
                statusText = 'Quá hạn';
                statusClass = 'text-red-500';
            } else if (daysDiff > 7) {
                statusText = 'Đang chờ';
                statusClass = 'text-blue-500';
            }

            const html = `
            <div class="flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer">
                <div class="flex items-center gap-4">
                    <div class="w-12 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 font-bold text-xs flex items-center justify-center">
                        P${p.room_number || 'N/A'}
                    </div>
                    <div>
                        <h4 class="text-sm font-semibold text-gray-800 dark:text-white">${p.full_name || 'N/A'}</h4>
                        <p class="text-xs text-gray-500 flex items-center mt-0.5">
                            <span class="material-icons-outlined w-3 h-3 mr-1 !text-[14px]">schedule</span>
                            Đến hạn: ${dayMonth}
                        </p>
                    </div>
                </div>
                <div class="text-right">
                    <p class="text-sm font-bold text-blue-600 dark:text-blue-400">${parseInt(p.total_amount || 0).toLocaleString('vi-VN')} đ</p>
                    <p class="text-[10px] ${statusClass} font-medium">${statusText}</p>
                </div>
            </div>`;
            list.innerHTML += html;
        });
    } catch(e) { 
        console.error("Payment Error", e);
        const list = document.querySelector('.payment-list');
        if (list) {
            list.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Không thể tải danh sách thanh toán</p>';
        }
    }

    // 4. Load Recent Activities
    try {
        const res = await fetch(`${API_URL}/dashboard/activities`);
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const activities = await res.json();
        const actList = document.querySelector('.activity-list');
        if (!actList) {
            console.warn('Không tìm thấy .activity-list');
            return;
        }
        actList.innerHTML = '';

        if (!activities || activities.length === 0) {
            actList.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Không có hoạt động gần đây</p>';
            return;
        }

        activities.forEach(act => {
            let icon = 'notifications';
            let colorClass = 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400';
            let title = 'Thông báo';
            let desc = '';

            if(act.type === 'payment') {
                icon = 'attach_money'; 
                colorClass = 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400';
                title = 'Đã Nhận thanh toán';
                desc = `${act.full_name || 'N/A'} - Phòng ${act.room_number || 'N/A'}`;
            } else if (act.type === 'maintenance') {
                icon = 'build'; 
                colorClass = 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400';
                title = 'Yêu cầu bảo trì mới';
                desc = `${act.val || 'Yêu cầu bảo trì'} - Phòng ${act.room_number || 'N/A'}`;
            } else if (act.type === 'tenant') {
                icon = 'group'; 
                colorClass = 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400';
                title = 'Người thuê mới đã nhập';
                desc = `${act.full_name || 'N/A'} - Phòng ${act.room_number || 'N/A'}`;
            }

            const html = `
            <div class="flex gap-4">
                <div class="w-10 h-10 rounded-xl ${colorClass} flex-shrink-0 flex items-center justify-center">
                    <span class="material-icons-outlined">${icon}</span>
                </div>
                <div class="flex-1">
                    <div class="flex justify-between items-start">
                        <h4 class="text-sm font-semibold text-gray-800 dark:text-white">${title}</h4>
                        <span class="text-xs text-gray-400">${timeAgo(act.created_at)}</span>
                    </div>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${desc}</p>
                </div>
            </div>`;
            actList.innerHTML += html;
        });
    } catch(e) { 
        console.error("Activity Error", e);
        const actList = document.querySelector('.activity-list');
        if (actList) {
            actList.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Không thể tải hoạt động gần đây</p>';
        }
    }

    // 5. Load Top Properties
    try {
        const res = await fetch(`${API_URL}/dashboard/top-properties`);
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const props = await res.json();
        const propList = document.querySelector('.property-list');
        if (!propList) {
            console.warn('Không tìm thấy .property-list');
            return;
        }
        propList.innerHTML = '';

        if (props && props.length > 0) {
            props.forEach(p => {
                const totalRooms = p.total_rooms || 0;
                const occupiedRooms = p.occupied_rooms || 0;
                const percent = totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 100) : 0;
                const html = `
                <div class="property-card">
                    <div class="property-header">
                        <h4 class="property-name">${p.house_name || 'Chưa có tên'}</h4>
                        <span class="material-icons-outlined property-trend up">trending_up</span>
                    </div>
                    <div class="property-stats">
                        <div>
                            <p class="property-stat-label">Phòng</p>
                            <p class="property-stat-value">${totalRooms}</p>
                        </div>
                        <div>
                            <p class="property-stat-label">Đã thuê</p>
                            <p class="property-stat-value primary">${occupiedRooms}/${totalRooms}</p>
                        </div>
                        <div class="property-stat-value right">
                            <p class="property-stat-label">Doanh thu</p>
                            <p class="property-stat-value blue">${((p.estimated_revenue || 0) / 1000000).toFixed(1)}tr</p>
                        </div>
                    </div>
                    <div class="property-progress">
                        <div class="property-progress-bar" style="width: ${percent}%"></div>
                    </div>
                </div>`;
                propList.innerHTML += html;
            });
        } else {
            // Hiển thị message khi không có dữ liệu
            propList.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Chưa có bất động sản nào</p>';
        }
    } catch(e) { 
        console.error("Property Error", e);
        const propList = document.querySelector('.property-list');
        if (propList) {
            propList.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">Không thể tải dữ liệu bất động sản</p>';
        }
    }
}

// Load mức sử dụng điện/nước
async function loadUsageChart(type = 'electricity') {
    try {
        const res = await fetch(`${API_URL}/dashboard/usage?type=${type}`);
        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();
        
        const titleEl = document.querySelector('.usage-chart-title');
        const svgPath = document.querySelector('#usage-chart-path');
        const svgGradient = document.querySelector('#usage-chart-gradient');
        const chartContainer = document.querySelector('.h-64.relative');
        
        if (titleEl) {
            titleEl.textContent = type === 'electricity' 
                ? 'Mức sử dụng điện (kWh)' 
                : 'Mức sử dụng nước (m³)';
        }
        
        if (!data || data.length === 0) {
            console.warn('Không có dữ liệu sử dụng');
            return;
        }
        
        // Tính toán giá trị max để scale biểu đồ
        const maxUsage = Math.max(...data.map(d => d.usage || 0), 1);
        const chartHeight = 200; // viewBox height
        const chartWidth = 400; // viewBox width
        const paddingTop = 20;
        const paddingBottom = 20;
        const usableHeight = chartHeight - paddingTop - paddingBottom;
        const pointCount = data.length;
        const spacing = chartWidth / (pointCount - 1);
        
        // Tạo path string từ dữ liệu
        let pathString = '';
        let gradientPathString = '';
        
        data.forEach((point, index) => {
            const x = index * spacing;
            // Đảo ngược Y vì SVG (0,0) ở trên cùng
            const normalizedUsage = (point.usage || 0) / maxUsage;
            const y = chartHeight - paddingBottom - (normalizedUsage * usableHeight);
            
            if (index === 0) {
                pathString = `M ${x} ${y}`;
                gradientPathString = `M ${x} ${chartHeight} L ${x} ${y}`;
            } else {
                // Sử dụng đường cong mượt (quadratic bezier)
                const prevX = (index - 1) * spacing;
                const controlX = (prevX + x) / 2;
                pathString += ` Q ${controlX} ${data[index - 1].usage ? chartHeight - paddingBottom - ((data[index - 1].usage / maxUsage) * usableHeight) : y} ${x} ${y}`;
                gradientPathString += ` L ${x} ${y}`;
            }
        });
        
        // Đóng gradient path
        const lastX = (pointCount - 1) * spacing;
        gradientPathString += ` L ${lastX} ${chartHeight} Z`;
        
        // Cập nhật SVG paths
        if (svgPath) {
            svgPath.setAttribute('d', pathString);
        }
        
        if (svgGradient) {
            svgGradient.setAttribute('d', gradientPathString);
            // Đổi màu gradient theo type
            if (type === 'water') {
                svgGradient.setAttribute('fill', 'url(#gradientBlue)');
            } else {
                svgGradient.setAttribute('fill', 'url(#gradientOrange)');
            }
        }
        
        // Cập nhật màu stroke theo type
        if (svgPath) {
            svgPath.setAttribute('stroke', type === 'water' ? '#3b82f6' : '#fb923c');
        }
        
        // Cập nhật giá trị trên trục Y (tìm các div có class border-b)
        const yAxisContainer = chartContainer?.querySelector('.absolute.inset-0.flex.flex-col');
        if (yAxisContainer) {
            const yAxisDivs = yAxisContainer.querySelectorAll('.border-b');
            if (yAxisDivs && yAxisDivs.length >= 5) {
                const spans = Array.from(yAxisDivs).map(div => div.querySelector('span')).filter(Boolean);
                if (spans.length >= 5) {
                    spans[0].textContent = Math.round(maxUsage).toLocaleString('vi-VN');
                    spans[1].textContent = Math.round(maxUsage * 0.75).toLocaleString('vi-VN');
                    spans[2].textContent = Math.round(maxUsage * 0.5).toLocaleString('vi-VN');
                    spans[3].textContent = Math.round(maxUsage * 0.25).toLocaleString('vi-VN');
                    spans[4].textContent = '0';
                }
            }
        }
        
        // Cập nhật labels tháng ở dưới
        const monthLabelsContainer = chartContainer?.querySelector('.absolute.bottom-0');
        if (monthLabelsContainer) {
            const monthLabels = monthLabelsContainer.querySelectorAll('span');
            if (monthLabels && monthLabels.length >= pointCount) {
                data.forEach((point, index) => {
                    if (monthLabels[index]) {
                        monthLabels[index].textContent = `T${point.month}`;
                    }
                });
            }
        }
        
    } catch(e) { 
        console.error("Usage Chart Error", e);
        // Không crash, chỉ log lỗi
    }
}

// Toggle điện/nước
function initUsageToggle() {
    const btnElectricity = document.getElementById('btn-electricity');
    const btnWater = document.getElementById('btn-water');
    
    if (!btnElectricity || !btnWater) return;
    
    [btnElectricity, btnWater].forEach(btn => {
        btn.addEventListener('click', function() {
            const type = this.dataset.type;
            
            // Update button styles
            [btnElectricity, btnWater].forEach(b => {
                b.classList.remove('active', 'bg-white', 'dark:bg-gray-600', 'text-orange-500', 'shadow-sm');
                b.classList.add('text-gray-500', 'dark:text-gray-400');
            });
            
            this.classList.add('active', 'bg-white', 'dark:bg-gray-600', 'text-orange-500', 'shadow-sm');
            this.classList.remove('text-gray-500', 'dark:text-gray-400');
            
            // Load chart data
            loadUsageChart(type);
        });
    });
}

// Chạy khi trang load xong
document.addEventListener('DOMContentLoaded', () => {
    loadDashboard();
    initUsageToggle();
    loadUsageChart('electricity'); // Load mặc định điện
});

