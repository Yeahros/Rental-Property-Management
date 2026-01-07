
    const API_URL = 'http://localhost:3000/api';
    let currentContractId = null;
    let currentMembers = [];
    let allowMemberEdit = true; // cho phép thêm/sửa thành viên (create mode hoặc edit mode)

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

    // --- THÀNH VIÊN PHÒNG ---
    function renderMembers(readOnly = false) {
        const list = document.getElementById('member-list');
        if (!list) return;
        list.innerHTML = '';
        if (!currentMembers || currentMembers.length === 0) {
            list.innerHTML = '<span style="font-size:12px; color:#9ca3af;">Chưa có thành viên</span>';
            return;
        }
        currentMembers.forEach((m, idx) => {
            const initials = (m.full_name || '??').split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
            const chip = document.createElement('div');
            chip.className = 'member-chip';
            chip.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid #e5e7eb;border-radius:10px;background:#f9fafb;cursor:pointer;';
            chip.innerHTML = `
                <div style="width:34px;height:34px;border-radius:9999px;background:#e0f2fe;color:#0369a1;display:flex;align-items:center;justify-content:center;font-weight:700;">${initials}</div>
                <div style="display:flex;flex-direction:column;line-height:1.3;">
                    <span style="font-weight:600;color:#111827;">${m.full_name || 'Chưa rõ'}</span>
                    <span style="font-size:12px;color:#6b7280;">${m.phone || ''}</span>
                </div>
            `;
            chip.onclick = () => showMemberInfo(idx);
            list.appendChild(chip);
        });

        // Khi ở chế độ xem (readOnly), không cho thêm thành viên trong modal chi tiết
        const form = document.getElementById('member-form');
        const btnShow = document.getElementById('btn-show-member-form');
        if (form) form.style.display = 'none';
        if (btnShow) btnShow.style.display = readOnly ? 'none' : 'inline-flex';
    }

    function clearMemberForm() {
        ['member-name','member-phone','member-idcard','member-cccd-front','member-cccd-back'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
    }

    function toggleMemberForm(show) {
        if (show && !allowMemberEdit) return; // chặn mở form khi không được phép
        const form = document.getElementById('member-form');
        const btnShow = document.getElementById('btn-show-member-form');
        const infoBox = document.getElementById('member-info');
        if (form) form.style.display = show ? 'grid' : 'none';
        if (btnShow) btnShow.style.display = show ? 'none' : 'inline-flex';
        if (!show && infoBox) infoBox.style.display = 'none';
        if (show) clearMemberForm();
    }

    function addMember() {
        if (!allowMemberEdit) {
            alert('Vui lòng bấm "Chỉnh sửa" để thêm thành viên.');
            return;
        }
        const nameEl = document.getElementById('member-name');
        if (!nameEl || !nameEl.value.trim()) {
            alert('Vui lòng nhập họ tên thành viên');
            return;
        }
        const newMember = {
            full_name: nameEl.value.trim(),
            phone: (document.getElementById('member-phone')?.value || '').trim(),
            id_card_number: (document.getElementById('member-idcard')?.value || '').trim(),
            cccd_front: (document.getElementById('member-cccd-front')?.value || '').trim(),
            cccd_back: (document.getElementById('member-cccd-back')?.value || '').trim(),
        };
        currentMembers.push(newMember);
        renderMembers(false);
        toggleMemberForm(false);
    }

    function showMemberInfo(index) {
        const infoBox = document.getElementById('member-info');
        if (!infoBox || !currentMembers[index]) return;
        const m = currentMembers[index];
        infoBox.style.display = 'block';
        infoBox.innerHTML = `
            <div style="padding:10px;border:1px dashed #d1d5db;border-radius:10px;background:#f8fafc;">
                <div style="font-weight:700;color:#111827;margin-bottom:6px;">${m.full_name}</div>
                <div style="font-size:13px;color:#374151;line-height:1.5;">
                    <div><strong>SĐT:</strong> ${m.phone || '---'}</div>
                    <div><strong>CCCD/CMND:</strong> ${m.id_card_number || '---'}</div>
                    <div><strong>Ảnh trước:</strong> ${m.cccd_front || '---'}</div>
                    <div><strong>Ảnh sau:</strong> ${m.cccd_back || '---'}</div>
                </div>
            </div>
        `;
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
                const selectedOption = this.options[this.selectedIndex];
                const price = selectedOption.getAttribute('data-price');
                
                if (price) {
                    // Format số tiền với dấu chấm phân cách hàng nghìn (ví dụ: 5.500.000)
                    const formattedPrice = new Intl.NumberFormat('vi-VN').format(parseInt(price));
                    
                    // Điền vào input tiền thuê phòng
                    const rentInput = document.getElementById('inp-rent');
                    if (rentInput) {
                        rentInput.value = formattedPrice;
                    }
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
            currentMembers = [];
            allowMemberEdit = true;
            renderMembers(false);
            toggleMemberForm(false);
            const infoBox = document.getElementById('member-info');
            if (infoBox) infoBox.style.display = 'none';

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
            // Ở chế độ xem chi tiết, chỉ xem icon thành viên, không cho thêm
            allowMemberEdit = false;
            renderMembers(true);
            toggleMemberForm(false);
        }
    }

    // --- 4. DATA LIST LOGIC ---
    async function loadContracts(status = 'All', search = '') {
        try {
            const params = new URLSearchParams();
            if (status && status !== 'All') params.append('status', status);
            if (search && search.trim() !== '') params.append('search', search.trim());
            const query = params.toString();
            const url = query ? `${API_URL}/contracts?${query}` : `${API_URL}/contracts`;
            const res = await fetch(url);
            const contracts = await res.json();
            const container = document.querySelector('.tenant-list');
            container.innerHTML = '';

            contracts.forEach(c => {
                let badgeClass = 'badge-neutral';
                let statusText = 'Unknown';
                if (c.status === 'Active') { badgeClass = 'badge-success'; statusText = 'Đang thuê'; }
                else if (c.status === 'Terminated') { badgeClass = 'badge-danger'; statusText = 'Đã chấm dứt'; }
                else if (c.status === 'Expired') { badgeClass = 'badge-neutral'; statusText = 'Hết hạn'; }

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
        formData.append('members', JSON.stringify(currentMembers || []));

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
            
            // Thành viên
            currentMembers = data.members || [];
            renderMembers(true);
            const infoBox = document.getElementById('member-info');
            if (infoBox) infoBox.style.display = 'none';

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

        // Toggle member form
        allowMemberEdit = enabled;
        renderMembers(!enabled);
        const infoBox = document.getElementById('member-info');
        if (!enabled && infoBox) infoBox.style.display = 'none';
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
    // Tìm kiếm và tự động điền thông tin tenant
    async function searchAndFillTenantInfo(searchBy, value) {
        if (!value || value.trim() === '') {
            return;
        }
        
        // Chỉ tìm kiếm nếu đã nhập đủ (ít nhất 8 ký tự cho số điện thoại hoặc CCCD)
        if (value.length < 8) {
            return;
        }
        
        try {
            const params = new URLSearchParams();
            if (searchBy === 'phone') {
                params.append('phone', value.trim());
            } else if (searchBy === 'id_card') {
                params.append('id_card', value.trim());
            }
            
            const res = await fetch(`${API_URL}/contracts/search-tenant?${params.toString()}`);
            
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            
            const tenant = await res.json();
            
            if (tenant) {
                // Chỉ điền các trường còn trống để tránh ghi đè dữ liệu người dùng đã nhập
                const fullnameInput = document.getElementById('inp-fullname');
                const phoneInput = document.getElementById('inp-phone');
                const idCardInput = document.getElementById('inp-id-card');
                const passwordInput = document.getElementById('inp-password');
                
                // Điền họ tên nếu còn trống
                if (tenant.full_name && (!fullnameInput.value || fullnameInput.value.trim() === '')) {
                    fullnameInput.value = tenant.full_name;
                }
                
                // Điền số điện thoại nếu còn trống và không phải là trường đang tìm kiếm
                if (tenant.phone && searchBy !== 'phone' && (!phoneInput.value || phoneInput.value.trim() === '')) {
                    phoneInput.value = tenant.phone;
                }
                
                // Điền CCCD nếu còn trống và không phải là trường đang tìm kiếm
                if (tenant.id_card_number && searchBy !== 'id_card' && (!idCardInput.value || idCardInput.value.trim() === '')) {
                    idCardInput.value = tenant.id_card_number;
                }
                
                // Điền mật khẩu nếu còn trống
                if (tenant.plain_password && (!passwordInput.value || passwordInput.value.trim() === '')) {
                    passwordInput.value = tenant.plain_password;
                }
                
                // Hiển thị thông báo tìm thấy
                showNotification('Đã tìm thấy thông tin khách thuê và tự động điền!', 'success');
            }
        } catch (err) {
            console.error('Search Tenant Error:', err);
            // Không hiển thị lỗi nếu không tìm thấy (đó là trường hợp bình thường)
        }
    }
    
    // Helper function để hiển thị thông báo
    function showNotification(message, type = 'info') {
        // Tạo element thông báo tạm thời
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#10B981' : '#3B82F6'};
            color: white;
            padding: 12px 20px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10000;
            font-size: 14px;
            font-weight: 500;
            animation: slideIn 0.3s ease;
        `;
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadContracts();
        loadContractStats(); // Gọi hàm thống kê khi load trang
        
        // Search + filter
        const searchInput = document.querySelector('.search-input');
        const dropdown = document.getElementById('statusDropdown');
        let currentStatus = 'All';

        function applyFilter() {
            const text = searchInput ? searchInput.value : '';
            loadContracts(currentStatus, text);
        }

        if (searchInput) {
            searchInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') applyFilter();
            });
        }

        // Dropdown logic
        if (dropdown) {
            const toggle = dropdown.querySelector('.dropdown-toggle');
            const menu = dropdown.querySelector('.dropdown-menu');
            const labelSpan = toggle.querySelector('span');

            window.toggleDropdown = function() {
                dropdown.classList.toggle('open');
            };

            menu.querySelectorAll('.dropdown-item').forEach(item => {
                item.addEventListener('click', () => {
                    menu.querySelectorAll('.dropdown-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                    labelSpan.textContent = item.textContent;

                    // Map text -> status param
                    if (item.textContent.includes('Đang thuê')) currentStatus = 'Active';
                    else if (item.textContent.includes('Chấm dứt')) currentStatus = 'Terminated';
                    else if (item.textContent.includes('Hết hạn')) currentStatus = 'Expired';
                    else currentStatus = 'All';

                    dropdown.classList.remove('open');
                    applyFilter();
                });
            });

            document.addEventListener('click', (e) => {
                if (!dropdown.contains(e.target)) dropdown.classList.remove('open');
            });
        }

        // Thêm event listener cho input số điện thoại
        const phoneInput = document.getElementById('inp-phone');
        if (phoneInput) {
            let phoneTimeout;
            phoneInput.addEventListener('blur', function() {
                clearTimeout(phoneTimeout);
                phoneTimeout = setTimeout(() => {
                    const phoneValue = this.value.trim();
                    if (phoneValue && phoneValue.length >= 8) {
                        // Tìm kiếm và điền thông tin (hàm sẽ tự kiểm tra và chỉ điền các trường còn trống)
                        searchAndFillTenantInfo('phone', phoneValue);
                    }
                }, 300); // Debounce 300ms
            });
        }
        
        // Thêm event listener cho input CCCD
        const idCardInput = document.getElementById('inp-id-card');
        if (idCardInput) {
            let idCardTimeout;
            idCardInput.addEventListener('blur', function() {
                clearTimeout(idCardTimeout);
                idCardTimeout = setTimeout(() => {
                    const idCardValue = this.value.trim();
                    if (idCardValue && idCardValue.length >= 8) {
                        // Tìm kiếm và điền thông tin (hàm sẽ tự kiểm tra và chỉ điền các trường còn trống)
                        searchAndFillTenantInfo('id_card', idCardValue);
                    }
                }, 300); // Debounce 300ms
            });
        }
    });