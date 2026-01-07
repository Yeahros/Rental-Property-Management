const API_URL = 'http://localhost:3000/api';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return { 'Authorization': `Bearer ${token || ''}`, 'Content-Type': 'application/json' };
}

function formatDateTime(d) {
  if (!d) return '';
  const date = new Date(d);
  return date.toLocaleDateString('vi-VN') + ' • ' + date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

function renderStatusBadge(status) {
  switch (status) {
    case 'New':
      return { text: 'Mới tạo', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', dot: 'bg-blue-600' };
    case 'InProgress':
      return { text: 'Đang xử lý', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', dot: 'bg-yellow-600' };
    case 'Completed':
      return { text: 'Hoàn thành', cls: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', dot: 'bg-green-600' };
    case 'Cancelled':
      return { text: 'Đã hủy', cls: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-200', dot: 'bg-gray-500' };
    default:
      return { text: status, cls: 'bg-gray-100 text-gray-700', dot: 'bg-gray-500' };
  }
}

async function loadRoomsForSelect() {
  try {
    const res = await fetch(`${API_URL}/tenant/dashboard/rooms`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rooms = await res.json();
    const sel = document.getElementById('select-room');
    if (!sel) return;
    sel.innerHTML = `<option disabled selected value="">Chọn phòng...</option>`;
    rooms.forEach(r => {
      const opt = document.createElement('option');
      opt.value = r.room_id;
      opt.textContent = `P.${r.room_number} - ${r.house_name}`;
      sel.appendChild(opt);
    });
  } catch (err) {
    console.error('loadRoomsForSelect error', err);
  }
}

async function loadTenantRequests() {
  try {
    const res = await fetch(`${API_URL}/tenant/maintenance`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const container = document.getElementById('tenant-maintenance-list');
    container.innerHTML = '';
    if (!data || data.length === 0) {
      container.innerHTML = `<p class="text-sm text-gray-500 dark:text-gray-400">Bạn chưa có yêu cầu bảo trì nào.</p>`;
      return;
    }
    data.forEach(req => {
      const badge = renderStatusBadge(req.status);
      const card = document.createElement('div');
      card.className = 'bg-white dark:bg-card-dark rounded-xl p-6 shadow-sm border border-gray-100 dark:border-gray-700';
      const canCancel = req.status !== 'Completed' && req.status !== 'Cancelled';
      card.innerHTML = `
        <div class="flex flex-col md:flex-row gap-4 items-start">
          <div class="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0 text-blue-500">
            <span class="material-icons-outlined">build</span>
          </div>
          <div class="flex-1 min-w-0 w-full">
            <div class="flex justify-between items-start mb-2 gap-3">
              <div>
                <h3 class="font-bold text-gray-900 dark:text-white text-lg">${req.title}</h3>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Phòng P.${req.room_number} - ${req.house_name}</p>
              </div>
              <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.cls}">
                <span class="w-1.5 h-1.5 rounded-full ${badge.dot} mr-1.5"></span>${badge.text}
              </span>
            </div>
            <p class="text-gray-500 dark:text-gray-400 text-sm mb-4">${req.description || ''}</p>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-500 dark:text-gray-400 mb-4">
              <div>
                <p class="text-gray-400 uppercase font-semibold text-[10px] mb-1">Đã gửi</p>
                <p class="font-medium text-gray-700 dark:text-gray-300">${formatDateTime(req.request_date)}</p>
              </div>
              <div>
                <p class="text-gray-400 uppercase font-semibold text-[10px] mb-1">Trạng thái hiện tại</p>
                <p class="font-medium text-gray-700 dark:text-gray-300">${badge.text}</p>
              </div>
            </div>
            ${req.resolution_note ? `<p class="text-xs text-gray-500 dark:text-gray-400 mb-3"><span class="font-semibold">Ghi chú xử lý:</span> ${req.resolution_note}</p>` : ''}
            ${canCancel ? `
              <button onclick="cancelRequest(${req.request_id})"
                class="w-full py-2.5 border border-red-500 rounded-lg text-sm text-red-600 hover:bg-red-50 dark:border-red-500 dark:text-red-300 dark:hover:bg-red-900/20 transition-colors">
                Hủy yêu cầu
              </button>` : ''}
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error('loadTenantRequests error', err);
  }
}

async function submitMaintenanceRequest() {
  const title = document.getElementById('inp-title')?.value.trim();
  const description = document.getElementById('inp-description')?.value.trim();
  const roomId = document.getElementById('select-room')?.value;

  if (!roomId) {
    alert('Vui lòng chọn phòng.');
    return;
  }
  if (!title) {
    alert('Vui lòng nhập tiêu đề vấn đề.');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/tenant/maintenance`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ room_id: roomId, title, description })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Đã gửi yêu cầu bảo trì.');
      document.getElementById('inp-title').value = '';
      document.getElementById('inp-description').value = '';
      document.getElementById('select-room').value = '';
      await loadTenantRequests();
    } else {
      alert(data.message || 'Có lỗi xảy ra khi gửi yêu cầu.');
    }
  } catch (err) {
    console.error('submitMaintenanceRequest error', err);
  }
}

async function cancelRequest(id) {
  if (!confirm('Bạn chắc chắn muốn hủy yêu cầu này?')) return;
  const note = prompt('Lý do hủy (tuỳ chọn):') || '';
  try {
    const res = await fetch(`${API_URL}/tenant/maintenance/${id}/cancel`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ note })
    });
    const data = await res.json();
    if (res.ok) {
      alert('Đã hủy yêu cầu.');
      await loadTenantRequests();
    } else {
      alert(data.message || 'Không thể hủy yêu cầu.');
    }
  } catch (err) {
    console.error('cancelRequest error', err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('token');
      window.location.href = 'index.html';
    });
  }
  loadRoomsForSelect();
  loadTenantRequests();
});


