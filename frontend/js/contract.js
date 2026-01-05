
    const API_URL = 'http://localhost:3000/api';
    let currentContractId = null;

    function previewImage(input, previewId, defaultId) {
        const file = input.files[0];
        const preview = document.getElementById(previewId);
        const defaultContent = document.getElementById(defaultId);
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                preview.src = e.target.result;
                preview.style.display = 'block';
                if(defaultContent) defaultContent.style.opacity = '0';
            }
            reader.readAsDataURL(file);
        } else {
            preview.src = "";
            preview.style.display = 'none';
            if(defaultContent) defaultContent.style.opacity = '1';
        }
    }

    
    function formatDate(dateString) {
        if(!dateString) return '';
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }
    
    function formatCurrency(amount) {
        if (!amount) return '0 đ';
        return new Intl.NumberFormat('vi-VN', { 
            style: 'currency', 
            currency: 'VND',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount).replace('₫', 'đ');
    }
    
    function getPaymentStatusText(status) {
        if (!status || status === null) return { text: 'Đúng hạn', class: 'ok' };
        switch(status) {
            case 'Paid': return { text: 'Đã thanh toán', class: 'ok' };
            case 'Unpaid': 
                // Kiểm tra xem có quá hạn không (cần thêm logic kiểm tra due_date)
                return { text: 'Chưa thanh toán', class: 'warning' };
            case 'Overdue': return { text: 'Quá hạn', class: 'danger' };
            case 'PartiallyPaid': return { text: 'Thanh toán một phần', class: 'warning' };
            default: return { text: 'Đúng hạn', class: 'ok' };
        }
    }

    // --- 1. LOGIC THỐNG KÊ (MỚI) ---
    async function loadContractStats() {
        try {
            const res = await fetch(`${API_URL}/contracts/stats`);
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            const data = await res.json();
            
            // Gán dữ liệu vào các thẻ HTML có ID tương ứng
            document.getElementById('stat-active').innerText = data.active || 0;
            document.getElementById('stat-terminated').innerText = data.terminated || 0;
            document.getElementById('stat-expired').innerText = data.expired || 0;
        } catch (err) { 
            console.error("Lỗi load stats:", err);
            // Hiển thị 0 nếu có lỗi
            document.getElementById('stat-active').innerText = '0';
            document.getElementById('stat-terminated').innerText = '0';
            document.getElementById('stat-expired').innerText = '0';
        }
    }

    // --- 2. LOGIC LOAD PHÒNG VÀO DROPDOWN (MỚI) ---
    async function loadRoomsForSelect() {
        try {
            // Gọi API lấy danh sách phòng
            const res = await fetch(`${API_URL}/rooms`); 
            const rooms = await res.json();
            
            const select = document.getElementById('select-room-id');
            select.innerHTML = '<option disabled selected value="">-- Chọn phòng --</option>';

            rooms.forEach(room => {
                // Chỉ hiển thị phòng Trống (Vacant) để tạo hợp đồng mới
                // Hoặc hiển thị tất cả nhưng đánh dấu
                if (room.status === 'Vacant') {
                    const option = document.createElement('option');
                    option.value = room.room_id;
                    option.text = `P.${room.room_number} - ${formatCurrency(room.base_rent)}`;
                    // Lưu giá tiền vào attribute để tí tự điền
                    option.setAttribute('data-price', room.base_rent); 
                    select.appendChild(option);
                }
            });
            
            // Tự động điền giá tiền khi chọn phòng
            select.onchange = function() {
                const price = this.options[this.selectedIndex].getAttribute('data-price');
                // Tìm input tiền thuê (giả sử là input thứ 2 có class has-icon)
                const moneyInputs = document.querySelectorAll('.has-icon');
                if(moneyInputs[1] && price) {
                    moneyInputs[1].value = formatCurrency(price).replace(' ₫', '').replace(/\./g, '');
                }
            };

        } catch (err) { console.error("Lỗi load rooms:", err); }
    }

    // --- 3. MODAL LOGIC ---
    function toggleModal(mode = 'create') {
        const modal = document.getElementById('contractModal');
        const isShowing = modal.classList.contains('show');
        
        if (!isShowing) {
            setupModalMode(mode);
            // Nếu mở modal tạo mới -> Load danh sách phòng trống
            if (mode === 'create') {
                loadRoomsForSelect();
            }
            modal.classList.add('show');
        } else {
            modal.classList.remove('show');
            currentContractId = null;
        }
    }

    function setupModalMode(mode) {
        const title = document.querySelector('.modal-header h2');
        const btnCreate = document.getElementById('btn-create');
        const btnsEdit = document.getElementById('action-buttons-edit');
        
        // Reset inputs văn bản (code cũ)
        if (mode === 'create') {
            document.querySelectorAll('.modal-body input, textarea').forEach(i => i.value = '');
            document.getElementById('select-room-id').value = "";
            document.getElementById('select-room-id').disabled = false;

            // --- ĐÂY LÀ BƯỚC 4: THÊM ĐOẠN CODE NÀY VÀO ---
            
            // 1. Ẩn ảnh xem trước (Preview)
            document.getElementById('preview-front').style.display = 'none';
            document.getElementById('preview-front').src = '';
            
            document.getElementById('preview-back').style.display = 'none';
            document.getElementById('preview-back').src = '';

            // 2. Hiện lại giao diện upload mặc định
            document.getElementById('default-front').style.opacity = '1';
            document.getElementById('default-back').style.opacity = '1';

            // 3. Xóa tên file PDF đã chọn (nếu có)
            document.getElementById('pdf-name-display').innerText = '';
            
            // --- KẾT THÚC BƯỚC 4 ---
        }

        if (mode === 'create') {
            title.innerText = 'Tạo Hợp đồng mới';
            btnCreate.style.display = 'flex';
            btnsEdit.style.display = 'none';
        } else {
            title.innerText = 'Chi tiết Hợp đồng';
            btnCreate.style.display = 'none';
            btnsEdit.style.display = 'flex';
        }
    }

    // --- 4. DATA LIST LOGIC ---
    async function loadContracts(status = 'All') {
        try {
            const res = await fetch(`${API_URL}/contracts?status=${status}`);
            const contracts = await res.json();
            const container = document.querySelector('.tenant-list');
            container.innerHTML = '';

            contracts.forEach(c => {
                let badgeClass = 'badge-neutral';
                let statusText = 'Unknown';
                if (c.status === 'Active') { badgeClass = 'badge-success'; statusText = 'Đang thuê'; }
                else if (c.status === 'Terminated') { badgeClass = 'badge-danger'; statusText = 'Đã chấm dứt'; }
                else if (c.status === 'Expired') { badgeClass = 'badge-neutral'; statusText = 'Hết hạn'; }

                // Tạo mã KH (format: T-0204B)
                // Lấy số từ room_number và format lại
                const roomNum = c.room_number || '';
                const roomNumberOnly = roomNum.replace(/\D/g, ''); // Lấy chỉ số
                const roomLetter = roomNum.replace(/\d/g, ''); // Lấy chỉ chữ
                const customerCode = `T-${roomNumberOnly.padStart(4, '0')}${roomLetter}`;
                
                // Lấy initials từ tên
                const initials = c.full_name ? c.full_name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : '??';
                
                // Trạng thái thanh toán
                const paymentStatus = getPaymentStatusText(c.payment_status);
                
                const html = `
                <div class="tenant-card">
                    <div class="card-header">
                        <div class="user-summary">
                            <div class="avatar-large bg-blue-light">${initials}</div>
                            <div class="user-details">
                                <h3>${c.full_name} <span class="badge ${badgeClass}">${statusText}</span></h3>
                                <p style="font-size: 13px; color: #6b7280; margin-top: 4px;">Mã KH: ${customerCode}</p>
                            </div>
                        </div>
                        
                    </div>
                    <div class="info-grid">
                        <div class="info-item">
                            <label>Phòng</label>
                            <span><i class="fa-solid fa-location-dot"></i> ${c.room_number} - ${c.house_name}</span>
                        </div>
                        <div class="info-item">
                            <label>Thời hạn thuê</label>
                            <span><i class="fa-regular fa-calendar"></i> ${formatDate(c.start_date)} - ${formatDate(c.end_date)}</span>
                        </div>
                        <div class="info-item">
                            <label>SĐT</label>
                            <span><i class="fa-solid fa-phone"></i> ${c.phone || 'N/A'}</span>
                        </div>
                        <div class="info-item">
                            <label>Email</label>
                            <span><i class="fa-regular fa-envelope"></i> ${c.email || 'N/A'}</span>
                        </div>
                    </div>
                    <div class="info-grid" style="border-top: 1px dashed #e5e7eb; padding-top: 15px;">
                        <div class="info-item">
                            <label>Tiền thuê tháng</label>
                            <span class="rent-price">${formatCurrency(c.rent_amount || c.base_rent)}</span>
                        </div>
                        <div class="info-item"></div>
                        <div class="info-item">
                            <label>Trạng thái TT</label>
                            <span class="status-text ${paymentStatus.class}">${paymentStatus.text}</span>
                        </div>
                        <div class="info-item" style="text-align: right;">
    <label>Mật khẩu</label>
    <span style="font-weight: 700; color: #d97706; font-family: monospace; font-size: 16px;">
        ${c.plain_password || '---'}
    </span>
</div>
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-sm btn-dark" onclick="viewContractDetails(${c.contract_id})">
                            <i class="fa-regular fa-eye"></i> Xem chi tiết
                        </button>
                        <button class="btn btn-sm btn-light" onclick="viewPaymentHistory(${c.contract_id})">
                            <i class="fa-solid fa-clock-rotate-left"></i> Lịch sử thanh toán
                        </button>
                        <button class="btn btn-sm btn-light" onclick="downloadContract(${c.contract_id})">
                            <i class="fa-solid fa-download"></i> Download hợp đồng
                        </button>
                    </div>
                </div>`;
                container.insertAdjacentHTML('beforeend', html);
            });
        } catch (err) { console.error(err); }
    }

    // --- 5. ACTION LOGIC ---
    // --- THAY THẾ TOÀN BỘ HÀM CŨ BẰNG HÀM NÀY ---
    // --- 2. HÀM GỬI FORM TẠO HỢP ĐỒNG ---
    async function submitCreateContract() {
        const roomId = document.getElementById('select-room-id').value;
        
        // Lấy dữ liệu theo ID (An toàn hơn)
        const fullName = document.getElementById('inp-fullname').value;
        const phone = document.getElementById('inp-phone').value;
        const idCardNumber = document.getElementById('inp-id-card').value;
        const startDate = document.getElementById('inp-start-date').value;
        const endDate = document.getElementById('inp-end-date').value;
        const depositRaw = document.getElementById('inp-deposit').value;
        const rentRaw = document.getElementById('inp-rent').value;
        const notes = document.getElementById('inp-notes').value;
        const password = document.getElementById('inp-password').value;

        // Validate cơ bản
        if (!roomId) return alert("Vui lòng chọn phòng!");
        if (!fullName || !phone) return alert("Vui lòng nhập tên và SĐT!");
        if (!idCardNumber) return alert("Vui lòng nhập số CCCD/CMND!");

        // Tạo FormData
        const formData = new FormData();
        formData.append('room_id', roomId);
        formData.append('full_name', fullName);
        formData.append('phone', phone);
        formData.append('id_card_number', idCardNumber);
        formData.append('start_date', startDate);
        formData.append('end_date', endDate);
        formData.append('deposit_amount', depositRaw.replace(/[^0-9]/g, ''));
        formData.append('rent_amount', rentRaw.replace(/[^0-9]/g, ''));
        formData.append('notes', notes);
        formData.append('password', password);

        // File upload
        const fileFront = document.getElementById('file-cccd-front').files[0];
        const fileBack = document.getElementById('file-cccd-back').files[0];
        const filePdf = document.getElementById('file-contract-pdf').files[0];

        if (fileFront) formData.append('cccd_front', fileFront);
        if (fileBack) formData.append('cccd_back', fileBack);
        if (filePdf) formData.append('contract_pdf', filePdf);

        try {
            const res = await fetch(`${API_URL}/contracts`, {
                method: 'POST',
                body: formData
            });

            if (res.ok) {
                alert("Tạo hợp đồng thành công!");
                toggleModal();
                // Nếu có hàm loadContracts() thì gọi ở đây
                 window.location.reload(); // Tạm thời reload trang để thấy data mới
            } else {
                // Sửa lỗi JSON parse: Nếu backend trả về text lỗi thì in ra text
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    const data = await res.json();
                    alert("Lỗi: " + data.message);
                } else {
                    const text = await res.text();
                    alert("Lỗi Server: " + text);
                }
            }
        } catch (err) {
            console.error(err);
            alert("Lỗi kết nối hoặc lỗi code JS: " + err.message);
        }
    }

    async function viewContractDetails(id) {
        currentContractId = id;
        toggleModal('edit'); // Chuyển sang chế độ xem/sửa
        
        try {
            const res = await fetch(`${API_URL}/contracts/${id}`);
            const data = await res.json();
            
            // Điền thông tin khách
            document.getElementById('inp-fullname').value = data.full_name;
            document.getElementById('inp-phone').value = data.phone;
            
            // [MỚI] Điền mật khẩu hiện tại vào ô input
            document.getElementById('inp-password').value = data.plain_password || '';
    
            // Xử lý Select Room
            const select = document.getElementById('select-room-id');
            select.innerHTML = `<option value="${data.room_id}" selected>P.${data.room_number}</option>`;
            select.disabled = true;
    
            // Điền ngày tháng
            const dateInputs = document.querySelectorAll('input[type="date"]');
            dateInputs[0].value = formatDateInput(data.start_date); // Cần hàm format YYYY-MM-DD cho input date
            dateInputs[1].value = formatDateInput(data.end_date);
            
            // Điền tiền
            const moneyInputs = document.querySelectorAll('.has-icon'); 
            // Lưu ý: index thay đổi do ta thêm ô input password có class .has-icon ở trên
            // Index 0: password (mới thêm ở trên) -> KHÔNG DÙNG Ở ĐÂY
            // Index 1: Tiền cọc (trong file html cũ là index 0)
            // Index 2: Tiền thuê (trong file html cũ là index 1)
            
            // Sửa lại cách lấy input tiền cho chính xác theo ID
            document.getElementById('inp-deposit').value = data.deposit_amount;
            document.getElementById('inp-rent').value = data.rent_amount;
            document.getElementById('inp-notes').value = data.notes || '';
            
            // Ban đầu disable tất cả input (chế độ xem)
            setEditMode(false);
    
        } catch (err) { console.error(err); }
    }
    
    // Bật chế độ chỉnh sửa
    function enableEditMode() {
        setEditMode(true);
        document.getElementById('btn-edit').style.display = 'none';
        document.getElementById('btn-save').style.display = 'flex';
    }
    
    // Tắt/bật chế độ chỉnh sửa
    function setEditMode(enabled) {
        const inputs = [
            'inp-fullname',
            'inp-phone',
            'inp-id-card',
            'inp-password',
            'inp-start-date',
            'inp-end-date',
            'inp-deposit',
            'inp-rent',
            'inp-notes'
        ];
        
        inputs.forEach(id => {
            const input = document.getElementById(id);
            if (input) {
                input.disabled = !enabled;
                if (enabled) {
                    input.style.backgroundColor = '#ffffff';
                    input.style.cursor = 'text';
                } else {
                    input.style.backgroundColor = '#f9fafb';
                    input.style.cursor = 'not-allowed';
                }
            }
        });
    }
    
    // Lưu thay đổi
    async function saveContractChanges() {
        if (!currentContractId) return;
        
        // Thu thập dữ liệu từ Form
        const payload = {
            full_name: document.getElementById('inp-fullname').value,
            phone: document.getElementById('inp-phone').value,
            id_card_number: document.getElementById('inp-id-card').value,
            password: document.getElementById('inp-password').value, // Lấy mật khẩu
            
            start_date: document.getElementById('inp-start-date').value,
            end_date: document.getElementById('inp-end-date').value,
            
            deposit_amount: document.getElementById('inp-deposit').value.replace(/[^0-9]/g, ''),
            rent_amount: document.getElementById('inp-rent').value.replace(/[^0-9]/g, ''),
            notes: document.getElementById('inp-notes').value
        };
    
        try {
            const res = await fetch(`${API_URL}/contracts/${currentContractId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
    
            if (res.ok) {
                alert('Cập nhật thành công!');
                // Tắt chế độ chỉnh sửa
                setEditMode(false);
                document.getElementById('btn-edit').style.display = 'flex';
                document.getElementById('btn-save').style.display = 'none';
                // Tải lại danh sách
                loadContracts();
                loadContractStats();
            } else {
                const err = await res.text();
                alert('Lỗi: ' + err);
            }
        } catch (e) {
            console.error(e);
            alert('Có lỗi xảy ra khi cập nhật');
        }
    }
    
    // Hàm hỗ trợ format date cho input type="date" (YYYY-MM-DD)
    function formatDateInput(dateString) {
        if (!dateString) return '';
        const d = new Date(dateString);
        return d.toISOString().split('T')[0];
    }
    

    async function terminateContract() {
        if(!currentContractId) return;
        if(!confirm('Chắc chắn chấm dứt?')) return;
        
        try {
            await fetch(`${API_URL}/contracts/${currentContractId}/terminate`, { method: 'PUT' });
            alert('Thành công!');
            toggleModal();
            loadContracts();
            loadContractStats(); // Cập nhật lại số liệu thống kê
        } catch(e) { console.error(e); }
    }

    function viewPaymentHistory(contractId) {
        // TODO: Implement payment history view
        alert('Tính năng lịch sử thanh toán đang được phát triển. Contract ID: ' + contractId);
    }

    async function downloadContract(contractId) {
        try {
            const res = await fetch(`${API_URL}/contracts/${contractId}`);
            const data = await res.json();
            
            if (data.contract_file_url) {
                // Tạo link download
                const link = document.createElement('a');
                link.href = `http://localhost:3000${data.contract_file_url}`;
                link.download = `hop-dong-${contractId}.pdf`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } else {
                alert('Hợp đồng chưa có file PDF để tải xuống.');
            }
        } catch (err) {
            console.error(err);
            alert('Lỗi khi tải hợp đồng: ' + err.message);
        }
    }

    // --- INIT ---
    document.addEventListener('DOMContentLoaded', () => {
        loadContracts();
        loadContractStats(); // Gọi hàm thống kê khi load trang
    });