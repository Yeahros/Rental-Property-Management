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

// Danh sách yêu cầu bảo trì của tenant
const getRequests = async (req, res) => {
    const tenantId = getTenantIdFromToken(req);
    if (!tenantId) return res.status(401).json({ message: 'Unauthorized' });

    const { status } = req.query;

    let sql = `
        SELECT 
            m.request_id,
            m.title,
            m.description,
            m.request_date,
            m.status,
            m.resolved_date,
            m.resolution_note,
            r.room_id,
            r.room_number,
            h.house_name
        FROM maintenance_requests m
        JOIN rooms r ON m.room_id = r.room_id
        JOIN boarding_houses h ON r.house_id = h.house_id
        WHERE m.tenant_id = ?
    `;
    const params = [tenantId];

    if (status && status !== 'all') {
        sql += ` AND m.status = ?`;
        params.push(status);
    }

    sql += ` ORDER BY m.request_date DESC`;

    try {
        const [rows] = await pool.query(sql, params);
        res.json(rows);
    } catch (err) {
        console.error('Tenant getRequests error:', err);
        res.status(500).json({ message: 'Lỗi khi lấy yêu cầu bảo trì', error: err.message });
    }
};

// Tenant tạo yêu cầu mới (dựa trên phòng mà tenant đang thuê)
const createRequest = async (req, res) => {
    const tenantId = getTenantIdFromToken(req);
    if (!tenantId) return res.status(401).json({ message: 'Unauthorized' });

    const { room_id, title, description } = req.body;
    if (!room_id || !title) {
        return res.status(400).json({ message: 'Thiếu phòng hoặc tiêu đề' });
    }

    try {
        // Xác nhận phòng thuộc về tenant (có hợp đồng active)
        const [rows] = await pool.query(
            `SELECT c.contract_id
             FROM contracts c
             WHERE c.room_id = ? AND c.tenant_id = ? AND c.status = 'Active' AND c.is_current = 1
             LIMIT 1`,
            [room_id, tenantId]
        );
        if (rows.length === 0) {
            return res.status(400).json({ message: 'Phòng này không thuộc hợp đồng đang hoạt động của bạn' });
        }

        await pool.query(
            `INSERT INTO maintenance_requests (room_id, tenant_id, title, description, status)
             VALUES (?, ?, ?, ?, 'New')`,
            [room_id, tenantId, title, description || '']
        );

        res.json({ message: 'Gửi yêu cầu bảo trì thành công' });
    } catch (err) {
        console.error('Tenant createRequest error:', err);
        res.status(500).json({ message: 'Lỗi khi tạo yêu cầu', error: err.message });
    }
};

// Tenant hủy yêu cầu (chưa hoàn thành)
const cancelRequest = async (req, res) => {
    const tenantId = getTenantIdFromToken(req);
    if (!tenantId) return res.status(401).json({ message: 'Unauthorized' });

    const requestId = req.params.id;
    const { note } = req.body;

    try {
        const [rows] = await pool.query(
            `SELECT status FROM maintenance_requests WHERE request_id = ? AND tenant_id = ?`,
            [requestId, tenantId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Không tìm thấy yêu cầu' });
        }

        const currentStatus = rows[0].status;
        if (currentStatus === 'Completed' || currentStatus === 'Cancelled') {
            return res.status(400).json({ message: 'Yêu cầu đã hoàn thành hoặc đã hủy, không thể hủy nữa' });
        }

        await pool.query(
            `UPDATE maintenance_requests 
             SET status = 'Cancelled', resolved_date = CURRENT_TIMESTAMP, resolution_note = ?
             WHERE request_id = ? AND tenant_id = ?`,
            [note || '', requestId, tenantId]
        );

        res.json({ message: 'Đã hủy yêu cầu bảo trì' });
    } catch (err) {
        console.error('Tenant cancelRequest error:', err);
        res.status(500).json({ message: 'Lỗi khi hủy yêu cầu', error: err.message });
    }
};

module.exports = {
    getRequests,
    createRequest,
    cancelRequest,
};


