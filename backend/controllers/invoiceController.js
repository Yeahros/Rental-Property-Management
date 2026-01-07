const pool = require('../config/database');

// Lấy thống kê Hóa đơn
const getInvoiceStats = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                COALESCE(SUM(CASE 
                    WHEN status = 'Paid' AND MONTH(paid_date) = MONTH(CURRENT_DATE()) 
                    THEN total_amount ELSE 0 END), 0) as revenue_month,
                COALESCE(SUM(CASE 
                    WHEN status = 'Unpaid' AND due_date >= CURRENT_DATE() 
                    THEN total_amount ELSE 0 END), 0) as pending_amount,
                COUNT(CASE 
                    WHEN status = 'Unpaid' AND due_date < CURRENT_DATE() 
                    THEN 1 END) as overdue_count
            FROM invoices
        `);
        res.json(rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).send('Lỗi thống kê hóa đơn');
    }
};

// Lấy danh sách Hóa đơn
const getInvoices = async (req, res) => {
    const { month, status, search } = req.query;

    let sql = `
        SELECT i.*, 
               r.room_number, 
               t.full_name,
               CASE 
                   WHEN i.status = 'Paid' THEN 'Paid'
                   WHEN i.status = 'Unpaid' AND i.due_date < CURRENT_DATE() THEN 'Overdue'
                   ELSE 'Unpaid'
               END as display_status,
               DATEDIFF(CURRENT_DATE(), i.due_date) as overdue_days
        FROM invoices i
        JOIN contracts c ON i.contract_id = c.contract_id
        JOIN rooms r ON c.room_id = r.room_id
        JOIN tenants t ON c.tenant_id = t.tenant_id
        WHERE 1=1
    `;

    const params = [];

    if (month) {
        sql += ` AND i.billing_period = ?`;
        params.push(month);
    }

    if (search) {
        sql += ` AND (t.full_name LIKE ? OR r.room_number LIKE ?)`;
        params.push(`%${search}%`, `%${search}%`);
    }

    sql += ` ORDER BY i.issue_date DESC, i.invoice_id DESC`;

    try {
        const [invoices] = await pool.query(sql, params);

        let result = invoices;
        if (status && status !== 'all') {
            result = invoices.filter(inv => {
                if (status === 'paid') return inv.display_status === 'Paid';
                if (status === 'pending') return inv.display_status === 'Unpaid';
                if (status === 'overdue') return inv.display_status === 'Overdue';
                return true;
            });
        }

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).send(err);
    }
};

// Tạo Hóa đơn
const createInvoice = async (req, res) => {
    const {
        type,
        contract_id,
        billing_period,
        due_date,
        items,
        notes,
        total_amount,
        room_rent
    } = req.body;

    // Chuẩn hóa billing_period: nếu phát sinh (Incidental) mà không có, dùng tháng của due_date hoặc tháng hiện tại
    let finalBillingPeriod = billing_period;
    if (!finalBillingPeriod && due_date) {
        // Lấy theo tháng của due_date (YYYY-MM) để phù hợp độ dài cột billing_period
        finalBillingPeriod = new Date(due_date).toISOString().slice(0,7);
    }
    // Nếu vẫn null, dùng tháng hiện tại để tránh lỗi DB
    if (!finalBillingPeriod) {
        finalBillingPeriod = new Date().toISOString().slice(0,7);
    }

    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        const [invResult] = await connection.query(
            `INSERT INTO invoices (contract_id, billing_period, issue_date, due_date, room_rent, total_amount, status, notes, invoice_type)
             VALUES (?, ?, CURRENT_DATE(), ?, ?, ?, 'Unpaid', ?, ?)`,
            [contract_id, finalBillingPeriod, due_date, room_rent || 0, total_amount, notes, type]
        );
        const invoiceId = invResult.insertId;

        if (items && items.length > 0) {
            for (const item of items) {
                // Lưu ý: invoice_details không có cột service_type trong database thực tế
                await connection.query(
                    `INSERT INTO invoice_details (invoice_id, previous_reading, current_reading, unit_price, amount)
                     VALUES (?, ?, ?, ?, ?)`,
                    [invoiceId, item.old || null, item.new || null, item.price || 0, item.amount]
                );
            }
        }

        await connection.commit();
        res.json({ message: 'Tạo hóa đơn thành công' });

    } catch (err) {
        await connection.rollback();
        console.error(err);
        // Bắt lỗi trùng key (duplicate billing_period/contract)
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ message: 'Đã tồn tại hóa đơn cho kỳ này. Vui lòng chọn kỳ khác.' });
        }
        res.status(500).send('Lỗi tạo hóa đơn: ' + err.message);
    } finally {
        connection.release();
    }
};

// Cập nhật trạng thái thanh toán
const updateInvoiceStatus = async (req, res) => {
    const { status } = req.body;
    try {
        await pool.query(
            `UPDATE invoices SET status = ?, paid_date = ? WHERE invoice_id = ?`,
            [status, status === 'Paid' ? new Date() : null, req.params.id]
        );
        res.json({ message: 'Cập nhật trạng thái thành công' });
    } catch (err) {
        res.status(500).send(err);
    }
};

// Lấy chi tiết một hóa đơn theo ID
const getInvoiceById = async (req, res) => {
    try {
        const invoiceId = req.params.id;
        
        // Lấy thông tin hóa đơn
        const [invoices] = await pool.query(`
            SELECT i.*, 
                   r.room_number, 
                   r.house_id,
                   h.house_name,
                   h.address,
                   t.full_name,
                   t.phone,
                   t.email,
                   c.contract_id,
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
            JOIN tenants t ON c.tenant_id = t.tenant_id
            WHERE i.invoice_id = ?
        `, [invoiceId]);
        
        if (invoices.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });
        }
        
        const invoice = invoices[0];
        
        // Lấy chi tiết các khoản phí
        const [details] = await pool.query(`
            SELECT 
                id.usage_id,
                id.previous_reading,
                id.current_reading,
                id.unit_price,
                id.amount
            FROM invoice_details id
            WHERE id.invoice_id = ?
            ORDER BY id.usage_id
        `, [invoiceId]);
        
        // Map dữ liệu và thêm service_name dựa trên thứ tự (item đầu = điện, item thứ 2 = nước, còn lại = dịch vụ khác)
        invoice.items = (details || []).map((item, index) => {
            let serviceName = 'Dịch vụ';
            let serviceType = 'Theo số (kWh/khối)';
            
            if (index === 0) {
                serviceName = 'Tiền điện';
            } else if (index === 1) {
                serviceName = 'Tiền nước';
            } else {
                serviceName = `Dịch vụ ${index - 1}`;
            }
            
            return {
                ...item,
                service_name: serviceName,
                service_type: serviceType
            };
        });
        
        res.json(invoice);
    } catch (err) {
        console.error('Get Invoice By ID Error:', err);
        res.status(500).json({ message: 'Lỗi khi lấy chi tiết hóa đơn', error: err.message });
    }
};

// Xóa Hóa đơn (chỉ khi chưa thanh toán)
const deleteInvoice = async (req, res) => {
    const invoiceId = req.params.id;
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [rows] = await connection.query(`SELECT status FROM invoices WHERE invoice_id = ?`, [invoiceId]);
        if (rows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ message: 'Không tìm thấy hóa đơn' });
        }
        if (rows[0].status === 'Paid') {
            await connection.rollback();
            return res.status(400).json({ message: 'Không thể xóa hóa đơn đã thanh toán' });
        }

        await connection.query(`DELETE FROM invoice_details WHERE invoice_id = ?`, [invoiceId]);
        await connection.query(`DELETE FROM invoices WHERE invoice_id = ?`, [invoiceId]);

        await connection.commit();
        res.json({ message: 'Đã xóa hóa đơn' });
    } catch (err) {
        await connection.rollback();
        console.error('Delete Invoice Error:', err);
        res.status(500).json({ message: 'Lỗi khi xóa hóa đơn', error: err.message });
    } finally {
        connection.release();
    }
};

module.exports = {
    getInvoiceStats,
    getInvoices,
    getInvoiceById,
    createInvoice,
    updateInvoiceStatus,
    deleteInvoice
};

