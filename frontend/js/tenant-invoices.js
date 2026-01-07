const API_URL = 'http://localhost:3000/api';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Authorization': `Bearer ${token || ''}`
  };
}

function formatCurrency(n) {
  if (n === null || n === undefined) return '0 đ';
  return new Intl.NumberFormat('vi-VN').format(n) + ' đ';
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('vi-VN');
}

function renderStatus(inv) {
  if (inv.display_status === 'Paid') {
    return { text: 'Đã thanh toán', cls: 'text-green-600', icon: 'check_circle' };
  }
  if (inv.display_status === 'Overdue') {
    return { text: `Quá hạn ${inv.overdue_days || 0} ngày`, cls: 'text-red-600', icon: 'error_outline' };
  }
  return { text: 'Chưa thanh toán', cls: 'text-yellow-600', icon: 'schedule' };
}

async function loadInvoices() {
  try {
    const res = await fetch(`${API_URL}/tenant/invoices`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = document.getElementById('invoice-list');
    list.innerHTML = '';
    if (!data || data.length === 0) {
      list.innerHTML = `<div class="text-center text-gray-500 dark:text-gray-400 py-10">Không có hóa đơn</div>`;
      return;
    }
    data.forEach(inv => {
      const st = renderStatus(inv);
      const card = document.createElement('div');
      card.className = `bg-white dark:bg-card-dark rounded-xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row items-start md:items-center gap-4 transition-all hover:shadow-md cursor-pointer`;
      card.onclick = () => viewInvoiceDetail(inv.invoice_id);
      card.innerHTML = `
        <div class="w-12 h-12 rounded-full ${st.cls.includes('green') ? 'bg-green-50 dark:bg-green-900/20' : st.cls.includes('red') ? 'bg-red-50 dark:bg-red-900/20' : 'bg-yellow-50 dark:bg-yellow-900/20'} flex items-center justify-center flex-shrink-0 ${st.cls}">
          <span class="material-icons-outlined">${st.icon}</span>
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="font-bold text-gray-900 dark:text-white text-base mb-1">P.${inv.room_number} - ${inv.house_name || ''}</h3>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
            <span class="flex items-center gap-1"><span class="material-icons-outlined text-xs">calendar_today</span> ${formatDate(inv.issue_date)}</span>
            <span class="flex items-center gap-1">Mã: #${inv.invoice_id}</span>
          </div>
        </div>
        <div class="text-left md:text-right flex flex-col items-start md:items-end min-w-[140px]">
          <span class="font-bold text-lg text-gray-900 dark:text-white">${formatCurrency(inv.total_amount)}</span>
          <span class="text-xs ${st.cls} font-medium">${st.text}</span>
        </div>
      `;
      list.appendChild(card);
    });
  } catch (err) {
    console.error('loadInvoices error', err);
  }
}

async function viewInvoiceDetail(id) {
  if (!id) return;
  try {
    const res = await fetch(`${API_URL}/tenant/invoices/${id}`, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const inv = await res.json();
    document.getElementById('detail-room').textContent = `Phòng: P.${inv.room_number} - ${inv.house_name || ''}`;
    document.getElementById('detail-period').textContent = `Mã: #${inv.invoice_id}`;
    const st = renderStatus(inv);
    document.getElementById('detail-status').textContent = st.text;
    document.getElementById('detail-status').className = `text-sm font-medium ${st.cls}`;
    document.getElementById('detail-amount').textContent = formatCurrency(inv.total_amount);
    document.getElementById('detail-issue').textContent = formatDate(inv.issue_date);
    document.getElementById('detail-due').textContent = formatDate(inv.due_date);

    const itemsBox = document.getElementById('detail-items');
    itemsBox.innerHTML = '';
    (inv.items || []).forEach(it => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2';
      const usage = (it.current_reading ?? null) !== null && (it.previous_reading ?? null) !== null
        ? `SL: ${(it.current_reading - it.previous_reading) || 0}`
        : '';
      row.innerHTML = `
        <div>
          <div class="font-semibold text-gray-900 dark:text-white">${it.service_name}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400">${usage}</div>
        </div>
        <div class="text-right">
          <div class="text-sm text-gray-900 dark:text-white">${formatCurrency(it.amount)}</div>
          <div class="text-[11px] text-gray-400">Đơn giá: ${formatCurrency(it.unit_price || 0)}</div>
        </div>
      `;
      itemsBox.appendChild(row);
    });

    toggleInvoiceDetail(true);
  } catch (err) {
    console.error('viewInvoiceDetail error', err);
  }
}

function toggleInvoiceDetail(show) {
  const modal = document.getElementById('invoice-detail-modal');
  if (modal) modal.classList.toggle('hidden', !show);
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
  loadInvoices();
});

