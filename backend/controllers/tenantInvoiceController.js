const pool = require('../config/database');
const jwt = require('jsonwebtoken');

const getTenantIdFromToken = (req) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return null;
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== 'tenant') return null;
        return decoded.id;
    } catch {
        return null;
    }
};

// Danh sách hóa đơn của người thuê
const getInvoices = async (req, res) => {
    const tenantId = getTenantIdFromToken(req);
    if (!tenantId) return res.status(401).json({ message: 'Unauthorized' });

    try {
        const [rows] = await pool.query(
            `
            SELECT i.invoice_id, i.billing_period, i.issue_date, i.due_date, i.total_amount, i.status,
                   r.room_number,
                   h.house_name,
                   CASE 
                       WHEN i.status = 'Paid' THEN 'Paid'
                       WHEN i.status = 'Unpaid' AND i.due_date < CURRENT_DATE() THEN 'Overdue'
                       ELSE 'Unpaid'
                   END as display_status,
                   DATEDIFF(CURRENT_DATE(), i.due_date) as overdue_days
            FROM invoices i
            JOIN contracts c ON i.contract_id = c.contract_id
            JOIN rooms r ON c.room_id = r.room_id
            JOIN boarding_houses h ON r.house_id = h.house_id
            WHERE c.tenant_id = ?
            ORDER BY i.issue_date DESC, i.invoice_id DESC
            `,
            [tenantId]
        );
        res.json(rows);
    } catch (err) {
        console.error('Tenant getInvoices error:', err);
        res.status(500).json({ message: 'Lỗi khi lấy danh sách hóa đơn', error: err.message });
    }
};

// Chi tiết hóa đơn của người thuê (read-only)
const getInvoiceById = async (req, res) => {
    const tenantId = getTenantIdFromToken(req);
    if (!tenantId) return res.status(401).json({ message: 'Unauthorized' });

    const invoiceId = req.params.id;
    try {
        const [rows] = await pool.query(
            `
            SELECT i.*, 
                   r.room_number,
                   r.house_id,
                   h.house_name,
                   h.address,
                   c.contract_id,
                   c.tenant_id,
                   CASE 
                       WHEN i.status = 'Paid' THEN 'Paid'
                       WHEN i.status = 'Unpaid' AND i.due_date < CURRENT_DATE() THEN 'Overdue'
                       ELSE 'Unpaid'
                   END as display_status,
                   DATEDIFF(CURRENT_DATE(), i.due_date) as overdue_days
            FROM invoices i
            JOIN contracts c ON i.contract_id = c.contract_id
            JOIN rooms r ON c.room_id = r.room_id
            JOIN boarding_houses h ON r.house_id = h.house_id
            WHERE i.invoice_id = ? AND c.tenant_id = ?
            `,
            [invoiceId, tenantId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });
        }

        const invoice = rows[0];

        const [details] = await pool.query(
            `
            SELECT 
                id.usage_id,
                id.previous_reading,
                id.current_reading,
                id.unit_price,
                id.amount
            FROM invoice_details id
            WHERE id.invoice_id = ?
            ORDER BY id.usage_id
            `,
            [invoiceId]
        );

        invoice.items = (details || []).map((item, index) => {
            let serviceName = 'Dịch vụ';
            let serviceType = 'Theo số (kWh/khối)';
            if (index === 0) serviceName = 'Tiền điện';
            else if (index === 1) serviceName = 'Tiền nước';
            else serviceName = `Dịch vụ ${index - 1}`;
            return {
                ...item,
                service_name: serviceName,
                service_type: serviceType,
            };
        });

        res.json(invoice);
    } catch (err) {
        console.error('Tenant getInvoiceById error:', err);
        res.status(500).json({ message: 'Lỗi khi lấy chi tiết hóa đơn', error: err.message });
    }
};

module.exports = {
    getInvoices,
    getInvoiceById,
};

