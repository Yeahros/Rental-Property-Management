
    const API_URL = 'http://localhost:3000/api';
    
    // --- UTILS ---
    function formatCurrency(number) {
        return new Intl.NumberFormat('vi-VN').format(number);
    }
    
    function formatDate(dateString) {
        if(!dateString) return '';
        const d = new Date(dateString);
        return d.toLocaleDateString('vi-VN');
    }

    // --- 1. LOAD DỮ LIỆU BAN ĐẦU ---
    document.addEventListener('DOMContentLoaded', () => {
        loadStats();
        loadActiveContracts();
        loadInvoices();
        
        // Set mặc định tháng hiện tại cho input filter
        const today = new Date();
        const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        // Nếu có input filter month, gán value = monthStr (cần thêm id vào html nếu muốn)
    });

    // --- 2. API CALLS (GET) ---

    async function loadStats() {
        try {
            const res = await fetch(`${API_URL}/invoices/stats`);
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            const data = await res.json();
            
            // Cập nhật UI Dashboard (Dựa vào vị trí thẻ trong HTML của bạn)
            const cards = document.querySelectorAll('.card h3');
            cards[0].innerText = formatCurrency(data.revenue_month) + ' đ';
            cards[1].innerText = formatCurrency(data.pending_amount) + ' đ';
            cards[2].innerText = data.overdue_count + ' Hóa đơn';
        } catch (e) { console.error(e); }
    }

    async function loadActiveContracts() {
        try {
            const res = await fetch(`${API_URL}/contracts/active`);
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            const contracts = await res.json();
            
            const select = document.querySelector('.modal-header select'); // Select box chọn phòng
            select.innerHTML = '<option value="">Chọn phòng áp dụng</option>';
            
            contracts.forEach(c => {
                const option = document.createElement('option');
                option.value = c.contract_id;
                option.text = `P.${c.room_number} - ${c.full_name}`;
                option.setAttribute('data-rent', c.rent_amount); // Lưu giá thuê vào attribute
                select.appendChild(option);
            });

            // Sự kiện khi chọn phòng -> Tự điền giá thuê
            select.onchange = function() {
                const rent = this.options[this.selectedIndex].getAttribute('data-rent');
                if (rent) {
                    document.getElementById('roomPrice').value = rent; // Giá gốc ko format để tính toán
                    calculateTotal();
                }
            };
        } catch (e) { console.error(e); }
    }

    async function loadInvoices() {
        // Lấy giá trị filter (bạn cần thêm ID cho các input filter trong HTML để lấy chính xác)
        // Tạm thời load tất cả
        try {
            const res = await fetch(`${API_URL}/invoices`);
            const invoices = await res.json();
            const tbody = document.querySelector('.data-table tbody');
            tbody.innerHTML = '';

            invoices.forEach(inv => {
                let badgeHtml = '';
                if (inv.display_status === 'Paid') {
                    badgeHtml = `<span class="badge badge-success"><span class="dot" style="background: #16a34a;"></span> Đã thanh toán</span>`;
                } else if (inv.display_status === 'Overdue') {
                    badgeHtml = `<span class="badge badge-danger"><span class="material-symbols-outlined" style="font-size: 14px;">warning</span> Quá hạn ${inv.overdue_days} ngày</span>`;
                } else {
                    badgeHtml = `<span class="badge badge-warning"><span class="dot" style="background: #ca8a04;"></span> Chưa thanh toán</span>`;
                }

                const row = `
                    <tr>
                        <td class="font-bold">P.${inv.room_number}</td>
                        <td>
                            <div class="user-info">
                                <div class="avatar-sm" style="background: #dbeafe; color: #1e40af;">${inv.full_name.substring(0,2).toUpperCase()}</div>
                                <span class="font-medium">${inv.full_name}</span>
                            </div>
                        </td>
                        <td class="font-bold">${formatCurrency(inv.total_amount)} đ</td>
                        <td style="color: var(--text-gray);">${formatDate(inv.created_at)}</td>
                        <td style="color: var(--text-gray);">${formatDate(inv.due_date)}</td>
                        <td>${badgeHtml}</td>
                        <td class="text-right">
                             ${inv.display_status !== 'Paid' ? 
                                `<button class="btn-icon" onclick="markPaid(${inv.invoice_id})" title="Xác nhận thanh toán"><span class="material-symbols-outlined" style="color:green">check_circle</span></button>` 
                                : ''}
                            <button class="btn-icon delete"><span class="material-symbols-outlined">delete</span></button>
                        </td>
                    </tr>
                `;
                tbody.insertAdjacentHTML('beforeend', row);
            });
        } catch (e) { console.error(e); }
    }

    // --- 3. LOGIC TÍNH TOÁN (CLIENT SIDE) ---
    
    function calculateTotal() {
        const roomPrice = parseFloat(document.getElementById('roomPrice').value) || 0;
        
        // Điện
        const elecOld = parseFloat(document.getElementById('elecOld').value) || 0;
        const elecNew = parseFloat(document.getElementById('elecNew').value) || 0;
        let elecUsage = elecNew - elecOld; 
        if(elecUsage < 0) elecUsage = 0;
        const elecTotal = elecUsage * 3500; // Giá cứng hoặc lấy từ DB

        // Nước
        const waterOld = parseFloat(document.getElementById('waterOld').value) || 0;
        const waterNew = parseFloat(document.getElementById('waterNew').value) || 0;
        let waterUsage = waterNew - waterOld;
        if(waterUsage < 0) waterUsage = 0;
        const waterTotal = waterUsage * 15000;

        // UI Update
        document.getElementById('elecUsage').innerText = elecUsage;
        document.getElementById('elecTotal').innerText = formatCurrency(elecTotal);
        document.getElementById('waterUsage').innerText = waterUsage;
        document.getElementById('waterTotal').innerText = formatCurrency(waterTotal);

        const grandTotal = roomPrice + elecTotal + waterTotal;
        document.getElementById('grandTotal').innerHTML = `${formatCurrency(grandTotal)} <span style="font-size: 0.875rem; font-weight: 500; color: #9ca3af;">VND</span>`;
        return grandTotal;
    }

    function calcIncidental() {
        const price = parseFloat(document.getElementById('incidentalPrice').value) || 0;
        document.getElementById('incidentalTotalDisplay').value = formatCurrency(price);
        document.getElementById('grandTotal').innerHTML = `${formatCurrency(price)} <span style="font-size: 0.875rem; font-weight: 500; color: #9ca3af;">VND</span>`;
        return price;
    }

    // --- 4. TẠO HÓA ĐƠN (POST) ---
    async function createInvoice() {
        const contractId = document.querySelector('.modal-header select').value;
        if (!contractId) return alert("Vui lòng chọn phòng!");

        const isMonthly = document.getElementById('tab-monthly').classList.contains('active');
        let payload = {};

        // Lấy ngày tháng chung
        const period = document.querySelector('input[type="month"]').value; // YYYY-MM
        const dueDate = document.querySelector('input[type="date"]').value;
        
        if(!dueDate) return alert("Vui lòng chọn hạn thanh toán");

        if (isMonthly) {
            const roomPrice = parseFloat(document.getElementById('roomPrice').value) || 0;
            const elecTotal = parseFloat(document.getElementById('elecTotal').innerText.replace(/\./g, '')) || 0;
            const waterTotal = parseFloat(document.getElementById('waterTotal').innerText.replace(/\./g, '')) || 0;
            const total = roomPrice + elecTotal + waterTotal;

            payload = {
                type: 'Monthly',
                contract_id: contractId,
                billing_period: period,
                due_date: dueDate,
                room_rent: roomPrice,
                total_amount: total,
                items: [
                    { 
                        name: 'Tiền điện', 
                        old: document.getElementById('elecOld').value,
                        new: document.getElementById('elecNew').value,
                        amount: elecTotal,
                        price: 3500 
                    },
                    { 
                        name: 'Tiền nước', 
                        old: document.getElementById('waterOld').value,
                        new: document.getElementById('waterNew').value,
                        amount: waterTotal,
                        price: 15000 
                    }
                ],
                notes: document.querySelector('#form-monthly textarea').value
            };
        } else {
            // Hóa đơn phát sinh
            const amount = parseFloat(document.getElementById('incidentalPrice').value) || 0;
            const name = document.querySelector('#form-incidental input[type="text"]').value;
            
            payload = {
                type: 'Incidental',
                contract_id: contractId,
                billing_period: null, // Phát sinh ko nhất thiết theo kỳ
                due_date: dueDate,
                room_rent: 0,
                total_amount: amount,
                items: [
                    { name: name, amount: amount, price: amount, old: null, new: null }
                ],
                notes: document.querySelector('#form-incidental textarea').value
            };
        }

        try {
            const res = await fetch(`${API_URL}/invoices`, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(payload)
            });
            
            if (res.ok) {
                alert('Tạo hóa đơn thành công!');
                toggleModal(false);
                loadStats();
                loadInvoices();
            } else {
                alert('Lỗi tạo hóa đơn');
            }
        } catch (e) { console.error(e); }
    }

    async function markPaid(id) {
        if(!confirm('Xác nhận khách đã thanh toán?')) return;
        try {
            await fetch(`${API_URL}/invoices/${id}/status`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ status: 'Paid' })
            });
            loadStats();
            loadInvoices();
        } catch(e) { console.error(e); }
    }

    // --- MODAL & TABS ---
    function toggleModal(show) {
        const modal = document.getElementById('invoiceModal');
        if (show) {
            modal.classList.add('open');
            switchTab('monthly');
        } else {
            modal.classList.remove('open');
        }
    }

    function switchTab(tabName) {
        const btnMonthly = document.getElementById('tab-monthly');
        const btnIncidental = document.getElementById('tab-incidental');
        const formMonthly = document.getElementById('form-monthly');
        const formIncidental = document.getElementById('form-incidental');

        if (tabName === 'monthly') {
            btnMonthly.className = "tab-btn active";
            btnIncidental.className = "tab-btn inactive";
            formMonthly.classList.remove('hidden');
            formIncidental.classList.add('hidden');
            calculateTotal();
        } else {
            btnIncidental.className = "tab-btn active";
            btnMonthly.className = "tab-btn inactive";
            formIncidental.classList.remove('hidden');
            formMonthly.classList.add('hidden');
            calcIncidental();
        }
    }
    
    // Gán hàm createInvoice vào nút Save trong HTML
    document.querySelector('.modal-footer .btn-primary').onclick = createInvoice;
