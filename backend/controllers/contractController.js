const pool = require('../config/database');
const bcrypt = require('bcrypt');

// Lấy danh sách Hợp đồng
const getContracts = async (req, res) => {
    const { status, search } = req.query;
    let sql = `
        SELECT c.*, t.tenant_id, t.full_name, t.phone, t.email, t.plain_password, 
               r.room_number, r.house_id, r.base_rent, h.house_name,
               (SELECT i.status FROM invoices i WHERE i.contract_id = c.contract_id ORDER BY i.due_date DESC LIMIT 1) as payment_status
        FROM contracts c
        JOIN tenants t ON c.tenant_id = t.tenant_id
        JOIN rooms r ON c.room_id = r.room_id
        JOIN boarding_houses h ON r.house_id = h.house_id
        WHERE 1=1
    `;
    const params = [];
    if (status && status !== 'All') { sql += ` AND c.status = ?`; params.push(status); }
    if (search) { sql += ` AND (t.full_name LIKE ? OR t.phone LIKE ? OR r.room_number LIKE ?)`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
    sql += ` ORDER BY c.created_at DESC`;

    try {
        const [rows] = await pool.execute(sql, params);
        res.json(rows);
    } catch (err) {
        res.status(500).send(err);
    }
};

// Lấy chi tiết Hợp đồng
const getContractById = async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT c.*, 
                   t.full_name, t.phone, t.email, t.id_card_number, t.plain_password,
                   r.room_number, r.house_id, r.base_rent
            FROM contracts c
            JOIN tenants t ON c.tenant_id = t.tenant_id
            JOIN rooms r ON c.room_id = r.room_id
            WHERE c.contract_id = ?
        `, [req.params.id]);

        if (rows.length === 0) return res.status(404).json({ message: "Không tìm thấy hợp đồng" });
        
        const contract = rows[0];
        
        // Lấy dịch vụ của phòng (room_services) hoặc dịch vụ chung của nhà (house_services)
        const [roomServices] = await pool.query(`
            SELECT s.service_name, s.service_type, rs.price as unit_price
            FROM room_services rs
            JOIN services s ON rs.service_id = s.service_id
            WHERE rs.room_id = ?
        `, [contract.room_id]);
        
        // Nếu phòng không có dịch vụ riêng, lấy dịch vụ chung của nhà
        let services = roomServices;
        if (services.length === 0) {
            const [houseServices] = await pool.query(`
                SELECT s.service_name, s.service_type, hs.price as unit_price
                FROM house_services hs
                JOIN services s ON hs.service_id = s.service_id
                WHERE hs.house_id = ?
            `, [contract.house_id]);
            services = houseServices;
        }
        
        contract.services = services || [];
        contract.rent_amount = contract.rent_amount || contract.base_rent || 0;
        
        res.json(contract);
    } catch (err) {
        console.error('Get Contract By ID Error:', err);
        res.status(500).json({ message: 'Lỗi khi lấy chi tiết hợp đồng', error: err.message });
    }
};

// Tạo Hợp đồng mới
const createContract = async (req, res) => {
    const { room_id, full_name, phone, id_card_number, start_date, end_date, deposit_amount, rent_amount, notes, password } = req.body;
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        // 1. Xử lý File
        let cccdPathArray = [];
        if (req.files['cccd_front']) cccdPathArray.push('/uploads/' + req.files['cccd_front'][0].filename);
        if (req.files['cccd_back']) cccdPathArray.push('/uploads/' + req.files['cccd_back'][0].filename);
        let pdfPath = req.files['contract_pdf'] ? '/uploads/' + req.files['contract_pdf'][0].filename : null;

        // 2. Tạo Password ngẫu nhiên
        let rawPassword = password;
        if (!rawPassword || rawPassword.trim() === "") {
            rawPassword = Math.random().toString(36).slice(-6).toUpperCase();
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(rawPassword, salt);

        // 3. Tạo/Update Tenant
        const [existingTenant] = await connection.query('SELECT tenant_id FROM tenants WHERE phone = ?', [phone]);
        let tenantId;

        if (existingTenant.length > 0) {
            tenantId = existingTenant[0].tenant_id;

            let updateSql = 'UPDATE tenants SET is_active = 1';
            let updateParams = [];

            updateSql += ', plain_password = ?';
            updateParams.push(rawPassword);

            if (cccdPathArray.length > 0) {
                updateSql += ', id_card_photos = ?';
                updateParams.push(JSON.stringify(cccdPathArray));
            }

            updateSql += ' WHERE tenant_id = ?';
            updateParams.push(tenantId);

            await connection.query(updateSql, updateParams);
        } else {
            const [newTenant] = await connection.query(
                `INSERT INTO tenants (full_name, phone, id_card_number, id_card_photos, plain_password, is_active) 
                 VALUES (?, ?, ?, ?, ?, 1)`,
                [full_name, phone, 'P_' + Date.now(), JSON.stringify(cccdPathArray), rawPassword]
            );
            tenantId = newTenant.insertId;
        }

        // 4. Insert Hợp đồng
        await connection.query(
            `INSERT INTO contracts (room_id, tenant_id, start_date, end_date, deposit_amount, rent_amount, notes, contract_file_url, status, is_current)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', 1)`,
            [room_id, tenantId, start_date, end_date, deposit_amount, rent_amount, notes, pdfPath]
        );

        // 5. Update trạng thái phòng -> Occupied
        await connection.query('UPDATE rooms SET status = "Occupied" WHERE room_id = ?', [room_id]);

        await connection.commit();
        res.json({ message: 'Tạo hợp đồng thành công', password: rawPassword });

    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).json({ message: 'Lỗi tạo hợp đồng: ' + err.message });
    } finally {
        connection.release();
    }
};

