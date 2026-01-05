
    const API_URL = 'http://localhost:3000/api';
    let currentHouseId = null; // Biến quan trọng: Lưu ID nhà đang xem
    let currentRoomId = null; // Lưu ID phòng đang xem/chỉnh sửa
    let isEditMode = false; // Trạng thái chỉnh sửa
    let isHouseEditMode = false; // Trạng thái chỉnh sửa nhà trọ
    let currentRoomsPage = 0; // Trang hiện tại của danh sách phòng
    let roomsPerPage = 8; // Số phòng hiển thị mỗi trang
    let allRooms = []; // Lưu tất cả phòng để phân trang
    let currentHousesPage = 0; // Trang hiện tại của danh sách nhà trọ
    let housesPerPage = 5; // Số nhà trọ hiển thị mỗi trang (không tính nhà đang chọn)
    let allHouses = []; // Lưu tất cả nhà trọ để phân trang

    // --- 1. UTILS (TIỆN ÍCH) ---
    function formatCurrency(amount) {
        if (!amount && amount !== 0) return '0 đ';
        return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
    }

    // --- 2. MODAL LOGIC (XỬ LÝ CỬA SỔ) ---
    function openModal(modalId) {
        document.getElementById(modalId).classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeModal(modalId) {
        document.getElementById(modalId).classList.remove('open');
        document.body.style.overflow = '';
    }

    window.onclick = function(event) {
        if (event.target.classList.contains('modal-overlay')) {
            event.target.classList.remove('open');
            document.body.style.overflow = '';
        }
    }

    // --- 3. SERVICE LOGIC (XỬ LÝ DỊCH VỤ ĐỘNG) ---

    // Tạo HTML cho một dòng dịch vụ
    function createServiceRowHtml(name = '', type = 'Theo tháng', price = '') {
        return `
            <div class="service-row">
                <div style="flex: 2;">
                    <input type="text" class="form-input svc-name" placeholder="Tên DV (Điện, Wifi...)" value="${name}">
                </div>
                <div style="flex: 1.5;">
                    <select class="form-input svc-type">
                        <option value="Theo số (kWh/khối)" ${type === 'Theo số (kWh/khối)' ? 'selected' : ''}>Theo số (kWh/khối)</option>
                        <option value="Theo tháng" ${type === 'Theo tháng' ? 'selected' : ''}>Theo tháng</option>
                        <option value="Theo người" ${type === 'Theo người' ? 'selected' : ''}>Theo người</option>
                    </select>
                </div>
                <div style="flex: 1.5;">
                    <input type="text" class="form-input svc-price" placeholder="Giá tiền" value="${price}">
                </div>
                <button type="button" class="btn-remove-service" onclick="this.parentElement.remove()">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
    }

    // Thêm một dòng dịch vụ trống vào form
    function addServiceRow(context) { // context là 'house' hoặc 'room'
        const container = document.getElementById(`service-list-${context}`);
        container.insertAdjacentHTML('beforeend', createServiceRowHtml());
    }

    // Thu thập dữ liệu dịch vụ từ form để gửi đi
    function collectServices(context) {
        const container = document.getElementById(`service-list-${context}`);
        const rows = container.getElementsByClassName('service-row');
        const services = [];

        for (let row of rows) {
            const name = row.querySelector('.svc-name').value.trim();
            const type = row.querySelector('.svc-type').value;
            // Loại bỏ dấu chấm/phẩy trong giá tiền để gửi số nguyên về server
            let priceRaw = row.querySelector('.svc-price').value;
            let price = priceRaw.replace(/[^0-9]/g, '');

            if (name && price) {
                services.push({ name, type, price });
            }
        }
        return services;
    }

    // Logic mở Modal tạo phòng: Tự động lấy dịch vụ chung của Nhà đắp vào Form Phòng
    async function checkAndOpenRoomModal() {
        if (!currentHouseId) {
            alert("Vui lòng chọn hoặc tạo một Nhà trọ trước khi thêm phòng!");
            return;
        }

        // Reset danh sách dịch vụ cũ trong modal phòng
        const container = document.getElementById('service-list-room');
        container.innerHTML = '';

        // Gọi API lấy dịch vụ chung của nhà này
        try {
            const houseId = parseInt(currentHouseId);
            if (isNaN(houseId) || houseId <= 0) {
                throw new Error('ID nhà trọ không hợp lệ');
            }
            
            const res = await fetch(`${API_URL}/houses/${houseId}`);
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            const house = await res.json();
            const services = house.services || [];

            if (services.length > 0) {
                // Nếu nhà có dịch vụ chung, hiển thị chúng (Kế thừa)
                services.forEach(svc => {
                    container.insertAdjacentHTML('beforeend', createServiceRowHtml(svc.name, svc.type, svc.price));
                });
            } else {
                // Nếu nhà chưa thiết lập dịch vụ, tạo sẵn 2 dòng mẫu gợi ý
                container.insertAdjacentHTML('beforeend', createServiceRowHtml('Điện', 'Theo số (kWh/khối)', '3500'));
                container.insertAdjacentHTML('beforeend', createServiceRowHtml('Nước', 'Theo người', '100000'));
            }
        } catch (err) {
            console.error("Lỗi load dịch vụ chung:", err);
            // Fallback nếu lỗi - tạo 2 dòng mẫu
            container.insertAdjacentHTML('beforeend', createServiceRowHtml('Điện', 'Theo số (kWh/khối)', '3500'));
            container.insertAdjacentHTML('beforeend', createServiceRowHtml('Nước', 'Theo người', '100000'));
        }

        openModal('modal-room');
    }


    // --- 4. DATA FETCHING (LẤY DỮ LIỆU HIỂN THỊ) ---

    // Load thống kê Dashboard
    async function loadStats() {
        try {
            const res = await fetch(`${API_URL}/houses/stats`);
            const data = await res.json();
            document.getElementById('stat-total').innerText = data.total_rooms || 0;
            document.getElementById('stat-occupied').innerText = data.occupied || 0;
            document.getElementById('stat-vacant').innerText = data.vacant || 0;
            document.getElementById('stat-revenue').innerText = formatCurrency(data.revenue || 0);
        } catch (err) {
            console.error("Lỗi load stats:", err);
            // Hiển thị 0 nếu có lỗi
            document.getElementById('stat-total').innerText = '0';
            document.getElementById('stat-occupied').innerText = '0';
            document.getElementById('stat-vacant').innerText = '0';
            document.getElementById('stat-revenue').innerText = '0 đ';
        }
    }

    // Load danh sách Nhà trọ -> Tạo Tabs với phân trang
    async function loadHouses() {
        try {
            const res = await fetch(`${API_URL}/houses`);
            allHouses = await res.json();
            currentHousesPage = 0; // Reset về trang đầu
            renderHousesPage();
        } catch (err) {
            console.error("Lỗi load houses:", err);
        }
    }

    // Render nhà trọ theo trang
    function renderHousesPage() {
            const container = document.getElementById('house-tabs-container');
            container.innerHTML = ''; // Xóa nội dung cũ

        if (allHouses.length === 0) {
                container.innerHTML = '<span style="font-size:0.9rem; color:#666">Chưa có nhà nào. Hãy tạo mới!</span>';
            document.getElementById('active-house-card').style.display = 'none';
                currentHouseId = null;
            return;
        }

        // Nếu chưa chọn nhà nào, mặc định chọn nhà đầu tiên
        if (!currentHouseId && allHouses.length > 0) {
            currentHouseId = allHouses[0].house_id;
        }

        // Tìm nhà trọ đang active
        const activeHouse = allHouses.find(h => h.house_id == currentHouseId);
        
        // Hiển thị nhà trọ active ở card lớn
        if (activeHouse) {
            document.getElementById('active-house-card').style.display = 'block';
            displayActiveHouse(activeHouse); // Async function
            } else {
            document.getElementById('active-house-card').style.display = 'none';
        }

        // Lọc các nhà trọ khác (không bao gồm nhà active)
        const otherHouses = allHouses.filter(h => h.house_id != currentHouseId);
        
        // Tính toán nhà trọ hiển thị trong trang hiện tại
        const startIndex = currentHousesPage * housesPerPage;
        const endIndex = Math.min(startIndex + housesPerPage, otherHouses.length);
        const housesToShow = otherHouses.slice(startIndex, endIndex);

        // Hiển thị các nhà trọ khác ở icon bên phải
        housesToShow.forEach(house => {
            const houseIcon = createHouseIcon(house);
            container.appendChild(houseIcon);
        });

        // Cập nhật nút mũi tên chuyển trang (nếu có nhiều trang)
        const totalPages = Math.ceil(otherHouses.length / housesPerPage);
        const nextBtn = document.getElementById('houses-nav-next-btn');
        if (nextBtn) {
            nextBtn.style.display = (totalPages > 1 && currentHousesPage < totalPages - 1) ? 'block' : 'none';
        }

        // Không cần xử lý nút cũ vì đã xóa container.innerHTML ở đầu

        // Load phòng cho nhà đang active
        if (currentHouseId) loadRooms(currentHouseId);
    }

    // Tạo icon nhà trọ
    function createHouseIcon(house) {
        const houseIcon = document.createElement('div');
        houseIcon.className = 'house-icon-item';
        houseIcon.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 0.5rem; cursor: pointer; transition: opacity 0.2s; min-width: 90px; opacity: 0.5;';
        
        const iconDiv = document.createElement('div');
        iconDiv.style.cssText = 'width: 56px; height: 56px; background: #f3f4f6; border-radius: 0.75rem; display: flex; align-items: center; justify-content: center; transition: all 0.2s;';
        
        const icon = document.createElement('i');
        icon.className = 'fas fa-home';
        icon.style.cssText = 'font-size: 1.75rem; color: #6b7280; transition: all 0.2s;';
        
        iconDiv.appendChild(icon);
        
        houseIcon.onmouseover = () => {
            houseIcon.style.opacity = '1';
            iconDiv.style.backgroundColor = '#EFF6FF';
            iconDiv.style.borderColor = '#3B82F6';
            icon.style.color = '#1D4ED8';
        };
        houseIcon.onmouseout = () => {
            houseIcon.style.opacity = '0.5';
            iconDiv.style.backgroundColor = '#f3f4f6';
            iconDiv.style.borderColor = 'transparent';
            icon.style.color = '#6b7280';
        };
        
        houseIcon.appendChild(iconDiv);
        
        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'font-size: 0.9375rem; font-weight: 500; color: #1D4ED8; text-align: center; word-break: break-word; max-width: 90px;';
        nameSpan.textContent = house.house_name;
        houseIcon.appendChild(nameSpan);
        
        houseIcon.onclick = () => {
                        currentHouseId = house.house_id;
            currentHousesPage = 0; // Reset về trang đầu khi chọn nhà mới
            renderHousesPage(); // Render lại để nhà mới lên card lớn
                        loadRooms(currentHouseId); // Load phòng tương ứng
                    };
        
        return houseIcon;
    }

    // Tạo icon "Thêm nhà"
    function createAddHouseIcon() {
        const addHouseIcon = document.createElement('div');
        addHouseIcon.className = 'house-icon-item';
        addHouseIcon.style.cssText = 'display: flex; flex-direction: column; align-items: center; gap: 0.5rem; cursor: pointer; transition: transform 0.2s; min-width: 80px;';
        
        const addIconDiv = document.createElement('div');
        addIconDiv.style.cssText = 'width: 64px; height: 64px; background: transparent; border: 2px dashed #9ca3af; border-radius: 0.75rem; display: flex; align-items: center; justify-content: center; transition: all 0.2s;';
        
        const addIcon = document.createElement('i');
        addIcon.className = 'fas fa-plus';
        addIcon.style.cssText = 'font-size: 1.5rem; color: #9ca3af; transition: all 0.2s;';
        
        addIconDiv.appendChild(addIcon);
        
        addHouseIcon.onmouseover = () => {
            addHouseIcon.style.transform = 'translateY(-2px)';
            addIconDiv.style.borderColor = '#3B82F6';
            addIconDiv.style.backgroundColor = '#EFF6FF';
            addIcon.style.color = '#3B82F6';
        };
        addHouseIcon.onmouseout = () => {
            addHouseIcon.style.transform = 'translateY(0)';
            addIconDiv.style.borderColor = '#9ca3af';
            addIconDiv.style.backgroundColor = 'transparent';
            addIcon.style.color = '#9ca3af';
        };
        
        addHouseIcon.appendChild(addIconDiv);
        
        const addNameSpan = document.createElement('span');
        addNameSpan.style.cssText = 'font-size: 0.75rem; color: #6b7280; text-align: center; word-break: break-word; max-width: 80px;';
        addNameSpan.textContent = 'Thêm nhà';
        addHouseIcon.appendChild(addNameSpan);
        
        addHouseIcon.onclick = () => {
                // Reset form nhà khi mở mới
                document.getElementById('form-house').reset();
                document.getElementById('service-list-house').innerHTML = '';
                addServiceRow('house'); // Thêm 1 dòng trống
                openModal('modal-house');
            };
        
        return addHouseIcon;
    }

    // Cập nhật nút điều hướng nhà trọ (không cần nữa vì tạo động)
    function updateHousesNavigation(totalOtherHouses) {
        // Function này giữ lại để tương thích, nhưng không làm gì vì nút được tạo động
    }

    // Chuyển sang trang tiếp theo của danh sách nhà trọ
    function nextHousesPage() {
        const otherHouses = allHouses.filter(h => h.house_id != currentHouseId);
        const totalPages = Math.ceil(otherHouses.length / housesPerPage);
        if (currentHousesPage < totalPages - 1) {
            currentHousesPage++;
            renderHousesPage();
        }
    }

    // Chuyển về trang trước của danh sách nhà trọ
    function prevHousesPage() {
        if (currentHousesPage > 0) {
            currentHousesPage--;
            renderHousesPage();
        }
    }

    // Hiển thị nhà trọ active ở card lớn
    async function displayActiveHouse(house) {
        if (!house) {
            document.getElementById('active-house-card').style.display = 'none';
            return;
        }
        
        document.getElementById('active-house-name').textContent = house.house_name || 'Chưa có tên';
        document.getElementById('active-house-address').innerHTML = `
            <i class="fas fa-map-marker-alt" style="color: #9ca3af;"></i>
            <span>${house.address || 'Chưa có địa chỉ'}</span>
        `;
        
        // Lấy doanh thu tháng
        try {
            const res = await fetch(`${API_URL}/houses/${house.house_id}/revenue`);
            const data = await res.json();
            const revenue = data.monthly_revenue || 0;
            document.getElementById('active-house-revenue').textContent = formatCurrency(revenue);
        } catch (err) {
            console.error("Lỗi load doanh thu:", err);
            document.getElementById('active-house-revenue').textContent = formatCurrency(0);
        }
    }

    // Load danh sách Phòng
    async function loadRooms(houseId) {
        try {
            const res = await fetch(`${API_URL}/rooms?house_id=${houseId}`);
            allRooms = await res.json();
            currentRoomsPage = 0; // Reset về trang đầu
            renderRoomsPage();
        } catch (err) {
            console.error("Lỗi load rooms:", err);
        }
    }

    // Render phòng theo trang
    function renderRoomsPage() {
            const container = document.getElementById('rooms-container');
            container.innerHTML = '';

        if (allRooms.length === 0) {
                container.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:2rem; color:#888; border:1px dashed #ddd; border-radius:8px;">Nhà này chưa có phòng nào. Hãy ấn nút "Thêm Phòng".</div>';
            document.getElementById('rooms-next-btn').style.display = 'none';
            document.getElementById('rooms-prev-btn').style.display = 'none';
                return;
            }

        // Tính toán phòng hiển thị trong trang hiện tại
        const startIndex = currentRoomsPage * roomsPerPage;
        const endIndex = Math.min(startIndex + roomsPerPage, allRooms.length);
        const roomsToShow = allRooms.slice(startIndex, endIndex);

        // Render các phòng
        roomsToShow.forEach(room => {
                let statusBadge, tenantHtml, statusBarClass;

                if (room.status === 'Occupied') {
                    statusBadge = `<span class="badge occupied">Đã thuê</span>`;
                    statusBarClass = 'green';
                    const tName = room.tenant_name || 'Khách';
                    tenantHtml = `
                        <div class="tenant-info">
                            <div class="tenant-avatar blue">${tName.substring(0,2).toUpperCase()}</div>
                            <div class="tenant-details">
                                <p class="name">${tName}</p>
                                <p class="date">HĐ đến: ${room.contract_end_date ? new Date(room.contract_end_date).toLocaleDateString('vi-VN') : '?'}</p>
                            </div>
                        </div>`;
                } else {
                    statusBadge = `<span class="badge vacant">Còn trống</span>`;
                    statusBarClass = 'red';
                    tenantHtml = `<div class="empty-state">Sẵn sàng cho thuê</div>`;
                }

                const html = `
            <div class="room-card" onclick="viewRoomDetail(${room.room_id})" style="cursor: pointer;">
                    <div class="card-body">
                        <div class="card-header">
                            <div>
                                <h4 class="room-name">Phòng ${room.room_number}</h4>
                                <div class="room-meta">
                                    <span><i class="fas fa-layer-group"></i> Tầng ${room.floor}</span> • 
                                    <span>${room.area_m2} m²</span>
                                </div>
                            </div>
                            ${statusBadge}
                        </div>
                        ${tenantHtml}
                        <div class="card-footer-info">
                            <span class="price-label">Giá thuê</span>
                            <span class="price-value">${formatCurrency(room.base_rent)}<span style="font-size:0.75rem; color:#6B7280; font-weight:400">/tháng</span></span>
                        </div>
                    </div>
                    <div class="status-bar ${statusBarClass}"></div>
                </div>`;
                container.insertAdjacentHTML('beforeend', html);
            });

        // Hiển thị/ẩn nút mũi tên
        updateRoomsNavigation();
    }

    // Cập nhật nút điều hướng
    function updateRoomsNavigation() {
        const totalPages = Math.ceil(allRooms.length / roomsPerPage);
        const nextBtn = document.getElementById('rooms-next-btn');
        const prevBtn = document.getElementById('rooms-prev-btn');

        if (totalPages <= 1) {
            nextBtn.style.display = 'none';
            prevBtn.style.display = 'none';
        } else {
            // Chỉ hiển thị nút next (mũi tên phải) ở góc phải
            nextBtn.style.display = currentRoomsPage < totalPages - 1 ? 'flex' : 'none';
            prevBtn.style.display = 'none'; // Không hiển thị nút prev ở góc phải
        }
    }

    // Chuyển sang trang tiếp theo
    function nextRoomsPage() {
        const totalPages = Math.ceil(allRooms.length / roomsPerPage);
        if (currentRoomsPage < totalPages - 1) {
            currentRoomsPage++;
            renderRoomsPage();
            // Scroll về đầu danh sách
            window.scrollTo({ top: document.getElementById('rooms-container').offsetTop - 100, behavior: 'smooth' });
        }
    }

    // Chuyển về trang trước
    function prevRoomsPage() {
        if (currentRoomsPage > 0) {
            currentRoomsPage--;
            renderRoomsPage();
            // Scroll về đầu danh sách
            window.scrollTo({ top: document.getElementById('rooms-container').offsetTop - 100, behavior: 'smooth' });
        }
    }

    // --- 5. DATA SUBMISSION (GỬI DỮ LIỆU) ---

    // Xử lý nút: Tạo Bất động sản
    async function submitHouse() {
        const name = document.getElementById('inp-house-name').value;
        const addr = document.getElementById('inp-house-addr').value;
        const desc = document.getElementById('inp-house-desc').value;

        if (!name) return alert("Vui lòng nhập tên nhà trọ!");

        // Lấy danh sách dịch vụ từ form
        const services = collectServices('house');

        const payload = {
            name: name,
            address: addr,
            description: desc,
            landlord_id: 1, // Demo ID, thực tế lấy từ token
            services: services // Gửi kèm dịch vụ
        };

        try {
            const res = await fetch(`${API_URL}/houses`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                alert("Thêm nhà thành công!");
                closeModal('modal-house');
                loadHouses(); // Tải lại danh sách nhà
            } else {
                alert("Lỗi khi thêm nhà!");
            }
        } catch (err) { console.error(err); }
    }

    // Xử lý nút: Tạo Phòng
    async function submitRoom() {
        if (!currentHouseId) return alert("Lỗi: Chưa xác định được nhà trọ!");

        const num = document.getElementById('inp-room-number').value;
        const floor = document.getElementById('inp-room-floor').value;
        const area = document.getElementById('inp-room-area').value;
        
        // Xóa ký tự không phải số ở giá thuê
        const rentRaw = document.getElementById('inp-room-rent').value;
        const rent = rentRaw.replace(/[^0-9]/g, ''); 
        
        const facilities = document.getElementById('inp-room-facilities').value;

        if (!num || !rent) return alert("Vui lòng nhập số phòng và giá thuê!");

        // Lấy danh sách dịch vụ (bao gồm cả dịch vụ kế thừa và mới)
        const services = collectServices('room');

        const payload = {
            house_id: currentHouseId,
            room_number: num,
            floor: floor,
            area: area,
            rent: rent,
            facilities: facilities,
            services: services // Gửi danh sách dịch vụ phòng
        };

        try {
            const res = await fetch(`${API_URL}/rooms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();

            if (res.ok) {
                alert("Thêm phòng thành công!");
                closeModal('modal-room');
                loadStats(); // Cập nhật thống kê
                loadRooms(currentHouseId); // Cập nhật danh sách phòng
            } else {
                alert("Lỗi: " + (data.message || "Không thể tạo phòng"));
            }
        } catch (err) { console.error(err); }
    }

    // --- 6. XEM VÀ CHỈNH SỬA CHI TIẾT PHÒNG ---

    // Mở modal xem chi tiết phòng
    async function viewRoomDetail(roomId) {
        currentRoomId = roomId;
        isEditMode = false;
        
        try {
            // Đảm bảo roomId là số nguyên hợp lệ
            const id = parseInt(roomId);
            if (isNaN(id) || id <= 0) {
                throw new Error('ID phòng không hợp lệ');
            }
            
            const res = await fetch(`${API_URL}/rooms/${id}`);
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            const room = await res.json();
            
            // Điền thông tin phòng
            document.getElementById('inp-room-detail-number').value = room.room_number || '';
            document.getElementById('inp-room-detail-floor').value = room.floor || '';
            document.getElementById('inp-room-detail-area').value = room.area_m2 || '';
            document.getElementById('inp-room-detail-rent').value = room.base_rent || '';
            document.getElementById('inp-room-detail-facilities').value = room.facilities || '';
            
            // Hiển thị thông tin khách thuê nếu có
            const tenantSection = document.getElementById('tenant-section');
            if (room.tenant_name) {
                tenantSection.style.display = 'block';
                document.getElementById('tenant-avatar-large').textContent = room.tenant_name.substring(0, 2).toUpperCase();
                document.getElementById('tenant-name-detail').textContent = room.tenant_name;
                document.getElementById('tenant-phone-detail').textContent = room.tenant_phone || 'Chưa có';
                document.getElementById('tenant-email-detail').textContent = room.tenant_email || 'Chưa có';
                if (room.contract_start_date && room.contract_end_date) {
                    const startDate = new Date(room.contract_start_date).toLocaleDateString('vi-VN');
                    const endDate = new Date(room.contract_end_date).toLocaleDateString('vi-VN');
                    document.getElementById('tenant-contract-detail').textContent = `Hợp đồng: Từ ${startDate} đến ${endDate}`;
                } else {
                    document.getElementById('tenant-contract-detail').textContent = 'Hợp đồng: Chưa có thông tin';
                }
            } else {
                tenantSection.style.display = 'none';
            }
            
            // Load dịch vụ
            const serviceContainer = document.getElementById('service-list-room-detail');
            serviceContainer.innerHTML = '';
            
            if (room.services && room.services.length > 0) {
                room.services.forEach(svc => {
                    serviceContainer.insertAdjacentHTML('beforeend', createServiceRowHtml(svc.name, svc.type, svc.price));
                });
            }
            
            // Cập nhật UI cho chế độ xem
            setEditMode(false);
            openModal('modal-room-detail');
            
        } catch (err) {
            console.error("Lỗi load chi tiết phòng:", err);
            alert("Không thể tải thông tin phòng!");
        }
    }

    // Toggle chế độ chỉnh sửa
    function toggleEditRoom() {
        isEditMode = !isEditMode;
        setEditMode(isEditMode);
    }

    // Thiết lập chế độ chỉnh sửa/xem
    function setEditMode(edit) {
        const inputs = document.querySelectorAll('#form-room-detail input, #form-room-detail textarea');
        inputs.forEach(input => {
            input.readOnly = !edit;
            if (edit) {
                input.style.backgroundColor = 'white';
                input.style.cursor = 'text';
            } else {
                input.style.backgroundColor = '#f9fafb';
                input.style.cursor = 'default';
            }
        });
        
        const serviceRows = document.querySelectorAll('#service-list-room-detail .service-row');
        serviceRows.forEach(row => {
            const removeBtn = row.querySelector('.btn-remove-service');
            if (edit) {
                removeBtn.style.display = 'block';
            } else {
                removeBtn.style.display = 'none';
            }
        });
        
        document.getElementById('btn-edit-room').style.display = edit ? 'none' : 'inline-block';
        document.getElementById('btn-save-room').style.display = edit ? 'inline-block' : 'none';
        document.getElementById('btn-add-service-detail').style.display = edit ? 'block' : 'none';
        
        // Cập nhật title
        if (edit) {
            document.getElementById('modal-room-detail-title').textContent = 'Chỉnh sửa Phòng';
            document.getElementById('modal-room-detail-desc').textContent = 'Cập nhật thông tin phòng và dịch vụ';
        } else {
            document.getElementById('modal-room-detail-title').textContent = 'Chi tiết Phòng';
            document.getElementById('modal-room-detail-desc').textContent = 'Xem và chỉnh sửa thông tin phòng';
        }
    }

    // Lưu thay đổi phòng
    async function saveRoomDetail() {
        if (!currentRoomId) return alert("Lỗi: Không xác định được phòng!");
        
        const num = document.getElementById('inp-room-detail-number').value;
        const floor = document.getElementById('inp-room-detail-floor').value;
        const area = document.getElementById('inp-room-detail-area').value;
        
        // Xóa ký tự không phải số ở giá thuê
        const rentRaw = document.getElementById('inp-room-detail-rent').value;
        const rent = rentRaw.replace(/[^0-9]/g, '');
        
        const facilities = document.getElementById('inp-room-detail-facilities').value;

        if (!num || !rent) return alert("Vui lòng nhập số phòng và giá thuê!");

        // Lấy danh sách dịch vụ
        const services = collectServices('room-detail');

        const payload = {
            room_number: num,
            floor: floor,
            area: area,
            rent: rent,
            facilities: facilities,
            services: services
        };

        try {
            const res = await fetch(`${API_URL}/rooms/${currentRoomId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();

            if (res.ok) {
                alert("Cập nhật phòng thành công!");
                setEditMode(false);
                isEditMode = false;
                loadStats(); // Cập nhật thống kê
                if (currentHouseId) loadRooms(currentHouseId); // Cập nhật danh sách phòng
                // Tải lại chi tiết phòng để hiển thị dữ liệu mới
                await viewRoomDetail(currentRoomId);
            } else {
                alert("Lỗi: " + (data.message || "Không thể cập nhật phòng"));
            }
        } catch (err) {
            console.error(err);
            alert("Lỗi khi cập nhật phòng!");
        }
    }

    // --- 7. XEM VÀ CHỈNH SỬA CHI TIẾT NHÀ TRỌ ---

    // Mở modal xem chi tiết nhà trọ
    async function viewHouseDetail() {
        if (!currentHouseId) {
            alert("Vui lòng chọn một nhà trọ!");
            return;
        }
        
        isHouseEditMode = false;
        
        try {
            // Đảm bảo currentHouseId là số nguyên hợp lệ
            const houseId = parseInt(currentHouseId);
            if (isNaN(houseId) || houseId <= 0) {
                throw new Error('ID nhà trọ không hợp lệ');
            }
            
            const res = await fetch(`${API_URL}/houses/${houseId}`);
            if (!res.ok) {
                throw new Error(`HTTP error! status: ${res.status}`);
            }
            const house = await res.json();
            
            // Điền thông tin nhà trọ
            document.getElementById('inp-house-detail-name').value = house.house_name || '';
            document.getElementById('inp-house-detail-addr').value = house.address || '';
            document.getElementById('inp-house-detail-desc').value = house.description || '';
            
            // Load dịch vụ
            const serviceContainer = document.getElementById('service-list-house-detail');
            serviceContainer.innerHTML = '';
            
            if (house.services && house.services.length > 0) {
                house.services.forEach(svc => {
                    serviceContainer.insertAdjacentHTML('beforeend', createServiceRowHtml(svc.name, svc.type, svc.price));
                });
            }
            
            // Cập nhật UI cho chế độ xem
            setHouseEditMode(false);
            openModal('modal-house-detail');
            
        } catch (err) {
            console.error("Lỗi load chi tiết nhà trọ:", err);
            alert("Không thể tải thông tin nhà trọ!");
        }
    }

    // Toggle chế độ chỉnh sửa nhà trọ
    function toggleEditHouse() {
        isHouseEditMode = !isHouseEditMode;
        setHouseEditMode(isHouseEditMode);
    }

    // Thiết lập chế độ chỉnh sửa/xem nhà trọ
    function setHouseEditMode(edit) {
        const inputs = document.querySelectorAll('#form-house-detail input, #form-house-detail textarea');
        inputs.forEach(input => {
            input.readOnly = !edit;
            if (edit) {
                input.style.backgroundColor = 'white';
                input.style.cursor = 'text';
            } else {
                input.style.backgroundColor = '#f9fafb';
                input.style.cursor = 'default';
            }
        });
        
        const serviceRows = document.querySelectorAll('#service-list-house-detail .service-row');
        serviceRows.forEach(row => {
            const removeBtn = row.querySelector('.btn-remove-service');
            if (edit) {
                removeBtn.style.display = 'block';
            } else {
                removeBtn.style.display = 'none';
            }
        });
        
        document.getElementById('btn-edit-house').style.display = edit ? 'none' : 'inline-block';
        document.getElementById('btn-save-house').style.display = edit ? 'inline-block' : 'none';
        document.getElementById('btn-add-service-house-detail').style.display = edit ? 'block' : 'none';
        
        // Cập nhật title
        if (edit) {
            document.getElementById('modal-house-detail-title').textContent = 'Chỉnh sửa Nhà trọ';
            document.getElementById('modal-house-detail-desc').textContent = 'Cập nhật thông tin nhà trọ và dịch vụ';
        } else {
            document.getElementById('modal-house-detail-title').textContent = 'Chi tiết Nhà trọ';
            document.getElementById('modal-house-detail-desc').textContent = 'Xem và chỉnh sửa thông tin nhà trọ';
        }
    }

    // Lưu thay đổi nhà trọ
    async function saveHouseDetail() {
        if (!currentHouseId) return alert("Lỗi: Không xác định được nhà trọ!");
        
        const name = document.getElementById('inp-house-detail-name').value;
        const address = document.getElementById('inp-house-detail-addr').value;
        const description = document.getElementById('inp-house-detail-desc').value;

        if (!name) return alert("Vui lòng nhập tên nhà trọ!");

        // Lấy danh sách dịch vụ
        const services = collectServices('house-detail');

        const payload = {
            name: name,
            address: address,
            description: description,
            services: services
        };

        try {
            const res = await fetch(`${API_URL}/houses/${currentHouseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();

            if (res.ok) {
                alert("Cập nhật nhà trọ thành công!");
                setHouseEditMode(false);
                isHouseEditMode = false;
                loadHouses(); // Tải lại danh sách nhà để cập nhật thông tin
                // Tải lại chi tiết nhà trọ để hiển thị dữ liệu mới
                await viewHouseDetail();
            } else {
                alert("Lỗi: " + (data.message || "Không thể cập nhật nhà trọ"));
            }
        } catch (err) {
            console.error(err);
            alert("Lỗi khi cập nhật nhà trọ!");
        }
    }

    // --- KHỞI CHẠY ---
    document.addEventListener('DOMContentLoaded', () => {
        loadStats();
        loadHouses();
    });