// Cập nhật Hợp đồng
const updateContract = async (req, res) => {
    const { start_date, end_date, deposit_amount, rent_amount, notes, full_name, phone, id_card_number, password } = req.body;

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        await connection.execute(`
            UPDATE contracts 
            SET start_date=?, end_date=?, deposit_amount=?, rent_amount=?, notes=?
            WHERE contract_id=?
        `, [start_date, end_date, deposit_amount, rent_amount, notes, req.params.id]);

        const [rows] = await connection.execute('SELECT tenant_id FROM contracts WHERE contract_id = ?', [req.params.id]);

        if (rows.length > 0) {
            const tenantId = rows[0].tenant_id;

            let updateTenantSql = 'UPDATE tenants SET full_name = ?, phone = ?';
            let updateParams = [full_name, phone];

            if (id_card_number && id_card_number.trim() !== "") {
                updateTenantSql += ', id_card_number = ?';
                updateParams.push(id_card_number.trim());
            }

            if (password && password.trim() !== "") {
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(password, salt);

                updateTenantSql += ', password_hash = ?, plain_password = ?';
                updateParams.push(hashedPassword, password);
            }

            updateTenantSql += ' WHERE tenant_id = ?';
            updateParams.push(tenantId);

            await connection.execute(updateTenantSql, updateParams);
        }

        await connection.commit();
        res.json({ message: 'Cập nhật thành công' });
    } catch (err) {
        await connection.rollback();
        console.error(err);
        res.status(500).send('Lỗi cập nhật: ' + err.message);
    } finally {
        connection.release();
    }
};

// Chấm dứt Hợp đồng
const terminateContract = async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        await connection.execute(`UPDATE contracts SET status = 'Terminated', is_current = 0 WHERE contract_id = ?`, [req.params.id]);

        const [rows] = await connection.execute('SELECT room_id FROM contracts WHERE contract_id = ?', [req.params.id]);
        if (rows.length > 0) {
            await connection.execute(`UPDATE rooms SET status = 'Vacant' WHERE room_id = ?`, [rows[0].room_id]);
        }
        await connection.commit();
        res.json({ message: 'Đã chấm dứt hợp đồng' });
    } catch (err) {
        await connection.rollback();
        res.status(500).send(err);
    } finally {
        connection.release();
    }
};

// Lấy thống kê Hợp đồng
const getContractStats = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT 
                SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as active,
                SUM(CASE WHEN status = 'Terminated' THEN 1 ELSE 0 END) as \`terminated\`,
                SUM(CASE WHEN status = 'Expired' THEN 1 ELSE 0 END) as expired
            FROM contracts
        `);
        res.json(rows[0]);
    } catch (err) {
        res.status(500).send(err);
    }
};

// Lấy danh sách Hợp đồng đang Active
const getActiveContracts = async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT c.contract_id, c.room_id, r.room_number, t.full_name, c.rent_amount
            FROM contracts c
            JOIN rooms r ON c.room_id = r.room_id
            JOIN tenants t ON c.tenant_id = t.tenant_id
            WHERE c.status = 'Active' AND c.is_current = 1
        `);
        res.json(rows);
    } catch (err) {
        res.status(500).send(err);
    }
};

module.exports = {
    getContracts,
    getContractById,
    createContract,
    updateContract,
    terminateContract,
    getContractStats,
    getActiveContracts
};

